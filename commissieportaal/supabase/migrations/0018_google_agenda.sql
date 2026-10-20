-- Google Agenda per setter: terugbelmomenten en taken komen als afspraak met herinnering in haar eigen agenda.
create table crm_google_koppelingen (
  setter_id uuid primary key references acq_setters (id) on delete cascade,
  google_email text,
  refresh_token_enc text not null,
  gekoppeld_op timestamptz not null default now(),
  laatste_fout text,
  laatste_fout_op timestamptz
);
alter table crm_google_koppelingen enable row level security;
grant select, insert, update, delete on crm_google_koppelingen to service_role;

alter table crm_contacts add column google_event_id text, add column google_event_setter uuid references acq_setters (id) on delete set null;
alter table crm_tasks add column google_event_id text, add column google_event_setter uuid references acq_setters (id) on delete set null;
