-- Vendor flag: does this vendor issue tax invoices?
-- True for GST-registered suppliers (oil, packaging, etc.) — bills from them
-- must have an invoice attachment for ITC / audit defense.
-- Default false; user manually opts vendors in. Bills from flagged vendors
-- without an invoice attachment surface in Audit → Gap Scan.
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS requires_invoice boolean NOT NULL DEFAULT false;
