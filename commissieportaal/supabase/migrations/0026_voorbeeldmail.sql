-- Wachtrij voor een voorbeeld van de kliniekmail aan de admin (verstuurd door de cron).
alter table settings add column if not exists voorbeeldmail_kliniek uuid references clinics (id);
