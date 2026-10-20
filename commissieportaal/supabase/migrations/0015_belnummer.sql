-- Eigen belnummer per setter (geverifieerd caller-ID in Twilio); de klant ziet alleen dit nummer.
alter table acq_setters add column beller_nummer text check (beller_nummer is null or beller_nummer ~ '^\+[1-9][0-9]{7,14}$');
