import { eq, and, sql, desc } from 'drizzle-orm';
import {
  labourSettlements, labourSettlementLines, labourSettlementPayments,
  labourContracts, contractAdvances, bankAccounts, accounts,
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
    if (b.pausedDays > 0 && detail.contractType !== 'task_lumpsum') {
      warnings.push(
        `${b.pausedDays} paused ${b.pausedDays === 1 ? 'day is' : 'days are'} excluded — ` +
        'the work was stopped and nothing accrued.',
      );
    }
    if (detail.pauseState.state === 'paused') {
      warnings.push(
        `The work is still paused, since ${detail.pauseState.since}. Settling closes the contract.`,
      );
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
      pausedDays: b.pausedDays,
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
    const [lines, payments] = await Promise.all([
      this.db.select().from(labourSettlementLines)
        .where(eq(labourSettlementLines.settlementId, id)),
      this.payments(id),
    ]);
    return { ...row, lines, payments, amountDue: this.dueOn(row) };
  }

  async payments(settlementId: string) {
    return this.db
      .select()
      .from(labourSettlementPayments)
      .where(and(
        eq(labourSettlementPayments.tenantId, this.tenantId),
        eq(labourSettlementPayments.settlementId, settlementId),
      ))
      .orderBy(desc(labourSettlementPayments.paymentDate));
  }

  /** What is still to be handed over. Never negative. */
  private dueOn(s: { netPayable: string; amountPaid: string }) {
    return Math.max(0, r2(Number(s.netPayable) - Number(s.amountPaid)));
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

  /**
   * Disburse, in whole or in part: Dr 2110 Salary Payable / Cr bank-or-cash.
   *
   * A crew is paid as the cash comes in, so any number of instalments can
   * land against one settlement. Each posts its own entry — leaving the
   * payable overstated between part-payments would misstate the books — and
   * the settlement only reaches `paid` when the due reaches zero.
   *
   * `amount` omitted means "the rest of it", which is the one-click case.
   */
  async pay(id: string, input: PaySettlementInput, userId: string) {
    const settlement = await this.get(id);
    const amount = this.payableAmount(settlement, input);
    const creditCode = input.paymentMethod === 'cash'
      ? '1102'
      : await this.bankGlCode(input.bankAccountId!);

    return this.db.transaction(async (tx) => {
      const gl = new GLService(tx as unknown as Db, this.tenantId);
      const je = await gl.createJournalEntry({
        date: input.paymentDate,
        description: `Contract settlement paid — ${settlement.settlementNumber}`,
        sourceType: 'contract_settlement_payment',
        sourceId: settlement.id,
        lines: [
          { accountCode: '2110', debit: amount, description: 'Salary Payable cleared' },
          { accountCode: creditCode, credit: amount, description: 'Settlement disbursement' },
        ],
        createdBy: userId,
      });

      await tx.insert(labourSettlementPayments).values({
        tenantId: this.tenantId,
        settlementId: settlement.id,
        contractId: settlement.contractId,
        amount: String(amount),
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        bankAccountId: input.bankAccountId ?? null,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        journalEntryId: je.id,
        createdBy: userId,
      });

      return this.bumpPaid(tx as unknown as Db, id, amount);
    });
  }

  /**
   * Add a disbursement to the settlement's running total, and flip it to
   * `paid` once the due reaches zero.
   *
   * Both are decided in SQL against the row as it stands, not against the
   * figure read before the transaction: two payments entered at the same
   * moment would otherwise both see the full due and between them pay out
   * more than is owed. The guard in the WHERE is what refuses the second.
   */
  private async bumpPaid(tx: Db, id: string, amount: number) {
    const paidSoFar = sql`${labourSettlements.amountPaid} + ${String(amount)}`;
    const settled = sql`${paidSoFar} >= ${labourSettlements.netPayable}`;
    const [updated] = await tx
      .update(labourSettlements)
      .set({
        amountPaid: paidSoFar,
        status: sql`(CASE WHEN ${settled} THEN 'paid' ELSE 'approved' END)::contract_settlement_status`,
        paidAt: sql`(CASE WHEN ${settled} THEN now() ELSE NULL END)`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(labourSettlements.id, id),
        sql`${paidSoFar} <= ${labourSettlements.netPayable}`,
      ))
      .returning();
    if (!updated) {
      throw new ConflictError(
        'Another payment landed on this settlement at the same time. Reopen it and check what is still due.',
      );
    }
    return updated;
  }

  /**
   * How much this payment is for, and whether it may be made at all.
   * Omitting the amount means "the rest of it", which is the one-click case.
   */
  private payableAmount(
    settlement: { status: string; amountDue: number },
    input: PaySettlementInput,
  ): number {
    if (settlement.status !== 'approved') {
      throw new ConflictError(
        settlement.status === 'paid'
          ? 'Settlement is already paid in full'
          : 'Approve the settlement before paying it',
      );
    }
    const due = settlement.amountDue;
    if (due <= 0) {
      throw new UnprocessableError('Nothing to disburse — nothing is due');
    }
    const amount = r2(input.amount ?? due);
    if (amount > due) {
      throw new UnprocessableError(
        `That is more than the ₹${due.toLocaleString('en-IN')} still due on this settlement.`,
      );
    }
    return amount;
  }

  /**
   * Undo a payment entered wrongly. The disbursement is already in the
   * ledger, so this posts the exact reverse and keeps the row — deleting it
   * would leave a reversal pointing at nothing.
   */
  async voidPayment(paymentId: string, userId: string) {
    const [payment] = await this.db
      .select()
      .from(labourSettlementPayments)
      .where(and(
        eq(labourSettlementPayments.id, paymentId),
        eq(labourSettlementPayments.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.voidedAt) throw new ConflictError('This payment is already voided');

    const settlement = await this.get(payment.settlementId);
    const amount = r2(Number(payment.amount));
    const creditCode = payment.paymentMethod === 'cash'
      ? '1102'
      : await this.bankGlCode(payment.bankAccountId!);

    return this.db.transaction(async (tx) => {
      const gl = new GLService(tx as unknown as Db, this.tenantId);
      const je = await gl.createJournalEntry({
        date: payment.paymentDate,
        description: `Contract settlement payment reversed — ${settlement.settlementNumber}`,
        sourceType: 'contract_settlement_payment_reversal',
        sourceId: payment.id,
        lines: [
          { accountCode: creditCode, debit: amount, description: 'Disbursement reversed' },
          { accountCode: '2110', credit: amount, description: 'Salary Payable restored' },
        ],
        createdBy: userId,
      });

      await tx
        .update(labourSettlements)
        .set({
          amountPaid: sql`GREATEST(${labourSettlements.amountPaid} - ${String(amount)}, 0)`,
          status: 'approved',
          paidAt: null,
          updatedAt: new Date(),
        })
        .where(eq(labourSettlements.id, payment.settlementId));

      const [updated] = await tx
        .update(labourSettlementPayments)
        .set({ voidedAt: new Date(), voidJournalEntryId: je.id, updatedAt: new Date() })
        .where(eq(labourSettlementPayments.id, paymentId))
        .returning();
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
