/**
 * RLS Policy SQL.
 *
 * Applied to ALL tenant-scoped tables. Application connections must use the
 * 'runq_app' role (non-bypass) so policies are enforced. Migration connections
 * use 'runq_admin' (BYPASSRLS).
 *
 * Each request must `SET LOCAL app.current_tenant_id = '<uuid>'` after borrowing
 * a connection from the pool — see apps/api/src/plugins/db.ts for the
 * per-request hook.
 *
 * NOTE: As of Phase 1 ship, RLS is NOT yet active in production. The policies
 * exist but the application is still using a global pool connection without
 * setting `app.current_tenant_id`. Manual WHERE clauses + the membership-checked
 * tenant context plugin are the active security boundary. The Phase 2 hardening
 * initiative will switch dbPlugin to per-request connection borrowing and apply
 * the migration in `migrations/0060_rls_enable.sql`.
 */

export const RLS_TABLES = [
  // AR
  'customers',
  'customer_buyer_aliases',
  'invoice_sequences',
  'sales_invoices',
  'sales_invoice_items',
  'sales_orders',
  'sales_order_items',
  'sales_quotes',
  'sales_quote_items',
  'payment_receipts',
  'receipt_allocations',
  'credit_notes',
  'dunning_rules',
  'dunning_log',
  'collection_assignments',

  // AP
  'vendors',
  'vendor_bill_item_aliases',
  'vendor_contracts',
  'vendor_ratings',
  'purchase_orders',
  'purchase_order_items',
  'purchase_requisitions',
  'purchase_requisition_items',
  'goods_receipt_notes',
  'grn_items',
  'purchase_invoices',
  'purchase_invoice_items',
  'payments',
  'payment_allocations',
  'payment_schedules',
  'payment_schedule_items',
  'advance_payments',
  'advance_adjustments',
  'debit_notes',

  // Banking
  'bank_accounts',
  'bank_transactions',
  'bank_reconciliations',
  'reconciliation_matches',
  'bank_match_corrections',
  'bank_narration_rules',
  'bank_statement_format_aliases',
  'cheques',
  'petty_cash_accounts',
  'petty_cash_transactions',
  'pg_settlements',
  'pg_settlement_lines',

  // GL / Accounting
  'accounts',
  'journal_sequences',
  'journal_entries',
  'journal_lines',
  'fiscal_periods',
  'transaction_comments',

  // GST
  'gst_returns',
  'gst_return_invoices',
  'gsp_auth_tokens',

  // Fixed assets
  'asset_categories',
  'asset_sequences',
  'asset_transfers',
  'fixed_assets',
  'depreciation_entries',

  // HR
  'expense_claims',
  'expense_claim_items',

  // Workflows
  'approval_workflows',
  'approval_rules',
  'approval_steps',
  'approval_instances',
  'task_assignments',

  // Integrations / sync
  'integrations',
  'integration_logs',
  'bill_sync_sources',
  'bill_sync_logs',
  'extraction_corrections',
  'webhook_endpoints',
  'webhook_events',

  // Platform-tenant overlap
  'subscriptions',
  'tenant_feature_flags',
  'scheduled_reports',
  'document_attachments',

  // Audit / activity / agent
  'audit_log',
  'activity_log',
  'agent_events',
  'notifications',
  'dashboard_widgets',

  // Support
  'support_conversations',

  // Help / learning hub
  'help_recipe_progress',

  // Auth (within tenant)
  'users',
];

export function generateRLSSQL(): string {
  const statements = RLS_TABLES.map((table) => `
-- ${table}
ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_${table} ON ${table};
CREATE POLICY tenant_isolation_${table} ON ${table}
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
`);
  return statements.join('\n');
}
