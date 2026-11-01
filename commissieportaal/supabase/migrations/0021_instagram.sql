-- Instagram-DM's als eigen bron naast het CRM (fase 1: alleen lezen + setter-pijplijn).
-- Puur additief: alleen nieuwe ig_-tabellen en een nieuwe functie. Geen wijziging aan bestaande tabellen.
-- Gevuld door de sync-job op de box via POST /api/ig/sync (Bearer IG_SYNC_SECRET).

-- Eigen Instagram-account(s).
create table ig_accounts (
  id uuid primary key default gen_random_uuid(),
  ig_user_id text not null unique,
  gebruikersnaam text,
  crm_id uuid references crm_werkruimtes (id),
  created_at timestamptz not null default now()
);

-- Een gesprek met een lead.
create table ig_threads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references ig_accounts (id),
  ig_conversation_id text not null,
  lead_ig_id text,
  lead_gebruikersnaam text,
  contact_id uuid references crm_contacts (id) on delete set null,
  gestart_door text not null default 'onbekend' check (gestart_door in ('wij', 'lead', 'onbekend')),
  eerste_bericht_op timestamptz,
  laatste_bericht_op timestamptz,
  laatste_van text check (laatste_van in ('wij', 'lead')),
  laatste_tekst text,
  intern boolean not null default false,
  is_spam boolean not null default false,
  bestaande_klant boolean not null default false,
  fase text not null default 'opener_gestuurd' check (fase in (
    'opener_gestuurd', 'in_gesprek', 'video_gestuurd', 'bookinglink_gestuurd', 'call_geboekt',
    'geen_interesse', 'niet_bruikbaar', 'intern', 'spam'
  )),
  fase_sinds timestamptz not null default now(),
  -- 'handmatig' (gesleept in het dashboard) wint: de sync overschrijft die fase nooit.
  fase_bron text not null default 'script' check (fase_bron in ('script', 'brein', 'handmatig')),
  fase_door text,
  -- Tijdstip van het laatste echte leadbericht (geen autoreply) waar wij nog niet op reageerden.
  wacht_op_ons_sinds timestamptz,
  bookinglink_op timestamptz,
  geboekt_op timestamptz,
  calendly_invitee_uri text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, ig_conversation_id)
);
create index ig_threads_laatste on ig_threads (account_id, laatste_bericht_op desc);
create index ig_threads_fase on ig_threads (fase);
create index ig_threads_wacht on ig_threads (wacht_op_ons_sinds);

-- Een bericht.
create table ig_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references ig_threads (id) on delete cascade,
  ig_message_id text not null unique,
  van text not null check (van in ('wij', 'lead')),
  verzonden_op timestamptz not null,
  tekst text,
  extra text[] not null default '{}',
  links text[] not null default '{}',
  is_bookinglink boolean not null default false,
  is_autoreply boolean not null default false,
  autoreply_bevestigd boolean,
  created_at timestamptz not null default now()
);
create index ig_messages_thread on ig_messages (thread_id, verzonden_op);

-- Rapportcijfers per dag (venster 08:00 tot 08:00 Amsterdam). null = nog niet beoordeeld.
create table ig_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references ig_accounts (id),
  rapportdag date not null,
  venster_start timestamptz,
  venster_eind timestamptz,
  nieuwe_gesprekken integer,
  nieuw_door_ons integer,
  nieuw_door_lead integer,
  lopende_gesprekken integer,
  echte_reactie_lead integer,
  alleen_autoreply integer,
  geen_reactie integer,
  reactie_openers_pct numeric(5, 1),
  signaal_sterk integer,
  signaal_lauw integer,
  geen_interesse integer,
  bookinglinks integer,
  calls_bevestigd integer,
  te_laat_30min integer,
  wacht_nu_op_ons integer,
  calendly_nieuw_alle_bronnen integer,
  berichten_van_ons integer,
  berichten_van_leads integer,
  bron jsonb not null default '{}',
  berekend_op timestamptz not null default now(),
  unique (account_id, rapportdag)
);

-- Bewijs dat de sync draait.
create table ig_sync_runs (
  id uuid primary key default gen_random_uuid(),
  gestart_op timestamptz not null default now(),
  klaar_op timestamptz,
  gesprekken integer,
  berichten_nieuw integer,
  fouten integer not null default 0,
  fout text
);
create index ig_sync_runs_gestart on ig_sync_runs (gestart_op desc);

-- Alles dicht voor anon/authenticated (ook als Supabase standaardrechten heeft uitgedeeld); alleen de server.
alter table ig_accounts enable row level security;
alter table ig_threads enable row level security;
alter table ig_messages enable row level security;
alter table ig_daily_metrics enable row level security;
alter table ig_sync_runs enable row level security;
revoke all on ig_accounts, ig_threads, ig_messages, ig_daily_metrics, ig_sync_runs from anon, authenticated;
grant select, insert, update, delete on ig_accounts, ig_threads, ig_messages, ig_daily_metrics, ig_sync_runs to service_role;

