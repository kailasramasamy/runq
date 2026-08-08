-- Indexes for the per-customer sales analytics endpoint
-- (GET /api/v1/ar/customers/:id/analytics).
--
-- The aggregate walks sales_invoice_items joined to sales_invoices, filtered
-- by tenant + customer + invoice_date. Two gaps existed:
--
--   1. sales_invoices had no index covering invoice_date, so a date-windowed
--      per-customer scan fell back to idx_si_tenant_customer and then filtered
--      dates row-by-row.
--   2. sales_invoice_items only had idx_sii_invoice_id, which is fine for the
--      join direction we use, but the tenant+item index lets the per-product
--      grouping stay index-only for tenants with large line volumes.
--
-- Both are plain btree — expression indexes break `drizzle-kit push`, which is
-- how production schema is applied.

CREATE INDEX IF NOT EXISTS idx_si_tenant_customer_date
  ON sales_invoices (tenant_id, customer_id, invoice_date);

CREATE INDEX IF NOT EXISTS idx_sii_tenant_item
  ON sales_invoice_items (tenant_id, item_id);
