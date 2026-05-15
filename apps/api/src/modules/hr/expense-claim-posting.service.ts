import { eq, and } from 'drizzle-orm';
import { expenseClaims, expenseClaimItems, employees } from '@runq/db';
import type { Db } from '@runq/db';
import { GLService } from '../gl/gl.service';
import { NotFoundError, ConflictError } from '../../utils/errors';

const DEFAULT_EXPENSE_ACCOUNT = '5002'; // Purchase Expenses (fallback)
const REIMBURSEMENTS_PAYABLE = '2111';   // Employee Reimbursements Payable

/**
 * Post an approved expense claim straight to the GL — no fake vendor, no AP
 * bill. Each item debits its `accountCode` (falling back to the catch-all
 * Purchase Expenses account); the total credits 2111 Employee Reimbursements
 * Payable. That liability is later cleared by an employee_payments row
 * (sourceType='expense_claim') when the employee is actually reimbursed.
 *
 * This replaces ReimbursementToBillService — the employee-as-vendor stopgap
 * we used while AP was the only payee subledger.
 */
export class ExpenseClaimPostingService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async post(claimId: string, employeeId: string, userId: string) {
    const [claim] = await this.db
      .select()
      .from(expenseClaims)
      .where(and(
        eq(expenseClaims.id, claimId),
        eq(expenseClaims.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!claim) throw new NotFoundError('Expense claim');
    if (claim.status !== 'approved') {
      throw new ConflictError('Only approved claims can be posted to GL');
    }
    if (claim.journalEntryId) {
      throw new ConflictError('Claim is already posted');
    }

    const items = await this.db
      .select()
      .from(expenseClaimItems)
      .where(and(
        eq(expenseClaimItems.tenantId, this.tenantId),
        eq(expenseClaimItems.claimId, claimId),
      ));
    if (items.length === 0) throw new ConflictError('Claim has no items');

    const [emp] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.tenantId, this.tenantId)))
      .limit(1);
    if (!emp) throw new NotFoundError('Employee');

    // Sum items by expense account so we emit one debit per account.
    const debitsByAccount = new Map<string, number>();
    for (const item of items) {
      const code = item.accountCode ?? DEFAULT_EXPENSE_ACCOUNT;
      debitsByAccount.set(code, (debitsByAccount.get(code) ?? 0) + Number(item.amount));
    }
    const total = Number(claim.totalAmount);

    return this.db.transaction(async (tx) => {
      const gl = new GLService(tx as unknown as Db, this.tenantId);
      type JeLine = { accountCode: string; debit?: number; credit?: number; description: string };
      const lines: JeLine[] = [];
      for (const [code, amount] of debitsByAccount.entries()) {
        lines.push({
          accountCode: code,
          debit: Math.round(amount * 100) / 100,
          description: `Expense claim ${claim.claimNumber}`,
        });
      }
      lines.push({
        accountCode: REIMBURSEMENTS_PAYABLE,
        credit: total,
        description: `Owed to claimant for ${claim.claimNumber}`,
      });

      const je = await gl.createJournalEntry({
        date: claim.claimDate,
        description: `Expense claim ${claim.claimNumber}`,
        sourceType: 'expense_claim',
        sourceId: claim.id,
        lines,
        createdBy: userId,
      });

      const [updated] = await tx
        .update(expenseClaims)
        .set({
          journalEntryId: je.id,
          employeeId,
          updatedAt: new Date(),
        })
        .where(eq(expenseClaims.id, claimId))
        .returning();
      return updated;
    });
  }
}
