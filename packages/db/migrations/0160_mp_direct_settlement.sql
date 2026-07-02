-- 0160_mp_direct_settlement.sql
--
-- Direct-payment settlement from the billing page: each farmer line and each
-- VMCC operator can be settled individually (posts GL + AP payment) with a
-- transaction confirmation, mirroring the VMCC bill. Adds the confirmation +
-- journal/payment link columns.
--
-- Apply in native dev via scripts/run-sql.ts (drizzle-kit push is the prod path).

BEGIN;

ALTER TABLE mp_payout_lines
  ADD COLUMN IF NOT EXISTS payment_reference varchar(120),
  ADD COLUMN IF NOT EXISTS payment_mode varchar(30),
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES journal_entries(id);

ALTER TABLE mp_operator_payouts
  ADD COLUMN IF NOT EXISTS payment_mode varchar(30),
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES payments(id);

COMMIT;
