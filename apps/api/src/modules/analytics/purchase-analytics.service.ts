import { and, eq, gte, lte, ne, sql, inArray, desc } from 'drizzle-orm';
import {
  purchaseInvoices, purchaseInvoiceItems, debitNotes, vendors,
  payments, paymentAllocations,
} from '@runq/db';
import type { Db } from '@runq/db';
import { toNumber } from '../../utils/decimal';

/** Statuses that represent a real purchase. Drafts are not a commitment yet
 *  and cancelled bills never were, so both stay out of every figure here.
 *  pending_match / matched bills DO count — the goods arrived and the vendor
 *  is owed whether or not the three-way match has been cleared. */
const BOOKED_STATUSES = [
  'pending_match', 'matched', 'approved', 'partially_paid', 'paid',
] as const;

/** Trend bucket width, chosen from the range length so a 12-month view isn't
 *  365 unreadable points and a fortnight isn't a single bar. */
export type TrendGrain = 'day' | 'week' | 'month';

export interface PurchaseTrendPoint {
  /** Bucket start, ISO date. */
  bucket: string;
  spend: number;
  billCount: number;
}

export interface PurchaseAnalytics {
  period: { from: string; to: string; grain: TrendGrain };
  headline: {
    grossSpend: number;
    debitNotes: number;
    netSpend: number;
    taxableValue: number;
    taxAmount: number;
    billCount: number;
    avgBillValue: number;
    activeVendors: number;
  };
  trend: PurchaseTrendPoint[];
  topVendors: { vendorId: string; name: string; spend: number; billCount: number; share: number }[];
  /** `sku` stands in for the sales side's uom — bill lines carry no unit,
   *  and the SKU is what tells two similarly-named lines apart. */
  topItems: { description: string; spend: number; quantity: number; sku: string | null }[];
  statusSplit: { status: string; count: number; amount: number }[];
  payments: {
    paidInPeriod: number;
    outstandingFromPeriod: number;
    paidRatio: number;
    avgDaysToPay: number | null;
  };
}

/**
 * Purchase analytics on a bill basis: every figure is derived from booked
 * vendor bills dated inside the window, net of debit notes issued in the same
 * window. That ties the screen to the bill list a user can scroll, and will
 * not match a GL-basis P&L — the caller labels it accordingly.
 *
 * Mirror of SalesAnalyticsService, deliberately: the two screens sit side by
 * side in the app, and a user reading both should not have to hold two
 * different definitions of "the period's number" in their head.
 */
