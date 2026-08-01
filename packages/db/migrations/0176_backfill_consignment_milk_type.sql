-- Backfill mp_consignments.milk_type for legs dispatched before each milk type
-- travelled as its own consignment.
--
-- Until now the server only stamped a type when the source held exactly one, so
-- most legs carry NULL. An untyped leg can't post to the right raw-milk item at
-- the plant, which is what put buffalo litres into the A1 item.
--
-- Only unambiguous legs are filled: where the source held a single milk type,
-- that type is the leg's type. Genuinely mixed legs stay NULL — they can only be
-- resolved by splitting them against the underlying pours, which is a judgement
-- call, not a backfill.
--
-- Idempotent: re-running touches nothing, since every pass requires NULL.

-- 1. VMCC → CC. The source is the VMCC's recorded pours for that date, scoped to
--    the leg's shift when it has one (a pooled leg covers the whole day).
update mp_consignments c
set milk_type = src.milk_type::mp_milk_type, updated_at = now()
from (
  select p.tenant_id, p.node_id, p.collection_date, p.shift,
         min(p.milk_type::text) as milk_type
  from mp_pours p
  where p.status = 'recorded'
  group by p.tenant_id, p.node_id, p.collection_date, p.shift
  having count(distinct p.milk_type) = 1
) src
where c.milk_type is null
  and c.kind = 'vmcc_to_cc'
  and c.tenant_id = src.tenant_id
  and c.from_node_id = src.node_id
  and c.collection_date = src.collection_date
  and (c.shift is null or c.shift = src.shift);

-- 2. Manual receipts from centres that don't use the app. These have no pours to
--    derive from, so use the source centre's configuration: a node allowed exactly
--    one milk type can only ever have sent that one. Runs before the CC → PP pass
--    so those legs can be resolved from it.
update mp_consignments c
set milk_type = n.allowed_milk_types[1], updated_at = now()
from mp_nodes n
where c.milk_type is null
  and c.from_node_id = n.id
  and c.tenant_id = n.tenant_id
  and array_length(n.allowed_milk_types, 1) = 1;

-- 3. CC → PP. The source is what that CC took in on the date. Runs after the
--    passes above so it sees the types just filled in upstream.
update mp_consignments c
set milk_type = src.milk_type::mp_milk_type, updated_at = now()
from (
  select r.tenant_id, r.to_node_id, r.collection_date,
         min(r.milk_type::text) as milk_type
  from mp_consignments r
  where r.status = 'received' and r.milk_type is not null
  group by r.tenant_id, r.to_node_id, r.collection_date
  having count(distinct r.milk_type) = 1
) src
where c.milk_type is null
  and c.kind = 'cc_to_pp'
  and c.tenant_id = src.tenant_id
  and c.from_node_id = src.to_node_id
  and c.collection_date = src.collection_date;
