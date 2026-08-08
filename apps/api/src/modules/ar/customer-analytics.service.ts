import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { salesInvoices, salesInvoiceItems, items } from '@runq/db';
import type { Db } from '@runq/db';

export type TrendGroupBy = 'day' | 'week' | 'month';

export interface CustomerAnalyticsSummary {
  totalSales: number;
  taxAmount: number;
  invoiceCount: number;
  distinctProducts: number;
  totalQuantity: number;
  avgInvoiceValue: number;
}

export interface CustomerProductSales {
  /** null for ad-hoc lines with no item master. */
  itemId: string | null;
  name: string;
  sku: string | null;
  uom: string | null;
  quantity: number;
  revenue: number;
  invoiceCount: number;
  /** Share of `summary.totalSales` (net of tax), 0–100. */
  sharePct: number;
}

export interface CustomerTrendPoint {
  /** Bucket start, ISO date. */
  period: string;
  revenue: number;
  invoiceCount: number;
}

export interface CustomerAnalyticsResult {
  dateFrom: string;
  dateTo: string;
  groupBy: TrendGroupBy;
  summary: CustomerAnalyticsSummary;
  products: CustomerProductSales[];
  trend: CustomerTrendPoint[];
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Label for invoice lines that carry no item-master reference. */
const AD_HOC_LABEL = 'Uncategorised (ad-hoc lines)';

/**
 * Sales analytics for a single customer over an explicit date window.
 *
 * Scope decisions, applied consistently across all three queries so the
 * numbers reconcile with each other:
 *   - `draft` and `cancelled` invoices are excluded — they aren't realised
 *     sales. This matches `ItemService.getSalesAnalytics`.
 *   - the window filters on `invoice_date`, not created/posted date.
 *   - product revenue is line `amount` (net of tax), so the per-product
 *     rows sum to `summary.totalSales`, not to invoice grand totals.
 */
export class CustomerAnalyticsService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async getAnalytics(
    customerId: string,
    dateFrom: string,
    dateTo: string,
    groupBy: TrendGroupBy,
  ): Promise<CustomerAnalyticsResult> {
    const [products, trend, invoiceStats] = await Promise.all([
      this.salesByProduct(customerId, dateFrom, dateTo),
      this.revenueTrend(customerId, dateFrom, dateTo, groupBy),
      this.invoiceStats(customerId, dateFrom, dateTo),
    ]);

    const totalSales = products.reduce((s, p) => s + p.revenue, 0);
    const totalQuantity = products.reduce((s, p) => s + p.quantity, 0);
    const withShare = products.map((p) => ({
      ...p,
      sharePct: totalSales > 0 ? (p.revenue / totalSales) * 100 : 0,
    }));

    return {
      dateFrom,
      dateTo,
      groupBy,
      summary: {
        totalSales,
        taxAmount: invoiceStats.taxAmount,
        invoiceCount: invoiceStats.invoiceCount,
        // Ad-hoc lines are one bucket, not a product — don't inflate the count.
        distinctProducts: withShare.filter((p) => p.itemId != null).length,
        totalQuantity,
        avgInvoiceValue: invoiceStats.invoiceCount > 0 ? totalSales / invoiceStats.invoiceCount : 0,
      },
      products: withShare,
      trend,
    };
  }

  /**
   * Shared window predicate. `realisedOnly` keeps drafts and cancellations
   * out of every figure we report.
   */
  private windowWhere(customerId: string, dateFrom: string, dateTo: string) {
    return and(
      eq(salesInvoices.tenantId, this.tenantId),
      eq(salesInvoices.customerId, customerId),
      gte(salesInvoices.invoiceDate, dateFrom),
      lte(salesInvoices.invoiceDate, dateTo),
      sql`${salesInvoices.status} NOT IN ('draft', 'cancelled')`,
    );
  }

