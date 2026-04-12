-- Add vendor link to bank transactions
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id);
CREATE INDEX IF NOT EXISTS idx_bt_vendor ON bank_transactions(vendor_id);
