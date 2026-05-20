-- Comprehensive onboarding: per-item document kind (aadhaar / pan / etc.)
-- and a link to the uploaded attachment. When set, the mobile app renders
-- an upload tile instead of a checkbox and stores the file in
-- document_attachments (entity_type='employee', document_kind=<kind>).

ALTER TABLE onboarding_template_items
  ADD COLUMN IF NOT EXISTS document_kind varchar(40);

ALTER TABLE onboarding_items
  ADD COLUMN IF NOT EXISTS document_kind varchar(40),
  ADD COLUMN IF NOT EXISTS attachment_id uuid REFERENCES document_attachments(id);

CREATE INDEX IF NOT EXISTS idx_onbitem_attachment
  ON onboarding_items (attachment_id) WHERE attachment_id IS NOT NULL;
