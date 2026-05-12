-- Indexes to keep analytics queries cheap.
--
-- Audit findings (pre-migration):
--   - bank_transactions:  has (tenant_id, bank_account_id, transaction_date) — OK
--   - journal_entries:    has (tenant_id, date) — OK
--   - purchase_invoices:  has (tenant_id, due_date) — missing (tenant_id, invoice_date)
--   - sales_invoices:     has (tenant_id, due_date) — missing (tenant_id, invoice_date)
--
-- invoice_date is what we group by for revenue/expense trends, monthly
-- buckets, top vendors-by-spend windows, etc. due_date is only useful for
-- aging. Adding both keeps each query single-index, no sort.

CREATE INDEX IF NOT EXISTS idx_si_tenant_invoice_date
  ON sales_invoices(tenant_id, invoice_date);

CREATE INDEX IF NOT EXISTS idx_pi_tenant_invoice_date
  ON purchase_invoices(tenant_id, invoice_date);
