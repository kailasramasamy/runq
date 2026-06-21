-- Round Off at remittance settlement.
-- Track the sub-rupee gap booked to the Round Off ledger per allocation line so
-- re-allocating a receipt stays idempotent (settled = amount + round_off_amount).
ALTER TABLE receipt_allocations
  ADD COLUMN IF NOT EXISTS round_off_amount numeric(15, 2) NOT NULL DEFAULT 0;
