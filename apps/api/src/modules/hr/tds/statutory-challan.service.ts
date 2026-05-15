import { eq, and, desc, sql } from 'drizzle-orm';
import {
  statutoryChallans, bankAccounts, accounts, payrollRuns,
} from '@runq/db';
import type { Db } from '@runq/db';
import { GLService } from '../../gl/gl.service';
import { NotFoundError, ConflictError } from '../../../utils/errors';

export type StatutoryChallanKind = 'pf' | 'esi' | 'pt' | 'tds';

/** GL liability accounts cleared when each statutory deposit is recorded. */
const LIABILITY_ACCOUNT: Record<StatutoryChallanKind, string> = {
  pf:  '2107', // PF Payable
  esi: '2108', // ESI Payable
  pt:  '2109', // Professional Tax Payable
  tds: '2104', // TDS Payable
};

const KIND_LABEL: Record<StatutoryChallanKind, string> = {
  pf: 'PF', esi: 'ESI', pt: 'Professional Tax', tds: 'TDS',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const r2 = (n: number): number => Math.round(n * 100) / 100;

export interface DepositInput {
  bankAccountId: string;
  depositDate: string;
  paymentMode?: string | null;
  bankRef?: string | null;
  /** TDS only: 7-digit BSR. */
  bankBsrCode?: string | null;
  /** TDS challan serial / PF TRRN / ESI challan no / PT portal reference. */
  referenceNumber?: string | null;
  interestAmount?: number;
  lateFeeAmount?: number;
  notes?: string | null;
}

export interface CreateChallanInput {
  kind: StatutoryChallanKind;
  payrollRunId: string;
  /** PT only: per-state challan; null for the other three kinds. */
  stateCode?: string | null;
  /** Statutory liability amount derived from the run's payslips. */
  liabilityAmount: number;
  /** TDS only: section (defaults '192' for salary). */
  section?: string | null;
}

/**
 * Shared service for all four statutory challans (PF / ESI / PT / TDS).
 * `recordDeposit` atomically captures the deposit details and posts the
 * settlement JE (Dr liability / Cr bank), clearing the payable that the
 * payroll-approval JE booked.
 *
 * TdsChallanService delegates here for the deposit flow; the PF/ESI/PT
 * routes call this directly via `createAndRecordDeposit`.
 */
export class StatutoryChallanService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async getById(id: string) {
    const [row] = await this.db
      .select()
      .from(statutoryChallans)
      .where(and(
        eq(statutoryChallans.id, id),
        eq(statutoryChallans.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('Statutory challan');
    return row;
  }

  async listByKind(kind: StatutoryChallanKind) {
    return this.db
      .select()
      .from(statutoryChallans)
      .where(and(
        eq(statutoryChallans.tenantId, this.tenantId),
        eq(statutoryChallans.kind, kind),
      ))
      .orderBy(desc(statutoryChallans.periodYear), desc(statutoryChallans.periodMonth));
  }

  /**
   * Find an existing challan for (run, kind, state). Used by callers that
   * want idempotent "record deposit" UX — show the existing row instead of
   * inserting a duplicate.
   */
  async findForRun(payrollRunId: string, kind: StatutoryChallanKind, stateCode?: string | null) {
    const conditions = [
      eq(statutoryChallans.tenantId, this.tenantId),
      eq(statutoryChallans.payrollRunId, payrollRunId),
      eq(statutoryChallans.kind, kind),
    ];
    if (stateCode != null) {
      conditions.push(eq(statutoryChallans.stateCode, stateCode));
    } else {
      conditions.push(sql`${statutoryChallans.stateCode} IS NULL`);
    }
    const [row] = await this.db
      .select()
      .from(statutoryChallans)
      .where(and(...conditions))
      .limit(1);
    return row ?? null;
  }

  /**
   * Insert a `pending` challan and immediately record its deposit + post the
   * settlement JE. The all-in-one path PF/ESI/PT take from their summary
   * modals — no pre-existing pending row required.
   */
  async createAndRecordDeposit(
    create: CreateChallanInput,
    deposit: DepositInput,
    userId: string,
  ) {
    const existing = await this.findForRun(create.payrollRunId, create.kind, create.stateCode);
    if (existing?.status === 'deposited') {
      throw new ConflictError(
        `${KIND_LABEL[create.kind]} challan for this period is already deposited`,
      );
    }

    const challan = existing ?? await this.insertPendingChallan(create);
    return this.recordDeposit(challan.id, deposit, userId);
  }

  /**
   * Capture deposit details on an existing pending challan and post the
   * settlement JE atomically.
   */
  async recordDeposit(id: string, input: DepositInput, userId: string) {
    const challan = await this.getById(id);
    if (challan.status === 'deposited') {
      throw new ConflictError('Challan is already deposited');
    }
    const kind = challan.kind as StatutoryChallanKind;

    const interest = input.interestAmount ?? 0;
    const lateFee = input.lateFeeAmount ?? 0;
    const liability = Number(challan.liabilityAmount);
    if (liability <= 0) {
      throw new ConflictError('Nothing to deposit — liability is zero');
    }
    const total = r2(liability + interest + lateFee);
    const bankGlCode = await this.bankGlAccountCode(input.bankAccountId);

    return this.db.transaction(async (tx) => {
      // Settlement JE: clear the liability (+ interest/late fee to P&L)
      // against the bank account that funded the deposit.
      const gl = new GLService(tx as unknown as Db, this.tenantId);
      type JeLine = { accountCode: string; debit?: number; credit?: number; description: string };
      const lines: JeLine[] = [
        { accountCode: LIABILITY_ACCOUNT[kind], debit: liability,
          description: `${KIND_LABEL[kind]} liability cleared` },
      ];
      if (interest > 0) lines.push({
        accountCode: '5215', debit: interest,
        description: `${KIND_LABEL[kind]} interest on late payment`,
      });
      if (lateFee > 0) lines.push({
        accountCode: '5216', debit: lateFee,
        description: `${KIND_LABEL[kind]} late filing fee`,
      });
      lines.push({
        accountCode: bankGlCode, credit: total,
        description: `${KIND_LABEL[kind]} challan deposit`,
      });

      const je = await gl.createJournalEntry({
        date: input.depositDate,
        description: `${KIND_LABEL[kind]} deposit — ${monthLabel(challan.periodYear, challan.periodMonth)}`,
        sourceType: 'statutory_challan',
        sourceId: challan.id,
        lines,
        createdBy: userId,
      });

      const [updated] = await tx
        .update(statutoryChallans)
        .set({
          status: 'deposited',
          depositDate: input.depositDate,
          paymentMode: input.paymentMode ?? null,
          bankRef: input.bankRef ?? null,
          bankBsrCode: input.bankBsrCode ?? null,
          referenceNumber: input.referenceNumber ?? null,
          bankAccountId: input.bankAccountId,
          interestAmount: String(interest),
          lateFeeAmount: String(lateFee),
          amount: String(total),
          journalEntryId: je.id,
          depositedBy: userId,
          notes: input.notes ?? challan.notes,
          updatedAt: new Date(),
        })
        .where(eq(statutoryChallans.id, id))
        .returning();
      return updated;
    });
  }

  /**
   * Insert a pending challan derived from a payroll run. Used by
   * TdsChallanService's lazy sync and by PF/ESI/PT one-shot deposits.
   */
  async insertPendingChallan(input: CreateChallanInput) {
    const [run] = await this.db
      .select({ month: payrollRuns.month, year: payrollRuns.year })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.id, input.payrollRunId),
        eq(payrollRuns.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!run) throw new NotFoundError('Payroll run');

    const liability = r2(input.liabilityAmount);
    const [row] = await this.db
      .insert(statutoryChallans)
      .values({
        tenantId: this.tenantId,
        kind: input.kind,
        payrollRunId: input.payrollRunId,
        periodMonth: run.month,
        periodYear: run.year,
        stateCode: input.stateCode ?? null,
        section: input.kind === 'tds' ? (input.section ?? '192') : null,
        liabilityAmount: String(liability),
        amount: String(liability),
      })
      .returning();
    return row;
  }

  /** Resolve the GL account code for a bank account; falls back to 1101 cash. */
  private async bankGlAccountCode(bankAccountId: string): Promise<string> {
    const [bank] = await this.db
      .select({ glAccountId: bankAccounts.glAccountId })
      .from(bankAccounts)
      .where(and(
        eq(bankAccounts.id, bankAccountId),
        eq(bankAccounts.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!bank) throw new NotFoundError('Bank account');
    if (!bank.glAccountId) return '1101';
    const [acct] = await this.db
      .select({ code: accounts.code })
      .from(accounts)
      .where(eq(accounts.id, bank.glAccountId))
      .limit(1);
    return acct?.code ?? '1101';
  }
}

function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}
