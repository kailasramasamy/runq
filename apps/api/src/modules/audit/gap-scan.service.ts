import { eq, and, isNull, sql, gte } from 'drizzle-orm';
import {
  bankTransactions,
  purchaseInvoices,
  salesInvoices,
  payments,
  paymentReceipts,
  vendors,
  customers,
  documentAttachments,
} from '@runq/db';
import type { Db } from '@runq/db';
import { toNumber } from '../../utils/decimal';
import { OrphanCleanupService } from './orphan-cleanup.service';

export interface GapItem {
  entityType: string;
  entityId: string;
  label: string;
  summary: string;
  date: string | null;
  url: string;
}

export interface GapCategorySummary {
  key: string;
  title: string;
  description: string;
  severity: 'error' | 'warning';
  count: number;
}

export interface GapScanSummary {
  categories: GapCategorySummary[];
  totalGaps: number;
  daysScanned: number;
  scannedAt: string;
}

export interface GapCategoryItems {
  key: string;
  items: GapItem[];
}

const GAP_DEFINITIONS: Array<{ key: string; title: string; description: string; severity: 'error' | 'warning' }> = [
  { key: 'orphan_bank_artifacts', title: 'Orphaned Bank Artifacts', description: 'Receipts / payments / JEs auto-created from a bank txn that no longer exists. Reverse to rebalance the books.', severity: 'error' },
  { key: 'uncategorized_bank_txns', title: 'Uncategorized Bank Transactions', description: 'No GL category, vendor, or customer assigned', severity: 'error' },
  { key: 'customer_credit_no_invoice', title: 'Customer Payments Without Invoices', description: 'Bank credit matched to customer but no invoice exists — create invoice to complete reconciliation', severity: 'error' },
  { key: 'matched_without_je', title: 'Matched Without Journal Entries', description: 'Reconciled but no accounting entry — books incomplete', severity: 'error' },
  { key: 'unposted_bills', title: 'Bills Without Journal Entries', description: 'Approved bills not posted to GL', severity: 'error' },
  { key: 'bills_missing_invoice', title: 'Bills Missing Invoice Attachment', description: 'GST-registered vendors require a tax invoice — attach it to claim ITC and survive audit', severity: 'warning' },
  { key: 'unposted_invoices', title: 'Invoices Without Journal Entries', description: 'Sent invoices not posted to GL', severity: 'error' },
  { key: 'unpaid_bills', title: 'Unpaid Bills', description: 'Outstanding vendor balance', severity: 'warning' },
  { key: 'unpaid_invoices', title: 'Unpaid Invoices', description: 'Outstanding customer balance', severity: 'warning' },
  { key: 'unmatched_payments', title: 'Unreconciled Payments', description: 'Not matched to bank statement', severity: 'warning' },
  { key: 'unmatched_receipts', title: 'Unreconciled Receipts', description: 'Not matched to bank statement', severity: 'warning' },
];

