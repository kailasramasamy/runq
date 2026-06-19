-- Dhenu: full farmer profile so a VMCC operator can register a farmer in-app.
-- Adds contact/location, herd composition (per-breed JSON + in-milk split),
-- KYC identity and a profile photo. Bank already lives on the vendor row; we
-- add UPI there too. Farmer attachments (photo + scans) need a new enum value.

ALTER TYPE attachment_entity_type ADD VALUE IF NOT EXISTS 'farmer';

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS upi_id varchar(64);

ALTER TABLE mp_farmers
  ADD COLUMN IF NOT EXISTS village varchar(120),
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS aadhaar varchar(12),
  ADD COLUMN IF NOT EXISTS cattle_breeds jsonb,
  ADD COLUMN IF NOT EXISTS in_milk_count integer,
  ADD COLUMN IF NOT EXISTS lat numeric(10, 7),
  ADD COLUMN IF NOT EXISTS lng numeric(10, 7),
  ADD COLUMN IF NOT EXISTS photo_doc_id uuid REFERENCES document_attachments(id);
