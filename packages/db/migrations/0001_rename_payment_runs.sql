-- 0001_rename_payment_runs.sql
-- Rename the legacy "Payment Queue" tables to "Payment Runs" and add the
-- purchase_invoice_id FK that links a run line back to the bill it settles.
--
-- This script is idempotent. Running it multiple times is safe.
-- It runs from docker-entrypoint.sh BEFORE drizzle-kit push, so the schema
-- diff has nothing to do once the rename is in place.

BEGIN;

-- Tables
ALTER TABLE IF EXISTS payment_batches RENAME TO payment_runs;
ALTER TABLE IF EXISTS payment_instructions RENAME TO payment_run_lines;

-- Enums
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_batch_status') THEN
    ALTER TYPE payment_batch_status RENAME TO payment_run_status;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'instruction_status') THEN
    ALTER TYPE instruction_status RENAME TO payment_run_line_status;
  END IF;
END$$;

-- Indexes
ALTER INDEX IF EXISTS payment_batches_tenant_batch_id_uniq RENAME TO payment_runs_tenant_run_id_uniq;
ALTER INDEX IF EXISTS payment_batches_tenant_status_idx     RENAME TO payment_runs_tenant_status_idx;
ALTER INDEX IF EXISTS payment_instructions_tenant_batch_idx  RENAME TO payment_run_lines_tenant_run_idx;
ALTER INDEX IF EXISTS payment_instructions_tenant_status_idx RENAME TO payment_run_lines_tenant_status_idx;

-- Columns: rename batch_id → run_id on both tables
-- payment_runs.batch_id is the user-facing identifier (varchar)
-- payment_run_lines.batch_id is the uuid FK back to payment_runs.id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_runs' AND column_name = 'batch_id'
  ) THEN
    ALTER TABLE payment_runs RENAME COLUMN batch_id TO run_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_run_lines' AND column_name = 'batch_id'
  ) THEN
    ALTER TABLE payment_run_lines RENAME COLUMN batch_id TO run_id;
  END IF;
END$$;

-- New FK column linking a line to the bill it settles (nullable — external
-- batches submitted via API may not have a bill).
ALTER TABLE payment_run_lines
  ADD COLUMN IF NOT EXISTS purchase_invoice_id uuid REFERENCES purchase_invoices(id);

CREATE INDEX IF NOT EXISTS payment_run_lines_invoice_idx
  ON payment_run_lines(purchase_invoice_id);

COMMIT;
