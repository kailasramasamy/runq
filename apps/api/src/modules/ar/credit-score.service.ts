import { eq, and, sql, gte, inArray } from 'drizzle-orm';
import { salesInvoices, receiptAllocations, paymentReceipts } from '@runq/db';
import type { Db } from '@runq/db';

export type CreditRisk = 'high' | 'medium' | 'low';

export interface CreditScoreResult {
  score: number;
  risk: CreditRisk;
  factors: string[];
}

export class CreditScoreService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async getScore(customerId: string): Promise<CreditScoreResult> {
    const factors: string[] = [];
    let score = 100;

    const overdueCount = await this.countCurrentlyOverdue(customerId);
    if (overdueCount > 0) {
      const penalty = overdueCount * 5;
      score -= penalty;
      factors.push(`${overdueCount} currently overdue invoice(s): -${penalty}`);
    }

    const { late15, late30, onTime } = await this.getPaymentHistory(customerId);

    if (late30 > 0) {
      const penalty = late30 * 20;
      score -= penalty;
      factors.push(`${late30} invoice(s) paid >30 days late: -${penalty}`);
    }
    if (late15 > 0) {
      const penalty = late15 * 10;
      score -= penalty;
      factors.push(`${late15} invoice(s) paid >15 days late: -${penalty}`);
    }
    if (onTime > 0) {
      const bonus = onTime * 5;
      score += bonus;
      factors.push(`${onTime} invoice(s) paid on time: +${bonus}`);
    }

    score = Math.max(0, Math.min(100, score));
    const risk = this.classifyRisk(score);

    return { score, risk, factors };
  }

  private classifyRisk(score: number): CreditRisk {
    if (score < 40) return 'high';
    if (score <= 70) return 'medium';
    return 'low';
  }

  private async countCurrentlyOverdue(customerId: string): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(salesInvoices)
      .where(
        and(
          eq(salesInvoices.tenantId, this.tenantId),
          eq(salesInvoices.customerId, customerId),
          sql`${salesInvoices.dueDate} < ${today}`,
          sql`${salesInvoices.balanceDue} > 0`,
          inArray(salesInvoices.status, ['sent', 'partially_paid']),
        ),
      );
    return row?.count ?? 0;
  }

  private async getPaymentHistory(customerId: string) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const cutoff = sixMonthsAgo.toISOString().slice(0, 10);

    const rows = await this.db
      .select({
        dueDate: salesInvoices.dueDate,
        receiptDate: paymentReceipts.receiptDate,
      })
      .from(salesInvoices)
      .innerJoin(receiptAllocations, eq(salesInvoices.id, receiptAllocations.invoiceId))
      .innerJoin(paymentReceipts, eq(receiptAllocations.receiptId, paymentReceipts.id))
      .where(
        and(
          eq(salesInvoices.tenantId, this.tenantId),
          eq(salesInvoices.customerId, customerId),
          eq(salesInvoices.status, 'paid'),
          gte(salesInvoices.invoiceDate, cutoff),
        ),
      );

    let late15 = 0;
    let late30 = 0;
    let onTime = 0;

    for (const r of rows) {
      const daysLate = this.daysBetween(r.dueDate, r.receiptDate);
      if (daysLate > 30) late30++;
      else if (daysLate > 15) late15++;
      else onTime++;
    }

    return { late15, late30, onTime };
  }

  private daysBetween(dateA: string, dateB: string): number {
    const a = new Date(dateA).getTime();
    const b = new Date(dateB).getTime();
    return Math.floor((b - a) / 86_400_000);
  }
}
