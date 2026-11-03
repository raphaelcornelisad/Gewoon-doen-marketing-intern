-- Bronvermelding voor de videopagina's (/video en /video-2 op de beauty-site).
-- Puur additief: één nieuwe tabel en één nieuwe leesfunctie. Geen wijziging aan bestaande tabellen of functies.
-- Geschreven door POST /api/track/video (service_role). Geen IP-adres, geen ruwe user agent, geen cookies.

create table video_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null check (event in ('view', 'play', 'calendly_view', 'booked')),
  page text not null check (page in ('video', 'video-2')),
  source text not null check (source ~ '^[a-z0-9_-]{1,40}$'),
  -- Willekeurige uuid per browser (localStorage op de pagina), geen persoonsgegeven.
  visitor_id uuid not null,
  utm jsonb not null default '{}'::jsonb,
  -- Alleen origin + pad van de verwijzer, zonder querystring.
  referrer text,
  -- sha256 van de user agent, alleen om bots en dubbelingen te kunnen herkennen.
  user_agent_hash text,
  calendly_event_uri text,
  calendly_invitee_uri text
);
create index video_events_source_created on video_events (source, created_at);
create index video_events_visitor on video_events (visitor_id);

-- Zelfde patroon als 0021/0022: RLS aan zonder policies, dicht voor anon/authenticated, alleen service_role.
-- CRM-gebruikers lezen via de server (service_role), zoals de rest van het CRM.
alter table video_events enable row level security;
revoke all on video_events from anon, authenticated;
grant select, insert, update, delete on video_events to service_role;

-- Tellingen per bron en pagina sinds p_van (tot p_tot), plus subtotaal per bron (page null) en totaal (source null).
-- Unieke bezoekers, plays en Calendly-weergaven tellen browsers; boekingen tellen unieke Calendly-invitees.
create function video_bronnen(p_van timestamptz, p_tot timestamptz default now())
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(r order by r.source nulls last, r.page nulls first), '[]'::jsonb)
  from (
    select
      source,
      page,
      count(distinct visitor_id)::int as bezoekers,
      count(distinct visitor_id) filter (where event = 'play')::int as plays,
      count(distinct visitor_id) filter (where event = 'calendly_view')::int as calendly_views,
      count(distinct coalesce(calendly_invitee_uri, visitor_id::text)) filter (where event = 'booked')::int as boekingen
    from video_events
    where created_at >= p_van and created_at < p_tot
    group by grouping sets ((source, page), (source), ())
  ) r;
$$;
revoke all on function video_bronnen(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function video_bronnen(timestamptz, timestamptz) to service_role;
