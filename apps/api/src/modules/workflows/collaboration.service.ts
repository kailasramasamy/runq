import { eq, and, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  transactionComments,
  taskAssignments,
  activityLog,
  users,
} from '@runq/db';
import type { Db } from '@runq/db';
import type {
  TransactionComment,
  TaskAssignment,
  ActivityLogEntry,
} from '@runq/types';
import type {
  CreateCommentInput,
  CreateTaskInput,
} from '@runq/validators';
import { NotFoundError } from '../../utils/errors';

export class CollaborationService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async createComment(data: CreateCommentInput, userId: string): Promise<TransactionComment> {
    const [row] = await this.db
      .insert(transactionComments)
      .values({
        tenantId: this.tenantId,
        entityType: data.entityType,
        entityId: data.entityId,
        userId,
        content: data.content,
      })
      .returning();

    return this.toComment(row!);
  }

  async listComments(entityType: string, entityId: string): Promise<TransactionComment[]> {
    const rows = await this.db
      .select()
      .from(transactionComments)
      .where(
        and(
          eq(transactionComments.tenantId, this.tenantId),
          eq(transactionComments.entityType, entityType),
          eq(transactionComments.entityId, entityId),
        ),
      )
      .orderBy(desc(transactionComments.createdAt));

    return rows.map((r) => this.toComment(r));
  }

  async createTask(data: CreateTaskInput, assignedBy: string): Promise<TaskAssignment> {
    const [row] = await this.db
      .insert(taskAssignments)
      .values({
        tenantId: this.tenantId,
        entityType: data.entityType,
        entityId: data.entityId,
        title: data.title,
        description: data.description ?? null,
        assignedTo: data.assignedTo,
        assignedBy,
        dueDate: data.dueDate ?? null,
      })
      .returning();

    return this.toTask(row!);
  }

  async listTasks(filters: { assignedTo?: string; entityType?: string; entityId?: string }): Promise<TaskAssignment[]> {
    const conditions = this.buildTaskConditions(filters);
    const assignedToUser = alias(users, 'assigned_to_user');
    const assignedByUser = alias(users, 'assigned_by_user');
    const rows = await this.db
      .select({
        task: taskAssignments,
        assignedToName: assignedToUser.name,
        assignedByName: assignedByUser.name,
      })
      .from(taskAssignments)
      .leftJoin(assignedToUser, eq(taskAssignments.assignedTo, assignedToUser.id))
      .leftJoin(assignedByUser, eq(taskAssignments.assignedBy, assignedByUser.id))
      .where(and(...conditions))
      .orderBy(desc(taskAssignments.createdAt));

    return rows.map((r) => this.toTask(r.task, r.assignedToName ?? undefined, r.assignedByName ?? undefined));
  }

  async updateTaskStatus(taskId: string, status: 'open' | 'in_progress' | 'completed' | 'cancelled', userId: string): Promise<TaskAssignment> {
    const [existing] = await this.db
      .select()
      .from(taskAssignments)
      .where(and(eq(taskAssignments.id, taskId), eq(taskAssignments.tenantId, this.tenantId)))
      .limit(1);

    if (!existing) throw new NotFoundError('Task');

    const completedAt = status === 'completed' ? new Date() : null;
    const [row] = await this.db
      .update(taskAssignments)
      .set({ status, completedAt, updatedAt: new Date() })
      .where(eq(taskAssignments.id, taskId))
      .returning();

    return this.toTask(row!);
  }

  async logActivity(params: {
    entityType: string;
    entityId: string;
    action: string;
    description: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.logActivityInternal(this.db, params);
  }

  async getActivityTimeline(entityType: string, entityId: string): Promise<ActivityLogEntry[]> {
    const rows = await this.db
      .select()
      .from(activityLog)
      .where(
        and(
          eq(activityLog.tenantId, this.tenantId),
          eq(activityLog.entityType, entityType),
          eq(activityLog.entityId, entityId),
        ),
      )
      .orderBy(desc(activityLog.createdAt));

    return rows.map((r) => this.toActivityEntry(r));
  }

  // Public re-export for callers that need to log activity within a transaction
  async logActivityInternal(
    db: any,
    params: { entityType: string; entityId: string; action: string; description: string; userId?: string; metadata?: Record<string, unknown> },
  ): Promise<void> {
    await db.insert(activityLog).values({
      tenantId: this.tenantId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      description: params.description,
      userId: params.userId ?? null,
      metadata: params.metadata ?? {},
    });
  }

  // --- Private helpers ---

  private buildTaskConditions(filters: { assignedTo?: string; entityType?: string; entityId?: string }) {
    const conds: Parameters<typeof and> = [eq(taskAssignments.tenantId, this.tenantId)];
    if (filters.assignedTo) conds.push(eq(taskAssignments.assignedTo, filters.assignedTo));
    if (filters.entityType) conds.push(eq(taskAssignments.entityType, filters.entityType));
    if (filters.entityId) conds.push(eq(taskAssignments.entityId, filters.entityId));
    return conds;
  }

  private toComment(r: typeof transactionComments.$inferSelect): TransactionComment {
    return {
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      userId: r.userId,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private toTask(
    r: typeof taskAssignments.$inferSelect,
    assignedToName?: string,
    assignedByName?: string,
  ): TaskAssignment {
    return {
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      title: r.title,
      description: r.description,
      assignedTo: r.assignedTo,
      assignedToName,
      assignedBy: r.assignedBy,
      assignedByName,
      dueDate: r.dueDate,
      status: r.status,
      completedAt: r.completedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private toActivityEntry(r: typeof activityLog.$inferSelect): ActivityLogEntry {
    return {
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      description: r.description,
      userId: r.userId,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
