-- Vendor flag: when a bank debit lands without a matching bill, post the
-- payment as an advance to supplier (1104) instead of direct expense.
-- Used for monthly-billing vendors (e.g., milk suppliers) where pre-bill
-- payments must accrue as advances and be applied when the real bill arrives.
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS treat_no_bill_as_advance boolean NOT NULL DEFAULT false;
