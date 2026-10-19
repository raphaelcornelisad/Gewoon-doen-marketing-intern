-- CRM v2: belomgeving, toestemming, berichten, afspraken, webhooks, commissiegrootboek.

-- ---------- Gebruikers ----------
alter table acq_setters add column rol text not null default 'setter' check (rol in ('setter', 'sales'));
alter table acq_setters alter column utm_source drop not null;   -- nieuwe setters hebben geen eigen Calendly-link nodig

-- ---------- Leads ----------
alter table crm_contacts
  add column adres text,
  add column postcode text,
  add column type_bedrijf text,
  add column domein text,
  add column bron_url text,
  add column extern_id text,                         -- bv. Google place_id uit Outscraper/Apify
  add column oorspronkelijke_setter_id uuid references acq_setters (id),
  add column laatste_contact_op timestamptz,
  add column volgende_opvolging_op timestamptz,
  add column belpogingen integer not null default 0,
  add column niet_benaderen boolean not null default false,
  add column niet_benaderen_reden text,
  add column gereserveerd_door uuid references acq_setters (id),
  add column gereserveerd_tot timestamptz;
create index crm_contacts_domein on crm_contacts (domein);
create index crm_contacts_opvolging on crm_contacts (volgende_opvolging_op);

-- Fases v2 (tabellen zijn nog leeg; mapping voor de zekerheid).
update crm_opportunities set fase = case fase
  when 'gebeld' then 'niet_opgenomen' when 'wafu' then 'wavo' when 'opvolgen' then 'terugbellen' when 'verloren' then 'niet_geinteresseerd' else fase end
  where pijplijn = 'outbound';
update crm_opportunities set fase = case fase
  when 'gesprek' then 'kennismaking' when 'no_show' then 'ingepland' when 'gewonnen' then 'geaccepteerd' when 'verloren' then 'afgewezen' else fase end
  where pijplijn = 'sales';

alter table crm_opportunities
  add column verkoper_id uuid references acq_setters (id),   -- salesmedewerker
  add column offerte_op date,
  add column offerte_cents integer check (offerte_cents >= 0),
  add column sluitdatum date;

-- Atomair de volgende lead reserveren voor een setter (geen twee setters tegelijk).
create or replace function crm_reserveer_volgende(p_setter uuid, p_minuten integer, p_overslaan uuid[] default '{}')
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  -- Bestaande reservering van deze setter vrijgeven.
  update crm_contacts set gereserveerd_door = null, gereserveerd_tot = null where gereserveerd_door = p_setter;
  select c.id into v_id
  from crm_contacts c
  join crm_opportunities o on o.contact_id = c.id and o.pijplijn = 'outbound'
  where o.fase in ('nieuw', 'niet_opgenomen', 'wavo', 'terugbellen')
    and not c.niet_benaderen
    and c.telefoon_norm is not null
    and (c.eigenaar_id is null or c.eigenaar_id = p_setter)
    and (c.gereserveerd_tot is null or c.gereserveerd_tot < now())
    and (c.volgende_opvolging_op is null or c.volgende_opvolging_op <= now())
    and not (c.id = any (p_overslaan))
  order by
    (c.volgende_opvolging_op is not null) desc,     -- achterstallige opvolging eerst
    c.volgende_opvolging_op asc nulls last,
    (c.eigenaar_id = p_setter) desc nulls last,     -- dan eigen leads
    c.belpogingen asc,
    c.created_at asc
  limit 1
  for update of c skip locked;
  if v_id is not null then
    update crm_contacts set gereserveerd_door = p_setter, gereserveerd_tot = now() + make_interval(mins => p_minuten) where id = v_id;
  end if;
  return v_id;
end $$;

-- Eén specifieke lead reserveren (vanaf de leadkaart). Geeft false als een ander hem al heeft.
create or replace function crm_reserveer(p_contact uuid, p_setter uuid, p_minuten integer)
returns boolean language plpgsql as $$
declare n integer;
begin
  update crm_contacts set gereserveerd_door = p_setter, gereserveerd_tot = now() + make_interval(mins => p_minuten)
  where id = p_contact
    and not niet_benaderen
    and (eigenaar_id is null or eigenaar_id = p_setter)
    and (gereserveerd_tot is null or gereserveerd_tot < now() or gereserveerd_door = p_setter);
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- ---------- Toestemming ----------
create table crm_consents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references crm_contacts (id) on delete cascade,
  kanaal text not null check (kanaal in ('whatsapp', 'sms', 'email', 'bellen')),
  categorie text not null default 'marketing' check (categorie in ('marketing', 'service')),
  status text not null check (status in ('gegeven', 'ingetrokken')),
  bron text not null,              -- bv. 'telefonisch akkoord', 'inkomend bericht', 'formulier', 'STOP'
  vastgelegd_door text not null,
  created_at timestamptz not null default now()
);
create index crm_consents_contact on crm_consents (contact_id, kanaal, created_at desc);

