-- Outbound CRM + sales-CRM. Eén contact, per pijplijn één kaart (opportunity).

create table crm_contacts (
  id uuid primary key default gen_random_uuid(),
  salon_naam text not null,
  contactpersoon text,
  telefoon text,
  telefoon_norm text,                 -- +31… voor ontdubbelen/koppelen
  email citext,
  website text,
  stad text,
  provincie text,
  behandelingen text[] not null default '{}',
  bron text not null default 'handmatig',   -- sheet | calendly | handmatig
  eigenaar_id uuid references acq_setters (id),  -- setter die de lead heeft opgepakt
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index crm_contacts_tel on crm_contacts (telefoon_norm) where telefoon_norm is not null;
create unique index crm_contacts_email on crm_contacts (email) where email is not null;
create index crm_contacts_stad on crm_contacts (stad);
create index crm_contacts_provincie on crm_contacts (provincie);

create table crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references crm_contacts (id) on delete cascade,
  pijplijn text not null check (pijplijn in ('outbound', 'sales')),
  fase text not null,
  waarde_cents integer check (waarde_cents >= 0),
  setter_id uuid references acq_setters (id),   -- tag: wie heeft ingepland
  invitee_uri text,                              -- gekoppelde Calendly-afspraak
  afspraak_op timestamptz,
  fase_sinds timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, pijplijn)
);
create index crm_opps_board on crm_opportunities (pijplijn, fase);
create index crm_opps_setter on crm_opportunities (setter_id);

create table crm_activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references crm_contacts (id) on delete cascade,
  door text not null,                 -- e-mail van admin/setter of 'calendly'/'import'
  setter_id uuid references acq_setters (id),
  type text not null,                 -- fase | notitie | waarde | import | calendly | gegevens
  pijplijn text,
  van text,
  naar text,
  tekst text,
  created_at timestamptz not null default now()
);
create index crm_act_contact on crm_activities (contact_id, created_at desc);
create index crm_act_fase on crm_activities (type, naar, created_at);

-- Alleen Calendly-afspraken vanaf deze datum komen in het CRM (oude historie blijft erbuiten).
alter table acq_settings add column crm_calendly_vanaf date not null default '2026-10-19';

alter table crm_contacts enable row level security;
alter table crm_opportunities enable row level security;
alter table crm_activities enable row level security;
