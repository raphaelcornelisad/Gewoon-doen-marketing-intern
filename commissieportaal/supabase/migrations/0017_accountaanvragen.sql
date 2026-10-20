-- Accountaanvragen: iemand meldt zich aan, de admin keurt goed (dan pas een gebruiker) of wijst af.
create table crm_accountaanvragen (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  email text not null,
  telefoon text,
  rol text not null default 'setter' check (rol in ('setter', 'sales')),
  toelichting text,
  status text not null default 'open' check (status in ('open', 'goedgekeurd', 'afgewezen')),
  beoordeeld_door text,
  beoordeeld_op timestamptz,
  ip text,
  created_at timestamptz not null default now()
);
create unique index crm_accountaanvragen_open on crm_accountaanvragen (lower(email)) where status = 'open';
alter table crm_accountaanvragen enable row level security;
grant select, insert, update, delete on crm_accountaanvragen to service_role;
