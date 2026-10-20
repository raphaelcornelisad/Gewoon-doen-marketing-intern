-- Extra wachtwoord voor Beheer (alleen admin), los van de inloglink.
alter table crm_settings
  add column beheer_hash text,
  add column beheer_fouten integer not null default 0,
  add column beheer_blok_tot timestamptz;
