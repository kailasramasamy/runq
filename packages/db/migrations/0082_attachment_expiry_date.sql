-- Document expiry tracking for HR.
--
-- Adds an optional expiry date to document_attachments so the HR
-- dashboard can surface upcoming compliance-doc expiries (Aadhaar,
-- passport, driving licence, employment contract end, etc.). Existing
-- attachments stay null; only newly-uploaded HR docs typically set it.
--
-- Index supports the dashboard's "expiring in the next N days" sweep
-- without full-scanning the attachments table.

ALTER TABLE document_attachments
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

CREATE INDEX IF NOT EXISTS idx_da_tenant_expiry
  ON document_attachments (tenant_id, expiry_date);
