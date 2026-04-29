import { FastifyInstance, FastifyRequest } from 'fastify';
import { platformAuditLog } from '@runq/db';

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId?: string | null;
  targetTenantId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logPlatformAction(
  app: FastifyInstance,
  request: FastifyRequest,
  entry: AuditEntry,
): Promise<void> {
  const platformUserId = request.user?.platformUserId ?? null;
  await app.db.insert(platformAuditLog).values({
    platformUserId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    targetTenantId: entry.targetTenantId ?? null,
    metadata: entry.metadata ?? null,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}
