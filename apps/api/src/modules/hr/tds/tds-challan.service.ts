import { eq, and, desc, inArray } from 'drizzle-orm';
import { tdsChallans, payrollRuns, payslips } from '@runq/db';
import type { Db } from '@runq/db';
import type { RecordTdsDepositInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../../utils/errors';

function r2(n: number): number { return Math.round(n * 100) / 100; }

/**
 * Monthly TDS deposit challans (ITNS-281).
 *
 * Challan amounts are *derived* from payslips, so rather than coupling to the
 * payroll-run approval flow they're reconciled lazily: `syncAndList()` creates
 * a pending challan for every approved/closed run that lacks one and refreshes
 * the amount on still-pending challans (handles run re-processing). Deposited
 * challans are never auto-touched — the customer has already paid against them.
 */
export class TdsChallanService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async syncAndList() {
    await this.sync();
    return this.db
      .select()
      .from(tdsChallans)
      .where(eq(tdsChallans.tenantId, this.tenantId))
      .orderBy(desc(tdsChallans.periodYear), desc(tdsChallans.periodMonth));
  }

  async getById(id: string) {
    const [row] = await this.db
      .select()
      .from(tdsChallans)
      .where(and(eq(tdsChallans.id, id), eq(tdsChallans.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('TDS challan');
    return row;
  }

  /** Reconcile challans against approved/closed payroll runs. */
  private async sync() {
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
      .select()
      .from(tdsChallans)
      .where(eq(tdsChallans.tenantId, this.tenantId));
    const byRun = new Map(existing.map((c) => [c.payrollRunId, c]));

    for (const run of runs) {
      const tdsAmount = r2(tdsByRun.get(run.id) ?? 0);
      if (tdsAmount <= 0) continue; // nothing was deducted — no challan needed

      const challan = byRun.get(run.id);
      if (!challan) {
        await this.db
          .insert(tdsChallans)
          .values({
            tenantId: this.tenantId,
            payrollRunId: run.id,
            periodMonth: run.month,
            periodYear: run.year,
            tdsAmount: String(tdsAmount),
            totalAmount: String(tdsAmount),
          })
          .onConflictDoNothing();
      } else if (challan.status === 'pending' && Number(challan.tdsAmount) !== tdsAmount) {
        const total = r2(
          tdsAmount + Number(challan.interestAmount) + Number(challan.lateFeeAmount),
        );
        await this.db
          .update(tdsChallans)
          .set({ tdsAmount: String(tdsAmount), totalAmount: String(total), updatedAt: new Date() })
          .where(eq(tdsChallans.id, challan.id));
      }
    }
  }

  /** Mark a challan deposited and capture its CIN. */
  async recordDeposit(id: string, input: RecordTdsDepositInput, userId: string) {
    const challan = await this.getById(id);
    if (challan.status === 'deposited') {
      throw new ConflictError('Challan is already marked deposited');
    }

    const interest = input.interestAmount ?? 0;
    const lateFee = input.lateFeeAmount ?? 0;
    const total = r2(Number(challan.tdsAmount) + interest + lateFee);

    const [updated] = await this.db
      .update(tdsChallans)
      .set({
        status: 'deposited',
        bsrCode: input.bsrCode,
        challanSerialNo: input.challanSerialNo,
        depositDate: input.depositDate,
        paymentMode: input.paymentMode ?? null,
        bankRef: input.bankRef ?? null,
        interestAmount: String(interest),
        lateFeeAmount: String(lateFee),
        totalAmount: String(total),
        depositedBy: userId,
        notes: input.notes ?? challan.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(tdsChallans.id, id), eq(tdsChallans.tenantId, this.tenantId)))
      .returning();
    return updated;
  }
}
