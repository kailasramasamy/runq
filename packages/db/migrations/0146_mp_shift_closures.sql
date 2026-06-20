-- 0146_mp_shift_closures.sql
--
-- Per-slot collection close for the Dhenu milk-procurement flow.
--
-- A row freezes pours/edits for one (node, collection_date, shift) and gates
-- dispatch, which now requires the slot closed first. A BMC node (pools the
-- whole day for dispatch) is closed by writing both `am` and `pm` rows, so
-- `shift` stays NOT NULL and the pour guard checks the pour's own shift with no
-- node lookup. Active closure = reopened_at IS NULL; reopen sets it, re-close
-- resets it. One row per slot (unique index below).
--
-- Mirrors packages/db/src/schema/milk-procurement/shift-closures.ts. Apply in
-- native dev via scripts/run-sql.ts (drizzle-kit push is the prod path).

BEGIN;

CREATE TABLE IF NOT EXISTS mp_shift_closures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  node_id         uuid NOT NULL REFERENCES mp_nodes(id),
  collection_date date NOT NULL,
  shift           mp_shift NOT NULL,
  closed_by       uuid REFERENCES users(id),
  closed_at       timestamptz NOT NULL DEFAULT now(),
  reopened_by     uuid REFERENCES users(id),
  reopened_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_shift_closures_slot
  ON mp_shift_closures (tenant_id, node_id, collection_date, shift);

COMMIT;
