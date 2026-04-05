import { eq, and } from 'drizzle-orm';
import { dashboardWidgets } from '@runq/db';
import type { Db } from '@runq/db';
import type { DashboardWidget } from '@runq/types';
import type { SaveWidgetLayoutInput } from '@runq/validators';

const DEFAULT_WIDGETS = [
  { widgetType: 'stats_overview', position: 0 },
  { widgetType: 'payables_aging', position: 1 },
  { widgetType: 'receivables_aging', position: 2 },
  { widgetType: 'cash_position', position: 3 },
  { widgetType: 'payment_priority', position: 4 },
  { widgetType: 'expense_alerts', position: 5 },
  { widgetType: 'ai_insights', position: 6 },
  { widgetType: 'pdc_calendar', position: 7 },
  { widgetType: 'quick_actions', position: 8 },
  { widgetType: 'profit_loss_summary', position: 9 },
  { widgetType: 'cash_flow_chart', position: 10 },
  { widgetType: 'revenue_trend', position: 11 },
];

export class WidgetService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async getWidgets(userId: string): Promise<DashboardWidget[]> {
    const rows = await this.db
      .select()
      .from(dashboardWidgets)
      .where(
        and(
          eq(dashboardWidgets.tenantId, this.tenantId),
          eq(dashboardWidgets.userId, userId),
        ),
      )
      .orderBy(dashboardWidgets.position);

    if (rows.length === 0) {
      return this.initializeDefaults(userId);
    }

    return rows.map(this.toWidget);
  }

  async saveLayout(
    userId: string,
    data: SaveWidgetLayoutInput,
  ): Promise<DashboardWidget[]> {
    await this.db
      .delete(dashboardWidgets)
      .where(
        and(
          eq(dashboardWidgets.tenantId, this.tenantId),
          eq(dashboardWidgets.userId, userId),
        ),
      );

    if (data.widgets.length > 0) {
      await this.db.insert(dashboardWidgets).values(
        data.widgets.map((w) => ({
          tenantId: this.tenantId,
          userId,
          widgetType: w.widgetType,
          position: w.position,
          config: w.config,
          isVisible: w.isVisible,
        })),
      );
    }

    return this.getWidgets(userId);
  }

  private async initializeDefaults(
    userId: string,
  ): Promise<DashboardWidget[]> {
    const values = DEFAULT_WIDGETS.map((w) => ({
      tenantId: this.tenantId,
      userId,
      widgetType: w.widgetType,
      position: w.position,
      config: {},
      isVisible: true,
    }));

    const rows = await this.db
      .insert(dashboardWidgets)
      .values(values)
      .returning();
    return rows.map(this.toWidget);
  }

  private toWidget(
    row: typeof dashboardWidgets.$inferSelect,
  ): DashboardWidget {
    return {
      id: row.id,
      widgetType: row.widgetType,
      position: row.position,
      config: row.config as Record<string, unknown>,
      isVisible: row.isVisible,
    };
  }
}
