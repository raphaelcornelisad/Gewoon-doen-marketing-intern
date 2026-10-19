-- Opgeslagen weergaven (filters) per gebruiker.
create table crm_views (
  id uuid primary key default gen_random_uuid(),
  eigenaar text not null,          -- e-mail van de gebruiker
  naam text not null,
  pijplijn text not null check (pijplijn in ('outbound', 'sales')),
  query text not null,             -- querystring van de filters
  created_at timestamptz not null default now(),
  unique (eigenaar, pijplijn, naam)
);
alter table crm_views enable row level security;
