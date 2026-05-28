-- 0119_pp_phase_3.sql
--
-- PP Phase 3: 3-way match. Spec: docs/purchase-procurement-plan.md §8 + §5.3.
--
-- Adds the bill-side fields the match flow writes when a bill is linked
-- to a PO. Reuses the existing `match_status` enum from migration 0114
-- (unmatched | matched | mismatch) — `mismatch` covers both "partial"
-- and "override" cases per the spec's compromise.
--
-- Vendor-level tolerance lives on `vendors.match_tolerance_pct` (nullable,
-- default tenant setting kicks in when NULL). Tenant-wide default is
-- hard-coded to 2% in code; per-tenant override is a Phase 5 polish.

BEGIN;

ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS matched_po_id          uuid,
  ADD COLUMN IF NOT EXISTS match_override_reason  text,
  ADD COLUMN IF NOT EXISTS match_override_by      uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS match_committed_at     timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pi_matched_po_v2_fk'
  ) THEN
    ALTER TABLE purchase_invoices
      ADD CONSTRAINT pi_matched_po_v2_fk
      FOREIGN KEY (matched_po_id) REFERENCES purchase_orders_v2(id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_pi_matched_po
  ON purchase_invoices (matched_po_id)
  WHERE matched_po_id IS NOT NULL;

-- Per-vendor tolerance override. NULL → tenant default (2% hard-coded for v1).
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS match_tolerance_pct numeric(5, 2);

COMMIT;
