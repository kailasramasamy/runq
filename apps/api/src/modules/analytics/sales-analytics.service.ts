import { and, eq, gte, lte, ne, sql, inArray, desc } from 'drizzle-orm';
import {
  salesInvoices, salesInvoiceItems, creditNotes, customers,
  paymentReceipts, receiptAllocations,
} from '@runq/db';
import type { Db } from '@runq/db';
import { toNumber } from '../../utils/decimal';

/** Statuses that represent a real sale. Drafts are not revenue yet and
 *  cancelled invoices never were, so both stay out of every figure here. */
const ISSUED_STATUSES = ['sent', 'partially_paid', 'paid', 'overdue'] as const;

/** Trend bucket width, chosen from the range length so a 12-month view isn't
 *  365 unreadable points and a fortnight isn't a single bar. */
export type TrendGrain = 'day' | 'week' | 'month';

export interface SalesTrendPoint {
  /** Bucket start, ISO date. */
  bucket: string;
  revenue: number;
  invoiceCount: number;
}

export interface SalesAnalytics {
  period: { from: string; to: string; grain: TrendGrain };
  headline: {
    grossRevenue: number;
    creditNotes: number;
    netRevenue: number;
    taxableValue: number;
    taxAmount: number;
    invoiceCount: number;
    avgInvoiceValue: number;
    activeCustomers: number;
  };
  trend: SalesTrendPoint[];
  topCustomers: { customerId: string; name: string; revenue: number; invoiceCount: number; share: number }[];
  topItems: { description: string; revenue: number; quantity: number; uom: string | null }[];
  statusSplit: { status: string; count: number; amount: number }[];
  collections: {
    receivedInPeriod: number;
    outstandingFromPeriod: number;
    collectedRatio: number;
    avgDaysToPay: number | null;
  };
}

/**
 * Sales analytics on an invoice basis: every figure is derived from issued
 * sales invoices dated inside the window, net of credit notes issued in the
 * same window. That ties the screen to the invoice list a user can scroll,
 * and will not match a GL-basis P&L — the caller labels it accordingly.
 */
