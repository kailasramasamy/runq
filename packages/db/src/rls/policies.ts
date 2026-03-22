/**
 * RLS Policy SQL to be run as a custom migration.
 *
 * Applied to ALL tables except 'tenants'.
 * Application connections use the 'runq_app' role (non-bypass).
 * Migration connections use 'runq_admin' (BYPASSRLS).
 */

export const RLS_TABLES = [
  'users',
  'vendors',
  'purchase_orders',
  'purchase_order_items',
  'goods_receipt_notes',
  'grn_items',
  'purchase_invoices',
  'purchase_invoice_items',
  'payments',
  'payment_allocations',
  'advance_payments',
  'advance_adjustments',
  'debit_notes',
  'customers',
  'invoice_sequences',
  'sales_invoices',
  'sales_invoice_items',
  'payment_receipts',
  'receipt_allocations',
  'credit_notes',
  'dunning_rules',
  'dunning_log',
  'bank_accounts',
  'bank_transactions',
  'bank_reconciliations',
  'reconciliation_matches',
  'petty_cash_accounts',
  'petty_cash_transactions',
  'pg_settlements',
  'pg_settlement_lines',
  'payment_batches',
  'payment_instructions',
  'webhook_events',
  'audit_log',
  'accounts',
  'journal_sequences',
  'journal_entries',
  'journal_lines',
];

export function generateRLSSQL(): string {
  const statements = RLS_TABLES.map((table) => `
ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_${table} ON ${table}
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
`);

  return statements.join('\n');
}
