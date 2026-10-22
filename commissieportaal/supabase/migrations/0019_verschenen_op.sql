-- Moment waarop een salesdeal voor het eerst in Kennismakingsgesprek (of verder) kwam: de lead is verschenen.
-- Blijft staan bij latere fases (ook Afgewezen/Opvolgen), wordt gewist bij terugzetten naar Ingepland.
alter table crm_opportunities add column if not exists verschenen_op timestamptz;
update crm_opportunities set verschenen_op = coalesce(fase_sinds, updated_at, now())
  where pijplijn = 'sales' and verschenen_op is null and fase in ('kennismaking', 'salesgesprek', 'offerte', 'geaccepteerd');
