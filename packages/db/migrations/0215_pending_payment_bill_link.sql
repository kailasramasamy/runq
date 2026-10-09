-- A captured payment can settle a vendor bill: the AP payment carries the cash
-- side, and the bank match links to it instead of posting a direct expense.
ALTER TABLE pending_payments
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES payments(id);