-- ---------- Oproepen ----------
create table crm_calls (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references crm_contacts (id) on delete cascade,
  setter_id uuid references acq_setters (id),
  door text not null,
  provider text not null default 'handmatig' check (provider in ('handmatig', 'twilio')),
  provider_sid text unique,
  provider_status text,            -- ringing/in-progress/completed/no-answer/busy/failed (alleen bij provider)
  gestart_op timestamptz not null default now(),
  beeindigd_op timestamptz,
  duur_sec integer,
  uitkomst text,                   -- menselijke uitkomst
  notitie text,
  opname_sid text,
  opname_url text,
  opname_duur_sec integer,
  transcript jsonb,                -- [{start, eind, spreker, tekst}]
  samenvatting text,
  bezwaren jsonb,                  -- [{categorie, citaat, tijdstip_sec}]
  vervolgstap text,
  analyse_status text,             -- null | wachtrij | klaar | mislukt | gecorrigeerd
  analyse_gecorrigeerd_door text,
  created_at timestamptz not null default now()
);
create index crm_calls_contact on crm_calls (contact_id, gestart_op desc);
create index crm_calls_setter on crm_calls (setter_id, gestart_op desc);

-- ---------- Berichten ----------
create table crm_templates (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  kanaal text not null check (kanaal in ('whatsapp', 'sms')),
  doel text not null default 'wavo',          -- wavo | bevestiging | herinnering | algemeen
  tekst text not null,                        -- met {{voornaam}}, {{salon}}, {{setter}}, {{afspraak}}
  provider_template_id text,                  -- goedgekeurde WhatsApp-template (Twilio Content SID)
  categorie text not null default 'marketing' check (categorie in ('marketing', 'utility')),
  actief boolean not null default true,
  created_at timestamptz not null default now()
);

create table crm_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references crm_contacts (id) on delete cascade,
  kanaal text not null check (kanaal in ('whatsapp', 'sms')),
  richting text not null check (richting in ('in', 'uit')),
  tekst text not null,
  template_id uuid references crm_templates (id),
  status text not null check (status in ('wachtrij', 'verzonden', 'afgeleverd', 'gelezen', 'mislukt', 'ontvangen', 'handmatig')),
  provider_sid text unique,
  fout text,
  setter_id uuid references acq_setters (id),
  door text not null,
  gelezen_door_team boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_messages_contact on crm_messages (contact_id, created_at desc);
create index crm_messages_open on crm_messages (richting, gelezen_door_team);

-- ---------- Scripts ----------
create table crm_scripts (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  campagne text,
  opening text not null default '',
  kwalificatie text not null default '',
  pitch text not null default '',
  bezwaren jsonb not null default '[]',       -- [{bezwaar, antwoord}]
  afsluiting text not null default '',
  actief boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------- Taken ----------
create table crm_tasks (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references crm_contacts (id) on delete cascade,
  toegewezen_aan uuid references acq_setters (id),
  titel text not null,
  vervalt_op timestamptz,
  gedaan_op timestamptz,
  door text not null,
  created_at timestamptz not null default now()
);
create index crm_tasks_open on crm_tasks (toegewezen_aan, gedaan_op, vervalt_op);

-- ---------- Afspraken ----------
create table crm_booking_refs (
  ref text primary key,
  contact_id uuid not null references crm_contacts (id) on delete cascade,
  setter_id uuid references acq_setters (id),
  gesprekstype text not null check (gesprekstype in ('kennismaking', 'salesgesprek')),
  campagne text,
  aangemaakt_door text not null,
  created_at timestamptz not null default now(),
  gebruikt_op timestamptz
);

create table crm_appointments (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references crm_contacts (id) on delete cascade,
  type text not null check (type in ('kennismaking', 'salesgesprek')),
  status text not null check (status in ('gepland', 'verplaatst', 'geannuleerd', 'verschenen', 'no_show')),
  start_op timestamptz not null,
  eind_op timestamptz,
  calendly_event_uri text,
  calendly_invitee_uri text unique,
  booking_ref text references crm_booking_refs (ref),
  attributie text not null check (attributie in ('referentie', 'utm_setter', 'handmatig', 'geen')),
  setter_id uuid references acq_setters (id),          -- toegeschreven setter (commissie)
  vorige_afspraak_id uuid references crm_appointments (id),
  status_door text,                                     -- wie verschenen/no-show registreerde
  bevestiging_via text not null default 'calendly',     -- welk systeem bevestigt
  herinnering_via text not null default 'calendly',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_appt_contact on crm_appointments (contact_id, start_op);
create index crm_appt_start on crm_appointments (start_op);

-- ---------- Webhooks en sync ----------
create table crm_webhook_events (
  id uuid primary key default gen_random_uuid(),
  bron text not null,                -- calendly | twilio
  sleutel text not null,             -- idempotentie (bv. event + invitee-uri + tijdstip)
  soort text not null,
  payload jsonb not null,
  status text not null default 'ontvangen' check (status in ('ontvangen', 'verwerkt', 'mislukt', 'genegeerd')),
  fout text,
  pogingen integer not null default 0,
  created_at timestamptz not null default now(),
  verwerkt_op timestamptz,
  unique (bron, sleutel)
);

create table crm_review (
  id uuid primary key default gen_random_uuid(),
  soort text not null check (soort in ('duplicaat', 'boeking_zonder_lead', 'attributie')),
  contact_id uuid references crm_contacts (id) on delete cascade,
  ander_contact_id uuid references crm_contacts (id) on delete cascade,
  appointment_id uuid references crm_appointments (id) on delete cascade,
  info jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'opgelost', 'genegeerd')),
  opgelost_door text,
  created_at timestamptz not null default now()
);

