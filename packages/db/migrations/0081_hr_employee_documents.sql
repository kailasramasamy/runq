-- 0081_hr_employee_documents.sql
-- Phase: HR document storage.
--
--   * employees.photo_url  — single avatar slot (S3 storage key).
--   * Extend attachment_entity_type enum with 'employee' so the existing
--     polymorphic document_attachments table can carry HR docs alongside
--     finance ones.
--   * document_attachments.document_kind  — optional categorisation tag
--     (aadhaar, pan, offer_letter, etc.). Nullable so legacy AP rows are
--     untouched; HR rows always set it.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS photo_url varchar(500);

-- Postgres requires enum-value adds to commit before the value is usable in
-- the same transaction. The migration runner executes each statement
-- separately, so this works; if you ever consolidate it into one tx, split
-- the ALTER TYPE into its own statement first.
ALTER TYPE attachment_entity_type ADD VALUE IF NOT EXISTS 'employee';

ALTER TABLE document_attachments
  ADD COLUMN IF NOT EXISTS document_kind varchar(40);

-- Filter document listings by kind without a full scan (kinds aren't unique
-- per entity — Aadhaar typically has front + back).
CREATE INDEX IF NOT EXISTS idx_da_entity_kind
  ON document_attachments (tenant_id, entity_type, entity_id, document_kind);
