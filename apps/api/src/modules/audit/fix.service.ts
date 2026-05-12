import { eq, and, sql, inArray } from 'drizzle-orm';
import { bankTransactions, bankAccounts, accounts, vendors, customers, salesInvoices, paymentReceipts, receiptAllocations, purchaseInvoices, payments, reconciliationMatches } from '@runq/db';
import type { Db } from '@runq/db';
import { AutoBillPayService } from '../banking/auto-bill-pay.service';
import { CategorizePostingService } from '../banking/categorize-posting.service';
import { GLService } from '../gl/gl.service';
import { NotFoundError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';

interface FixStep {
  action: string;
  result: string;
  success: boolean;
}

export interface FixResult {
  steps: FixStep[];
  allFixed: boolean;
  manualRequired: string[];
}

export class FixService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async fixBankTransaction(id: string): Promise<FixResult> {
    const [txn] = await this.db.select().from(bankTransactions)
      .where(and(eq(bankTransactions.id, id), eq(bankTransactions.tenantId, this.tenantId))).limit(1);
    if (!txn) throw new NotFoundError('Bank transaction');

    const steps: FixStep[] = [];
    const manualRequired: string[] = [];

    // Get bank GL code
    const [bankGl] = await this.db
      .select({ code: accounts.code })
      .from(bankAccounts)
      .innerJoin(accounts, eq(bankAccounts.glAccountId, accounts.id))
      .where(and(eq(bankAccounts.id, txn.bankAccountId), eq(bankAccounts.tenantId, this.tenantId)))
      .limit(1);

    if (!bankGl) {
      steps.push({ action: 'Check bank GL mapping', result: 'Bank account has no GL account linked', success: false });
      manualRequired.push('Link a GL account to this bank account under Banking → Accounts');
      return { steps, allFixed: false, manualRequired };
    }

    // Path 1: Vendor assigned + debit → auto-bill-pay
    if (txn.vendorId && txn.type === 'debit') {
      const [vendor] = await this.db.select().from(vendors).where(eq(vendors.id, txn.vendorId)).limit(1);
      if (!vendor?.expenseAccountCode) {
        steps.push({ action: 'Check vendor expense code', result: `Vendor "${vendor?.name}" has no expense account code`, success: false });
        manualRequired.push('Set an expense account code on the vendor');
        return { steps, allFixed: false, manualRequired };
      }

      const autoBillPay = new AutoBillPayService(this.db, this.tenantId);
      const result = await autoBillPay.createFromBankTxn({
        bankTransactionId: id,
        vendorId: txn.vendorId,
        vendorName: vendor.name,
        expenseAccountCode: vendor.expenseAccountCode,
        bankAccountId: txn.bankAccountId,
        bankGlAccountCode: bankGl.code,
        amount: toNumber(txn.amount),
        transactionDate: txn.transactionDate,
        narration: txn.narration,
        reference: txn.reference,
      });

      if (result) {
        steps.push({ action: 'Create bill', result: `Bill created for ${vendor.name}`, success: true });
        steps.push({ action: 'Create payment', result: `Payment recorded: ₹${toNumber(txn.amount).toLocaleString('en-IN')}`, success: true });
        steps.push({ action: 'Post journal entries', result: '2 JEs posted (expense + payment)', success: true });
        steps.push({ action: 'Reconcile', result: 'Transaction matched', success: true });
      } else {
        steps.push({ action: 'Link to existing payment', result: 'Matched to existing payment — no new bill needed', success: true });
      }

      if (vendor.expenseAccountCode && !vendor.gstin) {
        // Non-GST vendor — fully done
      } else if (vendor.gstin) {
        manualRequired.push(`Attach vendor invoice to the bill and add GST line items for ${vendor.name}`);
      }

      return { steps, allFixed: manualRequired.length === 0, manualRequired };
    }

    // Path 2: Customer assigned + credit → find invoices, create receipt, post JE
    if (txn.customerId && txn.type === 'credit') {
      const [customer] = await this.db.select().from(customers).where(eq(customers.id, txn.customerId)).limit(1);
      const amount = toNumber(txn.amount);

      // Try exact match first, then batch match (multiple unpaid invoices)
      const exactMatch = await this.db.select().from(salesInvoices).where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        eq(salesInvoices.customerId, txn.customerId),
        sql`ABS(${salesInvoices.totalAmount}::numeric - ${amount}) < 0.01`,
        sql`${salesInvoices.balanceDue}::numeric > 0`,
      )).limit(1);

      const invoicesToAllocate = exactMatch.length > 0
        ? exactMatch
        : await this.db.select().from(salesInvoices).where(and(
            eq(salesInvoices.tenantId, this.tenantId),
            eq(salesInvoices.customerId, txn.customerId),
            sql`${salesInvoices.balanceDue}::numeric > 0`,
            sql`${salesInvoices.status} NOT IN ('cancelled', 'draft')`,
          )).orderBy(salesInvoices.invoiceDate).limit(20);

      if (invoicesToAllocate.length > 0) {
        // Create receipt
        const [receipt] = await this.db.insert(paymentReceipts).values({
          tenantId: this.tenantId,
          customerId: txn.customerId,
          bankAccountId: txn.bankAccountId,
          receiptDate: txn.transactionDate,
          amount: String(amount),
          paymentMethod: 'bank_transfer',
          referenceNumber: txn.reference,
          notes: 'Auto-created from bank transaction',
        }).returning();

        // Allocate across invoices (oldest first)
        let remaining = amount;
        let allocatedCount = 0;
        for (const inv of invoicesToAllocate) {
          if (remaining <= 0) break;
          const balance = toNumber(inv.balanceDue);
          const allocAmount = Math.min(remaining, balance);

          await this.db.insert(receiptAllocations).values({
            tenantId: this.tenantId,
            receiptId: receipt!.id,
            invoiceId: inv.id,
            amount: String(allocAmount),
          });

          const newReceived = toNumber(inv.amountReceived) + allocAmount;
          const newBalance = Math.max(0, toNumber(inv.totalAmount) - newReceived);
          await this.db.update(salesInvoices).set({
            amountReceived: String(newReceived),
            balanceDue: String(newBalance),
            status: newBalance <= 0.01 ? 'paid' : 'partially_paid',
            updatedAt: new Date(),
          }).where(eq(salesInvoices.id, inv.id));

          remaining -= allocAmount;
          allocatedCount++;
        }

        steps.push({ action: 'Create receipt', result: `Receipt created: ₹${amount.toLocaleString('en-IN')}`, success: true });
        steps.push({ action: 'Allocate to invoices', result: `Allocated across ${allocatedCount} invoice${allocatedCount > 1 ? 's' : ''} (oldest first)`, success: true });
        if (remaining > 0.01) {
          steps.push({ action: 'Excess amount', result: `₹${remaining.toLocaleString('en-IN')} unallocated (exceeds invoice balances)`, success: false });
          manualRequired.push(`₹${remaining.toLocaleString('en-IN')} could not be allocated — may need a new invoice or advance receipt`);
        }

        // Post receipt JE
        const gl = new GLService(this.db, this.tenantId);
        await gl.postReceipt({
          amount,
          date: txn.transactionDate,
          id: receipt!.id,
          customerName: customer?.name ?? 'Unknown',
        });
        steps.push({ action: 'Post journal entry', result: 'JE posted: DR Bank, CR Accounts Receivable', success: true });

        // Mark bank txn as matched + create the reconciliation_matches link
        // row so the bank↔receipt pair is queryable both directions. Without
        // this row the receipt shows up in gap-scan as `unmatched_receipts`
        // even though the bank side is already 'matched'.
        await this.db.update(bankTransactions).set({
          reconStatus: 'matched',
          glAccountId: null,
          updatedAt: new Date(),
        }).where(eq(bankTransactions.id, id));
        await this.db.insert(reconciliationMatches).values({
          tenantId: this.tenantId,
          bankTransactionId: id,
          receiptId: receipt!.id,
          matchType: 'manual',
        });
        steps.push({ action: 'Reconcile', result: 'Transaction matched', success: true });

      } else {
        // No invoices at all — post basic JE
        const posting = new CategorizePostingService(this.db, this.tenantId);
        await posting.postBankCredit({
          transactionId: id,
          transactionDate: txn.transactionDate,
          amount,
          narration: txn.narration,
          glAccountCode: '1103',
          bankGlAccountCode: bankGl.code,
        });
        steps.push({ action: 'Post journal entry', result: 'JE posted: DR Bank, CR Accounts Receivable', success: true });
        manualRequired.push(`No unpaid invoices found for ${customer?.name ?? 'Unknown'}. Create invoices manually if needed.`);
      }

      return { steps, allFixed: manualRequired.length === 0, manualRequired };
    }

    // Path 3: GL category assigned but no JE → post JE
    if (txn.glAccountId && !txn.journalEntryId) {
      const [glAccount] = await this.db.select({ code: accounts.code, name: accounts.name })
        .from(accounts).where(eq(accounts.id, txn.glAccountId)).limit(1);

      if (glAccount) {
        const posting = new CategorizePostingService(this.db, this.tenantId);
        if (txn.type === 'debit') {
          await posting.postBankDebit({
            transactionId: id,
            transactionDate: txn.transactionDate,
            amount: toNumber(txn.amount),
            narration: txn.narration,
            glAccountCode: glAccount.code,
            bankGlAccountCode: bankGl.code,
          });
          steps.push({ action: 'Post journal entry', result: `JE posted: DR ${glAccount.code} ${glAccount.name}, CR ${bankGl.code} Bank`, success: true });
        } else {
          await posting.postBankCredit({
            transactionId: id,
            transactionDate: txn.transactionDate,
            amount: toNumber(txn.amount),
            narration: txn.narration,
            glAccountCode: glAccount.code,
            bankGlAccountCode: bankGl.code,
          });
          steps.push({ action: 'Post journal entry', result: `JE posted: DR ${bankGl.code} Bank, CR ${glAccount.code} ${glAccount.name}`, success: true });
        }
      }

      return { steps, allFixed: true, manualRequired };
    }

    // Path 3: Nothing assigned
    if (!txn.glAccountId && !txn.vendorId && !txn.customerId) {
      manualRequired.push('Assign a vendor (for debits) or customer (for credits), or categorize with a GL account');
      return { steps, allFixed: false, manualRequired };
    }

    // Path 4: Already reconciled but missing JE — shouldn't happen often
    if (txn.reconStatus === 'matched' && !txn.journalEntryId) {
      manualRequired.push('Transaction is matched but has no JE. Try re-categorizing it.');
    }

    return { steps, allFixed: manualRequired.length === 0, manualRequired };
  }

  /**
   * Re-post missing JE for a purchase invoice. Used by gap-scan to fix bills
   * stuck without GL entries — common when posting failed mid-flight or the
   * bill was created in a way that bypassed the post hook.
   */
  async fixPurchaseInvoice(id: string): Promise<FixResult> {
    const [row] = await this.db
      .select({ bill: purchaseInvoices, vendorName: vendors.name })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
      .where(and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Purchase invoice');

    const steps: FixStep[] = [];
    if (row.bill.status === 'draft' || row.bill.status === 'cancelled') {
      return { steps, allFixed: false, manualRequired: [`Bill is in status '${row.bill.status}' — no JE expected. Approve or restore the bill first.`] };
    }

    const gl = new GLService(this.db, this.tenantId);
    await gl.postPurchaseInvoice({
      id,
      date: row.bill.invoiceDate,
      totalAmount: toNumber(row.bill.totalAmount),
      vendorName: row.vendorName,
    });
    steps.push({ action: 'Re-post journal entry', result: `JE posted: DR Expense, CR AP ₹${toNumber(row.bill.totalAmount).toLocaleString('en-IN')}`, success: true });
    return { steps, allFixed: true, manualRequired: [] };
  }

  /**
   * Re-post missing JE for a sales invoice — mirror of fixPurchaseInvoice.
   */
  async fixSalesInvoice(id: string): Promise<FixResult> {
    const [row] = await this.db
      .select({ inv: salesInvoices, customerName: customers.name })
      .from(salesInvoices)
      .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
      .where(and(eq(salesInvoices.id, id), eq(salesInvoices.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Sales invoice');

    const steps: FixStep[] = [];
    if (row.inv.status === 'draft' || row.inv.status === 'cancelled') {
      return { steps, allFixed: false, manualRequired: [`Invoice is in status '${row.inv.status}' — no JE expected. Send the invoice first.`] };
    }

    const gl = new GLService(this.db, this.tenantId);
    await gl.postSalesInvoice({
      id,
      date: row.inv.invoiceDate,
      totalAmount: toNumber(row.inv.totalAmount),
      customerName: row.customerName,
    });
    steps.push({ action: 'Re-post journal entry', result: `JE posted: DR AR, CR Revenue ₹${toNumber(row.inv.totalAmount).toLocaleString('en-IN')}`, success: true });
    return { steps, allFixed: true, manualRequired: [] };
  }

  /**
   * Link an unreconciled receipt to its matching bank credit. Used when a
   * receipt was recorded in books (e.g. via auto-create from a customer
   * bank credit) but the reconciliation_matches link row is missing —
   * typically a legacy data bug from before the link was inserted on
   * receipt creation. Matches on customer + amount + ±3 day window. Wallet
   * receipts (2102 settlement) are excluded by gap-scan upstream so they
   * never reach here.
   */
  async fixReceipt(id: string): Promise<FixResult> {
    const [receipt] = await this.db.select().from(paymentReceipts)
      .where(and(eq(paymentReceipts.id, id), eq(paymentReceipts.tenantId, this.tenantId))).limit(1);
    if (!receipt) throw new NotFoundError('Receipt');

    const steps: FixStep[] = [];

    // Already linked? No-op.
    const existingMatch = await this.db.select({ id: reconciliationMatches.id })
      .from(reconciliationMatches)
      .where(and(
        eq(reconciliationMatches.tenantId, this.tenantId),
        eq(reconciliationMatches.receiptId, id),
      ))
      .limit(1);
    if (existingMatch.length > 0) {
      return { steps, allFixed: true, manualRequired: [] };
    }

    const amount = toNumber(receipt.amount);
    const candidates = await this.db.select({ id: bankTransactions.id, narration: bankTransactions.narration, date: bankTransactions.transactionDate })
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.tenantId, this.tenantId),
        eq(bankTransactions.type, 'credit'),
        receipt.customerId ? eq(bankTransactions.customerId, receipt.customerId) : sql`TRUE`,
        sql`ABS(${bankTransactions.amount}::numeric - ${amount}) < 0.01`,
        sql`${bankTransactions.transactionDate} BETWEEN (${receipt.receiptDate}::date - INTERVAL '3 days') AND (${receipt.receiptDate}::date + INTERVAL '3 days')`,
        sql`NOT EXISTS (SELECT 1 FROM reconciliation_matches rm WHERE rm.bank_transaction_id = ${bankTransactions.id})`,
      ))
      .limit(2);

    if (candidates.length === 0) {
      return {
        steps,
        allFixed: false,
        manualRequired: ['No matching unreconciled bank credit found (same customer + amount within ±3 days). Match this receipt manually from Banking → Reconciliation, or delete it if it was recorded by mistake.'],
      };
    }
    if (candidates.length > 1) {
      return {
        steps,
        allFixed: false,
        manualRequired: [`Multiple bank credits match (${candidates.length}). Open Banking → Reconciliation and pick the right one to avoid linking the wrong txn.`],
      };
    }

    const bankTxn = candidates[0]!;
    await this.db.insert(reconciliationMatches).values({
      tenantId: this.tenantId,
      bankTransactionId: bankTxn.id,
      receiptId: id,
      matchType: 'manual',
    });
    await this.db.update(bankTransactions).set({
      reconStatus: 'matched',
      updatedAt: new Date(),
    }).where(eq(bankTransactions.id, bankTxn.id));

    steps.push({
      action: 'Link to bank credit',
      result: `Matched to ${bankTxn.date} · ${(bankTxn.narration ?? '').slice(0, 40)}`,
      success: true,
    });
    return { steps, allFixed: true, manualRequired: [] };
  }

  /**
   * Clear orphan reconciliation matches for a bank txn whose linked
   * payments/receipts have been reversed or deleted, and reset it back to
   * unreconciled so the user can re-categorize. This is the only safe fix
   * for the `matched_without_je` gap when the original match is stale.
   */
  async unmatchBankTransaction(id: string): Promise<FixResult> {
    const [txn] = await this.db.select().from(bankTransactions)
      .where(and(eq(bankTransactions.id, id), eq(bankTransactions.tenantId, this.tenantId))).limit(1);
    if (!txn) throw new NotFoundError('Bank transaction');

    const steps: FixStep[] = [];
    const matches = await this.db.select().from(reconciliationMatches)
      .where(and(
        eq(reconciliationMatches.tenantId, this.tenantId),
        eq(reconciliationMatches.bankTransactionId, id),
      ));

    // Verify every match is genuinely orphaned (reversed/failed payment, or
    // null IDs entirely). If any match still points at a live payment/receipt,
    // refuse — surfacing it for manual review beats silently breaking valid
    // links.
    const livePaymentIds = matches.map((m) => m.paymentId).filter((x): x is string => !!x);
    const liveReceiptIds = matches.map((m) => m.receiptId).filter((x): x is string => !!x);

    const livePayments = livePaymentIds.length > 0
      ? await this.db.select({ id: payments.id, status: payments.status }).from(payments)
          .where(inArray(payments.id, livePaymentIds))
      : [];
    const liveReceipts = liveReceiptIds.length > 0
      ? await this.db.select({ id: paymentReceipts.id }).from(paymentReceipts)
          .where(inArray(paymentReceipts.id, liveReceiptIds))
      : [];

    const stillValid = livePayments.some((p) => p.status !== 'reversed' && p.status !== 'failed')
      || liveReceipts.length > 0;
    if (stillValid) {
      return {
        steps,
        allFixed: false,
        manualRequired: ['This transaction is matched to a live payment or receipt. Open Banking → Reconciliation and unmatch it manually so you can review what to do.'],
      };
    }

    const deleted = await this.db.delete(reconciliationMatches)
      .where(and(
        eq(reconciliationMatches.tenantId, this.tenantId),
        eq(reconciliationMatches.bankTransactionId, id),
      ))
      .returning({ id: reconciliationMatches.id });

    await this.db.update(bankTransactions).set({
      reconStatus: 'unreconciled',
      journalEntryId: null,
      updatedAt: new Date(),
    }).where(eq(bankTransactions.id, id));

    steps.push({ action: 'Clear orphan matches', result: `Removed ${deleted.length} stale match${deleted.length === 1 ? '' : 'es'} (all pointed at reversed payments)`, success: true });
    steps.push({ action: 'Reset reconciliation', result: 'Transaction set back to unreconciled — re-categorize from Banking → Transactions', success: true });
    return { steps, allFixed: true, manualRequired: [] };
  }
}
