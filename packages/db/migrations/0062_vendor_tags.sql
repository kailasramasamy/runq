-- Vendor tags: free-form labels for grouping (e.g. "A1 Milk", "A2 Milk", "Buffalo", "Oil")
-- Stored as JSONB string array so multiple tags per vendor are filterable via GIN.
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_vendors_tags ON vendors USING gin (tags);
