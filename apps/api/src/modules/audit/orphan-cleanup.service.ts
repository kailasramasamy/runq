import { eq, and, sql } from 'drizzle-orm';
import {
  auditLog,
  bankTransactions,
  paymentReceipts,
  receiptAllocations,
  payments,
  paymentAllocations,
  salesInvoices,
  purchaseInvoices,
  journalEntries,
  reconciliationMatches,
} from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';

export interface OrphanArtifact {
  auditLogId: string;
  createdAt: string;
  entityType: 'payment_receipt' | 'payment' | 'journal_entry';
  entityId: string;
  amount: number;
  flow: string | null;
  bankTransactionId: string;
  label: string;
}

interface ReverseStep {
  action: string;
  result: string;
  success: boolean;
}

export interface ReverseResult {
  steps: ReverseStep[];
  allFixed: boolean;
  manualRequired: string[];
}

/**
 * Cleans up artifacts (receipts, payments, JEs) that were auto-created from
 * a bank transaction which has since been deleted — typically the fallout
 * of a mistaken bank-statement re-import where the duplicate bank rows
 * were cleaned up but the cascading book entries weren't.
 *
 * Identification is by the `auto_created_from_bank_txn` audit log entry:
 * if `metadata.bankTransactionId` no longer resolves, the artifact is
 * orphaned and must be reversed so the books rebalance.
 */
