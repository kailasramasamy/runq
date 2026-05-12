-- Performance indexes for the /finance/analytics hot paths.
--
-- The existing (tenant_id, status) and (tenant_id, due_date) indexes work,
-- but every analytics query for AR/AP further filters to `balance_due > 0
-- AND status IN (open-set)` — so a partial index that already encodes that
-- predicate is dramatically smaller (paid/cancelled bills excluded) and
-- avoids a heap re-check on the balance_due column.
--
-- Similarly, the PnL / cash-flow / suspense / expense-category queries all
-- filter `je.status = 'posted'`. A partial on (tenant_id, date) WHERE
-- posted skips draft/reversed entries entirely.

-- Open AR — used by ar_outstanding, ar_aging, top_overdue_customers, cash_forecast
CREATE INDEX IF NOT EXISTS idx_si_open_by_due
  ON sales_invoices(tenant_id, due_date)
  WHERE balance_due > 0 AND status IN ('sent', 'partially_paid', 'overdue');

-- Open AP — used by ap_outstanding, ap_aging, bills_due_week, cash_forecast,
-- top_vendors_by_spend (within 90d window)
CREATE INDEX IF NOT EXISTS idx_pi_open_by_due
  ON purchase_invoices(tenant_id, due_date)
  WHERE balance_due > 0 AND status IN ('pending_match', 'matched', 'approved', 'partially_paid');

-- Posted JEs only — covers P&L summary, cash flow, revenue_vs_expense_12mo,
-- top_expense_categories, suspense balance scan, trial balance
CREATE INDEX IF NOT EXISTS idx_je_posted_by_date
  ON journal_entries(tenant_id, date)
  WHERE status = 'posted';

-- Receipts already have (tenant_id, customer_id) + (tenant_id, receipt_date)
-- which serves DSO trend's per-customer cumulative sum.
