import { eq, and } from 'drizzle-orm';
import { integrations, integrationLogs } from '@runq/db';
import type { Db } from '@runq/db';
import type { Integration, IntegrationLog } from '@runq/types';
import type {
  CreateIntegrationInput,
  UpdateIntegrationInput,
} from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';

export class IntegrationService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list(): Promise<Integration[]> {
    const rows = await this.db
      .select()
      .from(integrations)
      .where(eq(integrations.tenantId, this.tenantId))
      .orderBy(integrations.provider);
    return rows.map(this.toIntegration);
  }

  async create(data: CreateIntegrationInput): Promise<Integration> {
    const [row] = await this.db
      .insert(integrations)
      .values({
        tenantId: this.tenantId,
        provider: data.provider,
        config: data.config,
      })
      .returning();
    return this.toIntegration(row!);
  }

  async update(
    id: string,
    data: UpdateIntegrationInput,
  ): Promise<Integration> {
    const [existing] = await this.db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.id, id),
          eq(integrations.tenantId, this.tenantId),
        ),
      );
    if (!existing) throw new NotFoundError('Integration');

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.isActive !== undefined) updates.isActive = data.isActive;
    if (data.config !== undefined) updates.config = data.config;

    const [row] = await this.db
      .update(integrations)
      .set(updates)
      .where(eq(integrations.id, id))
      .returning();
    return this.toIntegration(row!);
  }

  async delete(id: string): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.id, id),
          eq(integrations.tenantId, this.tenantId),
        ),
      );
    if (!existing) throw new NotFoundError('Integration');
    await this.db.delete(integrationLogs).where(eq(integrationLogs.integrationId, id));
    await this.db.delete(integrations).where(eq(integrations.id, id));
  }

  async triggerSync(id: string, action: string): Promise<IntegrationLog> {
    const [existing] = await this.db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.id, id),
          eq(integrations.tenantId, this.tenantId),
        ),
      );
    if (!existing) throw new NotFoundError('Integration');
    if (!existing.isActive) throw new ConflictError('Integration is not active');

    const [log] = await this.db
      .insert(integrationLogs)
      .values({
        tenantId: this.tenantId,
        integrationId: id,
        action,
        status: 'success',
        message: `Sync triggered for ${existing.provider}: ${action}`,
        metadata: { triggeredAt: new Date().toISOString() },
      })
      .returning();

    await this.db
      .update(integrations)
      .set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(integrations.id, id));

    return this.toLog(log!);
  }

  async getLogs(integrationId: string): Promise<IntegrationLog[]> {
    const rows = await this.db
      .select()
      .from(integrationLogs)
      .where(
        and(
          eq(integrationLogs.tenantId, this.tenantId),
          eq(integrationLogs.integrationId, integrationId),
        ),
      )
      .orderBy(integrationLogs.createdAt)
      .limit(100);
    return rows.map(this.toLog);
  }

  async tallyExport(): Promise<Record<string, unknown>> {
    return {
      message: 'Tally export available at /api/v1/tally/export',
      format: 'xml',
    };
  }

  async tallyImport(
    data: Record<string, unknown>,
  ): Promise<{ imported: number }> {
    return { imported: 0 };
  }

  private toIntegration(
    row: typeof integrations.$inferSelect,
  ): Integration {
    return {
      id: row.id,
      provider: row.provider,
      isActive: row.isActive,
      config: row.config as Record<string, unknown>,
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toLog(
    row: typeof integrationLogs.$inferSelect,
  ): IntegrationLog {
    return {
      id: row.id,
      integrationId: row.integrationId,
      action: row.action,
      status: row.status as 'success' | 'error',
      message: row.message,
      metadata: row.metadata as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
