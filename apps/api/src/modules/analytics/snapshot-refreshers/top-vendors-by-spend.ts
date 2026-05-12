import { sql } from 'drizzle-orm';
import type { MetricRefresher } from '../refresh-registry';
import { upsertSnapshot } from '../snapshot-store';

export interface VendorSpendRow {
  vendorId: string;
  vendorName: string;
  totalSpend: number;
  billCount: number;
}
export interface TopVendorsBySpendPayload {
  items: VendorSpendRow[];
  totalAmount: number;
  windowDays: 90;
}

export const topVendorsBySpendRefresher: MetricRefresher = {
  metricKey: 'top_vendors_by_spend',
  cadence: 'nightly',
  async refresh(ctx) {
    const res = await ctx.db.execute(sql`
      SELECT v.id AS vendor_id, v.name AS vendor_name,
             COALESCE(SUM(pi.total_amount), 0) AS amount,
             COUNT(*)::int AS cnt
      FROM purchase_invoices pi
      JOIN vendors v ON v.id = pi.vendor_id
      WHERE pi.tenant_id = ${ctx.tenantId}
        AND pi.invoice_date >= CURRENT_DATE - INTERVAL '90 days'
        AND pi.status NOT IN ('draft','cancelled')
      GROUP BY v.id, v.name
      ORDER BY amount DESC
      LIMIT 10
    `);
    const rows = ((res as unknown as { rows: Array<{ vendor_id: string; vendor_name: string; amount: unknown; cnt: number }> }).rows) ?? [];
    const items: VendorSpendRow[] = rows.map((r) => ({
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      totalSpend: Number(r.amount) || 0,
      billCount: r.cnt,
    }));
    const payload: TopVendorsBySpendPayload = {
      items,
      totalAmount: items.reduce((s, i) => s + i.totalSpend, 0),
      windowDays: 90,
    };
    const day = new Date(ctx.now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
    await upsertSnapshot(ctx.db, ctx.tenantId, 'top_vendors_by_spend', day, payload);
  },
};
