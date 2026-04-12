ALTER TABLE bank_narration_rules ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);
