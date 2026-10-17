-- Acquisitie-setter (koude acquisitie, gesprekken via Calendly met UTM-code).

create table acq_setters (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  email citext not null unique,
  utm_source text not null unique,     -- vergelijken in kleine letters
  start_datum date not null,           -- klanten met eerste boeking vóór deze datum tellen niet
  actief boolean not null default true,
  created_at timestamptz not null default now()
);

-- Eén rij per Calendly-invitee (= één afspraak van één klant).
create table acq_meetings (
  invitee_uri text primary key,
  event_uri text not null,
  event_name text not null,
  start_time timestamptz not null,
  status text not null check (status in ('active', 'canceled')),
  no_show boolean not null default false,
  email citext,
  phone text,
  naam text not null default '',
  utm_source text,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);
create index acq_meetings_email on acq_meetings (email);
create index acq_meetings_start on acq_meetings (start_time);

-- Closes markeert de admin per klant (klant = genormaliseerde sleutel, bv. 'e:naam@x.nl').
create table acq_closes (
  client_key text primary key,
  setter_id uuid not null references acq_setters (id),
  bedrag_cents integer not null check (bedrag_cents >= 0),
  opmerking text,
  gemarkeerd_op timestamptz not null default now()
);

-- Afrekening per periode; bij goedkeuren gaat het bedrag op slot.
create table acq_statements (
  id uuid primary key default gen_random_uuid(),
  setter_id uuid not null references acq_setters (id),
  start date not null,
  eind date not null,
  calc_json jsonb not null,
  status text not null default 'goedgekeurd' check (status in ('goedgekeurd')),
  approved_at timestamptz not null default now(),
  unique (setter_id, start)
);

create table acq_settings (
  id integer primary key default 1 check (id = 1),
  base_fee_cents integer not null default 50000,
  per_verschenen_cents integer not null default 1000,
  bonus_drempel integer not null default 30,
  bonus_cents integer not null default 50000,
  close_percentage numeric not null default 5,
  event_naam text not null default 'Kennismaking',
  laatste_sync timestamptz
);
insert into acq_settings (id) values (1);

insert into acq_setters (naam, email, utm_source, start_datum)
values ('Mireille', 'mireille.gewoondoenmarketing@gmail.com', 'mireille', '2026-10-12');

alter table acq_setters enable row level security;
alter table acq_meetings enable row level security;
alter table acq_closes enable row level security;
alter table acq_statements enable row level security;
alter table acq_settings enable row level security;
