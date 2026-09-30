-- Receipt variance, valued. `variance_qty` already records litres gained or
-- lost between dispatch and receipt; these carry what those litres cost to buy,
-- snapshotted at receipt so a later pour correction can't silently rewrite a
-- past month's loss. Unit cost is NULL where neither pours nor a prior VMCC
-- bill know the price (RawMilkCostService returns 0) — unpriced, not free.
BEGIN;
ALTER TABLE mp_consignments
  ADD COLUMN IF NOT EXISTS variance_unit_cost numeric(12, 2),
  ADD COLUMN IF NOT EXISTS variance_value numeric(14, 2);
COMMIT;
