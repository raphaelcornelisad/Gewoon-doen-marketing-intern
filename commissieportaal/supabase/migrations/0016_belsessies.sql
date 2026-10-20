-- Belsessies: setter start, pauzeert en dient in; tellers worden bij indienen vastgelegd.
create table crm_belsessies (
  id uuid primary key default gen_random_uuid(),
  setter_id uuid not null references acq_setters (id),
  crm_id uuid references crm_werkruimtes (id),
  status text not null default 'actief' check (status in ('actief', 'ingediend')),
  gestart_op timestamptz not null default now(),
  beeindigd_op timestamptz,
  pauze_sec integer not null default 0,
  pauze_sinds timestamptz,
  gebeld integer,
  gesproken integer,
  wafu integer,
  ingepland integer,
  notitie text,
  created_at timestamptz not null default now()
);
create unique index crm_belsessies_een_actief on crm_belsessies (setter_id) where status = 'actief';
create index crm_belsessies_dag on crm_belsessies (gestart_op);
alter table crm_belsessies enable row level security;
grant select, insert, update, delete on crm_belsessies to service_role;
