import { eq, and, isNull, sql } from 'drizzle-orm';
import {
  bankTransactions,
  purchaseInvoices,
  salesInvoices,
  payments,
  paymentReceipts,
  journalEntries,
  reconciliationMatches,
  vendors,
  customers,
} from '@runq/db';
import type { Db } from '@runq/db';
import { toNumber } from '../../utils/decimal';

interface GapItem {
  entityType: string;
  entityId: string;
  label: string;
  summary: string;
  date: string | null;
  url: string;
}

interface GapCategory {
  title: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  items: GapItem[];
}

export interface GapScanResult {
  categories: GapCategory[];
  totalGaps: number;
  scannedAt: string;
}

export class GapScanService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async scan(): Promise<GapScanResult> {
    const categories = await Promise.all([
      this.uncategorizedBankTxns(),
      this.bankTxnsWithoutJE(),
      this.unpaidBills(),
      this.unpaidInvoices(),
      this.unmatchedPayments(),
      this.unmatchedReceipts(),
      this.unpostedBills(),
      this.unpostedInvoices(),
    ]);

    const filtered = categories.filter((c) => c.items.length > 0);
    const totalGaps = filtered.reduce((s, c) => s + c.items.length, 0);

    return { categories: filtered, totalGaps, scannedAt: new Date().toISOString() };
  }

  private async uncategorizedBankTxns(): Promise<GapCategory> {
    const rows = await this.db.select({
      id: bankTransactions.id,
      narration: bankTransactions.narration,
      amount: bankTransactions.amount,
      type: bankTransactions.type,
      date: bankTransactions.transactionDate,
    })
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.tenantId, this.tenantId),
        eq(bankTransactions.reconStatus, 'unreconciled'),
        isNull(bankTransactions.glAccountId),
        isNull(bankTransactions.vendorId),
        isNull(bankTransactions.customerId),
      ))
      .limit(50);

    return {
      title: 'Uncategorized Bank Transactions',
      description: 'Transactions with no GL category, vendor, or customer assigned',
      severity: 'error',
      items: rows.map((r) => ({
        entityType: 'bank_transaction', entityId: r.id,
        label: r.narration?.slice(0, 60) ?? 'No description',
        summary: `₹${toNumber(r.amount).toLocaleString('en-IN')} · ${r.type}`,
        date: r.date, url: '/banking/transactions',
      })),
    };
  }

  private async bankTxnsWithoutJE(): Promise<GapCategory> {
    const rows = await this.db.select({
      id: bankTransactions.id,
      narration: bankTransactions.narration,
      amount: bankTransactions.amount,
      type: bankTransactions.type,
      date: bankTransactions.transactionDate,
    })
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.tenantId, this.tenantId),
        eq(bankTransactions.reconStatus, 'matched'),
        isNull(bankTransactions.journalEntryId),
        sql`NOT EXISTS (
          SELECT 1 FROM reconciliation_matches rm
          JOIN payments p ON rm.payment_id = p.id
          JOIN journal_entries je ON je.source_type = 'payment' AND je.source_id = p.id
          WHERE rm.bank_transaction_id = ${bankTransactions.id}
        )`,
        sql`NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.source_id = ${bankTransactions.id}
          AND je.source_type IN ('bank_debit', 'bank_credit')
        )`,
      ))
      .limit(50);

    return {
      title: 'Matched Transactions Without Journal Entries',
      description: 'Reconciled but no accounting entry exists — books may be incomplete',
      severity: 'error',
      items: rows.map((r) => ({
        entityType: 'bank_transaction', entityId: r.id,
        label: r.narration?.slice(0, 60) ?? 'No description',
        summary: `₹${toNumber(r.amount).toLocaleString('en-IN')} · ${r.type}`,
        date: r.date, url: '/banking/transactions',
      })),
    };
  }

  private async unpaidBills(): Promise<GapCategory> {
    const rows = await this.db.select({
      id: purchaseInvoices.id,
      invoiceNumber: purchaseInvoices.invoiceNumber,
      totalAmount: purchaseInvoices.totalAmount,
      balanceDue: purchaseInvoices.balanceDue,
      date: purchaseInvoices.invoiceDate,
      vendorName: vendors.name,
    })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        sql`${purchaseInvoices.balanceDue}::numeric > 0`,
        sql`${purchaseInvoices.status} NOT IN ('cancelled', 'draft')`,
      ))
      .limit(50);

    return {
      title: 'Unpaid Bills',
      description: 'Approved bills with outstanding balance — payment not yet recorded',
      severity: 'warning',
      items: rows.map((r) => ({
        entityType: 'purchase_invoice', entityId: r.id,
        label: `${r.invoiceNumber} — ${r.vendorName}`,
        summary: `₹${toNumber(r.balanceDue).toLocaleString('en-IN')} due of ₹${toNumber(r.totalAmount).toLocaleString('en-IN')}`,
        date: r.date, url: `/ap/bills/${r.id}`,
      })),
    };
  }

  private async unpaidInvoices(): Promise<GapCategory> {
    const rows = await this.db.select({
      id: salesInvoices.id,
      invoiceNumber: salesInvoices.invoiceNumber,
      totalAmount: salesInvoices.totalAmount,
      balanceDue: salesInvoices.balanceDue,
      date: salesInvoices.invoiceDate,
      customerName: customers.name,
    })
      .from(salesInvoices)
      .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        sql`${salesInvoices.balanceDue}::numeric > 0`,
        sql`${salesInvoices.status} NOT IN ('cancelled', 'draft')`,
      ))
      .limit(50);

    return {
      title: 'Unpaid Invoices',
      description: 'Sent invoices with outstanding balance — payment not yet received',
      severity: 'warning',
      items: rows.map((r) => ({
        entityType: 'sales_invoice', entityId: r.id,
        label: `${r.invoiceNumber} — ${r.customerName}`,
        summary: `₹${toNumber(r.balanceDue).toLocaleString('en-IN')} due of ₹${toNumber(r.totalAmount).toLocaleString('en-IN')}`,
        date: r.date, url: `/ar/invoices/${r.id}`,
      })),
    };
  }

  private async unmatchedPayments(): Promise<GapCategory> {
    const rows = await this.db.select({
      id: payments.id,
      amount: payments.amount,
      date: payments.paymentDate,
      vendorName: vendors.name,
    })
      .from(payments)
      .innerJoin(vendors, eq(payments.vendorId, vendors.id))
      .where(and(
        eq(payments.tenantId, this.tenantId),
        sql`NOT EXISTS (SELECT 1 FROM reconciliation_matches rm WHERE rm.payment_id = ${payments.id})`,
      ))
      .limit(50);

    return {
      title: 'Unreconciled Payments',
      description: 'Payments recorded in books but not matched to any bank transaction',
      severity: 'warning',
      items: rows.map((r) => ({
        entityType: 'payment', entityId: r.id,
        label: `Payment to ${r.vendorName}`,
        summary: `₹${toNumber(r.amount).toLocaleString('en-IN')}`,
        date: r.date, url: `/ap/payments/${r.id}`,
      })),
    };
  }

  private async unmatchedReceipts(): Promise<GapCategory> {
    const rows = await this.db.select({
      id: paymentReceipts.id,
      amount: paymentReceipts.amount,
      date: paymentReceipts.receiptDate,
      customerName: customers.name,
    })
      .from(paymentReceipts)
      .innerJoin(customers, eq(paymentReceipts.customerId, customers.id))
      .where(and(
        eq(paymentReceipts.tenantId, this.tenantId),
        sql`NOT EXISTS (SELECT 1 FROM reconciliation_matches rm WHERE rm.receipt_id = ${paymentReceipts.id})`,
      ))
      .limit(50);

    return {
      title: 'Unreconciled Receipts',
      description: 'Receipts recorded in books but not matched to any bank transaction',
      severity: 'warning',
      items: rows.map((r) => ({
        entityType: 'receipt', entityId: r.id,
        label: `Receipt from ${r.customerName}`,
        summary: `₹${toNumber(r.amount).toLocaleString('en-IN')}`,
        date: r.date, url: `/ar/receipts/${r.id}`,
      })),
    };
  }

  private async unpostedBills(): Promise<GapCategory> {
    const rows = await this.db.select({
      id: purchaseInvoices.id,
      invoiceNumber: purchaseInvoices.invoiceNumber,
      totalAmount: purchaseInvoices.totalAmount,
      date: purchaseInvoices.invoiceDate,
      vendorName: vendors.name,
    })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        sql`${purchaseInvoices.status} NOT IN ('cancelled', 'draft')`,
        sql`NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.source_type = 'purchase_invoice' AND je.source_id = ${purchaseInvoices.id}
        )`,
      ))
      .limit(50);

    return {
      title: 'Bills Without Journal Entries',
      description: 'Approved bills with no GL posting — expense not recorded in books',
      severity: 'error',
      items: rows.map((r) => ({
        entityType: 'purchase_invoice', entityId: r.id,
        label: `${r.invoiceNumber} — ${r.vendorName}`,
        summary: `₹${toNumber(r.totalAmount).toLocaleString('en-IN')}`,
        date: r.date, url: `/ap/bills/${r.id}`,
      })),
    };
  }

  private async unpostedInvoices(): Promise<GapCategory> {
    const rows = await this.db.select({
      id: salesInvoices.id,
      invoiceNumber: salesInvoices.invoiceNumber,
      totalAmount: salesInvoices.totalAmount,
      date: salesInvoices.invoiceDate,
      customerName: customers.name,
    })
      .from(salesInvoices)
      .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        sql`${salesInvoices.status} NOT IN ('cancelled', 'draft')`,
        sql`NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.source_type = 'sales_invoice' AND je.source_id = ${salesInvoices.id}
        )`,
      ))
      .limit(50);

    return {
      title: 'Invoices Without Journal Entries',
      description: 'Sent invoices with no GL posting — revenue not recorded in books',
      severity: 'error',
      items: rows.map((r) => ({
        entityType: 'sales_invoice', entityId: r.id,
        label: `${r.invoiceNumber} — ${r.customerName}`,
        summary: `₹${toNumber(r.totalAmount).toLocaleString('en-IN')}`,
        date: r.date, url: `/ar/invoices/${r.id}`,
      })),
    };
  }
}
