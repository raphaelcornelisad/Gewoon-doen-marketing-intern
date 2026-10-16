-- Logboek van verstuurde automatische mails, zodat een mail nooit dubbel gaat.
create table mail_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null,          -- bv. 'maandmail'
  period_key text not null,    -- bv. '2026-10-14' (eind van de periode)
  email citext not null,
  sent_at timestamptz not null default now(),
  unique (kind, period_key, email)
);

alter table mail_log enable row level security;
