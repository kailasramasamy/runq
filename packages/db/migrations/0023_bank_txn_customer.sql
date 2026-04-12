-- Add customer link to bank transactions (for credit transactions)
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);
CREATE INDEX IF NOT EXISTS idx_bt_customer ON bank_transactions(customer_id);
