-- Aanvragen uit de salonfunnels (klanten van de salon, geen outbound-leads).
create table funnel_leads (
  id uuid primary key default gen_random_uuid(),
  salon text not null,
  funnel text not null,
  voornaam text not null,
  achternaam text,
  email text,
  telefoon text,
  telefoon_norm text,
  aanbod text,
  pagina text,
  akkoord boolean not null default false,
  status text not null default 'nieuw' check (status in ('nieuw', 'gebeld', 'geboekt', 'geen_interesse')),
  ip text,
  created_at timestamptz not null default now()
);
create index funnel_leads_salon on funnel_leads (salon, created_at desc);
alter table funnel_leads enable row level security;
grant select, insert, update, delete on funnel_leads to service_role;
