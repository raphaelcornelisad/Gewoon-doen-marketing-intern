-- Meerdere CRM's (bijv. Laser ontharen). Elk CRM heeft een eigen leadlijst; gebruikers, Calendly en commissie zijn gedeeld.
create table crm_werkruimtes (
  id uuid primary key default gen_random_uuid(),
  naam text not null unique check (length(trim(naam)) between 2 and 60),
  created_at timestamptz not null default now()
);
alter table crm_werkruimtes enable row level security;
insert into crm_werkruimtes (id, naam) values ('00000000-0000-4000-8000-000000000001', 'Laser ontharen');

alter table crm_contacts add column crm_id uuid not null default '00000000-0000-4000-8000-000000000001' references crm_werkruimtes (id);
create index crm_contacts_crm on crm_contacts (crm_id);

-- Dubbelcheck per CRM: dezelfde salon mag in twee CRM's voorkomen.
drop index crm_contacts_tel;
drop index crm_contacts_email;
create unique index crm_contacts_tel on crm_contacts (crm_id, telefoon_norm) where telefoon_norm is not null;
create unique index crm_contacts_email on crm_contacts (crm_id, email) where email is not null;

drop function crm_reserveer_volgende(uuid, integer, uuid[]);
create function crm_reserveer_volgende(p_setter uuid, p_minuten integer, p_overslaan uuid[] default '{}', p_crm uuid default '00000000-0000-4000-8000-000000000001')
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  update crm_contacts set gereserveerd_door = null, gereserveerd_tot = null where gereserveerd_door = p_setter;
  select c.id into v_id
  from crm_contacts c
  join crm_opportunities o on o.contact_id = c.id and o.pijplijn = 'outbound'
  where c.crm_id = p_crm
    and o.fase in ('nieuw', 'niet_opgenomen', 'wafu', 'terugbellen')
    and not c.niet_benaderen
    and c.telefoon_norm is not null
    and (c.eigenaar_id is null or c.eigenaar_id = p_setter)
    and (c.gereserveerd_tot is null or c.gereserveerd_tot < now())
    and (c.volgende_opvolging_op is null or c.volgende_opvolging_op <= now())
    and not (c.id = any (p_overslaan))
  order by
    (c.volgende_opvolging_op is not null) desc,
    c.volgende_opvolging_op asc nulls last,
    (c.eigenaar_id = p_setter) desc nulls last,
    c.belpogingen asc,
    c.created_at asc
  limit 1
  for update of c skip locked;
  if v_id is not null then
    update crm_contacts set gereserveerd_door = p_setter, gereserveerd_tot = now() + make_interval(mins => p_minuten) where id = v_id;
  end if;
  return v_id;
end $$;
revoke execute on function crm_reserveer_volgende(uuid, integer, uuid[], uuid) from public, anon, authenticated;
grant execute on function crm_reserveer_volgende(uuid, integer, uuid[], uuid) to service_role;
grant select, insert, update, delete on crm_werkruimtes to service_role;
