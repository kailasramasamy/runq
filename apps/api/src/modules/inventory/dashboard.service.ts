import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';

export class InventoryDashboardService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async kpis() {
    const today = new Date().toISOString().slice(0, 10);
    const result = await this.db.execute(sql`
      WITH on_hand AS (
        SELECT SUM(value) AS total_value, COUNT(*) FILTER (WHERE qty > 0) AS active_rows
        FROM stock_on_hand WHERE tenant_id = ${this.tenantId}
      ),
      low_stock AS (
        SELECT COUNT(*)::int AS cnt FROM (
          SELECT soh.item_id
          FROM stock_on_hand soh
          INNER JOIN items i ON i.id = soh.item_id
          WHERE soh.tenant_id = ${this.tenantId}
            AND i.reorder_level IS NOT NULL
          GROUP BY soh.item_id, i.reorder_level
          HAVING SUM(soh.qty) <= i.reorder_level
        ) x
      ),
      today_grns AS (
        SELECT COUNT(*)::int AS cnt FROM inventory_grns
        WHERE tenant_id = ${this.tenantId}
          AND received_date = ${today} AND status = 'posted'
      ),
      today_dns AS (
        SELECT COUNT(*)::int AS cnt FROM delivery_notes
        WHERE tenant_id = ${this.tenantId}
          AND dispatch_date = ${today} AND status = 'dispatched'
      )
      SELECT
        COALESCE((SELECT total_value FROM on_hand), 0)::text AS total_value,
        COALESCE((SELECT active_rows FROM on_hand), 0)::int AS active_rows,
        (SELECT cnt FROM low_stock) AS low_stock,
        (SELECT cnt FROM today_grns) AS today_grns,
        (SELECT cnt FROM today_dns) AS today_dns
    `);
    const row = (result as unknown as {
      rows: Array<{ total_value: string; active_rows: number; low_stock: number; today_grns: number; today_dns: number }>;
    }).rows[0]!;
    return {
      totalValue: Number(row.total_value ?? 0),
      activeRows: row.active_rows ?? 0,
      lowStockCount: row.low_stock ?? 0,
      todayGrns: row.today_grns ?? 0,
      todayDeliveries: row.today_dns ?? 0,
    };
  }
}
