import { sql } from 'drizzle-orm';
import type { MetricRefresher } from '../refresh-registry';
import { upsertSnapshot } from '../snapshot-store';

export interface OverdueCustomerRow {
  customerId: string;
  customerName: string;
  balanceDue: number;
  invoiceCount: number;
  maxDaysOverdue: number;
}
export interface TopOverdueCustomersPayload {
  items: OverdueCustomerRow[];
  totalAmount: number;
}

export const topOverdueCustomersRefresher: MetricRefresher = {
  metricKey: 'top_overdue_customers',
  cadence: 'nightly',
  async refresh(ctx) {
    const res = await ctx.db.execute(sql`
      SELECT c.id AS customer_id, c.name AS customer_name,
             COALESCE(SUM(si.balance_due), 0) AS amount,
             COUNT(*)::int AS cnt,
             MAX(CURRENT_DATE - si.due_date)::int AS max_days
      FROM sales_invoices si
      JOIN customers c ON c.id = si.customer_id
      WHERE si.tenant_id = ${ctx.tenantId}
        AND si.balance_due > 0
        AND si.due_date < CURRENT_DATE
        AND si.status IN ('sent','partially_paid','overdue')
      GROUP BY c.id, c.name
      ORDER BY amount DESC
      LIMIT 10
    `);
    const rows = ((res as unknown as { rows: Array<{ customer_id: string; customer_name: string; amount: unknown; cnt: number; max_days: number }> }).rows) ?? [];
    const items: OverdueCustomerRow[] = rows.map((r) => ({
      customerId: r.customer_id,
      customerName: r.customer_name,
      balanceDue: Number(r.amount) || 0,
      invoiceCount: r.cnt,
      maxDaysOverdue: r.max_days ?? 0,
    }));
    const payload: TopOverdueCustomersPayload = {
      items,
      totalAmount: items.reduce((s, i) => s + i.balanceDue, 0),
    };
    const day = new Date(ctx.now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
    await upsertSnapshot(ctx.db, ctx.tenantId, 'top_overdue_customers', day, payload);
  },
};