export class GapScanService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /** Fast summary — counts only, no row data */
  async scanSummary(days = 90): Promise<GapScanSummary> {
    const since = this.dateSince(days);
    const counts = await Promise.all([
      this.orphanBankArtifactsCount(),
      this.uncategorizedCount(since),
      this.customerCreditNoInvoiceCount(since),
      this.matchedWithoutJECount(since),
      this.unpostedBillsCount(since),
      this.billsMissingInvoiceCount(since),
      this.unpostedInvoicesCount(since),
      this.unpaidBillsCount(since),
      this.unpaidInvoicesCount(since),
      this.unmatchedPaymentsCount(since),
      this.unmatchedReceiptsCount(since),
    ]);

    const categories = GAP_DEFINITIONS.map((def, i) => ({
      ...def,
      count: counts[i],
    })).filter((c) => c.count > 0);

    return {
      categories,
      totalGaps: counts.reduce((s, c) => s + c, 0),
      daysScanned: days,
      scannedAt: new Date().toISOString(),
    };
  }

  /** Lazy-load items for a specific gap category */
  async getCategoryItems(key: string, days = 90): Promise<GapCategoryItems> {
    const since = this.dateSince(days);
    const fetcher = this.itemFetchers[key];
    if (!fetcher) return { key, items: [] };
    const items = await fetcher(since);
    return { key, items };
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private dateSince(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  }

  // ── Count queries (fast, indexed) ────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async countFrom(query: any): Promise<number> {
    const [row] = await query;
    return row?.count ?? 0;
  }

  private async orphanBankArtifactsCount(): Promise<number> {
    const orphans = await new OrphanCleanupService(this.db, this.tenantId).listOrphans();
    return orphans.length;
  }

  private uncategorizedCount(since: string) {
    return this.countFrom(this.db.select({ count: sql<number>`count(*)::int` }).from(bankTransactions).where(and(
      eq(bankTransactions.tenantId, this.tenantId), gte(bankTransactions.transactionDate, since),
      eq(bankTransactions.reconStatus, 'unreconciled'), isNull(bankTransactions.glAccountId),
      isNull(bankTransactions.vendorId), isNull(bankTransactions.customerId),
    )));
  }

  private customerCreditNoInvoiceCount(since: string) {
    return this.countFrom(this.db.select({ count: sql<number>`count(*)::int` }).from(bankTransactions).where(and(
      eq(bankTransactions.tenantId, this.tenantId), gte(bankTransactions.transactionDate, since),
      eq(bankTransactions.type, 'credit'), eq(bankTransactions.reconStatus, 'unreconciled'),
      sql`${bankTransactions.customerId} IS NOT NULL`,
    )));
  }

  private matchedWithoutJECount(since: string) {
    return this.countFrom(this.db.select({ count: sql<number>`count(*)::int` }).from(bankTransactions).where(and(
      eq(bankTransactions.tenantId, this.tenantId), gte(bankTransactions.transactionDate, since),
      eq(bankTransactions.reconStatus, 'matched'), isNull(bankTransactions.journalEntryId),
      sql`NOT EXISTS (SELECT 1 FROM reconciliation_matches rm JOIN payments p ON rm.payment_id = p.id JOIN journal_entries je ON je.source_type = 'payment' AND je.source_id = p.id WHERE rm.bank_transaction_id = ${bankTransactions.id} AND je.status = 'posted')`,
      sql`NOT EXISTS (SELECT 1 FROM reconciliation_matches rm JOIN payment_receipts pr ON rm.receipt_id = pr.id JOIN journal_entries je ON je.source_type = 'receipt' AND je.source_id = pr.id WHERE rm.bank_transaction_id = ${bankTransactions.id} AND je.status = 'posted')`,
      sql`NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.source_id = ${bankTransactions.id} AND je.source_type IN ('bank_debit', 'bank_credit') AND je.status = 'posted')`,
    )));
  }

  private unpostedBillsCount(since: string) {
    return this.countFrom(this.db.select({ count: sql<number>`count(*)::int` }).from(purchaseInvoices).where(and(
      eq(purchaseInvoices.tenantId, this.tenantId), gte(purchaseInvoices.invoiceDate, since),
      sql`${purchaseInvoices.status} NOT IN ('cancelled', 'draft')`,
      sql`${purchaseInvoices.invoiceNumber} NOT LIKE 'OB-%'`,
      sql`NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.source_type = 'purchase_invoice' AND je.source_id = ${purchaseInvoices.id})`,
    )));
  }

  private billsMissingInvoiceCount(since: string) {
    return this.countFrom(this.db.select({ count: sql<number>`count(*)::int` }).from(purchaseInvoices)
      .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId), gte(purchaseInvoices.invoiceDate, since),
        sql`${purchaseInvoices.status} NOT IN ('cancelled', 'draft')`,
        eq(vendors.requiresInvoice, true),
        sql`NOT EXISTS (SELECT 1 FROM ${documentAttachments} da WHERE da.entity_type = 'purchase_invoice' AND da.entity_id = ${purchaseInvoices.id})`,
      )));
  }

  private unpostedInvoicesCount(since: string) {
    return this.countFrom(this.db.select({ count: sql<number>`count(*)::int` }).from(salesInvoices).where(and(
      eq(salesInvoices.tenantId, this.tenantId), gte(salesInvoices.invoiceDate, since),
      sql`${salesInvoices.status} NOT IN ('cancelled', 'draft')`,
      sql`${salesInvoices.invoiceNumber} NOT LIKE 'OB-%'`,
      sql`NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.source_type = 'sales_invoice' AND je.source_id = ${salesInvoices.id})`,
    )));
  }

  private unpaidBillsCount(since: string) {
    return this.countFrom(this.db.select({ count: sql<number>`count(*)::int` }).from(purchaseInvoices).where(and(
      eq(purchaseInvoices.tenantId, this.tenantId), gte(purchaseInvoices.invoiceDate, since),
      sql`${purchaseInvoices.balanceDue}::numeric > 0`, sql`${purchaseInvoices.status} NOT IN ('cancelled', 'draft')`,
    )));
  }

  private unpaidInvoicesCount(since: string) {
    return this.countFrom(this.db.select({ count: sql<number>`count(*)::int` }).from(salesInvoices).where(and(
      eq(salesInvoices.tenantId, this.tenantId), gte(salesInvoices.invoiceDate, since),
      sql`${salesInvoices.balanceDue}::numeric > 0`, sql`${salesInvoices.status} NOT IN ('cancelled', 'draft')`,
    )));
  }

  private unmatchedPaymentsCount(since: string) {
    return this.countFrom(this.db.select({ count: sql<number>`count(*)::int` }).from(payments).where(and(
      eq(payments.tenantId, this.tenantId), gte(payments.paymentDate, since),
      sql`${payments.status} NOT IN ('reversed', 'failed')`,
      sql`NOT EXISTS (SELECT 1 FROM reconciliation_matches rm WHERE rm.payment_id = ${payments.id})`,
    )));
  }

  private unmatchedReceiptsCount(since: string) {
    return this.countFrom(this.db.select({ count: sql<number>`count(*)::int` }).from(paymentReceipts).where(and(
      eq(paymentReceipts.tenantId, this.tenantId), gte(paymentReceipts.receiptDate, since),
      sql`NOT EXISTS (SELECT 1 FROM reconciliation_matches rm WHERE rm.receipt_id = ${paymentReceipts.id})`,
      // Wallet receipts settle the 2102 customer-advance liability against AR
      // with no bank leg — they will never have a reconciliation_match by
      // design, so they shouldn't show up as gaps.
      sql`NOT EXISTS (
        SELECT 1 FROM journal_entries je
        JOIN journal_lines jl ON jl.journal_entry_id = je.id
        JOIN accounts a ON a.id = jl.account_id
        WHERE je.source_type = 'receipt' AND je.source_id = ${paymentReceipts.id}
          AND a.code = '2102' AND jl.debit::numeric > 0
      )`,
    )));
  }

  // ── Item fetchers (lazy, on expand) ─────────────────────────────

  private itemFetchers: Record<string, (since: string) => Promise<GapItem[]>> = {
    orphan_bank_artifacts: async () => {
      const orphans = await new OrphanCleanupService(this.db, this.tenantId).listOrphans();
      // Use the auditLogId as the gap item's entityId — the fix endpoint
      // (entityType='orphan_artifact') consumes it directly so the same
      // audit-driven row stays stable across refreshes even though the
      // underlying receipt/payment/JE may shift between scans.
      return orphans.map((o) => ({
        entityType: 'orphan_artifact',
        entityId: o.auditLogId,
        label: o.label,
        summary: `Source bank txn ${o.bankTransactionId.slice(0, 8)}… is gone · created ${o.createdAt.split('T')[0]}`,
        date: o.createdAt.split('T')[0] ?? null,
        url: '/audit/gap-scan',
      }));
    },
    uncategorized_bank_txns: (since) => this.fetchBankTxnItems(
      and(eq(bankTransactions.tenantId, this.tenantId), gte(bankTransactions.transactionDate, since), eq(bankTransactions.reconStatus, 'unreconciled'), isNull(bankTransactions.glAccountId), isNull(bankTransactions.vendorId), isNull(bankTransactions.customerId)),
    ),
    customer_credit_no_invoice: async (since) => {
      const rows = await this.db
        .select({ id: bankTransactions.id, narration: bankTransactions.narration, amount: bankTransactions.amount, date: bankTransactions.transactionDate, cname: customers.name })
        .from(bankTransactions)
        .innerJoin(customers, eq(bankTransactions.customerId, customers.id))
        .where(and(
          eq(bankTransactions.tenantId, this.tenantId), gte(bankTransactions.transactionDate, since),
          eq(bankTransactions.type, 'credit'), eq(bankTransactions.reconStatus, 'unreconciled'),
          sql`${bankTransactions.customerId} IS NOT NULL`,
        ))
        .limit(50);
      return rows.map((r) => ({
        entityType: 'bank_transaction', entityId: r.id,
        label: `${r.cname} — ${r.narration?.slice(0, 40) ?? 'No description'}`,
        summary: `₹${toNumber(r.amount).toLocaleString('en-IN')} · Create invoice for this customer, then re-run auto-reconcile`,
        date: r.date, url: '/banking/transactions',
      }));
    },
    matched_without_je: (since) => this.fetchBankTxnItems(
      and(eq(bankTransactions.tenantId, this.tenantId), gte(bankTransactions.transactionDate, since), eq(bankTransactions.reconStatus, 'matched'), isNull(bankTransactions.journalEntryId),
        sql`NOT EXISTS (SELECT 1 FROM reconciliation_matches rm JOIN payments p ON rm.payment_id = p.id JOIN journal_entries je ON je.source_type = 'payment' AND je.source_id = p.id WHERE rm.bank_transaction_id = ${bankTransactions.id})`,
        sql`NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.source_id = ${bankTransactions.id} AND je.source_type IN ('bank_debit', 'bank_credit'))`,
      ),
    ),
    unposted_bills: async (since) => {
      const rows = await this.db.select({ id: purchaseInvoices.id, num: purchaseInvoices.invoiceNumber, amt: purchaseInvoices.totalAmount, date: purchaseInvoices.invoiceDate, vname: vendors.name })
        .from(purchaseInvoices).innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
        .where(and(eq(purchaseInvoices.tenantId, this.tenantId), gte(purchaseInvoices.invoiceDate, since), sql`${purchaseInvoices.status} NOT IN ('cancelled', 'draft')`, sql`${purchaseInvoices.invoiceNumber} NOT LIKE 'OB-%'`, sql`NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.source_type = 'purchase_invoice' AND je.source_id = ${purchaseInvoices.id})`))
        .limit(50);
      return rows.map((r) => ({ entityType: 'purchase_invoice', entityId: r.id, label: `${r.num} — ${r.vname}`, summary: `₹${toNumber(r.amt).toLocaleString('en-IN')}`, date: r.date, url: `/ap/bills/${r.id}` }));
    },
    bills_missing_invoice: async (since) => {
      const rows = await this.db.select({ id: purchaseInvoices.id, num: purchaseInvoices.invoiceNumber, amt: purchaseInvoices.totalAmount, date: purchaseInvoices.invoiceDate, vname: vendors.name, gstin: vendors.gstin })
        .from(purchaseInvoices).innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
        .where(and(
          eq(purchaseInvoices.tenantId, this.tenantId), gte(purchaseInvoices.invoiceDate, since),
          sql`${purchaseInvoices.status} NOT IN ('cancelled', 'draft')`,
          eq(vendors.requiresInvoice, true),
          sql`NOT EXISTS (SELECT 1 FROM ${documentAttachments} da WHERE da.entity_type = 'purchase_invoice' AND da.entity_id = ${purchaseInvoices.id})`,
        ))
        .limit(50);
      return rows.map((r) => ({ entityType: 'purchase_invoice', entityId: r.id, label: `${r.num} — ${r.vname}`, summary: `₹${toNumber(r.amt).toLocaleString('en-IN')}${r.gstin ? ` · GSTIN ${r.gstin}` : ''}`, date: r.date, url: `/ap/bills/${r.id}` }));
    },
    unposted_invoices: async (since) => {
      const rows = await this.db.select({ id: salesInvoices.id, num: salesInvoices.invoiceNumber, amt: salesInvoices.totalAmount, date: salesInvoices.invoiceDate, cname: customers.name })
        .from(salesInvoices).innerJoin(customers, eq(salesInvoices.customerId, customers.id))
        .where(and(eq(salesInvoices.tenantId, this.tenantId), gte(salesInvoices.invoiceDate, since), sql`${salesInvoices.status} NOT IN ('cancelled', 'draft')`, sql`${salesInvoices.invoiceNumber} NOT LIKE 'OB-%'`, sql`NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.source_type = 'sales_invoice' AND je.source_id = ${salesInvoices.id})`))
        .limit(50);
      return rows.map((r) => ({ entityType: 'sales_invoice', entityId: r.id, label: `${r.num} — ${r.cname}`, summary: `₹${toNumber(r.amt).toLocaleString('en-IN')}`, date: r.date, url: `/ar/invoices/${r.id}` }));
    },
    unpaid_bills: async (since) => {
      const rows = await this.db.select({ id: purchaseInvoices.id, num: purchaseInvoices.invoiceNumber, amt: purchaseInvoices.totalAmount, bal: purchaseInvoices.balanceDue, date: purchaseInvoices.invoiceDate, vname: vendors.name })
        .from(purchaseInvoices).innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
        .where(and(eq(purchaseInvoices.tenantId, this.tenantId), gte(purchaseInvoices.invoiceDate, since), sql`${purchaseInvoices.balanceDue}::numeric > 0`, sql`${purchaseInvoices.status} NOT IN ('cancelled', 'draft')`))
        .limit(50);
      return rows.map((r) => ({ entityType: 'purchase_invoice', entityId: r.id, label: `${r.num} — ${r.vname}`, summary: `₹${toNumber(r.bal).toLocaleString('en-IN')} due of ₹${toNumber(r.amt).toLocaleString('en-IN')}`, date: r.date, url: `/ap/bills/${r.id}` }));
    },
    unpaid_invoices: async (since) => {
      const rows = await this.db.select({ id: salesInvoices.id, num: salesInvoices.invoiceNumber, amt: salesInvoices.totalAmount, bal: salesInvoices.balanceDue, date: salesInvoices.invoiceDate, cname: customers.name })
        .from(salesInvoices).innerJoin(customers, eq(salesInvoices.customerId, customers.id))
        .where(and(eq(salesInvoices.tenantId, this.tenantId), gte(salesInvoices.invoiceDate, since), sql`${salesInvoices.balanceDue}::numeric > 0`, sql`${salesInvoices.status} NOT IN ('cancelled', 'draft')`))
        .limit(50);
      return rows.map((r) => ({ entityType: 'sales_invoice', entityId: r.id, label: `${r.num} — ${r.cname}`, summary: `₹${toNumber(r.bal).toLocaleString('en-IN')} due of ₹${toNumber(r.amt).toLocaleString('en-IN')}`, date: r.date, url: `/ar/invoices/${r.id}` }));
    },
    unmatched_payments: async (since) => {
      const rows = await this.db.select({ id: payments.id, amt: payments.amount, date: payments.paymentDate, vname: vendors.name })
        .from(payments).innerJoin(vendors, eq(payments.vendorId, vendors.id))
        .where(and(eq(payments.tenantId, this.tenantId), gte(payments.paymentDate, since), sql`${payments.status} NOT IN ('reversed', 'failed')`, sql`NOT EXISTS (SELECT 1 FROM reconciliation_matches rm WHERE rm.payment_id = ${payments.id})`))
        .limit(50);
      return rows.map((r) => ({ entityType: 'payment', entityId: r.id, label: `Payment to ${r.vname}`, summary: `₹${toNumber(r.amt).toLocaleString('en-IN')}`, date: r.date, url: `/ap/payments/${r.id}` }));
    },
    unmatched_receipts: async (since) => {
      const rows = await this.db.select({ id: paymentReceipts.id, amt: paymentReceipts.amount, date: paymentReceipts.receiptDate, cname: customers.name })
        .from(paymentReceipts).innerJoin(customers, eq(paymentReceipts.customerId, customers.id))
        .where(and(
          eq(paymentReceipts.tenantId, this.tenantId), gte(paymentReceipts.receiptDate, since),
          sql`NOT EXISTS (SELECT 1 FROM reconciliation_matches rm WHERE rm.receipt_id = ${paymentReceipts.id})`,
          sql`NOT EXISTS (
            SELECT 1 FROM journal_entries je
            JOIN journal_lines jl ON jl.journal_entry_id = je.id
            JOIN accounts a ON a.id = jl.account_id
            WHERE je.source_type = 'receipt' AND je.source_id = ${paymentReceipts.id}
              AND a.code = '2102' AND jl.debit::numeric > 0
          )`,
        ))
        .limit(50);
      return rows.map((r) => ({ entityType: 'receipt', entityId: r.id, label: `Receipt from ${r.cname}`, summary: `₹${toNumber(r.amt).toLocaleString('en-IN')}`, date: r.date, url: `/ar/receipts/${r.id}` }));
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchBankTxnItems(where: any): Promise<GapItem[]> {
    const rows = await this.db.select({ id: bankTransactions.id, narration: bankTransactions.narration, amount: bankTransactions.amount, type: bankTransactions.type, date: bankTransactions.transactionDate })
      .from(bankTransactions).where(where).limit(50);
    return rows.map((r) => ({ entityType: 'bank_transaction', entityId: r.id, label: r.narration?.slice(0, 60) ?? 'No description', summary: `₹${toNumber(r.amount).toLocaleString('en-IN')} · ${r.type}`, date: r.date, url: '/banking/transactions' }));
  }
}
