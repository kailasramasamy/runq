-- 0004_customer_nickname.sql
-- Add a short nickname to customers — accountant shorthand for fast lookup,
-- search, and PO parser customer matching. Idempotent.

BEGIN;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS nickname varchar(100);

-- A trigram-style index would be ideal here, but we already use plain ilike
-- elsewhere for customer search and the dataset is small. A regular index
-- on (tenant_id, nickname) is enough to keep the search fast.
CREATE INDEX IF NOT EXISTS idx_customers_tenant_nickname
  ON customers (tenant_id, nickname);

COMMIT;
