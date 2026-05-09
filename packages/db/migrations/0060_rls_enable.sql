-- Phase 1 hardening: enable RLS on tenant-scoped tables.
-- Generated 2026-05-09T03:38:07.841Z from packages/db/src/rls/policies.ts.
--
-- IMPORTANT: Do NOT apply this migration in production until apps/api/src/plugins/db.ts
-- has been refactored to per-request connection borrowing with SET LOCAL
-- app.current_tenant_id. Otherwise, every query will see zero rows.
--
-- See docs/phase1-multi-tenant-spec.md "Phase 2 hardening" section for the
-- staged rollout plan.


-- customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_customers ON customers;
CREATE POLICY tenant_isolation_customers ON customers
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- customer_buyer_aliases
ALTER TABLE customer_buyer_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_buyer_aliases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_customer_buyer_aliases ON customer_buyer_aliases;
CREATE POLICY tenant_isolation_customer_buyer_aliases ON customer_buyer_aliases
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- invoice_sequences
ALTER TABLE invoice_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_sequences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_invoice_sequences ON invoice_sequences;
CREATE POLICY tenant_isolation_invoice_sequences ON invoice_sequences
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- sales_invoices
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_sales_invoices ON sales_invoices;
CREATE POLICY tenant_isolation_sales_invoices ON sales_invoices
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- sales_invoice_items
ALTER TABLE sales_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoice_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_sales_invoice_items ON sales_invoice_items;
CREATE POLICY tenant_isolation_sales_invoice_items ON sales_invoice_items
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- sales_orders
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_sales_orders ON sales_orders;
CREATE POLICY tenant_isolation_sales_orders ON sales_orders
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- sales_order_items
ALTER TABLE sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_sales_order_items ON sales_order_items;
CREATE POLICY tenant_isolation_sales_order_items ON sales_order_items
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- sales_quotes
ALTER TABLE sales_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_quotes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_sales_quotes ON sales_quotes;
CREATE POLICY tenant_isolation_sales_quotes ON sales_quotes
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- sales_quote_items
ALTER TABLE sales_quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_quote_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_sales_quote_items ON sales_quote_items;
CREATE POLICY tenant_isolation_sales_quote_items ON sales_quote_items
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- payment_receipts
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_payment_receipts ON payment_receipts;
CREATE POLICY tenant_isolation_payment_receipts ON payment_receipts
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- receipt_allocations
ALTER TABLE receipt_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_receipt_allocations ON receipt_allocations;
CREATE POLICY tenant_isolation_receipt_allocations ON receipt_allocations
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- credit_notes
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_credit_notes ON credit_notes;
CREATE POLICY tenant_isolation_credit_notes ON credit_notes
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- dunning_rules
ALTER TABLE dunning_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE dunning_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_dunning_rules ON dunning_rules;
CREATE POLICY tenant_isolation_dunning_rules ON dunning_rules
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- dunning_log
ALTER TABLE dunning_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE dunning_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_dunning_log ON dunning_log;
CREATE POLICY tenant_isolation_dunning_log ON dunning_log
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- collection_assignments
ALTER TABLE collection_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_collection_assignments ON collection_assignments;
CREATE POLICY tenant_isolation_collection_assignments ON collection_assignments
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- vendors
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_vendors ON vendors;
CREATE POLICY tenant_isolation_vendors ON vendors
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- vendor_bill_item_aliases
ALTER TABLE vendor_bill_item_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_bill_item_aliases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_vendor_bill_item_aliases ON vendor_bill_item_aliases;
CREATE POLICY tenant_isolation_vendor_bill_item_aliases ON vendor_bill_item_aliases
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- vendor_contracts
ALTER TABLE vendor_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_contracts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_vendor_contracts ON vendor_contracts;
CREATE POLICY tenant_isolation_vendor_contracts ON vendor_contracts
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- vendor_ratings
ALTER TABLE vendor_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_ratings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_vendor_ratings ON vendor_ratings;
CREATE POLICY tenant_isolation_vendor_ratings ON vendor_ratings
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- purchase_orders
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_purchase_orders ON purchase_orders;
CREATE POLICY tenant_isolation_purchase_orders ON purchase_orders
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- purchase_order_items
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_purchase_order_items ON purchase_order_items;
CREATE POLICY tenant_isolation_purchase_order_items ON purchase_order_items
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- purchase_requisitions
ALTER TABLE purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requisitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_purchase_requisitions ON purchase_requisitions;
CREATE POLICY tenant_isolation_purchase_requisitions ON purchase_requisitions
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- purchase_requisition_items
ALTER TABLE purchase_requisition_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requisition_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_purchase_requisition_items ON purchase_requisition_items;
CREATE POLICY tenant_isolation_purchase_requisition_items ON purchase_requisition_items
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- goods_receipt_notes
ALTER TABLE goods_receipt_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_goods_receipt_notes ON goods_receipt_notes;
CREATE POLICY tenant_isolation_goods_receipt_notes ON goods_receipt_notes
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- grn_items
ALTER TABLE grn_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_grn_items ON grn_items;
CREATE POLICY tenant_isolation_grn_items ON grn_items
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- purchase_invoices
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_purchase_invoices ON purchase_invoices;
CREATE POLICY tenant_isolation_purchase_invoices ON purchase_invoices
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- purchase_invoice_items
ALTER TABLE purchase_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoice_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_purchase_invoice_items ON purchase_invoice_items;
CREATE POLICY tenant_isolation_purchase_invoice_items ON purchase_invoice_items
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_payments ON payments;
CREATE POLICY tenant_isolation_payments ON payments
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- payment_allocations
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_payment_allocations ON payment_allocations;
CREATE POLICY tenant_isolation_payment_allocations ON payment_allocations
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- payment_schedules
ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_schedules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_payment_schedules ON payment_schedules;
CREATE POLICY tenant_isolation_payment_schedules ON payment_schedules
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- payment_schedule_items
ALTER TABLE payment_schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_schedule_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_payment_schedule_items ON payment_schedule_items;
CREATE POLICY tenant_isolation_payment_schedule_items ON payment_schedule_items
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- advance_payments
ALTER TABLE advance_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE advance_payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_advance_payments ON advance_payments;
CREATE POLICY tenant_isolation_advance_payments ON advance_payments
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- advance_adjustments
ALTER TABLE advance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE advance_adjustments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_advance_adjustments ON advance_adjustments;
CREATE POLICY tenant_isolation_advance_adjustments ON advance_adjustments
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- debit_notes
ALTER TABLE debit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE debit_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_debit_notes ON debit_notes;
CREATE POLICY tenant_isolation_debit_notes ON debit_notes
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- bank_accounts
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_bank_accounts ON bank_accounts;
CREATE POLICY tenant_isolation_bank_accounts ON bank_accounts
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- bank_transactions
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_bank_transactions ON bank_transactions;
CREATE POLICY tenant_isolation_bank_transactions ON bank_transactions
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- bank_reconciliations
ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_bank_reconciliations ON bank_reconciliations;
CREATE POLICY tenant_isolation_bank_reconciliations ON bank_reconciliations
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- reconciliation_matches
ALTER TABLE reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_matches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_reconciliation_matches ON reconciliation_matches;
CREATE POLICY tenant_isolation_reconciliation_matches ON reconciliation_matches
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- bank_match_corrections
ALTER TABLE bank_match_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_match_corrections FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_bank_match_corrections ON bank_match_corrections;
CREATE POLICY tenant_isolation_bank_match_corrections ON bank_match_corrections
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- bank_narration_rules
ALTER TABLE bank_narration_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_narration_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_bank_narration_rules ON bank_narration_rules;
CREATE POLICY tenant_isolation_bank_narration_rules ON bank_narration_rules
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- bank_statement_format_aliases
ALTER TABLE bank_statement_format_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_format_aliases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_bank_statement_format_aliases ON bank_statement_format_aliases;
CREATE POLICY tenant_isolation_bank_statement_format_aliases ON bank_statement_format_aliases
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- cheques
ALTER TABLE cheques ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheques FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_cheques ON cheques;
CREATE POLICY tenant_isolation_cheques ON cheques
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- petty_cash_accounts
ALTER TABLE petty_cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE petty_cash_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_petty_cash_accounts ON petty_cash_accounts;
CREATE POLICY tenant_isolation_petty_cash_accounts ON petty_cash_accounts
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- petty_cash_transactions
ALTER TABLE petty_cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE petty_cash_transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_petty_cash_transactions ON petty_cash_transactions;
CREATE POLICY tenant_isolation_petty_cash_transactions ON petty_cash_transactions
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- pg_settlements
ALTER TABLE pg_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_settlements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_pg_settlements ON pg_settlements;
CREATE POLICY tenant_isolation_pg_settlements ON pg_settlements
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- pg_settlement_lines
ALTER TABLE pg_settlement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_settlement_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_pg_settlement_lines ON pg_settlement_lines;
CREATE POLICY tenant_isolation_pg_settlement_lines ON pg_settlement_lines
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- accounts
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_accounts ON accounts;
CREATE POLICY tenant_isolation_accounts ON accounts
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- journal_sequences
ALTER TABLE journal_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_sequences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_journal_sequences ON journal_sequences;
CREATE POLICY tenant_isolation_journal_sequences ON journal_sequences
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- journal_entries
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_journal_entries ON journal_entries;
CREATE POLICY tenant_isolation_journal_entries ON journal_entries
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- journal_lines
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_journal_lines ON journal_lines;
CREATE POLICY tenant_isolation_journal_lines ON journal_lines
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- fiscal_periods
ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_periods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_fiscal_periods ON fiscal_periods;
CREATE POLICY tenant_isolation_fiscal_periods ON fiscal_periods
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- transaction_comments
ALTER TABLE transaction_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_comments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_transaction_comments ON transaction_comments;
CREATE POLICY tenant_isolation_transaction_comments ON transaction_comments
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- gst_returns
ALTER TABLE gst_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE gst_returns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_gst_returns ON gst_returns;
CREATE POLICY tenant_isolation_gst_returns ON gst_returns
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- gst_return_invoices
ALTER TABLE gst_return_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE gst_return_invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_gst_return_invoices ON gst_return_invoices;
CREATE POLICY tenant_isolation_gst_return_invoices ON gst_return_invoices
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- gsp_auth_tokens
ALTER TABLE gsp_auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsp_auth_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_gsp_auth_tokens ON gsp_auth_tokens;
CREATE POLICY tenant_isolation_gsp_auth_tokens ON gsp_auth_tokens
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- asset_categories
ALTER TABLE asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_asset_categories ON asset_categories;
CREATE POLICY tenant_isolation_asset_categories ON asset_categories
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- asset_sequences
ALTER TABLE asset_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_sequences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_asset_sequences ON asset_sequences;
CREATE POLICY tenant_isolation_asset_sequences ON asset_sequences
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- asset_transfers
ALTER TABLE asset_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_transfers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_asset_transfers ON asset_transfers;
CREATE POLICY tenant_isolation_asset_transfers ON asset_transfers
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- fixed_assets
ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_assets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_fixed_assets ON fixed_assets;
CREATE POLICY tenant_isolation_fixed_assets ON fixed_assets
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- depreciation_entries
ALTER TABLE depreciation_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE depreciation_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_depreciation_entries ON depreciation_entries;
CREATE POLICY tenant_isolation_depreciation_entries ON depreciation_entries
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- expense_claims
ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_claims FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_expense_claims ON expense_claims;
CREATE POLICY tenant_isolation_expense_claims ON expense_claims
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- expense_claim_items
ALTER TABLE expense_claim_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_claim_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_expense_claim_items ON expense_claim_items;
CREATE POLICY tenant_isolation_expense_claim_items ON expense_claim_items
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- approval_workflows
ALTER TABLE approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_workflows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_approval_workflows ON approval_workflows;
CREATE POLICY tenant_isolation_approval_workflows ON approval_workflows
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- approval_rules
ALTER TABLE approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_approval_rules ON approval_rules;
CREATE POLICY tenant_isolation_approval_rules ON approval_rules
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- approval_steps
ALTER TABLE approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_steps FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_approval_steps ON approval_steps;
CREATE POLICY tenant_isolation_approval_steps ON approval_steps
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- approval_instances
ALTER TABLE approval_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_instances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_approval_instances ON approval_instances;
CREATE POLICY tenant_isolation_approval_instances ON approval_instances
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- task_assignments
ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_task_assignments ON task_assignments;
CREATE POLICY tenant_isolation_task_assignments ON task_assignments
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- integrations
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_integrations ON integrations;
CREATE POLICY tenant_isolation_integrations ON integrations
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- integration_logs
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_integration_logs ON integration_logs;
CREATE POLICY tenant_isolation_integration_logs ON integration_logs
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- bill_sync_sources
ALTER TABLE bill_sync_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_sync_sources FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_bill_sync_sources ON bill_sync_sources;
CREATE POLICY tenant_isolation_bill_sync_sources ON bill_sync_sources
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- bill_sync_logs
ALTER TABLE bill_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_sync_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_bill_sync_logs ON bill_sync_logs;
CREATE POLICY tenant_isolation_bill_sync_logs ON bill_sync_logs
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- extraction_corrections
ALTER TABLE extraction_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_corrections FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_extraction_corrections ON extraction_corrections;
CREATE POLICY tenant_isolation_extraction_corrections ON extraction_corrections
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- webhook_endpoints
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_webhook_endpoints ON webhook_endpoints;
CREATE POLICY tenant_isolation_webhook_endpoints ON webhook_endpoints
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- webhook_events
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_webhook_events ON webhook_events;
CREATE POLICY tenant_isolation_webhook_events ON webhook_events
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_subscriptions ON subscriptions;
CREATE POLICY tenant_isolation_subscriptions ON subscriptions
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- tenant_feature_flags
ALTER TABLE tenant_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_feature_flags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tenant_feature_flags ON tenant_feature_flags;
CREATE POLICY tenant_isolation_tenant_feature_flags ON tenant_feature_flags
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- scheduled_reports
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_scheduled_reports ON scheduled_reports;
CREATE POLICY tenant_isolation_scheduled_reports ON scheduled_reports
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- document_attachments
ALTER TABLE document_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_attachments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_document_attachments ON document_attachments;
CREATE POLICY tenant_isolation_document_attachments ON document_attachments
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_audit_log ON audit_log;
CREATE POLICY tenant_isolation_audit_log ON audit_log
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- activity_log
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_activity_log ON activity_log;
CREATE POLICY tenant_isolation_activity_log ON activity_log
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- agent_events
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_agent_events ON agent_events;
CREATE POLICY tenant_isolation_agent_events ON agent_events
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_notifications ON notifications;
CREATE POLICY tenant_isolation_notifications ON notifications
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- dashboard_widgets
ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_widgets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_dashboard_widgets ON dashboard_widgets;
CREATE POLICY tenant_isolation_dashboard_widgets ON dashboard_widgets
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- support_conversations
ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_conversations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_support_conversations ON support_conversations;
CREATE POLICY tenant_isolation_support_conversations ON support_conversations
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