export class SalesAnalyticsService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    /** Scope every figure to one customer. Undefined means tenant-wide. */
    private readonly customerId?: string,
  ) {}

  async summary(dateFrom: string, dateTo: string): Promise<SalesAnalytics> {
    const grain = SalesAnalyticsService.grainFor(dateFrom, dateTo);
    const [headline, creditNoteTotal, trend, topCustomers, topItems, statusSplit, collections] =
      await Promise.all([
        this.headline(dateFrom, dateTo),
        this.creditNoteTotal(dateFrom, dateTo),
        this.trend(dateFrom, dateTo, grain),
        this.topCustomers(dateFrom, dateTo),
        this.topItems(dateFrom, dateTo),
        this.statusSplit(dateFrom, dateTo),
        this.collections(dateFrom, dateTo),
      ]);

    const netRevenue = headline.grossRevenue - creditNoteTotal;
    const totalCustomerRevenue = topCustomers.reduce((s, c) => s + c.revenue, 0);
    return {
      period: { from: dateFrom, to: dateTo, grain },
      headline: { ...headline, creditNotes: creditNoteTotal, netRevenue },
      trend,
      topCustomers: topCustomers.map((c) => ({
        ...c,
        share: totalCustomerRevenue > 0
          ? Math.round((c.revenue / totalCustomerRevenue) * 1000) / 10
          : 0,
      })),
      topItems,
      statusSplit,
      collections,
    };
  }

  /** Daily up to ~2 months, weekly up to ~9 months, monthly beyond. */
  static grainFor(dateFrom: string, dateTo: string): TrendGrain {
    const days =
      (Date.parse(dateTo) - Date.parse(dateFrom)) / 86_400_000;
    if (days <= 62) return 'day';
    if (days <= 280) return 'week';
    return 'month';
  }

  private issuedWhere(dateFrom: string, dateTo: string) {
    return and(
      eq(salesInvoices.tenantId, this.tenantId),
      inArray(salesInvoices.status, [...ISSUED_STATUSES]),
      gte(salesInvoices.invoiceDate, dateFrom),
      lte(salesInvoices.invoiceDate, dateTo),
      this.customerId ? eq(salesInvoices.customerId, this.customerId) : undefined,
    );
  }

  private async headline(dateFrom: string, dateTo: string) {
    const [row] = await this.db
      .select({
        gross: sql<string>`COALESCE(SUM(${salesInvoices.totalAmount}), 0)::text`,
        taxable: sql<string>`COALESCE(SUM(${salesInvoices.subtotal}), 0)::text`,
        tax: sql<string>`COALESCE(SUM(${salesInvoices.taxAmount}), 0)::text`,
        count: sql<number>`COUNT(*)::int`,
        customers: sql<number>`COUNT(DISTINCT ${salesInvoices.customerId})::int`,
      })
      .from(salesInvoices)
      .where(this.issuedWhere(dateFrom, dateTo));

    const grossRevenue = toNumber(row?.gross ?? '0');
    const invoiceCount = row?.count ?? 0;
    return {
      grossRevenue,
      taxableValue: toNumber(row?.taxable ?? '0'),
      taxAmount: toNumber(row?.tax ?? '0'),
      invoiceCount,
      avgInvoiceValue: invoiceCount > 0 ? grossRevenue / invoiceCount : 0,
      activeCustomers: row?.customers ?? 0,
    };
  }

  /** Issued + adjusted credit notes only — drafts and cancelled ones have
   *  not reduced anything the customer owes. */
  private async creditNoteTotal(dateFrom: string, dateTo: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${creditNotes.amount}), 0)::text` })
      .from(creditNotes)
      .where(and(
        eq(creditNotes.tenantId, this.tenantId),
        inArray(creditNotes.status, ['issued', 'adjusted']),
        gte(creditNotes.issueDate, dateFrom),
        lte(creditNotes.issueDate, dateTo),
        this.customerId ? eq(creditNotes.customerId, this.customerId) : undefined,
      ));
    return toNumber(row?.total ?? '0');
  }

  private async trend(dateFrom: string, dateTo: string, grain: TrendGrain): Promise<SalesTrendPoint[]> {
    // Grain is inlined rather than bound: as a bind parameter it lands at a
    // different position in SELECT and GROUP BY, so Postgres stops seeing the
    // two expressions as the same one. Safe — TrendGrain is a closed union.
    const bucket = sql`DATE_TRUNC('${sql.raw(grain)}', ${salesInvoices.invoiceDate}::timestamp)::date`;
    const rows = await this.db
      .select({
        bucket: sql<string>`${bucket}::text`,
        revenue: sql<string>`COALESCE(SUM(${salesInvoices.totalAmount}), 0)::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(salesInvoices)
      .where(this.issuedWhere(dateFrom, dateTo))
      .groupBy(bucket)
      .orderBy(bucket);
    return rows.map((r) => ({
      bucket: r.bucket,
      revenue: toNumber(r.revenue),
      invoiceCount: r.count,
    }));
  }

  private async topCustomers(dateFrom: string, dateTo: string) {
    const revenue = sql<string>`COALESCE(SUM(${salesInvoices.totalAmount}), 0)`;
    const rows = await this.db
      .select({
        customerId: salesInvoices.customerId,
        name: customers.name,
        revenue: sql<string>`${revenue}::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(salesInvoices)
      .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
      .where(this.issuedWhere(dateFrom, dateTo))
      .groupBy(salesInvoices.customerId, customers.name)
      .orderBy(desc(revenue))
      .limit(8);
    return rows.map((r) => ({
      customerId: r.customerId,
      name: r.name,
      revenue: toNumber(r.revenue),
      invoiceCount: r.count,
    }));
  }

  /** Grouped by line description rather than item id: invoices carry ad-hoc
   *  lines with no master item, and dropping them would understate the mix. */
  private async topItems(dateFrom: string, dateTo: string) {
    const revenue = sql<string>`COALESCE(SUM(${salesInvoiceItems.amount}), 0)`;
    const rows = await this.db
      .select({
        description: salesInvoiceItems.description,
        uom: sql<string | null>`MAX(${salesInvoiceItems.uom})`,
        revenue: sql<string>`${revenue}::text`,
        quantity: sql<string>`COALESCE(SUM(${salesInvoiceItems.quantity}), 0)::text`,
      })
      .from(salesInvoiceItems)
      .innerJoin(salesInvoices, eq(salesInvoices.id, salesInvoiceItems.invoiceId))
      .where(this.issuedWhere(dateFrom, dateTo))
      .groupBy(salesInvoiceItems.description)
      .orderBy(desc(revenue))
      .limit(8);
    return rows.map((r) => ({
      description: r.description,
      revenue: toNumber(r.revenue),
      quantity: toNumber(r.quantity),
      uom: r.uom,
    }));
  }

  /** Cancelled is excluded everywhere else, so it is excluded here too —
   *  the split has to add up to the headline invoice count. */
  private async statusSplit(dateFrom: string, dateTo: string) {
    const rows = await this.db
      .select({
        status: salesInvoices.status,
        count: sql<number>`COUNT(*)::int`,
        amount: sql<string>`COALESCE(SUM(${salesInvoices.totalAmount}), 0)::text`,
      })
      .from(salesInvoices)
      .where(this.issuedWhere(dateFrom, dateTo))
      .groupBy(salesInvoices.status);
    return rows.map((r) => ({
      status: r.status,
      count: r.count,
      amount: toNumber(r.amount),
    }));
  }

  /**
   * Cash actually collected against invoices dated in the window, plus how
   * much of that vintage is still open. Allocation-based rather than
   * invoice.amount_received so a receipt banked later still counts towards
   * the invoices it settled.
   */
  private async collections(dateFrom: string, dateTo: string) {
    const [alloc] = await this.db
      .select({
        received: sql<string>`COALESCE(SUM(${receiptAllocations.amount}), 0)::text`,
        avgDays: sql<string | null>`AVG(${paymentReceipts.receiptDate}::date - ${salesInvoices.invoiceDate}::date)`,
      })
      .from(receiptAllocations)
      .innerJoin(salesInvoices, eq(salesInvoices.id, receiptAllocations.invoiceId))
      .innerJoin(paymentReceipts, eq(paymentReceipts.id, receiptAllocations.receiptId))
      .where(this.issuedWhere(dateFrom, dateTo));

    const [open] = await this.db
      .select({ balance: sql<string>`COALESCE(SUM(${salesInvoices.balanceDue}), 0)::text` })
      .from(salesInvoices)
      .where(and(this.issuedWhere(dateFrom, dateTo), ne(salesInvoices.status, 'paid')));

    const receivedInPeriod = toNumber(alloc?.received ?? '0');
    const outstandingFromPeriod = toNumber(open?.balance ?? '0');
    const billed = receivedInPeriod + outstandingFromPeriod;
    return {
      receivedInPeriod,
      outstandingFromPeriod,
      collectedRatio: billed > 0 ? Math.round((receivedInPeriod / billed) * 1000) / 10 : 0,
      avgDaysToPay: alloc?.avgDays == null ? null : Math.round(Number(alloc.avgDays)),
    };
  }
}
