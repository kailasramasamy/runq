import { eq, and } from 'drizzle-orm';
import { scheduledReports } from '@runq/db';
import type { Db } from '@runq/db';
import type { ScheduledReport } from '@runq/types';
import type { CreateScheduledReportInput } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';
import { computeNextRun } from '../../utils/schedule';

export class ScheduledReportService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list(): Promise<ScheduledReport[]> {
    const rows = await this.db
      .select()
      .from(scheduledReports)
      .where(eq(scheduledReports.tenantId, this.tenantId))
      .orderBy(scheduledReports.name);
    return rows.map(this.toReport);
  }

  async create(
    data: CreateScheduledReportInput,
    createdBy: string,
  ): Promise<ScheduledReport> {
    const nextRun = computeNextRun(data.frequency);
    const [row] = await this.db
      .insert(scheduledReports)
      .values({
        tenantId: this.tenantId,
        name: data.name,
        reportType: data.reportType,
        frequency: data.frequency,
        recipients: data.recipients,
        config: data.config,
        createdBy,
        nextRunAt: nextRun,
      })
      .returning();
    return this.toReport(row!);
  }

  async toggleActive(id: string): Promise<ScheduledReport> {
    const [existing] = await this.db
      .select()
      .from(scheduledReports)
      .where(
        and(
          eq(scheduledReports.id, id),
          eq(scheduledReports.tenantId, this.tenantId),
        ),
      );
    if (!existing) throw new NotFoundError('ScheduledReport');

    const [row] = await this.db
      .update(scheduledReports)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(eq(scheduledReports.id, id))
      .returning();
    return this.toReport(row!);
  }

  async delete(id: string): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(scheduledReports)
      .where(
        and(
          eq(scheduledReports.id, id),
          eq(scheduledReports.tenantId, this.tenantId),
        ),
      );
    if (!existing) throw new NotFoundError('ScheduledReport');

    await this.db
      .delete(scheduledReports)
      .where(eq(scheduledReports.id, id));
  }

  private toReport(
    row: typeof scheduledReports.$inferSelect,
  ): ScheduledReport {
    return {
      id: row.id,
      name: row.name,
      reportType: row.reportType,
      frequency: row.frequency,
      recipients: row.recipients as string[],
      config: row.config as Record<string, unknown>,
      isActive: row.isActive,
      lastSentAt: row.lastSentAt?.toISOString() ?? null,
      nextRunAt: row.nextRunAt?.toISOString() ?? null,
      lastRunStatus: (row.lastRunStatus as 'success' | 'failed') ?? null,
      lastError: row.lastError ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
