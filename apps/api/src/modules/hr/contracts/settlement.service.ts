import { eq, and, sql, desc } from 'drizzle-orm';
import {
  labourSettlements, labourSettlementLines, labourContracts,
  contractAdvances, bankAccounts, accounts,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateSettlementInput, PaySettlementInput } from '@runq/validators';
import { NotFoundError, ConflictError, UnprocessableError } from '../../../utils/errors';
import { GLService } from '../../gl/gl.service';
import { ContractService } from './contract.service';
import { settlementJournalLines } from './earnings';

const r2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

export class SettlementService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /**
   * What the settlement would look like right now, per person. Computed and
   * never stored, so a day marked after the screen opened is already in it.
   */
  async preview(contractId: string, input?: { throughDate?: string | null; otherDeductions?: number }) {
    const contracts = new ContractService(this.db, this.tenantId);
    const detail = await contracts.detail(contractId, input?.throughDate ?? undefined);
    const deductions = r2(input?.otherDeductions ?? 0);
    const b = detail.balance;
    const net = r2(b.earned - b.advancesPaid - deductions);

    const warnings: string[] = [];
    if (b.earned <= 0) {
      warnings.push(
        detail.contractType === 'task_lumpsum'
          ? 'This contract has no agreed amount to settle.'
          : 'Nothing has been earned yet — every day in the term is marked as leave, ' +
            'or the crew has no rates set.',
      );
    }
    if (net < 0) {
      warnings.push(
        `Advances of ₹${b.advancesPaid.toLocaleString('en-IN')} exceed earnings of ` +
        `₹${b.earned.toLocaleString('en-IN')}. Recover the difference separately — ` +
        'a settlement cannot pay a negative amount.',
      );
    }
    if (detail.endDate === null) {
      warnings.push(
        `This contract is open-ended. Settling closes it at ${b.throughDate}.`,
      );
    } else if (detail.endDate > today()) {
      warnings.push('The contract term has not finished yet.');
    }

    return {
      contractId,
      contractNumber: detail.contractNumber,
      name: detail.name,
      leadPersonName: detail.leadPersonName,
      contractType: detail.contractType,
      fromDate: detail.startDate,
      throughDate: b.throughDate,
      isOpenEnded: b.isOpenEnded,
      earned: b.earned,
      advancesRecovered: b.advancesPaid,
      otherDeductions: deductions,
      netPayable: net,
      lines: b.lines,
      warnings,
    };
  }

  async get(id: string) {
    const [row] = await this.db
      .select()
      .from(labourSettlements)
      .where(and(
        eq(labourSettlements.id, id),
        eq(labourSettlements.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('Settlement not found');
    const lines = await this.db
      .select()
      .from(labourSettlementLines)
      .where(eq(labourSettlementLines.settlementId, id));
    return { ...row, lines };
  }

  async listForContract(contractId: string) {
    return this.db
      .select()
      .from(labourSettlements)
      .where(and(
        eq(labourSettlements.tenantId, this.tenantId),
        eq(labourSettlements.contractId, contractId),
      ))
      .orderBy(desc(labourSettlements.createdAt));
  }

  /** Freeze a preview into a draft. One live settlement per contract. */
  async create(contractId: string, input: CreateSettlementInput, userId: string) {
    const contracts = new ContractService(this.db, this.tenantId);
    const contract = await contracts.get(contractId);
    if (contract.status !== 'active') {
      throw new ConflictError(`Cannot settle a ${contract.status} contract`);
    }
    if (await contracts.liveSettlement(contractId)) {
      throw new ConflictError('This contract already has a settlement');
    }

    const p = await this.preview(contractId, {
      throughDate: input.throughDate,
      otherDeductions: input.otherDeductions,
    });
    if (p.earned <= 0) {
      throw new UnprocessableError('Nothing earned on this contract — nothing to settle');
    }
    if (p.netPayable < 0) {
      throw new UnprocessableError(
        `Advances (₹${p.advancesRecovered}) exceed earnings (₹${p.earned}). ` +
        'Reverse or reduce an advance before settling.',
      );
    }

    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(labourSettlements)
        .values({
          tenantId: this.tenantId,
          contractId,
          settlementNumber: await this.nextNumber(tx as unknown as Db),
          fromDate: p.fromDate,
          toDate: p.throughDate,
          earned: String(p.earned),
          advancesRecovered: String(p.advancesRecovered),
          otherDeductions: String(p.otherDeductions),
          netPayable: String(p.netPayable),
          status: 'draft',
          notes: input.notes ?? null,
          createdBy: userId,
        })
        .returning();

      // Rates and names are copied, not referenced: a settlement records
      // what was agreed at that moment, and editing a member later must not
      // rewrite what was paid.
      if (p.lines.length > 0) {
        await tx.insert(labourSettlementLines).values(
          p.lines.map((l) => ({
            tenantId: this.tenantId,
            settlementId: row.id,
            memberId: l.memberId,
            memberName: l.memberName,
            memberRole: l.memberRole,
            daysWorked: String(l.daysWorked),
            dailyRate: l.dailyRate == null ? null : String(l.dailyRate),
            earned: String(l.earned),
            advancesRecovered: String(l.advancesRecovered),
            netPayable: String(l.netPayable),
          })),
        );
      }
      return row;
    });
  }

  /**
   * Approve: expense the wage and recognise what's owed.
   *
   *   Dr 5201 Salary & Wages      earned
   *     Cr 1122 Employee Advances advances recovered
   *     Cr 2110 Salary Payable    net payable
   *
   * Also closes the contract and stamps its end date — which is how an
   * open-ended term acquires one — and marks the advances recovered so
   * nothing can be netted off twice.
   */
  async approve(id: string, userId: string) {
    const settlement = await this.get(id);
    if (settlement.status !== 'draft') {
      throw new ConflictError(`Settlement is already ${settlement.status}`);
    }
    const earned = r2(Number(settlement.earned));
    const advancesRecovered = r2(Number(settlement.advancesRecovered));
    const otherDeductions = r2(Number(settlement.otherDeductions));
    const net = r2(Number(settlement.netPayable));
    if (earned <= 0) {
      throw new UnprocessableError('Nothing earned on this contract — nothing to settle');
    }

    const contracts = new ContractService(this.db, this.tenantId);
    const contract = await contracts.get(settlement.contractId);
    const lines = settlementJournalLines({
      earned, advancesRecovered, otherDeductions, netPayable: net,
    });

    return this.db.transaction(async (tx) => {
      const gl = new GLService(tx as unknown as Db, this.tenantId);
      const je = await gl.createJournalEntry({
        date: settlement.toDate,
        description: `Contract settlement ${settlement.settlementNumber} — ${contract.name}`,
        sourceType: 'contract_settlement',
        sourceId: settlement.id,
        lines,
        createdBy: userId,
      });

      await tx
        .update(contractAdvances)
        .set({ status: 'recovered', settlementId: id, updatedAt: new Date() })
        .where(and(
          eq(contractAdvances.contractId, settlement.contractId),
          sql`${contractAdvances.status}::text = 'paid'`,
        ));

      await tx
        .update(labourContracts)
        .set({
          status: 'completed',
          // An open-ended contract gets its end date from the settlement's
          // through-date; a dated one keeps the date it was given.
          endDate: contract.endDate ?? settlement.toDate,
          updatedAt: new Date(),
        })
        .where(eq(labourContracts.id, settlement.contractId));

      const [updated] = await tx
        .update(labourSettlements)
        .set({
          status: 'approved',
          journalEntryId: je.id,
          approvedBy: userId,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(labourSettlements.id, id))
        .returning();
      return updated;
    });
  }

  /** Disburse: Dr 2110 Salary Payable / Cr bank-or-cash. */
  async pay(id: string, input: PaySettlementInput, userId: string) {
    const settlement = await this.get(id);
    if (settlement.status !== 'approved') {
      throw new ConflictError(
        settlement.status === 'paid'
          ? 'Settlement is already paid'
          : 'Approve the settlement before paying it',
      );
    }
    const net = r2(Number(settlement.netPayable));
    if (net <= 0) {
      throw new UnprocessableError('Nothing to disburse — net payable is zero');
    }
    const creditCode = input.paymentMethod === 'cash'
      ? '1102'
      : await this.bankGlCode(input.bankAccountId);

    return this.db.transaction(async (tx) => {
      const gl = new GLService(tx as unknown as Db, this.tenantId);
      const je = await gl.createJournalEntry({
        date: input.paymentDate,
        description: `Contract settlement paid — ${settlement.settlementNumber}`,
        sourceType: 'contract_settlement_payment',
        sourceId: settlement.id,
        lines: [
          { accountCode: '2110', debit: net, description: 'Salary Payable cleared' },
          { accountCode: creditCode, credit: net, description: 'Settlement disbursement' },
        ],
        createdBy: userId,
      });
      const [updated] = await tx
        .update(labourSettlements)
        .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
        .where(eq(labourSettlements.id, id))
        .returning();
      void je;
      return updated;
    });
  }

  /**
   * Cancel a draft. An approved settlement has already posted to the GL, so
   * unwinding it silently would leave the wage expensed with nothing owed.
   */
  async cancel(id: string) {
    const settlement = await this.get(id);
    if (settlement.status !== 'draft') {
      throw new ConflictError(
        'Only a draft settlement can be cancelled — reverse the journal entry for an approved one',
      );
    }
    const [row] = await this.db
      .update(labourSettlements)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(labourSettlements.id, id))
      .returning();
    return row;
  }

  private async bankGlCode(bankAccountId: string): Promise<string> {
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

  private async nextNumber(tx: Db): Promise<string> {
    const [row] = await tx
      .select({ n: sql<string>`COUNT(*)` })
      .from(labourSettlements)
      .where(eq(labourSettlements.tenantId, this.tenantId));
    return `CST-${String(Number(row?.n ?? 0) + 1).padStart(5, '0')}`;
  }
}