  /**
   * Revenue + quantity per product. LEFT JOIN to the item master on purpose:
   * an inner join silently drops ad-hoc lines (`item_id IS NULL`), which
   * would make the product breakdown fail to add up to total sales. Those
   * lines are collapsed into a single "Uncategorised" row instead.
   */
  private async salesByProduct(
    customerId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<Omit<CustomerProductSales, 'sharePct'>[]> {
    const rows = await this.db
      .select({
        itemId: salesInvoiceItems.itemId,
        itemName: items.name,
        itemSku: items.sku,
        itemUnit: items.unit,
        lineUom: sql<string | null>`MIN(${salesInvoiceItems.uom})`,
        lineDescription: sql<string | null>`MIN(${salesInvoiceItems.description})`,
        revenue: sql<string>`COALESCE(SUM(${salesInvoiceItems.amount}), 0)`,
        quantity: sql<string>`COALESCE(SUM(${salesInvoiceItems.quantity}), 0)`,
        invoiceCount: sql<string>`COUNT(DISTINCT ${salesInvoiceItems.invoiceId})`,
      })
      .from(salesInvoiceItems)
      .innerJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
      .leftJoin(items, eq(salesInvoiceItems.itemId, items.id))
      .where(this.windowWhere(customerId, dateFrom, dateTo))
      .groupBy(salesInvoiceItems.itemId, items.name, items.sku, items.unit);

    const mapped = rows.map((r) => ({
      itemId: r.itemId,
      // Fall back to the line description when there's no master record —
      // more useful than a bare "Uncategorised" if the line was named.
      name: r.itemName ?? r.lineDescription ?? AD_HOC_LABEL,
      sku: r.itemSku ?? null,
      uom: r.itemUnit ?? r.lineUom ?? null,
      quantity: toNumber(r.quantity),
      revenue: toNumber(r.revenue),
      invoiceCount: toNumber(r.invoiceCount),
    }));

    return mapped.sort((a, b) => b.revenue - a.revenue);
  }

  /**
   * Revenue bucketed over time.
   *
   * `groupBy` reaches `sql.raw` but is a zod-validated enum at the route
   * boundary, so there's nothing to inject.
   *
   * The bucket is formatted to text in SQL rather than handed back as a
   * timestamp: node-postgres would parse a timestamp into a local-time
   * `Date`, and `toISOString()` on that shifts the bucket a day earlier for
   * anyone east of UTC — i.e. every IST user, turning "Apr" into "31 Mar".
   * `YYYY-MM-DD` also sorts chronologically as text, so it doubles as the
   * group/order key.
   */
  private async revenueTrend(
    customerId: string,
    dateFrom: string,
    dateTo: string,
    groupBy: TrendGroupBy,
  ): Promise<CustomerTrendPoint[]> {
    const bucket = sql.raw(
      `to_char(date_trunc('${groupBy}', sales_invoices.invoice_date::timestamp), 'YYYY-MM-DD')`,
    );
    const rows = await this.db
      .select({
        period: sql<string>`${bucket}`,
        revenue: sql<string>`COALESCE(SUM(${salesInvoiceItems.amount}), 0)`,
        invoiceCount: sql<string>`COUNT(DISTINCT ${salesInvoiceItems.invoiceId})`,
      })
      .from(salesInvoiceItems)
      .innerJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
      .where(this.windowWhere(customerId, dateFrom, dateTo))
      .groupBy(bucket)
      .orderBy(bucket);

    return rows.map((r) => ({
      period: r.period,
      revenue: toNumber(r.revenue),
      invoiceCount: toNumber(r.invoiceCount),
    }));
  }

  /**
   * Invoice-level figures that can't come off the line join without
   * double-counting: how many invoices, and how much tax sat on them.
   */
  private async invoiceStats(
    customerId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<{ invoiceCount: number; taxAmount: number }> {
    const rows = await this.db
      .select({
        invoiceCount: sql<string>`COUNT(*)`,
        taxAmount: sql<string>`COALESCE(SUM(${salesInvoices.taxAmount}), 0)`,
      })
      .from(salesInvoices)
      .where(this.windowWhere(customerId, dateFrom, dateTo));

    const row = rows[0];
    return {
      invoiceCount: toNumber(row?.invoiceCount),
      taxAmount: toNumber(row?.taxAmount),
    };
  }
}
