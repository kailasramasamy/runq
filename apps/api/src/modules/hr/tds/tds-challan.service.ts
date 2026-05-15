import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { statutoryChallans, payrollRuns, payslips } from '@runq/db';
import type { Db } from '@runq/db';
import type { RecordTdsDepositInput } from '@runq/validators';
import { NotFoundError } from '../../../utils/errors';
import { StatutoryChallanService } from './statutory-challan.service';

function r2(n: number): number { return Math.round(n * 100) / 100; }

/** Aliased select that preserves the legacy tds_challans shape the frontend
 *  knows. Internally it's statutory_challans filtered to kind='tds'. */
const TDS_FIELDS = {
  id: statutoryChallans.id,
  payrollRunId: statutoryChallans.payrollRunId,
  periodMonth: statutoryChallans.periodMonth,
  periodYear: statutoryChallans.periodYear,
  section: statutoryChallans.section,
  tdsAmount: statutoryChallans.liabilityAmount,
  interestAmount: statutoryChallans.interestAmount,
  lateFeeAmount: statutoryChallans.lateFeeAmount,
  totalAmount: statutoryChallans.amount,
  status: statutoryChallans.status,
  bsrCode: statutoryChallans.bankBsrCode,
  challanSerialNo: statutoryChallans.referenceNumber,
  depositDate: statutoryChallans.depositDate,
  paymentMode: statutoryChallans.paymentMode,
  bankRef: statutoryChallans.bankRef,
  bankAccountId: statutoryChallans.bankAccountId,
  journalEntryId: statutoryChallans.journalEntryId,
  depositedBy: statutoryChallans.depositedBy,
  notes: statutoryChallans.notes,
  createdAt: statutoryChallans.createdAt,
  updatedAt: statutoryChallans.updatedAt,
} as const;

const tdsScope = (tenantId: string) => and(
  eq(statutoryChallans.tenantId, tenantId),
  eq(statutoryChallans.kind, 'tds'),
);

/**
 * TDS-specific facade over the unified statutory_challans table. Preserves
 * the legacy tds_challans response shape the frontend was built on, while
 * the deposit flow now posts a settlement JE via StatutoryChallanService.
 */
export class TdsChallanService {
  private readonly statutory: StatutoryChallanService;
  constructor(private readonly db: Db, private readonly tenantId: string) {
    this.statutory = new StatutoryChallanService(db, tenantId);
  }

  /**
   * Lazy reconcile: create a pending TDS challan for every approved/closed
   * run that doesn't have one, then return the full list. Refreshes the
   * pending amount if the run was re-processed (deposited rows are never
   * touched — that money has already been paid).
   */
  async syncAndList() {
    await this.syncFromApprovedRuns();
    return this.db
      .select(TDS_FIELDS)
      .from(statutoryChallans)
      .where(tdsScope(this.tenantId))
      .orderBy(desc(statutoryChallans.periodYear), desc(statutoryChallans.periodMonth));
  }

  async getById(id: string) {
    const [row] = await this.db
      .select(TDS_FIELDS)
      .from(statutoryChallans)
      .where(and(
        eq(statutoryChallans.id, id),
        eq(statutoryChallans.tenantId, this.tenantId),
        eq(statutoryChallans.kind, 'tds'),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('TDS challan');
    return row;
  }

  /** Capture the CIN on a pending TDS challan and post the settlement JE
   *  (Dr 2104 TDS Payable / Cr bank). Delegates to the shared service. */
  async recordDeposit(id: string, input: RecordTdsDepositInput, userId: string) {
    await this.statutory.recordDeposit(id, {
      bankAccountId: input.bankAccountId,
      depositDate: input.depositDate,
      paymentMode: input.paymentMode,
      bankRef: input.bankRef,
      bankBsrCode: input.bsrCode,
      referenceNumber: input.challanSerialNo,
      interestAmount: input.interestAmount,
      lateFeeAmount: input.lateFeeAmount,
      notes: input.notes,
    }, userId);
    // Re-read in the legacy aliased shape so the response matches the UI's type.
    return this.getById(id);
  }

  // ── internals ────────────────────────────────────────────────────────

  private async syncFromApprovedRuns(): Promise<void> {
    const runs = await this.db
      .select({ id: payrollRuns.id, month: payrollRuns.month, year: payrollRuns.year })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.tenantId, this.tenantId),
        inArray(payrollRuns.status, ['approved', 'closed']),
      ));
    if (runs.length === 0) return;

    const runIds = runs.map((r) => r.id);
    const slips = await this.db
      .select({ runId: payslips.payrollRunId, tds: payslips.tds })
      .from(payslips)
      .where(inArray(payslips.payrollRunId, runIds));
    const tdsByRun = new Map<string, number>();
    for (const s of slips) {
      tdsByRun.set(s.runId, (tdsByRun.get(s.runId) ?? 0) + Number(s.tds));
    }

    const existing = await this.db
      .select({
        id: statutoryChallans.id,
        payrollRunId: statutoryChallans.payrollRunId,
        status: statutoryChallans.status,
        liabilityAmount: statutoryChallans.liabilityAmount,
        interestAmount: statutoryChallans.interestAmount,
        lateFeeAmount: statutoryChallans.lateFeeAmount,
      })
      .from(statutoryChallans)
      .where(tdsScope(this.tenantId));
    const byRun = new Map(existing.map((c) => [c.payrollRunId, c]));

    for (const run of runs) {
      const tdsAmount = r2(tdsByRun.get(run.id) ?? 0);
      if (tdsAmount <= 0) continue;

      const challan = byRun.get(run.id);
      if (!challan) {
        await this.statutory.insertPendingChallan({
          kind: 'tds',
          payrollRunId: run.id,
          liabilityAmount: tdsAmount,
        });
      } else if (challan.status === 'pending' && Number(challan.liabilityAmount) !== tdsAmount) {
        const total = r2(
          tdsAmount + Number(challan.interestAmount) + Number(challan.lateFeeAmount),
        );
        await this.db
          .update(statutoryChallans)
          .set({
            liabilityAmount: String(tdsAmount),
            amount: String(total),
            updatedAt: new Date(),
          })
          .where(eq(statutoryChallans.id, challan.id));
      }
    }
  }
}

// Avoid unused-import warnings: sql isn't used yet, keep for future filters.
void sql;
