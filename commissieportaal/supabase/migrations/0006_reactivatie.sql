-- Reactivatie: tijdelijke afvinklijsten "op locatie geweest" voor salons. Telt niet mee voor commissie.

create table reactivation_campaigns (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  bronnen jsonb not null default '[]'::jsonb,   -- [{url, titel, groen}]
  created_at timestamptz not null default now()
);

create table reactivation_lists (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references reactivation_campaigns (id) on delete cascade,
  clinic_id uuid not null references clinics (id),
  token text not null unique,
  items_json jsonb not null,                     -- [{id, naam, campagne, bron, verschenen}]
  locked boolean not null default false,
  sent_at timestamptz,
  sent_to text,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (campaign_id, clinic_id)
);

alter table reactivation_campaigns enable row level security;
alter table reactivation_lists enable row level security;
