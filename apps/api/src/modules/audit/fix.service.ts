import { eq, and, sql } from 'drizzle-orm';
import { bankTransactions, bankAccounts, accounts, vendors, customers, salesInvoices, paymentReceipts, receiptAllocations } from '@runq/db';
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

        // Mark bank txn as matched
        await this.db.update(bankTransactions).set({
          reconStatus: 'matched',
          glAccountId: null,
          updatedAt: new Date(),
        }).where(eq(bankTransactions.id, id));
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
}
