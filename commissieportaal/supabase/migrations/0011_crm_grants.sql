-- Reserveringsfuncties alleen voor de server (service_role), niet voor anon/authenticated.
grant execute on function crm_reserveer_volgende(uuid, integer, uuid[]) to service_role;
grant execute on function crm_reserveer(uuid, uuid, integer) to service_role;
