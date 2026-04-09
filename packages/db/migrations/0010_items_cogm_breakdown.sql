-- 0010_items_cogm_breakdown.sql
-- Add a per-item COGM breakdown so business owners can capture how they
-- arrived at the manufacturing cost — raw material, inbound transport,
-- chilling, processing, packaging, labour, etc. — and never lose the
-- working out.
--
-- Stored as JSONB array of { label, amount, note } objects on the items
-- table itself (not a child table) because the breakdown is purely a
-- per-item attribute and never queried in aggregate. Total of the array
-- syncs back to items.cost_price on save so existing reports keep working.
--
-- Idempotent.

BEGIN;

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS cogm_breakdown jsonb;

COMMIT;
