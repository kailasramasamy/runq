-- Post-sale inventory corrections: free issues and finished-goods teardown.
--
-- 1. `free_issue` adjustment reason — stock handed over without an invoice
--    (extra cases to the logistics team to cover their breakages, samples).
--    Distinct from `damage`: the goods are intact, so the value belongs in
--    distribution cost (5106), not write-off (5104).
-- 2. inventory_adjustments.itc_reversal_value — input tax to reverse under
--    GST 17(5)(h). Stored now; the GSTR-3B Table 4(B) wiring reads it later.
-- 3. reclaim_in / reclaim_out stock movements.
-- 4. mfg_reclaims + mfg_reclaim_lines — cutting open unsold packets and
--    putting the milk back into the raw-material pool. Recovered material
--    enters at raw-material WAC; the shortfall is written off.
--
-- NOTE: account 5106 lives in standard-chart-of-accounts.ts. Existing tenants
-- need it backfilled or free-issue adjustments fail to post (GLService throws
-- on an unknown account code). After applying this migration, run:
--   pnpm --filter @runq/db db:seed:coa
-- It only inserts codes a tenant is missing, so it is safe to re-run.

-- 1 + 3. Enum values. ALTER TYPE ... ADD VALUE cannot run in the same
-- transaction that uses the new value, so these stand alone up front.
ALTER TYPE inv_adjustment_reason ADD VALUE IF NOT EXISTS 'free_issue';
ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'reclaim_out';
ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'reclaim_in';

-- 2.
ALTER TABLE inventory_adjustments
  ADD COLUMN IF NOT EXISTS itc_reversal_value NUMERIC(18, 2) NOT NULL DEFAULT 0;

-- 4.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mfg_reclaim_status') THEN
    CREATE TYPE mfg_reclaim_status AS ENUM ('draft', 'posted', 'cancelled');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS mfg_reclaims (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants (id),
  reclaim_no        VARCHAR(40) NOT NULL,
  warehouse_id      UUID NOT NULL REFERENCES warehouses (id),
  reclaim_date      DATE NOT NULL,
  status            mfg_reclaim_status NOT NULL DEFAULT 'draft',
  notes             TEXT,
  fg_value          NUMERIC(18, 2) NOT NULL DEFAULT 0,
  recovered_value   NUMERIC(18, 2) NOT NULL DEFAULT 0,
  loss_value        NUMERIC(18, 2) NOT NULL DEFAULT 0,
  journal_entry_id  UUID,
  posted_at         TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  idempotency_key   VARCHAR(64),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES users (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mfg_reclaim_tenant_no
  ON mfg_reclaims (tenant_id, reclaim_no);
CREATE INDEX IF NOT EXISTS idx_mfg_reclaim_tenant_status
  ON mfg_reclaims (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_mfg_reclaim_tenant_date
  ON mfg_reclaims (tenant_id, reclaim_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mfg_reclaim_idempotency
  ON mfg_reclaims (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS mfg_reclaim_lines (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants (id),
  reclaim_id           UUID NOT NULL REFERENCES mfg_reclaims (id) ON DELETE CASCADE,
  fg_item_id           UUID NOT NULL REFERENCES items (id),
  fg_batch_no          VARCHAR(60),
  fg_qty               NUMERIC(18, 3) NOT NULL,
  fg_unit_cost         NUMERIC(18, 4) NOT NULL DEFAULT 0,
  fg_value             NUMERIC(18, 2) NOT NULL DEFAULT 0,
  recovered_item_id    UUID NOT NULL REFERENCES items (id),
  recovered_batch_no   VARCHAR(60),
  recovered_qty        NUMERIC(18, 3) NOT NULL,
  recovered_unit_cost  NUMERIC(18, 4) NOT NULL DEFAULT 0,
  recovered_value      NUMERIC(18, 2) NOT NULL DEFAULT 0,
  expiry_date          DATE,
  notes                TEXT
);

CREATE INDEX IF NOT EXISTS idx_mfg_reclaim_lines_reclaim
  ON mfg_reclaim_lines (reclaim_id);
CREATE INDEX IF NOT EXISTS idx_mfg_reclaim_lines_fg_item
  ON mfg_reclaim_lines (tenant_id, fg_item_id);
CREATE INDEX IF NOT EXISTS idx_mfg_reclaim_lines_recovered
  ON mfg_reclaim_lines (tenant_id, recovered_item_id);
CREATE INDEX IF NOT EXISTS idx_mfg_reclaim_lines_expiry
  ON mfg_reclaim_lines (expiry_date) WHERE expiry_date IS NOT NULL;
