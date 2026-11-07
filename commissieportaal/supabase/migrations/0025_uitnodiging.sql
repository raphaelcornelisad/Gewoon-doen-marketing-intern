-- Uitnodigingsmail voor gebruikers: knop in Beheer of via de wachtrij (uitnodigen = true, verstuurd door de cron).
alter table acq_setters add column if not exists uitnodigen boolean not null default false;
alter table acq_setters add column if not exists uitgenodigd_op timestamptz;
