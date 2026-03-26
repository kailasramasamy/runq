import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { purchaseInvoices, vendors } from '@runq/db';
import type { Db } from '@runq/db';

const PAYABLE_STATUSES = ['approved', 'partially_paid'] as const;

const CATEGORY_BONUS: Record<string, number> = {
  raw_material: 20,
  logistics: 15,
  utilities: 10,
  service_provider: 5,
};

interface PrioritizedPayment {
  invoiceId: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  vendorCategory: string | null;
  balanceDue: string;
  dueDate: string;
  daysOverdue: number;
  daysUntilDue: number;
  urgencyScore: number;
  reason: string;
}

interface PrioritySummary {
  totalOverdue: string;
  totalDueThisWeek: string;
  totalApproved: string;
}

export class PrioritizeService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async getPrioritizedPayments(limit = 10): Promise<{ data: PrioritizedPayment[]; summary: PrioritySummary }> {
    const today = new Date().toISOString().split('T')[0]!;

    const [rows, summary] = await Promise.all([
      this.fetchInvoicesWithVendors(today, limit),
      this.fetchSummary(today),
    ]);

    const scored = rows.map((r) => this.scoreInvoice(r, today));
    scored.sort((a, b) => b.urgencyScore - a.urgencyScore || a.dueDate.localeCompare(b.dueDate));

    return { data: scored, summary };
  }

  private async fetchInvoicesWithVendors(today: string, limit: number) {
    return this.db
      .select({
        invoiceId: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        vendorId: vendors.id,
        vendorName: vendors.name,
        vendorCategory: vendors.category,
        balanceDue: purchaseInvoices.balanceDue,
        dueDate: purchaseInvoices.dueDate,
      })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
      .where(
        and(
          eq(purchaseInvoices.tenantId, this.tenantId),
          gt(purchaseInvoices.balanceDue, '0'),
          sql`${purchaseInvoices.status} = ANY(ARRAY[${sql.raw(PAYABLE_STATUSES.map((s) => `'${s}'`).join(','))}]::purchase_invoice_status[])`,
        ),
      )
      .orderBy(purchaseInvoices.dueDate)
      .limit(limit);
  }

  private async fetchSummary(today: string): Promise<PrioritySummary> {
    const plus7 = new Date(Date.now() + 7 * 86400_000).toISOString().split('T')[0]!;
    const statusFilter = sql`${purchaseInvoices.status} = ANY(ARRAY[${sql.raw(PAYABLE_STATUSES.map((s) => `'${s}'`).join(','))}]::purchase_invoice_status[])`;
    const base = and(
      eq(purchaseInvoices.tenantId, this.tenantId),
      gt(purchaseInvoices.balanceDue, '0'),
      statusFilter,
    );

    const [overdue, dueThisWeek, approved] = await Promise.all([
      this.db
        .select({ total: sql<string>`COALESCE(SUM(${purchaseInvoices.balanceDue}), 0)::text` })
        .from(purchaseInvoices)
        .where(and(base, sql`${purchaseInvoices.dueDate} < ${today}`)),
      this.db
        .select({ total: sql<string>`COALESCE(SUM(${purchaseInvoices.balanceDue}), 0)::text` })
        .from(purchaseInvoices)
        .where(and(base, sql`${purchaseInvoices.dueDate} >= ${today}`, sql`${purchaseInvoices.dueDate} <= ${plus7}`)),
      this.db
        .select({ total: sql<string>`COALESCE(SUM(${purchaseInvoices.balanceDue}), 0)::text` })
        .from(purchaseInvoices)
        .where(base),
    ]);

    return {
      totalOverdue: overdue[0]?.total ?? '0',
      totalDueThisWeek: dueThisWeek[0]?.total ?? '0',
      totalApproved: approved[0]?.total ?? '0',
    };
  }

  private scoreInvoice(row: {
    invoiceId: string;
    invoiceNumber: string;
    vendorId: string;
    vendorName: string;
    vendorCategory: string | null;
    balanceDue: string;
    dueDate: string;
  }, today: string): PrioritizedPayment {
    const dueDateMs = new Date(row.dueDate).getTime();
    const todayMs = new Date(today).getTime();
    const diffDays = Math.round((todayMs - dueDateMs) / 86400_000);

    const daysOverdue = Math.max(0, diffDays);
    const daysUntilDue = Math.max(0, -diffDays);
    const categoryLabel = formatCategory(row.vendorCategory);

    let score = 0;
    score += calcOverdueScore(daysOverdue, daysUntilDue);
    score += CATEGORY_BONUS[row.vendorCategory ?? ''] ?? 0;

    const reason = buildReason(daysOverdue, daysUntilDue, categoryLabel);

    return {
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      vendorCategory: row.vendorCategory,
      balanceDue: row.balanceDue,
      dueDate: row.dueDate,
      daysOverdue,
      daysUntilDue,
      urgencyScore: score,
      reason,
    };
  }
}

function calcOverdueScore(daysOverdue: number, daysUntilDue: number): number {
  if (daysOverdue > 30) return 100;
  if (daysOverdue >= 1) return 80;
  if (daysUntilDue === 0) return 50;
  if (daysUntilDue <= 7) return 50;
  if (daysUntilDue <= 14) return 30;
  if (daysUntilDue <= 30) return 10;
  return 0;
}

function formatCategory(category: string | null): string {
  if (!category) return 'vendor';
  return category.replace(/_/g, ' ') + ' supplier';
}

function buildReason(daysOverdue: number, daysUntilDue: number, categoryLabel: string): string {
  if (daysOverdue > 0) return `Overdue by ${daysOverdue} days \u2014 ${categoryLabel}`;
  if (daysUntilDue === 0) return `Due today \u2014 ${categoryLabel}`;
  return `Due in ${daysUntilDue} days \u2014 ${categoryLabel}`;
}
