import { eq, and, isNull } from 'drizzle-orm';
import { bankTransactions, bankAccounts, accounts, vendors } from '@runq/db';
import type { Db } from '@runq/db';
import { AutoBillPayService } from '../banking/auto-bill-pay.service';
import { CategorizePostingService } from '../banking/categorize-posting.service';
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

    // Path 2: GL category assigned but no JE → post JE
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
