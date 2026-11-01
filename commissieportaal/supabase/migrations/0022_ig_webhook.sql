-- Instagram realtime (fase 3): log van binnenkomende Meta-webhooks, voor dedup en foutopsporing.
-- Puur additief: één nieuwe tabel. Geen wijziging aan bestaande tabellen, constraints of functies.
-- Geschreven door POST /api/ig/webhook, alleen na een geldige X-Hub-Signature-256.

create table ig_webhook_events (
  id uuid primary key default gen_random_uuid(),
  ontvangen_op timestamptz not null default now(),
  -- sha256 van de ruwe body: dezelfde levering (Meta herhaalt bij fouten) geeft hetzelfde id.
  event_id text not null unique,
  status text not null default 'ontvangen' check (status in ('ontvangen', 'verwerkt', 'mislukt', 'genegeerd')),
  fout text,
  berichten integer,
  verwerkt_op timestamptz
);
create index ig_webhook_events_ontvangen on ig_webhook_events (ontvangen_op desc);

-- Zelfde patroon als 0021: RLS aan zonder policies, dicht voor anon/authenticated, alleen service_role.
alter table ig_webhook_events enable row level security;
revoke all on ig_webhook_events from anon, authenticated;
grant select, insert, update, delete on ig_webhook_events to service_role;
