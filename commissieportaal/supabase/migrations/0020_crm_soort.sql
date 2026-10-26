-- Soort CRM bepaalt de outbound-fases: 'standaard' (koude acquisitie) of 'leadmagnet' (opvolging met video).
alter table crm_werkruimtes add column if not exists soort text not null default 'standaard' check (soort in ('standaard', 'leadmagnet'));
update crm_werkruimtes set naam = 'Lead magnet', soort = 'leadmagnet' where id = 'f7f633fa-f8c1-4994-9b33-e87e82456b24';