create table crm_settings (
  id integer primary key default 1 check (id = 1),
  auto_doorbellen boolean not null default true,
  aftel_sec integer not null default 5,
  reservering_min integer not null default 15,
  calendly_url_kennismaking text,
  calendly_url_sales text,
  calendly_event_kennismaking text not null default 'Kennismaking gesprek',
  calendly_event_sales text not null default 'Salesgesprek',
  calendly_webhook_uri text,
  calendly_signing_key text,
  utm_campaign text not null default 'outbound',
  opnemen boolean not null default false,
  opname_melding text not null default 'Dit gesprek kan worden opgenomen voor trainingsdoeleinden.',
  bewaartermijn_dagen integer not null default 90,
  commissie_grondslag text not null default 'contractwaarde excl. btw',
  laatste_sync timestamptz,
  laatste_sync_fout text
);
insert into crm_settings (id) values (1);

-- ---------- Commissiegrootboek ----------
create table commission_ledger (
  id uuid primary key default gen_random_uuid(),
  setter_id uuid not null references acq_setters (id),
  soort text not null check (soort in ('basis', 'show', 'bonus', 'close', 'correctie', 'uitbetaling')),
  sleutel text not null unique,          -- idempotentie, bv. 'show:<contact>'
  contact_id uuid references crm_contacts (id),
  opp_id uuid references crm_opportunities (id),
  appointment_id uuid references crm_appointments (id),
  periode_start date not null,
  datum date not null,
  grondslag_cents integer,
  percentage numeric,
  bedrag_cents integer not null,
  status text not null default 'verdiend' check (status in ('verdiend', 'goedgekeurd', 'uitbetaald', 'vervallen')),
  regel_versie text not null,
  uitleg text not null,
  gecorrigeerd_van uuid references commission_ledger (id),
  door text not null default 'systeem',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index commission_ledger_setter on commission_ledger (setter_id, periode_start);

alter table crm_consents enable row level security;
alter table crm_calls enable row level security;
alter table crm_templates enable row level security;
alter table crm_messages enable row level security;
alter table crm_scripts enable row level security;
alter table crm_tasks enable row level security;
alter table crm_booking_refs enable row level security;
alter table crm_appointments enable row level security;
alter table crm_webhook_events enable row level security;
alter table crm_review enable row level security;
alter table crm_settings enable row level security;
alter table commission_ledger enable row level security;
revoke execute on function crm_reserveer_volgende(uuid, integer, uuid[]) from public, anon, authenticated;
revoke execute on function crm_reserveer(uuid, uuid, integer) from public, anon, authenticated;

-- Startgegevens: standaard WAVO-bericht en een basisscript (aanpasbaar in Instellingen).
insert into crm_templates (naam, kanaal, doel, tekst) values
  ('WAVO na gemiste oproep', 'whatsapp', 'wavo', 'Hoi {{voornaam}}, ik probeerde je net te bellen namens Gewoon Doen Marketing. We helpen salons zoals {{salon}} aan meer klanten via online campagnes. Wanneer schikt het om even kort te bellen? Groet, {{setter}}');
insert into crm_scripts (naam, opening, kwalificatie, pitch, bezwaren, afsluiting) values (
  'Koude acquisitie salons',
  'Goedemiddag, je spreekt met {{setter}} van Gewoon Doen Marketing. Spreek ik met de eigenaar van {{salon}}?',
  E'- Hoe komen nieuwe klanten nu bij jullie binnen?\n- Welke behandeling willen jullie vaker verkopen?\n- Hebben jullie ruimte in de agenda?',
  'Wij zorgen met campagnes voor een vaste stroom nieuwe klanten voor één behandeling, en plannen die direct in jullie agenda.',
  '[{"bezwaar":"Te duur","antwoord":"Snap ik. In het kennismakingsgesprek rekenen we samen uit wat één nieuwe klant jullie oplevert."},{"bezwaar":"Geen tijd","antwoord":"Het gesprek duurt 20 minuten; wanneer past het beter?"},{"bezwaar":"Stuur eerst info","antwoord":"Doe ik. Zullen we meteen een kort moment plannen om het door te nemen?"},{"bezwaar":"We hebben al een bureau","antwoord":"Prima. Veel salons gebruiken ons gesprek als second opinion; vrijblijvend."}]',
  'Zullen we een kort kennismakingsgesprek inplannen? Ik stuur je direct de uitnodiging.'
);
