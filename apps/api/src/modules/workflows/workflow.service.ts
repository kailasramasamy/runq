import { eq, and, desc, sql } from 'drizzle-orm';
import {
  approvalWorkflows,
  approvalRules,
  approvalInstances,
  approvalSteps,
  activityLog,
} from '@runq/db';
import type { Db } from '@runq/db';
import type {
  ApprovalWorkflow,
  ApprovalInstance,
} from '@runq/types';
import type {
  CreateApprovalWorkflowInput,
  ApprovalDecisionInput,
} from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';

export class WorkflowService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async createWorkflow(data: CreateApprovalWorkflowInput): Promise<ApprovalWorkflow> {
    return this.db.transaction(async (tx) => {
      const [wf] = await tx
        .insert(approvalWorkflows)
        .values({ tenantId: this.tenantId, name: data.name, entityType: data.entityType })
        .returning();

      const ruleRows = await tx
        .insert(approvalRules)
        .values(
          data.rules.map((r) => ({
            tenantId: this.tenantId,
            workflowId: wf!.id,
            stepOrder: r.stepOrder,
            approverRole: r.approverRole,
            minAmount: r.minAmount?.toString() ?? null,
            maxAmount: r.maxAmount?.toString() ?? null,
          })),
        )
        .returning();

      return this.toWorkflow(wf!, ruleRows);
    });
  }

  async listWorkflows(): Promise<ApprovalWorkflow[]> {
    const wfs = await this.db
      .select()
      .from(approvalWorkflows)
      .where(eq(approvalWorkflows.tenantId, this.tenantId))
      .orderBy(desc(approvalWorkflows.createdAt));

    return Promise.all(wfs.map((wf) => this.attachRules(wf)));
  }

  async submitForApproval(
    entityType: string,
    entityId: string,
    amount: number,
    requestedBy: string,
  ): Promise<ApprovalInstance> {
    const workflow = await this.findMatchingWorkflow(entityType, amount);
    if (!workflow) throw new NotFoundError('Matching approval workflow');

    const rules = await this.db
      .select()
      .from(approvalRules)
      .where(and(eq(approvalRules.tenantId, this.tenantId), eq(approvalRules.workflowId, workflow.id)))
      .orderBy(approvalRules.stepOrder);

    return this.db.transaction(async (tx) => {
      const [instance] = await tx
        .insert(approvalInstances)
        .values({
          tenantId: this.tenantId,
          workflowId: workflow.id,
          entityType,
          entityId,
          status: 'pending',
          requestedBy,
        })
        .returning();

      const stepRows = await this.insertSteps(tx, instance!.id, rules);
      await this.logActivityInternal(tx, { entityType, entityId, action: 'approval_submitted', description: 'Submitted for approval', userId: requestedBy });

      return this.toInstance(instance!, stepRows);
    });
  }

  async getApprovalInstance(entityType: string, entityId: string): Promise<ApprovalInstance> {
    const [instance] = await this.db
      .select()
      .from(approvalInstances)
      .where(
        and(
          eq(approvalInstances.tenantId, this.tenantId),
          eq(approvalInstances.entityType, entityType),
          eq(approvalInstances.entityId, entityId),
        ),
      )
      .orderBy(desc(approvalInstances.createdAt))
      .limit(1);

    if (!instance) throw new NotFoundError('Approval instance');

    const steps = await this.db
      .select()
      .from(approvalSteps)
      .where(and(eq(approvalSteps.tenantId, this.tenantId), eq(approvalSteps.instanceId, instance.id)))
      .orderBy(approvalSteps.stepOrder);

    return this.toInstance(instance, steps);
  }

  async decide(
    instanceId: string,
    stepId: string,
    decision: ApprovalDecisionInput,
    userId: string,
    userRole?: string,
  ): Promise<ApprovalInstance> {
    const step = await this.fetchStep(stepId, instanceId);
    if (step.status !== 'pending') {
      throw new ConflictError(`Step already has status "${step.status}"`);
    }

    // Enforce role matching (owners can always decide)
    if (userRole && userRole !== 'owner' && step.assignedRole !== userRole) {
      throw new ConflictError(`This step requires role "${step.assignedRole}"`);
    }

    // Enforce sequential ordering — all prior steps must be approved
    const priorPending = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(approvalSteps)
      .where(and(
        eq(approvalSteps.instanceId, instanceId),
        sql`${approvalSteps.stepOrder} < ${step.stepOrder}`,
        eq(approvalSteps.status, 'pending'),
      ));
    if ((priorPending[0]?.count ?? 0) > 0) {
      throw new ConflictError('Previous approval steps must be completed first');
    }

    return this.db.transaction(async (tx) => {
      await tx
        .update(approvalSteps)
        .set({ status: decision.decision, decidedBy: userId, decidedAt: new Date(), comment: decision.comment ?? null })
        .where(eq(approvalSteps.id, stepId));

      const instance = await this.resolveInstance(tx, instanceId, decision.decision);
      const steps = await tx
        .select().from(approvalSteps)
        .where(and(eq(approvalSteps.tenantId, this.tenantId), eq(approvalSteps.instanceId, instanceId)))
        .orderBy(approvalSteps.stepOrder);

      await this.logActivityInternal(tx, {
        entityType: instance.entityType,
        entityId: instance.entityId,
        action: `approval_${decision.decision}`,
        description: `Step ${decision.decision} by user`,
        userId,
      });

      return this.toInstance(instance, steps);
    });
  }

  // --- Enforcement helpers ---

  async isApproved(entityType: string, entityId: string): Promise<boolean> {
    // Check if any active workflow exists for this entity type
    const [workflow] = await this.db
      .select({ id: approvalWorkflows.id })
      .from(approvalWorkflows)
      .where(and(
        eq(approvalWorkflows.tenantId, this.tenantId),
        eq(approvalWorkflows.entityType, entityType),
        eq(approvalWorkflows.isActive, true),
      ))
      .limit(1);

    // No workflow configured — allow direct approval (backward compatible)
    if (!workflow) return true;

    // Check for an approved instance
    const [instance] = await this.db
      .select({ status: approvalInstances.status })
      .from(approvalInstances)
      .where(and(
        eq(approvalInstances.tenantId, this.tenantId),
        eq(approvalInstances.entityType, entityType),
        eq(approvalInstances.entityId, entityId),
      ))
      .orderBy(desc(approvalInstances.createdAt))
      .limit(1);

    return instance?.status === 'approved';
  }

  async listPendingApprovals(userRole: string): Promise<ApprovalInstance[]> {
    const instances = await this.db
      .select()
      .from(approvalInstances)
      .where(and(
        eq(approvalInstances.tenantId, this.tenantId),
        eq(approvalInstances.status, 'pending'),
      ))
      .orderBy(desc(approvalInstances.createdAt));

    const results: ApprovalInstance[] = [];
    for (const inst of instances) {
      const steps = await this.db
        .select()
        .from(approvalSteps)
        .where(and(eq(approvalSteps.instanceId, inst.id), eq(approvalSteps.tenantId, this.tenantId)))
        .orderBy(approvalSteps.stepOrder);

      // Show if current user's role has an actionable step (pending + all prior approved)
      const hasActionableStep = steps.some((s) =>
        s.status === 'pending' &&
        (s.assignedRole === userRole || userRole === 'owner') &&
        steps.filter((p) => p.stepOrder < s.stepOrder).every((p) => p.status === 'approved'),
      );
      if (hasActionableStep) results.push(this.toInstance(inst, steps));
    }
    return results;
  }

  async toggleWorkflow(workflowId: string): Promise<ApprovalWorkflow> {
    const [existing] = await this.db
      .select()
      .from(approvalWorkflows)
      .where(and(eq(approvalWorkflows.id, workflowId), eq(approvalWorkflows.tenantId, this.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Workflow');

    const [updated] = await this.db
      .update(approvalWorkflows)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(eq(approvalWorkflows.id, workflowId))
      .returning();

    return this.attachRules(updated!);
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    const [existing] = await this.db
      .select({ id: approvalWorkflows.id })
      .from(approvalWorkflows)
      .where(and(eq(approvalWorkflows.id, workflowId), eq(approvalWorkflows.tenantId, this.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Workflow');

    // Check for active instances
    const [activeInst] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(approvalInstances)
      .where(and(eq(approvalInstances.workflowId, workflowId), eq(approvalInstances.status, 'pending')));
    if ((activeInst?.count ?? 0) > 0) {
      throw new ConflictError('Cannot delete workflow with pending approval instances');
    }

    await this.db.delete(approvalRules).where(eq(approvalRules.workflowId, workflowId));
    await this.db.delete(approvalWorkflows).where(eq(approvalWorkflows.id, workflowId));
  }

  // --- Private helpers ---

  private async findMatchingWorkflow(entityType: string, amount: number) {
    const wfs = await this.db
      .select()
      .from(approvalWorkflows)
      .where(
        and(
          eq(approvalWorkflows.tenantId, this.tenantId),
          eq(approvalWorkflows.entityType, entityType),
          eq(approvalWorkflows.isActive, true),
        ),
      );

    for (const wf of wfs) {
      const rules = await this.db
        .select()
        .from(approvalRules)
        .where(and(eq(approvalRules.tenantId, this.tenantId), eq(approvalRules.workflowId, wf.id)));

      const match = rules.some((r) => this.ruleMatchesAmount(r, amount));
      if (match) return wf;
    }
    return null;
  }

  private ruleMatchesAmount(rule: typeof approvalRules.$inferSelect, amount: number): boolean {
    const min = rule.minAmount ? toNumber(rule.minAmount) : null;
    const max = rule.maxAmount ? toNumber(rule.maxAmount) : null;
    if (min !== null && amount < min) return false;
    if (max !== null && amount > max) return false;
    return true;
  }

  private async insertSteps(tx: any, instanceId: string, rules: (typeof approvalRules.$inferSelect)[]) {
    if (rules.length === 0) return [];
    return tx
      .insert(approvalSteps)
      .values(
        rules.map((r) => ({
          tenantId: this.tenantId,
          instanceId,
          ruleId: r.id,
          stepOrder: r.stepOrder,
          assignedRole: r.approverRole,
        })),
      )
      .returning();
  }

  private async resolveInstance(tx: any, instanceId: string, latestDecision: string) {
    const [instance] = await tx
      .select()
      .from(approvalInstances)
      .where(eq(approvalInstances.id, instanceId))
      .limit(1);

    if (!instance) throw new NotFoundError('Approval instance');

    if (latestDecision === 'rejected') {
      return this.markInstanceStatus(tx, instance, 'rejected');
    }

    const pendingSteps = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(approvalSteps)
      .where(and(eq(approvalSteps.instanceId, instanceId), eq(approvalSteps.status, 'pending')));

    if ((pendingSteps[0]?.count ?? 0) === 0) {
      return this.markInstanceStatus(tx, instance, 'approved');
    }
    return instance;
  }

  private async markInstanceStatus(
    tx: any,
    instance: typeof approvalInstances.$inferSelect,
    status: 'approved' | 'rejected',
  ) {
    if (status === 'rejected') {
      await tx
        .update(approvalSteps)
        .set({ status: 'skipped' })
        .where(and(eq(approvalSteps.instanceId, instance.id), eq(approvalSteps.status, 'pending')));
    }

    const [updated] = await tx
      .update(approvalInstances)
      .set({ status, completedAt: new Date() })
      .where(eq(approvalInstances.id, instance.id))
      .returning();

    return updated!;
  }

  private async fetchStep(stepId: string, instanceId: string) {
    const [step] = await this.db
      .select()
      .from(approvalSteps)
      .where(
        and(
          eq(approvalSteps.id, stepId),
          eq(approvalSteps.tenantId, this.tenantId),
          eq(approvalSteps.instanceId, instanceId),
        ),
      )
      .limit(1);

    if (!step) throw new NotFoundError('Approval step');
    return step;
  }

  private async attachRules(wf: typeof approvalWorkflows.$inferSelect): Promise<ApprovalWorkflow> {
    const rules = await this.db
      .select()
      .from(approvalRules)
      .where(and(eq(approvalRules.tenantId, this.tenantId), eq(approvalRules.workflowId, wf.id)))
      .orderBy(approvalRules.stepOrder);

    return this.toWorkflow(wf, rules);
  }

  private async logActivityInternal(
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

  private toWorkflow(
    wf: typeof approvalWorkflows.$inferSelect,
    rules: (typeof approvalRules.$inferSelect)[],
  ): ApprovalWorkflow {
    return {
      id: wf.id,
      tenantId: wf.tenantId,
      name: wf.name,
      entityType: wf.entityType,
      isActive: wf.isActive,
      rules: rules.map((r) => ({
        id: r.id,
        stepOrder: r.stepOrder,
        approverRole: r.approverRole,
        minAmount: r.minAmount ? toNumber(r.minAmount) : null,
        maxAmount: r.maxAmount ? toNumber(r.maxAmount) : null,
      })),
    };
  }

  private toInstance(
    inst: typeof approvalInstances.$inferSelect,
    steps: (typeof approvalSteps.$inferSelect)[],
  ): ApprovalInstance {
    return {
      id: inst.id,
      tenantId: inst.tenantId,
      workflowId: inst.workflowId,
      entityType: inst.entityType,
      entityId: inst.entityId,
      status: inst.status,
      requestedBy: inst.requestedBy,
      requestedAt: inst.requestedAt.toISOString(),
      completedAt: inst.completedAt?.toISOString() ?? null,
      steps: steps.map((s) => ({
        id: s.id,
        stepOrder: s.stepOrder,
        status: s.status,
        assignedRole: s.assignedRole,
        assignedTo: s.assignedTo,
        decidedBy: s.decidedBy,
        decidedAt: s.decidedAt?.toISOString() ?? null,
        comment: s.comment,
      })),
    };
  }
}
