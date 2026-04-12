import { eq, and, or, inArray } from 'drizzle-orm';
import {
  bankTransactions,
  reconciliationMatches,
  payments,
  paymentAllocations,
  paymentReceipts,
  receiptAllocations,
  purchaseInvoices,
  salesInvoices,
  journalEntries,
  journalLines,
  accounts,
  vendors,
  customers,
} from '@runq/db';
import type { Db } from '@runq/db';
import { toNumber } from '../../utils/decimal';
import { NotFoundError } from '../../utils/errors';

export interface TrailNode {
  type: string;
  id: string;
  label: string;
  summary: string;
  date: string | null;
  status: string | null;
  url: string;
}

export interface DocumentTrail {
  root: TrailNode;
  chain: TrailNode[];
  gaps: string[];
}

type EntityType = 'bank_transaction' | 'purchase_invoice' | 'sales_invoice'
  | 'payment' | 'receipt' | 'journal_entry';

const formatINR = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

export class TrailService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async getTrail(entityType: string, entityId: string): Promise<DocumentTrail> {
    switch (entityType as EntityType) {
      case 'bank_transaction': return this.traceFromBankTxn(entityId);
      case 'purchase_invoice': return this.traceFromBill(entityId);
      case 'sales_invoice': return this.traceFromInvoice(entityId);
      case 'payment': return this.traceFromPayment(entityId);
      case 'receipt': return this.traceFromReceipt(entityId);
      case 'journal_entry': return this.traceFromJE(entityId);
      default: throw new NotFoundError(`Unsupported entity type: ${entityType}`);
    }
  }

  // ── Trace from Bank Transaction ─────────────────────────────────

  private async traceFromBankTxn(id: string): Promise<DocumentTrail> {
    const [txn] = await this.db.select().from(bankTransactions)
      .where(and(eq(bankTransactions.id, id), eq(bankTransactions.tenantId, this.tenantId))).limit(1);
    if (!txn) throw new NotFoundError('Bank transaction');

    const root = this.bankTxnNode(txn);
    const chain: TrailNode[] = [];
    const gaps: string[] = [];

    // Vendor or Customer
    if (txn.vendorId) {
      const [v] = await this.db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, txn.vendorId)).limit(1);
      if (v) chain.push({ type: 'vendor', id: txn.vendorId, label: v.name, summary: 'Vendor', date: null, status: null, url: `/ap/vendors/${txn.vendorId}` });
    }
    if (txn.customerId) {
      const [c] = await this.db.select({ name: customers.name }).from(customers).where(eq(customers.id, txn.customerId)).limit(1);
      if (c) chain.push({ type: 'customer', id: txn.customerId, label: c.name, summary: 'Customer', date: null, status: null, url: `/ar/customers/${txn.customerId}` });
    }

    // Reconciliation matches → payment or receipt
    const matches = await this.db.select().from(reconciliationMatches)
      .where(and(eq(reconciliationMatches.bankTransactionId, id), eq(reconciliationMatches.tenantId, this.tenantId)));

    for (const m of matches) {
      if (m.paymentId) {
        const pNodes = await this.paymentChain(m.paymentId);
        chain.push(...pNodes);
      }
      if (m.receiptId) {
        const rNodes = await this.receiptChain(m.receiptId);
        chain.push(...rNodes);
      }
    }

    // Journal entries linked directly
    if (txn.journalEntryId) {
      const jeNodes = await this.jeNodes([txn.journalEntryId]);
      chain.push(...jeNodes);
    }

    // Also find JEs by sourceId matching this txn
    const sourceJEs = await this.findJEsBySource(['bank_debit', 'bank_credit'], [id]);
    for (const je of sourceJEs) {
      if (!chain.find((n) => n.type === 'journal_entry' && n.id === je.id)) {
        chain.push(...await this.jeNodes([je.id]));
      }
    }

    // Gap detection
    if (txn.reconStatus === 'unreconciled') {
      if (!txn.glAccountId && !txn.vendorId && !txn.customerId) {
        gaps.push('Not categorized or assigned to vendor/customer');
      } else if (!txn.journalEntryId && matches.length === 0) {
        gaps.push('No journal entry linked');
      }
    }

    return { root, chain, gaps };
  }

  // ── Trace from Purchase Invoice (Bill) ──────────────────────────

  private async traceFromBill(id: string): Promise<DocumentTrail> {
    const [bill] = await this.db.select().from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.tenantId, this.tenantId))).limit(1);
    if (!bill) throw new NotFoundError('Purchase invoice');

    const [v] = await this.db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, bill.vendorId)).limit(1);
    const root = this.billNode(bill, v?.name ?? 'Unknown');
    const chain: TrailNode[] = [];
    const gaps: string[] = [];

    // Vendor
    if (v) chain.push({ type: 'vendor', id: bill.vendorId, label: v.name, summary: 'Vendor', date: null, status: null, url: `/ap/vendors/${bill.vendorId}` });

    // Payments
    const allocs = await this.db.select().from(paymentAllocations)
      .where(and(eq(paymentAllocations.invoiceId, id), eq(paymentAllocations.tenantId, this.tenantId)));
    for (const a of allocs) {
      const pNodes = await this.paymentChain(a.paymentId);
      chain.push(...pNodes);
    }

    // JEs
    const jeIds = await this.findJEsBySource(['purchase_invoice', 'payment'], [id, ...allocs.map((a) => a.paymentId)]);
    chain.push(...await this.jeNodes(jeIds.map((j) => j.id)));

    // Bank txns via reconciliation
    for (const a of allocs) {
      const bankNodes = await this.bankTxnFromPayment(a.paymentId);
      chain.push(...bankNodes);
    }

    // Gaps
    if (allocs.length === 0 && parseFloat(bill.balanceDue) > 0) gaps.push('Bill unpaid');
    if (jeIds.length === 0) gaps.push('No journal entry posted for this bill');

    return { root, chain, gaps };
  }

  // ── Trace from Sales Invoice ────────────────────────────────────

  private async traceFromInvoice(id: string): Promise<DocumentTrail> {
    const [inv] = await this.db.select().from(salesInvoices)
      .where(and(eq(salesInvoices.id, id), eq(salesInvoices.tenantId, this.tenantId))).limit(1);
    if (!inv) throw new NotFoundError('Sales invoice');

    const [c] = await this.db.select({ name: customers.name }).from(customers).where(eq(customers.id, inv.customerId)).limit(1);
    const root: TrailNode = {
      type: 'sales_invoice', id, label: inv.invoiceNumber,
      summary: `${formatINR(toNumber(inv.totalAmount))} to ${c?.name ?? 'Unknown'}`,
      date: inv.invoiceDate, status: inv.status, url: `/ar/invoices/${id}`,
    };
    const chain: TrailNode[] = [];
    const gaps: string[] = [];

    if (c) chain.push({ type: 'customer', id: inv.customerId, label: c.name, summary: 'Customer', date: null, status: null, url: `/ar/customers/${inv.customerId}` });

    // Receipts
    const allocs = await this.db.select().from(receiptAllocations)
      .where(and(eq(receiptAllocations.invoiceId, id), eq(receiptAllocations.tenantId, this.tenantId)));
    for (const a of allocs) {
      const rNodes = await this.receiptChain(a.receiptId);
      chain.push(...rNodes);
    }

    // JEs
    const jeIds = await this.findJEsBySource(['sales_invoice', 'receipt'], [id, ...allocs.map((a) => a.receiptId)]);
    chain.push(...await this.jeNodes(jeIds.map((j) => j.id)));

    // Gaps
    if (allocs.length === 0 && parseFloat(inv.balanceDue) > 0) gaps.push('Invoice unpaid');
    if (jeIds.length === 0) gaps.push('No journal entry posted for this invoice');

    return { root, chain, gaps };
  }

  // ── Trace from Payment ──────────────────────────────────────────

  private async traceFromPayment(id: string): Promise<DocumentTrail> {
    const [pay] = await this.db.select().from(payments)
      .where(and(eq(payments.id, id), eq(payments.tenantId, this.tenantId))).limit(1);
    if (!pay) throw new NotFoundError('Payment');

    const [v] = await this.db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, pay.vendorId)).limit(1);
    const root: TrailNode = {
      type: 'payment', id, label: `Payment to ${v?.name ?? 'Unknown'}`,
      summary: formatINR(toNumber(pay.amount)), date: pay.paymentDate, status: pay.status,
      url: `/ap/payments/${id}`,
    };
    const chain: TrailNode[] = [];
    const gaps: string[] = [];

    if (v) chain.push({ type: 'vendor', id: pay.vendorId, label: v.name, summary: 'Vendor', date: null, status: null, url: `/ap/vendors/${pay.vendorId}` });

    // Bill allocations
    const allocs = await this.db.select().from(paymentAllocations)
      .where(and(eq(paymentAllocations.paymentId, id), eq(paymentAllocations.tenantId, this.tenantId)));
    for (const a of allocs) {
      const [bill] = await this.db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, a.invoiceId)).limit(1);
      if (bill) chain.push(this.billNode(bill, v?.name ?? 'Unknown'));
    }

    // Bank txn
    chain.push(...await this.bankTxnFromPayment(id));

    // JEs
    const jeIds = await this.findJEsBySource(['payment'], [id]);
    chain.push(...await this.jeNodes(jeIds.map((j) => j.id)));

    // Gaps
    const bankMatch = await this.db.select({ id: reconciliationMatches.id }).from(reconciliationMatches)
      .where(and(eq(reconciliationMatches.paymentId, id), eq(reconciliationMatches.tenantId, this.tenantId))).limit(1);
    if (bankMatch.length === 0) gaps.push('Payment not reconciled with bank');
    if (jeIds.length === 0) gaps.push('No journal entry posted');

    return { root, chain, gaps };
  }

  // ── Trace from Receipt ──────────────────────────────────────────

  private async traceFromReceipt(id: string): Promise<DocumentTrail> {
    const [rec] = await this.db.select().from(paymentReceipts)
      .where(and(eq(paymentReceipts.id, id), eq(paymentReceipts.tenantId, this.tenantId))).limit(1);
    if (!rec) throw new NotFoundError('Receipt');

    const [c] = await this.db.select({ name: customers.name }).from(customers).where(eq(customers.id, rec.customerId)).limit(1);
    const root: TrailNode = {
      type: 'receipt', id, label: `Receipt from ${c?.name ?? 'Unknown'}`,
      summary: formatINR(toNumber(rec.amount)), date: rec.receiptDate, status: null,
      url: `/ar/receipts/${id}`,
    };
    const chain: TrailNode[] = [];
    const gaps: string[] = [];

    if (c) chain.push({ type: 'customer', id: rec.customerId, label: c.name, summary: 'Customer', date: null, status: null, url: `/ar/customers/${rec.customerId}` });

    // Invoice allocations
    const allocs = await this.db.select().from(receiptAllocations)
      .where(and(eq(receiptAllocations.receiptId, id), eq(receiptAllocations.tenantId, this.tenantId)));
    for (const a of allocs) {
      const [inv] = await this.db.select().from(salesInvoices).where(eq(salesInvoices.id, a.invoiceId)).limit(1);
      if (inv) {
        chain.push({
          type: 'sales_invoice', id: a.invoiceId, label: inv.invoiceNumber,
          summary: formatINR(toNumber(inv.totalAmount)), date: inv.invoiceDate,
          status: inv.status, url: `/ar/invoices/${a.invoiceId}`,
        });
      }
    }

    // JEs
    const jeIds = await this.findJEsBySource(['receipt'], [id]);
    chain.push(...await this.jeNodes(jeIds.map((j) => j.id)));

    if (jeIds.length === 0) gaps.push('No journal entry posted');

    return { root, chain, gaps };
  }

  // ── Trace from Journal Entry ────────────────────────────────────

  private async traceFromJE(id: string): Promise<DocumentTrail> {
    const [je] = await this.db.select().from(journalEntries)
      .where(and(eq(journalEntries.id, id), eq(journalEntries.tenantId, this.tenantId))).limit(1);
    if (!je) throw new NotFoundError('Journal entry');

    const lines = await this.db.select({ line: journalLines, acct: accounts })
      .from(journalLines).innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(eq(journalLines.journalEntryId, id));

    const lineSummary = lines.map((l) => {
      const amt = toNumber(l.line.debit) > 0 ? toNumber(l.line.debit) : toNumber(l.line.credit);
      const side = toNumber(l.line.debit) > 0 ? 'Dr' : 'Cr';
      return `${side} ${l.acct.code} ${l.acct.name} ${formatINR(amt)}`;
    }).join(' | ');

    const root: TrailNode = {
      type: 'journal_entry', id, label: je.entryNumber,
      summary: lineSummary, date: je.date, status: je.status,
      url: `/gl/journal-entries`,
    };
    const chain: TrailNode[] = [];
    const gaps: string[] = [];

    // Trace to source document
    if (je.sourceType && je.sourceId) {
      try {
        const sourceTrail = await this.getTrail(this.mapSourceType(je.sourceType), je.sourceId);
        chain.push(sourceTrail.root);
        chain.push(...sourceTrail.chain);
      } catch {
        // Source document may not exist
      }
    }

    // Bank txn that links to this JE
    const [bankTxn] = await this.db.select().from(bankTransactions)
      .where(and(eq(bankTransactions.journalEntryId, id), eq(bankTransactions.tenantId, this.tenantId))).limit(1);
    if (bankTxn) {
      chain.push(this.bankTxnNode(bankTxn));
    }

    return { root, chain, gaps };
  }

  // ── Shared helpers ──────────────────────────────────────────────

  private async paymentChain(paymentId: string): Promise<TrailNode[]> {
    const [pay] = await this.db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!pay) return [];
    const [v] = await this.db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, pay.vendorId)).limit(1);
    return [{
      type: 'payment', id: paymentId, label: `Payment to ${v?.name ?? 'Unknown'}`,
      summary: formatINR(toNumber(pay.amount)), date: pay.paymentDate, status: pay.status,
      url: `/ap/payments/${paymentId}`,
    }];
  }

  private async receiptChain(receiptId: string): Promise<TrailNode[]> {
    const [rec] = await this.db.select().from(paymentReceipts).where(eq(paymentReceipts.id, receiptId)).limit(1);
    if (!rec) return [];
    const [c] = await this.db.select({ name: customers.name }).from(customers).where(eq(customers.id, rec.customerId)).limit(1);
    return [{
      type: 'receipt', id: receiptId, label: `Receipt from ${c?.name ?? 'Unknown'}`,
      summary: formatINR(toNumber(rec.amount)), date: rec.receiptDate, status: null,
      url: `/ar/receipts/${receiptId}`,
    }];
  }

  private async bankTxnFromPayment(paymentId: string): Promise<TrailNode[]> {
    const [match] = await this.db.select({ bankTransactionId: reconciliationMatches.bankTransactionId })
      .from(reconciliationMatches)
      .where(and(eq(reconciliationMatches.paymentId, paymentId), eq(reconciliationMatches.tenantId, this.tenantId))).limit(1);
    if (!match) return [];
    const [txn] = await this.db.select().from(bankTransactions).where(eq(bankTransactions.id, match.bankTransactionId)).limit(1);
    return txn ? [this.bankTxnNode(txn)] : [];
  }

  private async findJEsBySource(sourceTypes: string[], sourceIds: string[]) {
    if (sourceIds.length === 0) return [];
    return this.db.select({ id: journalEntries.id, entryNumber: journalEntries.entryNumber })
      .from(journalEntries)
      .where(and(
        eq(journalEntries.tenantId, this.tenantId),
        inArray(journalEntries.sourceType, sourceTypes),
        inArray(journalEntries.sourceId, sourceIds),
      ));
  }

  private async jeNodes(jeIds: string[]): Promise<TrailNode[]> {
    if (jeIds.length === 0) return [];
    const unique = [...new Set(jeIds)];
    const jes = await this.db.select().from(journalEntries).where(inArray(journalEntries.id, unique));
    return jes.map((je) => ({
      type: 'journal_entry' as const, id: je.id, label: je.entryNumber,
      summary: `${formatINR(toNumber(je.totalDebit))} — ${je.description}`,
      date: je.date, status: je.status, url: `/gl/journal-entries`,
    }));
  }

  private bankTxnNode(txn: typeof bankTransactions.$inferSelect): TrailNode {
    const amt = toNumber(txn.amount);
    return {
      type: 'bank_transaction', id: txn.id,
      label: txn.narration?.slice(0, 60) ?? 'Bank Transaction',
      summary: `${formatINR(amt)} · ${txn.type === 'credit' ? 'Credit' : 'Debit'}`,
      date: txn.transactionDate, status: txn.reconStatus,
      url: `/banking/transactions`,
    };
  }

  private billNode(bill: typeof purchaseInvoices.$inferSelect, vendorName: string): TrailNode {
    return {
      type: 'purchase_invoice', id: bill.id, label: bill.invoiceNumber,
      summary: `${formatINR(toNumber(bill.totalAmount))} from ${vendorName}`,
      date: bill.invoiceDate, status: bill.status, url: `/ap/bills/${bill.id}`,
    };
  }

  private mapSourceType(sourceType: string): string {
    const map: Record<string, string> = {
      purchase_invoice: 'purchase_invoice',
      sales_invoice: 'sales_invoice',
      payment: 'payment',
      receipt: 'receipt',
      bank_debit: 'bank_transaction',
      bank_credit: 'bank_transaction',
    };
    return map[sourceType] ?? sourceType;
  }
}