-- Een sync-batch in één transactie: account, gesprekken, berichten en dagcijfers.
-- Idempotent: upserts op (account, ig_conversation_id) en ig_message_id.
-- Een fase met fase_bron = 'handmatig' wordt nooit overschreven.
-- Dagcijfers: alleen de meegestuurde kolommen worden bijgewerkt (een oordeel blijft staan als de sync alleen tellingen stuurt).
create or replace function ig_sync(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_account uuid;
  v_thread uuid;
  t jsonb;
  m jsonb;
  d jsonb;
  v_nieuw boolean;
  v_gesprekken integer := 0;
  v_berichten_nieuw integer := 0;
  v_dagen integer := 0;
  v_raak uuid[] := '{}';
begin
  insert into ig_accounts (ig_user_id, gebruikersnaam)
  values (p #>> '{account,ig_user_id}', p #>> '{account,gebruikersnaam}')
  on conflict (ig_user_id) do update set gebruikersnaam = coalesce(excluded.gebruikersnaam, ig_accounts.gebruikersnaam)
  returning id into v_account;

  for t in select * from jsonb_array_elements(coalesce(p -> 'threads', '[]'::jsonb)) loop
    insert into ig_threads as it (
      account_id, ig_conversation_id, lead_ig_id, lead_gebruikersnaam, gestart_door, intern, is_spam, bestaande_klant,
      fase, fase_bron, bookinglink_op, geboekt_op, calendly_invitee_uri
    ) values (
      v_account,
      t ->> 'ig_conversation_id',
      t ->> 'lead_ig_id',
      t ->> 'lead_gebruikersnaam',
      coalesce(t ->> 'gestart_door', 'onbekend'),
      coalesce((t ->> 'intern')::boolean, false),
      coalesce((t ->> 'is_spam')::boolean, false),
      coalesce((t ->> 'bestaande_klant')::boolean, false),
      coalesce(t ->> 'fase', 'opener_gestuurd'),
      coalesce(t ->> 'fase_bron', 'script'),
      (t ->> 'bookinglink_op')::timestamptz,
      (t ->> 'geboekt_op')::timestamptz,
      t ->> 'calendly_invitee_uri'
    )
    on conflict (account_id, ig_conversation_id) do update set
      lead_ig_id = coalesce(excluded.lead_ig_id, it.lead_ig_id),
      lead_gebruikersnaam = coalesce(excluded.lead_gebruikersnaam, it.lead_gebruikersnaam),
      gestart_door = case when t ? 'gestart_door' then excluded.gestart_door else it.gestart_door end,
      intern = case when t ? 'intern' then excluded.intern else it.intern end,
      is_spam = case when t ? 'is_spam' then excluded.is_spam else it.is_spam end,
      bestaande_klant = case when t ? 'bestaande_klant' then excluded.bestaande_klant else it.bestaande_klant end,
      fase = case when it.fase_bron = 'handmatig' or not (t ? 'fase') then it.fase else excluded.fase end,
      fase_bron = case when it.fase_bron = 'handmatig' or not (t ? 'fase') then it.fase_bron else excluded.fase_bron end,
      fase_sinds = case when it.fase_bron = 'handmatig' or not (t ? 'fase') or excluded.fase = it.fase then it.fase_sinds else now() end,
      bookinglink_op = coalesce(excluded.bookinglink_op, it.bookinglink_op),
      geboekt_op = coalesce(excluded.geboekt_op, it.geboekt_op),
      calendly_invitee_uri = coalesce(excluded.calendly_invitee_uri, it.calendly_invitee_uri),
      updated_at = now()
    returning id into v_thread;
    v_gesprekken := v_gesprekken + 1;
    v_raak := v_raak || v_thread;

    for m in select * from jsonb_array_elements(coalesce(t -> 'messages', '[]'::jsonb)) loop
      insert into ig_messages as im (
        thread_id, ig_message_id, van, verzonden_op, tekst, extra, links, is_bookinglink, is_autoreply, autoreply_bevestigd
      ) values (
        v_thread,
        m ->> 'ig_message_id',
        m ->> 'van',
        (m ->> 'verzonden_op')::timestamptz,
        m ->> 'tekst',
        coalesce(array(select jsonb_array_elements_text(m -> 'extra')), '{}'),
        coalesce(array(select jsonb_array_elements_text(m -> 'links')), '{}'),
        coalesce((m ->> 'is_bookinglink')::boolean, false),
        coalesce((m ->> 'is_autoreply')::boolean, false),
        (m ->> 'autoreply_bevestigd')::boolean
      )
      on conflict (ig_message_id) do update set
        tekst = coalesce(excluded.tekst, im.tekst),
        extra = excluded.extra,
        links = excluded.links,
        is_bookinglink = excluded.is_bookinglink,
        is_autoreply = excluded.is_autoreply,
        autoreply_bevestigd = coalesce(excluded.autoreply_bevestigd, im.autoreply_bevestigd)
      returning (xmax = 0) into v_nieuw;
      if v_nieuw then
        v_berichten_nieuw := v_berichten_nieuw + 1;
      end if;
    end loop;
  end loop;

  -- Afgeleide velden opnieuw berekenen uit de opgeslagen berichten van de geraakte gesprekken.
  update ig_threads it set
    eerste_bericht_op = s.eerste,
    laatste_bericht_op = s.laatste,
    laatste_van = s.laatste_van,
    laatste_tekst = s.laatste_tekst,
    wacht_op_ons_sinds = case when s.laatste_echt_lead > coalesce(s.laatste_wij, '-infinity'::timestamptz) then s.laatste_echt_lead end
  from (
    select
      thread_id,
      min(verzonden_op) as eerste,
      max(verzonden_op) as laatste,
      (array_agg(van order by verzonden_op desc, ig_message_id desc))[1] as laatste_van,
      (array_agg(tekst order by verzonden_op desc, ig_message_id desc))[1] as laatste_tekst,
      max(verzonden_op) filter (where van = 'wij') as laatste_wij,
      max(verzonden_op) filter (where van = 'lead' and not coalesce(autoreply_bevestigd, is_autoreply)) as laatste_echt_lead
    from ig_messages
    where thread_id = any (v_raak)
    group by thread_id
  ) s
  where it.id = s.thread_id;

  for d in select * from jsonb_array_elements(coalesce(p -> 'metrics', '[]'::jsonb)) loop
    insert into ig_daily_metrics as dm (account_id, rapportdag) values (v_account, (d ->> 'rapportdag')::date)
    on conflict (account_id, rapportdag) do nothing;
    update ig_daily_metrics dm set
      venster_start = case when d ? 'venster_start' then (d ->> 'venster_start')::timestamptz else dm.venster_start end,
      venster_eind = case when d ? 'venster_eind' then (d ->> 'venster_eind')::timestamptz else dm.venster_eind end,
      nieuwe_gesprekken = case when d ? 'nieuwe_gesprekken' then (d ->> 'nieuwe_gesprekken')::integer else dm.nieuwe_gesprekken end,
      nieuw_door_ons = case when d ? 'nieuw_door_ons' then (d ->> 'nieuw_door_ons')::integer else dm.nieuw_door_ons end,
      nieuw_door_lead = case when d ? 'nieuw_door_lead' then (d ->> 'nieuw_door_lead')::integer else dm.nieuw_door_lead end,
      lopende_gesprekken = case when d ? 'lopende_gesprekken' then (d ->> 'lopende_gesprekken')::integer else dm.lopende_gesprekken end,
      echte_reactie_lead = case when d ? 'echte_reactie_lead' then (d ->> 'echte_reactie_lead')::integer else dm.echte_reactie_lead end,
      alleen_autoreply = case when d ? 'alleen_autoreply' then (d ->> 'alleen_autoreply')::integer else dm.alleen_autoreply end,
      geen_reactie = case when d ? 'geen_reactie' then (d ->> 'geen_reactie')::integer else dm.geen_reactie end,
      reactie_openers_pct = case when d ? 'reactie_openers_pct' then (d ->> 'reactie_openers_pct')::numeric else dm.reactie_openers_pct end,
      signaal_sterk = case when d ? 'signaal_sterk' then (d ->> 'signaal_sterk')::integer else dm.signaal_sterk end,
      signaal_lauw = case when d ? 'signaal_lauw' then (d ->> 'signaal_lauw')::integer else dm.signaal_lauw end,
      geen_interesse = case when d ? 'geen_interesse' then (d ->> 'geen_interesse')::integer else dm.geen_interesse end,
      bookinglinks = case when d ? 'bookinglinks' then (d ->> 'bookinglinks')::integer else dm.bookinglinks end,
      calls_bevestigd = case when d ? 'calls_bevestigd' then (d ->> 'calls_bevestigd')::integer else dm.calls_bevestigd end,
      te_laat_30min = case when d ? 'te_laat_30min' then (d ->> 'te_laat_30min')::integer else dm.te_laat_30min end,
      wacht_nu_op_ons = case when d ? 'wacht_nu_op_ons' then (d ->> 'wacht_nu_op_ons')::integer else dm.wacht_nu_op_ons end,
      calendly_nieuw_alle_bronnen = case when d ? 'calendly_nieuw_alle_bronnen' then (d ->> 'calendly_nieuw_alle_bronnen')::integer else dm.calendly_nieuw_alle_bronnen end,
      berichten_van_ons = case when d ? 'berichten_van_ons' then (d ->> 'berichten_van_ons')::integer else dm.berichten_van_ons end,
      berichten_van_leads = case when d ? 'berichten_van_leads' then (d ->> 'berichten_van_leads')::integer else dm.berichten_van_leads end,
      bron = dm.bron || coalesce(d -> 'bron', '{}'::jsonb),
      berekend_op = now()
    where dm.account_id = v_account and dm.rapportdag = (d ->> 'rapportdag')::date;
    v_dagen := v_dagen + 1;
  end loop;

  return jsonb_build_object('account_id', v_account, 'gesprekken', v_gesprekken, 'berichten_nieuw', v_berichten_nieuw, 'dagen', v_dagen);
end;
$$;
revoke execute on function ig_sync(jsonb) from public, anon, authenticated;
grant execute on function ig_sync(jsonb) to service_role;
