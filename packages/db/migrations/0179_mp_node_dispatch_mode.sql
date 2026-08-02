-- Explicit per-node dispatch/close mode, replacing behaviour inferred from
-- has_bmc + overnight_pooling.
--
--   per_shift — AM and PM close and dispatch independently (shift-tagged)
--   day       — today AM + PM pool into one dispatch (shift null)
--   overnight — previous-day PM + today AM pool into one dispatch
--
-- has_bmc described the equipment and was being read as if it described the
-- operating pattern; a node can have a BMC and still want per-shift
-- traceability, and a VMCC that chills overnight had no way to say so
-- (overnight_pooling was CC-only).

DO $$ BEGIN
  CREATE TYPE mp_dispatch_mode AS ENUM ('per_shift', 'day', 'overnight');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE mp_nodes
  ADD COLUMN IF NOT EXISTS dispatch_mode mp_dispatch_mode NOT NULL DEFAULT 'per_shift';

-- Backfill to whatever each node behaves like today, so no node changes
-- behaviour on deploy. Overnight wins over has_bmc: an overnight CC was already
-- pooling across the two-day window regardless of its BMC flag.
UPDATE mp_nodes
   SET dispatch_mode = CASE
     WHEN node_type = 'cc' AND overnight_pooling THEN 'overnight'::mp_dispatch_mode
     WHEN has_bmc THEN 'day'::mp_dispatch_mode
     ELSE 'per_shift'::mp_dispatch_mode
   END
 WHERE dispatch_mode = 'per_shift';

-- overnight_pooling is left in place (deprecated, no longer read) so this
-- backfill stays re-runnable and a rollback has its source data. Drop it in a
-- later migration once every environment is on dispatch_mode.
