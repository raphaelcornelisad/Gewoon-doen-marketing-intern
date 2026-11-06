-- Eigen afkorting op de kaart (bv. "H" voor Mariska Haveman); leeg = initialen van de naam.
alter table acq_setters add column if not exists afkorting text check (afkorting is null or char_length(afkorting) between 1 and 3);
update acq_setters set naam = 'Mariska Haveman', afkorting = 'H' where email = 'mariska.gewoondoenmarketing@gmail.com';
