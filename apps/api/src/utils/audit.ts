import { auditLog } from '@runq/db';
import type { Db } from '@runq/db';

export interface AuditLogParams {
  userId?: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async log(params: AuditLogParams): Promise<void> {
    await this.db.insert(auditLog).values({
      tenantId: this.tenantId,
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      changes: params.changes ?? null,
      metadata: params.metadata ?? null,
    });
  }
}