export class PurchaseAnalyticsService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    /** Scope every figure to one vendor. Undefined means tenant-wide. */
    private readonly vendorId?: string,
  ) {}

  async summary(dateFrom: string, dateTo: string): Promise<PurchaseAnalytics> {
    const grain = PurchaseAnalyticsService.grainFor(dateFrom, dateTo);
    const [headline, debitNoteTotal, trend, topVendors, topItems, statusSplit, paymentStats] =
      await Promise.all([
        this.headline(dateFrom, dateTo),
        this.debitNoteTotal(dateFrom, dateTo),
        this.trend(dateFrom, dateTo, grain),
        this.topVendors(dateFrom, dateTo),
        this.topItems(dateFrom, dateTo),
        this.statusSplit(dateFrom, dateTo),
        this.payments(dateFrom, dateTo),
      ]);

    const netSpend = headline.grossSpend - debitNoteTotal;
    const totalVendorSpend = topVendors.reduce((s, v) => s + v.spend, 0);
    return {
      period: { from: dateFrom, to: dateTo, grain },
      headline: { ...headline, debitNotes: debitNoteTotal, netSpend },
      trend,
      topVendors: topVendors.map((v) => ({
        ...v,
        share: totalVendorSpend > 0
          ? Math.round((v.spend / totalVendorSpend) * 1000) / 10
          : 0,
      })),
      topItems,
      statusSplit,
      payments: paymentStats,
    };
  }

  /** Daily up to ~2 months, weekly up to ~9 months, monthly beyond. */
  static grainFor(dateFrom: string, dateTo: string): TrendGrain {
    const days = (Date.parse(dateTo) - Date.parse(dateFrom)) / 86_400_000;
    if (days <= 62) return 'day';
    if (days <= 280) return 'week';
    return 'month';
  }

  private bookedWhere(dateFrom: string, dateTo: string) {
    return and(
      eq(purchaseInvoices.tenantId, this.tenantId),
      inArray(purchaseInvoices.status, [...BOOKED_STATUSES]),
      gte(purchaseInvoices.invoiceDate, dateFrom),
      lte(purchaseInvoices.invoiceDate, dateTo),
      this.vendorId ? eq(purchaseInvoices.vendorId, this.vendorId) : undefined,
    );
  }

  private async headline(dateFrom: string, dateTo: string) {
    const [row] = await this.db
      .select({
        gross: sql<string>`COALESCE(SUM(${purchaseInvoices.totalAmount}), 0)::text`,
        taxable: sql<string>`COALESCE(SUM(${purchaseInvoices.subtotal}), 0)::text`,
        tax: sql<string>`COALESCE(SUM(${purchaseInvoices.taxAmount}), 0)::text`,
        count: sql<number>`COUNT(*)::int`,
        vendors: sql<number>`COUNT(DISTINCT ${purchaseInvoices.vendorId})::int`,
      })
      .from(purchaseInvoices)
      .where(this.bookedWhere(dateFrom, dateTo));

    const grossSpend = toNumber(row?.gross ?? '0');
    const billCount = row?.count ?? 0;
    return {
      grossSpend,
      taxableValue: toNumber(row?.taxable ?? '0'),
      taxAmount: toNumber(row?.tax ?? '0'),
      billCount,
      avgBillValue: billCount > 0 ? grossSpend / billCount : 0,
      activeVendors: row?.vendors ?? 0,
    };
  }

  /** Issued + adjusted debit notes only — drafts and cancelled ones have not
   *  reduced anything we owe. */
  private async debitNoteTotal(dateFrom: string, dateTo: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${debitNotes.amount}), 0)::text` })
      .from(debitNotes)
      .where(and(
        eq(debitNotes.tenantId, this.tenantId),
        inArray(debitNotes.status, ['issued', 'adjusted']),
        gte(debitNotes.issueDate, dateFrom),
        lte(debitNotes.issueDate, dateTo),
        this.vendorId ? eq(debitNotes.vendorId, this.vendorId) : undefined,
      ));
    return toNumber(row?.total ?? '0');
  }

  private async trend(dateFrom: string, dateTo: string, grain: TrendGrain): Promise<PurchaseTrendPoint[]> {
    // Grain is inlined rather than bound: as a bind parameter it lands at a
    // different position in SELECT and GROUP BY, so Postgres stops seeing the
    // two expressions as the same one. Safe — TrendGrain is a closed union.
    const bucket = sql`DATE_TRUNC('${sql.raw(grain)}', ${purchaseInvoices.invoiceDate}::timestamp)::date`;
    const rows = await this.db
      .select({
        bucket: sql<string>`${bucket}::text`,
        spend: sql<string>`COALESCE(SUM(${purchaseInvoices.totalAmount}), 0)::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(purchaseInvoices)
      .where(this.bookedWhere(dateFrom, dateTo))
      .groupBy(bucket)
      .orderBy(bucket);
    return rows.map((r) => ({
      bucket: r.bucket,
      spend: toNumber(r.spend),
      billCount: r.count,
    }));
  }

  private async topVendors(dateFrom: string, dateTo: string) {
    const spend = sql<string>`COALESCE(SUM(${purchaseInvoices.totalAmount}), 0)`;
    const rows = await this.db
      .select({
        vendorId: purchaseInvoices.vendorId,
        name: vendors.name,
        spend: sql<string>`${spend}::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId))
      .where(this.bookedWhere(dateFrom, dateTo))
      .groupBy(purchaseInvoices.vendorId, vendors.name)
      .orderBy(desc(spend))
      .limit(8);
    return rows.map((r) => ({
      vendorId: r.vendorId,
      name: r.name,
      spend: toNumber(r.spend),
      billCount: r.count,
    }));
  }

  /** Grouped by line name rather than item id: bills carry ad-hoc lines with
   *  no master item, and dropping them would understate the mix. */
  private async topItems(dateFrom: string, dateTo: string) {
    const spend = sql<string>`COALESCE(SUM(${purchaseInvoiceItems.amount}), 0)`;
    const rows = await this.db
      .select({
        description: purchaseInvoiceItems.itemName,
        sku: sql<string | null>`MAX(${purchaseInvoiceItems.sku})`,
        spend: sql<string>`${spend}::text`,
        quantity: sql<string>`COALESCE(SUM(${purchaseInvoiceItems.quantity}), 0)::text`,
      })
      .from(purchaseInvoiceItems)
      .innerJoin(purchaseInvoices, eq(purchaseInvoices.id, purchaseInvoiceItems.invoiceId))
      .where(this.bookedWhere(dateFrom, dateTo))
      .groupBy(purchaseInvoiceItems.itemName)
      .orderBy(desc(spend))
      .limit(8);
    return rows.map((r) => ({
      description: r.description,
      spend: toNumber(r.spend),
      quantity: toNumber(r.quantity),
      sku: r.sku,
    }));
  }

  /** Cancelled and draft are excluded everywhere else, so they are excluded
   *  here too — the split has to add up to the headline bill count. */
  private async statusSplit(dateFrom: string, dateTo: string) {
    const rows = await this.db
      .select({
        status: purchaseInvoices.status,
        count: sql<number>`COUNT(*)::int`,
        amount: sql<string>`COALESCE(SUM(${purchaseInvoices.totalAmount}), 0)::text`,
      })
      .from(purchaseInvoices)
      .where(this.bookedWhere(dateFrom, dateTo))
      .groupBy(purchaseInvoices.status);
    return rows.map((r) => ({
      status: r.status,
      count: r.count,
      amount: toNumber(r.amount),
    }));
  }

  /**
   * Cash actually paid against bills dated in the window, plus how much of
   * that vintage is still open. Allocation-based rather than
   * invoice.amount_paid so a payment made later still counts towards the
   * bills it settled.
   */
  private async payments(dateFrom: string, dateTo: string) {
    const [alloc] = await this.db
      .select({
        paid: sql<string>`COALESCE(SUM(${paymentAllocations.amount}), 0)::text`,
        avgDays: sql<string | null>`AVG(${payments.paymentDate}::date - ${purchaseInvoices.invoiceDate}::date)`,
      })
      .from(paymentAllocations)
      .innerJoin(purchaseInvoices, eq(purchaseInvoices.id, paymentAllocations.invoiceId))
      .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .where(this.bookedWhere(dateFrom, dateTo));

    const [open] = await this.db
      .select({ balance: sql<string>`COALESCE(SUM(${purchaseInvoices.balanceDue}), 0)::text` })
      .from(purchaseInvoices)
      .where(and(this.bookedWhere(dateFrom, dateTo), ne(purchaseInvoices.status, 'paid')));

    const paidInPeriod = toNumber(alloc?.paid ?? '0');
    const outstandingFromPeriod = toNumber(open?.balance ?? '0');
    const billed = paidInPeriod + outstandingFromPeriod;
    return {
      paidInPeriod,
      outstandingFromPeriod,
      paidRatio: billed > 0 ? Math.round((paidInPeriod / billed) * 1000) / 10 : 0,
      avgDaysToPay: alloc?.avgDays == null ? null : Math.round(Number(alloc.avgDays)),
    };
  }
}
