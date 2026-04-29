-- Capture the customer's SKU code separately from the line description so we
-- can match via customer_sku_aliases (the moat) before falling back to fuzzy
-- name matching, and so the description shown to the user is clean.
ALTER TABLE po_draft_lines ADD COLUMN IF NOT EXISTS customer_sku_raw VARCHAR(100);
