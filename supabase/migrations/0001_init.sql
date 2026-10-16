-- Commissieportaal — basisschema
-- Alle lees- en schrijfacties lopen via server-side routes met de service role.
-- RLS staat aan zonder policies, dus de anon key kan niets lezen of schrijven.

create extension if not exists citext;

create table setters (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  email citext not null unique,
  actief boolean not null default true,
  is_nieuw boolean not null default true,
  created_at timestamptz not null default now()
);

create table periods (
  id uuid primary key default gen_random_uuid(),
  start date not null,
  eind date not null,
  label text not null,
  unique (start, eind),
  check (eind > start)
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  setter_id uuid not null references setters (id),
  period_id uuid not null references periods (id),
  sheet_url text not null,
  sheet_id text not null,
  sheet_title text not null,
  snapshot_json jsonb not null,
  counts_json jsonb not null,
  corrections_json jsonb not null default '[]'::jsonb,
  commission_json jsonb not null,
  settings_json jsonb not null,
  status text not null default 'te_controleren'
    check (status in ('te_controleren', 'goedgekeurd', 'vervangen')),
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  replaced_by uuid references submissions (id)
);

-- Eén actieve indiening per setter en periode; vervangen indieningen blijven bewaard.
create unique index submissions_one_active
  on submissions (setter_id, period_id)
  where status <> 'vervangen';

create index submissions_period on submissions (period_id);

-- Snapshot is onveranderlijk; een goedgekeurde indiening gaat helemaal op slot.
create or replace function submissions_guard() returns trigger
language plpgsql as $$
begin
  if new.snapshot_json is distinct from old.snapshot_json
     or new.counts_json is distinct from old.counts_json
     or new.sheet_url is distinct from old.sheet_url
     or new.sheet_id is distinct from old.sheet_id
     or new.setter_id is distinct from old.setter_id
     or new.submitted_at is distinct from old.submitted_at then
    raise exception 'De snapshot van een indiening kan niet worden gewijzigd';
  end if;
  if old.status = 'goedgekeurd' then
    raise exception 'Een goedgekeurde indiening kan niet worden gewijzigd';
  end if;
  return new;
end $$;

create trigger submissions_guard
  before update on submissions
  for each row execute function submissions_guard();

create table attendance (
  id uuid primary key default gen_random_uuid(),
  setter_id uuid not null references setters (id),
  period_id uuid not null references periods (id),
  max_count integer not null,
  clinic_checked_count integer not null default 0,
  approved_count integer,
  status text not null default 'open'
    check (status in ('open', 'bevestigd', 'uitbetaald')),
  paid_in_period_id uuid references periods (id),
  unique (setter_id, period_id),
  check (approved_count is null or approved_count between 0 and max_count),
  check ((status = 'uitbetaald') = (paid_in_period_id is not null))
);

create table clinics (
  id uuid primary key default gen_random_uuid(),
  naam text not null unique,
  email text,
  email_override text,
  notion_page_id text
);

create table tab_clinic_map (
  tab_naam text primary key,
  clinic_id uuid not null references clinics (id) on delete cascade
);

create table checklists (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id),
  setter_id uuid not null references setters (id),
  period_id uuid not null references periods (id),
  token text not null unique,
  items_json jsonb not null,
  locked boolean not null default false,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (clinic_id, setter_id, period_id)
);

create table settings (
  id integer primary key default 1 check (id = 1),
  admin_fee_cents integer not null default 15000,
  per_lead_cents integer not null default 200,
  bonus_per_100_cents integer not null default 2500,
  attendance_per_lead_cents integer not null default 100,
  counted_colors text[] not null default '{groen}',
  niet_ingepland_x_telt boolean not null default false,
  wafu_t_telt boolean not null default false,
  max_pogingen_per_lead integer not null default 4
);

insert into settings (id) values (1);

alter table setters enable row level security;
alter table periods enable row level security;
alter table submissions enable row level security;
alter table attendance enable row level security;
alter table clinics enable row level security;
alter table tab_clinic_map enable row level security;
alter table checklists enable row level security;
alter table settings enable row level security;

-- Indienen in één transactie: vervangt een open indiening, blokkeert bij een goedgekeurde.
create or replace function submit_snapshot(
  p_setter_id uuid,
  p_period_id uuid,
  p_sheet_url text,
  p_sheet_id text,
  p_sheet_title text,
  p_snapshot jsonb,
  p_counts jsonb,
  p_commission jsonb,
  p_settings jsonb
) returns jsonb
language plpgsql as $$
declare
  v_old submissions%rowtype;
  v_new_id uuid;
begin
  select * into v_old from submissions
   where setter_id = p_setter_id and period_id = p_period_id and status <> 'vervangen'
   for update;

  if found and v_old.status = 'goedgekeurd' then
    return jsonb_build_object('result', 'geblokkeerd', 'id', v_old.id);
  end if;

  if found then
    update submissions set status = 'vervangen' where id = v_old.id;
  end if;

  insert into submissions (setter_id, period_id, sheet_url, sheet_id, sheet_title,
                           snapshot_json, counts_json, commission_json, settings_json)
  values (p_setter_id, p_period_id, p_sheet_url, p_sheet_id, p_sheet_title,
          p_snapshot, p_counts, p_commission, p_settings)
  returning id into v_new_id;

  if v_old.id is not null then
    update submissions set replaced_by = v_new_id where id = v_old.id;
  end if;

  return jsonb_build_object(
    'result', case when v_old.id is null then 'nieuw' else 'vervangen' end,
    'id', v_new_id,
    'replaced_id', v_old.id
  );
end $$;

revoke execute on function submit_snapshot(uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
