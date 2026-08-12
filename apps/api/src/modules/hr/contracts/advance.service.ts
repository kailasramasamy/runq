import { eq, and, sql, desc } from 'drizzle-orm';
import { contractAdvances, contractMembers, bankAccounts, accounts } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateAdvanceInput } from '@runq/validators';
import { NotFoundError, ConflictError, ValidationError } from '../../../utils/errors';
import { GLService } from '../../gl/gl.service';
import { ContractService } from './contract.service';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Cash paid to a crew mid-term, ahead of settlement. */
export class AdvanceService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async listForContract(contractId: string) {
    return this.db
      .select()
      .from(contractAdvances)
      .where(and(
        eq(contractAdvances.tenantId, this.tenantId),
        eq(contractAdvances.contractId, contractId),
        sql`${contractAdvances.status}::text <> 'cancelled'`,
      ))
      .orderBy(desc(contractAdvances.paidOn));
  }

  /**
   * Pay an advance. Posts Dr 1122 Employee Advances / Cr bank-or-cash.
   *
   * The debit is an asset — the worker owes it back — and the wage is
   * expensed once, at settlement. Booking it to 5201 here would
   * double-count the labour cost.
   */
  async create(contractId: string, input: CreateAdvanceInput, userId: string) {
    const contracts = new ContractService(this.db, this.tenantId);
    const contract = await contracts.get(contractId);
    if (contract.status !== 'active') {
      throw new ConflictError(`Cannot advance against a ${contract.status} contract`);
    }
    if (await contracts.liveSettlement(contractId)) {
      throw new ConflictError(
        'This contract already has a settlement — an advance now would not be recovered by it',
      );
    }
    if (input.paidOn < contract.startDate) {
      throw new ValidationError('Advance date is before the contract starts');
    }

    // Attributing the advance to a person is what lets their settlement
    // line net it off; an unattributed one falls to the crew lead.
    let memberId: string | null = null;
    if (input.memberId) {
      const [m] = await this.db
        .select({ id: contractMembers.id })
        .from(contractMembers)
        .where(and(
          eq(contractMembers.id, input.memberId),
          eq(contractMembers.contractId, contractId),
        ))
        .limit(1);
      if (!m) throw new ValidationError('That person is not on this contract');
      memberId = m.id;
    }

    const amount = r2(input.amount);
    const creditCode = await this.creditAccountCode(
      input.paymentMethod,
      input.bankAccountId ?? null,
    );

    return this.db.transaction(async (tx) => {
      const [advance] = await tx
        .insert(contractAdvances)
        .values({
          tenantId: this.tenantId,
          contractId,
          memberId,
          amount: String(amount),
          paidOn: input.paidOn,
          paymentMethod: input.paymentMethod,
          bankAccountId: input.bankAccountId ?? null,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          status: 'paid',
          createdBy: userId,
        })
        .returning();

      // GLService opens its own transaction; Drizzle pg runs it as a
      // SAVEPOINT under this one.
      const gl = new GLService(tx as unknown as Db, this.tenantId);
      const je = await gl.createJournalEntry({
        date: input.paidOn,
        description: `Advance — ${contract.name} (${contract.contractNumber})`,
        sourceType: 'contract_advance',
        sourceId: advance.id,
        lines: [
          { accountCode: '1122', debit: amount, description: 'Contract advance' },
          { accountCode: creditCode, credit: amount, description: 'Advance paid out' },
        ],
        createdBy: userId,
      });

      const [updated] = await tx
        .update(contractAdvances)
        .set({ journalEntryId: je.id, updatedAt: new Date() })
        .where(eq(contractAdvances.id, advance.id))
        .returning();
      return updated;
    });
  }

  /**
   * Reverse an advance paid in error. Only while unrecovered — once a
   * settlement has netted it off, the settlement is the thing to cancel.
   */
  async cancel(id: string, userId: string) {
    const [advance] = await this.db
      .select()
      .from(contractAdvances)
      .where(and(
        eq(contractAdvances.id, id),
        eq(contractAdvances.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!advance) throw new NotFoundError('Advance not found');
    if (advance.status !== 'paid') {
      throw new ConflictError(`Advance is already ${advance.status}`);
    }

    const amount = r2(Number(advance.amount));
    const creditCode = await this.creditAccountCode(
      advance.paymentMethod,
      advance.bankAccountId,
    );

    return this.db.transaction(async (tx) => {
      const gl = new GLService(tx as unknown as Db, this.tenantId);
      await gl.createJournalEntry({
        date: advance.paidOn,
        description: `Advance reversed — ${advance.reference ?? advance.id.slice(0, 8)}`,
        sourceType: 'contract_advance_reversal',
        sourceId: advance.id,
        lines: [
          { accountCode: creditCode, debit: amount, description: 'Advance returned' },
          { accountCode: '1122', credit: amount, description: 'Contract advance cleared' },
        ],
        createdBy: userId,
      });
      const [updated] = await tx
        .update(contractAdvances)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(contractAdvances.id, id))
        .returning();
      return updated;
    });
  }

  /**
   * Which account the cash leaves. Cash-in-hand is the common case on a
   * site, so it does not require a bank account to be picked.
   */
  private async creditAccountCode(
    method: string,
    bankAccountId: string | null,
  ): Promise<string> {
    if (method === 'cash') return '1102'; // Petty Cash
    if (!bankAccountId) {
      throw new ValidationError(`A bank account is required for a ${method} advance`);
    }
    const [row] = await this.db
      .select({ code: accounts.code })
      .from(bankAccounts)
      .innerJoin(accounts, eq(accounts.id, bankAccounts.glAccountId))
      .where(and(
        eq(bankAccounts.id, bankAccountId),
        eq(bankAccounts.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('Bank account not found');
    return row.code;
  }
}
