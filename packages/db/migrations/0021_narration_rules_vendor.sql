-- Add vendor mapping to narration rules (nullable — existing GL-only rules unaffected)
ALTER TABLE bank_narration_rules ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id);