export class OrphanCleanupService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /**
   * List every auto-created artifact whose source bank txn is gone and
   * whose artifact row still exists. Bounded to a recent window — older
   * orphans typically aren't surfaceable for fix anyway and dragging the
   * full table is wasteful.
   */
  async listOrphans(): Promise<OrphanArtifact[]> {
    const rows = await this.db.execute<{
      audit_id: string;
      created_at: Date;
      entity_type: string;
      entity_id: string;
      amount: string;
      flow: string | null;
      bank_transaction_id: string;
    }>(sql`
      SELECT
        al.id AS audit_id,
        al.created_at,
        al.entity_type,
        al.entity_id,
        COALESCE(al.metadata->>'amount', '0') AS amount,
        al.metadata->>'flow' AS flow,
        (al.metadata->>'bankTransactionId')::uuid AS bank_transaction_id
      FROM audit_log al
      LEFT JOIN bank_transactions bt ON bt.id = (al.metadata->>'bankTransactionId')::uuid
      WHERE al.tenant_id = ${this.tenantId}
        AND al.action = 'auto_created_from_bank_txn'
        AND al.metadata ? 'bankTransactionId'
        AND bt.id IS NULL
      ORDER BY al.created_at DESC
      LIMIT 200
    `);

    const out: OrphanArtifact[] = [];
    for (const r of rows.rows) {
      const exists = await this.artifactStillExists(r.entity_type, r.entity_id);
      if (!exists) continue;
      out.push({
        auditLogId: r.audit_id,
        createdAt: new Date(r.created_at).toISOString(),
        entityType: r.entity_type as OrphanArtifact['entityType'],
        entityId: r.entity_id,
        amount: toNumber(r.amount),
        flow: r.flow,
        bankTransactionId: r.bank_transaction_id,
        label: this.describe(r.entity_type, r.flow, toNumber(r.amount)),
      });
    }
    return out;
  }

  /**
   * Reverse one orphan artifact identified by its audit_log row. Re-checks
   * the bank-txn is genuinely missing before touching anything, so a stale
   * UI clicking after a re-import can't accidentally undo good data.
   */
  async reverseByAuditLog(auditLogId: string): Promise<ReverseResult> {
    const [row] = await this.db.select().from(auditLog)
      .where(and(eq(auditLog.id, auditLogId), eq(auditLog.tenantId, this.tenantId))).limit(1);
    if (!row) throw new NotFoundError('Audit log entry');
    if (row.action !== 'auto_created_from_bank_txn') {
      throw new ConflictError('Audit entry is not an auto-created bank artifact');
    }

    const meta = (row.metadata ?? {}) as { bankTransactionId?: string; flow?: string };
    const bankTxnId = meta.bankTransactionId;
    if (!bankTxnId) throw new ConflictError('Audit entry missing bankTransactionId');

    const [bt] = await this.db.select({ id: bankTransactions.id }).from(bankTransactions)
      .where(and(eq(bankTransactions.id, bankTxnId), eq(bankTransactions.tenantId, this.tenantId))).limit(1);
    if (bt) {
      return {
        steps: [],
        allFixed: false,
        manualRequired: ['Bank transaction still exists — this is no longer an orphan. Refresh the page; if the row reappears, reconcile from Banking → Transactions instead.'],
      };
    }

    switch (row.entityType) {
      case 'payment_receipt':
        return this.reverseReceipt(row.entityId);
      case 'payment':
        return this.reversePayment(row.entityId, meta.flow ?? null);
      case 'journal_entry':
        return this.reverseJournalEntry(row.entityId);
      default:
        throw new ConflictError(`Cannot reverse entity type ${row.entityType}`);
    }
  }

  // ── reversals ────────────────────────────────────────────────────────

  private async reverseReceipt(receiptId: string): Promise<ReverseResult> {
    const [receipt] = await this.db.select().from(paymentReceipts)
      .where(and(eq(paymentReceipts.id, receiptId), eq(paymentReceipts.tenantId, this.tenantId))).limit(1);
    if (!receipt) return this.alreadyClean('Receipt was already removed.');

    const allocs = await this.db.select().from(receiptAllocations)
      .where(and(
        eq(receiptAllocations.tenantId, this.tenantId),
        eq(receiptAllocations.receiptId, receiptId),
      ));

    const steps: ReverseStep[] = [];
    await this.db.transaction(async (tx) => {
      for (const alloc of allocs) {
        const [inv] = await tx.select().from(salesInvoices)
          .where(eq(salesInvoices.id, alloc.invoiceId)).limit(1);
        if (!inv) continue;
        const newRecv = Math.max(0, toNumber(inv.amountReceived) - toNumber(alloc.amount));
        const newBal = Math.min(toNumber(inv.totalAmount), toNumber(inv.balanceDue) + toNumber(alloc.amount));
        await tx.update(salesInvoices).set({
          amountReceived: String(Math.round(newRecv * 100) / 100),
          balanceDue: String(Math.round(newBal * 100) / 100),
          status: newRecv <= 0.01 ? 'sent' : 'partially_paid',
          updatedAt: new Date(),
        }).where(eq(salesInvoices.id, inv.id));
      }
      await tx.delete(receiptAllocations).where(eq(receiptAllocations.receiptId, receiptId));
      await tx.update(journalEntries)
        .set({ status: 'reversed', updatedAt: new Date() })
        .where(and(
          eq(journalEntries.tenantId, this.tenantId),
          eq(journalEntries.sourceType, 'receipt'),
          eq(journalEntries.sourceId, receiptId),
        ));
      // recon_matches.receipt_id FK is RESTRICT — clear it before the receipt
      await tx.delete(reconciliationMatches).where(and(
        eq(reconciliationMatches.tenantId, this.tenantId),
        eq(reconciliationMatches.receiptId, receiptId),
      ));
      await tx.delete(paymentReceipts).where(eq(paymentReceipts.id, receiptId));
    });

    steps.push({ action: 'Restore invoice balances', result: `Re-opened ${allocs.length} invoice${allocs.length === 1 ? '' : 's'} (added ₹${toNumber(receipt.amount).toLocaleString('en-IN')} back to AR)`, success: true });
    steps.push({ action: 'Reverse JE', result: 'Receipt JE marked reversed (DR Bank / CR AR backed out)', success: true });
    steps.push({ action: 'Delete orphan receipt', result: `Removed receipt ₹${toNumber(receipt.amount).toLocaleString('en-IN')}`, success: true });
    return { steps, allFixed: true, manualRequired: [] };
  }

  private async reversePayment(paymentId: string, flow: string | null): Promise<ReverseResult> {
    const [payment] = await this.db.select().from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.tenantId, this.tenantId))).limit(1);
    if (!payment) return this.alreadyClean('Payment was already removed.');
    if (payment.status === 'reversed') return this.alreadyClean('Payment was already reversed.');

    const allocs = await this.db.select().from(paymentAllocations)
      .where(and(
        eq(paymentAllocations.tenantId, this.tenantId),
        eq(paymentAllocations.paymentId, paymentId),
      ));

    const steps: ReverseStep[] = [];
    await this.db.transaction(async (tx) => {
      for (const alloc of allocs) {
        const [bill] = await tx.select().from(purchaseInvoices)
          .where(eq(purchaseInvoices.id, alloc.invoiceId)).limit(1);
        if (!bill) continue;
        const newPaid = Math.max(0, toNumber(bill.amountPaid) - toNumber(alloc.amount));
        const newBal = Math.min(toNumber(bill.totalAmount), toNumber(bill.balanceDue) + toNumber(alloc.amount));
        await tx.update(purchaseInvoices).set({
          amountPaid: String(Math.round(newPaid * 100) / 100),
          balanceDue: String(Math.round(newBal * 100) / 100),
          status: newPaid <= 0.01 ? 'approved' : 'partially_paid',
          updatedAt: new Date(),
        }).where(eq(purchaseInvoices.id, bill.id));
      }
      await tx.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId));
      await tx.update(journalEntries)
        .set({ status: 'reversed', updatedAt: new Date() })
        .where(and(
          eq(journalEntries.tenantId, this.tenantId),
          eq(journalEntries.sourceType, 'payment'),
          eq(journalEntries.sourceId, paymentId),
        ));
      await tx.delete(reconciliationMatches).where(and(
        eq(reconciliationMatches.tenantId, this.tenantId),
        eq(reconciliationMatches.paymentId, paymentId),
      ));
      await tx.update(payments)
        .set({ status: 'reversed', updatedAt: new Date() })
        .where(eq(payments.id, paymentId));
    });

    const variant = flow === 'posted_advance' ? 'advance' : 'bill payment';
    steps.push({ action: 'Restore bill balances', result: allocs.length > 0 ? `Re-opened ${allocs.length} bill${allocs.length === 1 ? '' : 's'} (added ₹${toNumber(payment.amount).toLocaleString('en-IN')} back to AP)` : 'No allocations to restore', success: true });
    steps.push({ action: 'Reverse JEs', result: `Payment JE marked reversed (${variant})`, success: true });
    steps.push({ action: 'Mark payment reversed', result: `Payment ₹${toNumber(payment.amount).toLocaleString('en-IN')} status = reversed (kept for audit)`, success: true });
    return { steps, allFixed: true, manualRequired: [] };
  }

  private async reverseJournalEntry(journalEntryId: string): Promise<ReverseResult> {
    const [je] = await this.db.select().from(journalEntries)
      .where(and(eq(journalEntries.id, journalEntryId), eq(journalEntries.tenantId, this.tenantId))).limit(1);
    if (!je) return this.alreadyClean('Journal entry was already removed.');
    if (je.status === 'reversed') return this.alreadyClean('Journal entry was already reversed.');

    await this.db.update(journalEntries)
      .set({ status: 'reversed', updatedAt: new Date() })
      .where(eq(journalEntries.id, journalEntryId));

    return {
      steps: [{ action: 'Reverse JE', result: 'Direct expense JE marked reversed (CR Bank backed out)', success: true }],
      allFixed: true,
      manualRequired: [],
    };
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private async artifactStillExists(entityType: string, entityId: string): Promise<boolean> {
    if (entityType === 'payment_receipt') {
      const [r] = await this.db.select({ id: paymentReceipts.id }).from(paymentReceipts)
        .where(and(eq(paymentReceipts.id, entityId), eq(paymentReceipts.tenantId, this.tenantId))).limit(1);
      return !!r;
    }
    if (entityType === 'payment') {
      const [r] = await this.db.select({ id: payments.id, status: payments.status }).from(payments)
        .where(and(eq(payments.id, entityId), eq(payments.tenantId, this.tenantId))).limit(1);
      return !!r && r.status !== 'reversed';
    }
    if (entityType === 'journal_entry') {
      const [r] = await this.db.select({ id: journalEntries.id, status: journalEntries.status }).from(journalEntries)
        .where(and(eq(journalEntries.id, entityId), eq(journalEntries.tenantId, this.tenantId))).limit(1);
      return !!r && r.status !== 'reversed';
    }
    return false;
  }

  private describe(entityType: string, flow: string | null, amount: number): string {
    const amt = `₹${amount.toLocaleString('en-IN')}`;
    if (entityType === 'payment_receipt') return `Phantom receipt ${amt} (AR was credited but no bank deposit exists)`;
    if (entityType === 'payment') {
      if (flow === 'posted_advance') return `Phantom advance ${amt} to vendor (bank was debited but no real payment)`;
      return `Phantom bill payment ${amt} (bill marked paid but no real bank debit)`;
    }
    if (entityType === 'journal_entry') return `Phantom direct expense ${amt} (CR Bank with no real outflow)`;
    return `Orphan ${entityType} ${amt}`;
  }

  private alreadyClean(reason: string): ReverseResult {
    return { steps: [], allFixed: true, manualRequired: [reason] };
  }
}
