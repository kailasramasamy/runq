-- 0126_mfg_phase_2_5_idempotency.sql
--
-- Manufacturing Phase 2.5: client-generated idempotency keys on the
-- two endpoints that the mobile WO Run view replays after offline drain
-- (record consumption + record output). Server dedupes by key; replay
-- after partial success returns the existing row instead of creating a
-- duplicate.
--
-- Key shape: client-generated UUIDv4 (varchar(64) to allow other formats
-- if future callers prefer). Per-tenant unique so cross-tenant collisions
-- (vanishingly unlikely with UUIDv4 but free to enforce) can't leak.

BEGIN;

ALTER TABLE wo_consumption
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(64);

ALTER TABLE wo_output
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(64);

-- Partial unique indexes — NULL keys (legacy + pre-2.5 callers) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wo_cons_idempotency
  ON wo_consumption (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wo_output_idempotency
  ON wo_output (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
