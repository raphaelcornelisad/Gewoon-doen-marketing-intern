-- Benaming: WAFU (WhatsApp follow-up) in plaats van WAVO.
update crm_opportunities set fase = 'wafu' where pijplijn = 'outbound' and fase = 'wavo';
update crm_activities set van = 'wafu' where van = 'wavo';
update crm_activities set naar = 'wafu' where naar = 'wavo';
update crm_calls set uitkomst = 'wafu' where uitkomst = 'wavo';
update crm_templates set doel = 'wafu', naam = replace(naam, 'WAVO', 'WAFU') where doel = 'wavo' or naam like '%WAVO%';
alter table crm_templates alter column doel set default 'wafu';

create or replace function crm_reserveer_volgende(p_setter uuid, p_minuten integer, p_overslaan uuid[] default '{}')
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  update crm_contacts set gereserveerd_door = null, gereserveerd_tot = null where gereserveerd_door = p_setter;
  select c.id into v_id
  from crm_contacts c
  join crm_opportunities o on o.contact_id = c.id and o.pijplijn = 'outbound'
  where o.fase in ('nieuw', 'niet_opgenomen', 'wafu', 'terugbellen')
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
revoke execute on function crm_reserveer_volgende(uuid, integer, uuid[]) from public, anon, authenticated;
grant execute on function crm_reserveer_volgende(uuid, integer, uuid[]) to service_role;
