-- Waiving dispatch on invoices that predate inventory tracking.
--
-- A tenant that billed for months before receiving a single item into stock
-- has a dispatch queue it can never work: on-hand is zero because nothing
-- was ever received, and back-filling an opening balance to make the queue
-- clear would invent a warehouse history that did not happen.
--
-- Waiving records the honest position — these goods left, but not through
-- inventory — and takes the row out of the queue without moving stock or
-- posting COGS. Distinct from dispatched: no delivery note exists.
ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS dispatch_waived_at timestamptz;

-- No supporting index on purpose. The obvious one is partial
-- (WHERE dispatch_waived_at IS NULL), and drizzle-kit push — which the
-- Railway deploy runs — crashes introspecting partial/expression indexes.
-- The queue already filters on tenant_id first and the column is a cheap
-- NULL test on the remainder, so the index would buy little anyway.
