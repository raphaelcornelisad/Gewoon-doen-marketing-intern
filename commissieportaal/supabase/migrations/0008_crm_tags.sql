-- Vrije tags per contact (zoals in GoHighLevel).
alter table crm_contacts add column tags text[] not null default '{}';
create index crm_contacts_tags on crm_contacts using gin (tags);
