import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, desc, sql, asc, inArray } from 'drizzle-orm';
import {
  hrTickets, hrTicketComments, tenants,
  performanceCycles, performanceGoals, performanceReviews,
  employees, users, departments, designations,
} from '@runq/db';
import { NotificationsService } from '../../dashboard/notifications.service';
import { HrNotifier } from '../hr-notifier';
import { GoalGeneratorCache, type GeneratedGoal } from '../performance/goal-generator';
import {
  uuidParamSchema,
  createTicketSchema, updateTicketSchema, ticketCommentSchema,
  createCycleSchema, updateCycleSchema,
  createGoalSchema, updateGoalSchema,
  reviewSubmitSchema,
  helpdeskAgentSettingsSchema,
} from '@runq/validators';
import { rbacHook } from '../../../hooks/rbac';
import { NotFoundError, ConflictError, ForbiddenError } from '../../../utils/errors';
import { resolveSelfEmployee } from './self-employee';
import { runHrAgentInBackground } from '../agent/agent';
import { publishHelpdeskEvent } from '../agent/realtime';

const ALL = ['owner', 'accountant', 'viewer', 'hr'] as const;
const WRITE = ['owner', 'accountant', 'hr'] as const;
// Company-wide admin lists (all tickets / appraisal cycles, goals,
// reviews) — viewer excluded; employees use the /me/* routes.
const MANAGE = ['owner', 'accountant', 'hr'] as const;

// Category → default SLA hours.
const SLA_BY_CATEGORY: Record<string, number> = {
  payroll: 48,
  leave: 24,
  attendance: 24,
  reimbursement: 72,
  asset: 72,
  it: 24,
  document: 72,
  general: 48,
};

async function nextTicketNumber(db: import('@runq/db').Db, tenantId: string): Promise<string> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(hrTickets)
    .where(eq(hrTickets.tenantId, tenantId));
  const seq = (count ?? 0) + 1;
  return `HRT-${String(seq).padStart(6, '0')}`;
}

/** Notify the other party when a human comment is posted on a ticket. Fire-and-forget. */
async function fireCommentNotification(
  req: { server: { db: import('@runq/db').Db }; tenantId: string },
  ticket: { employeeId: string; ticketNumber: string; subject: string },
  authorRole: string,
  actorUserId: string,
): Promise<void> {
  const notifier = new HrNotifier(req.server.db, req.tenantId);
  const notice = {
    source: 'hr_helpdesk' as const,
    title: 'New reply on your ticket',
    body: `${ticket.ticketNumber}: ${ticket.subject}.`,
    targetUrl: '/hr/helpdesk',
  };
  if (authorRole === 'viewer') {
    // Employee commented — notify HR admins (exclude the actor).
    await notifier.notifyHrAdmins(notice, actorUserId);
  } else {
    // HR/agent commented — notify the employee who raised the ticket.
    await notifier.notifyEmployee(ticket.employeeId, notice);
  }
}

/** Notify manager when an employee submits their self-review. Fire-and-forget. */
async function notifySelfReviewSubmitted(
  req: { server: { db: import('@runq/db').Db }; tenantId: string },
  review: { managerUserId: string | null; cycleId: string; employeeId: string },
  emp: { firstName: string; lastName?: string | null },
): Promise<void> {
  if (!review.managerUserId) return;
  const [cycle] = await req.server.db
    .select({ name: performanceCycles.name })
    .from(performanceCycles)
    .where(eq(performanceCycles.id, review.cycleId))
    .limit(1);
  const cycleName = cycle?.name ?? 'performance';
  const empName = [emp.firstName, emp.lastName].filter(Boolean).join(' ');
  await new HrNotifier(req.server.db, req.tenantId).notifyUser(review.managerUserId, {
    source: 'hr_performance',
    title: 'Self-review submitted',
    body: `${empName} submitted their self-review for ${cycleName}.`,
    targetUrl: '/hr/performance',
  });
}

/** Notify employee when their manager submits the review. Fire-and-forget. */
async function notifyManagerReviewSubmitted(
  req: { server: { db: import('@runq/db').Db }; tenantId: string },
  review: { employeeId: string; cycleId: string },
): Promise<void> {
  const [cycle] = await req.server.db
    .select({ name: performanceCycles.name })
    .from(performanceCycles)
    .where(eq(performanceCycles.id, review.cycleId))
    .limit(1);
  const cycleName = cycle?.name ?? 'performance';
  await new HrNotifier(req.server.db, req.tenantId).notifyEmployee(review.employeeId, {
    source: 'hr_performance',
    title: 'Manager review submitted',
    body: `Your manager submitted your ${cycleName} review.`,
    targetUrl: '/hr/performance',
  });
}

/** Fire assignedTo / resolved notifications after a ticket PUT. Fire-and-forget. */
async function fireTicketUpdateNotifications(
  req: { server: { db: import('@runq/db').Db }; tenantId: string; log: { error: (...args: unknown[]) => void } },
  row: typeof import('@runq/db').hrTickets.$inferSelect,
  prev: { assignedTo: string | null; employeeId: string; ticketNumber: string; subject: string },
): Promise<void> {
  const notifier = new HrNotifier(req.server.db, req.tenantId);
  const assignedToChanged =
    row.assignedTo != null && row.assignedTo !== prev.assignedTo;

  if (assignedToChanged) {
    await notifier.notifyUser(row.assignedTo!, {
      source: 'hr_helpdesk',
      title: 'Ticket assigned to you',
      body: `${prev.ticketNumber}: ${prev.subject}.`,
      targetUrl: '/hr/helpdesk',
    });
  }

  if (row.status === 'resolved') {
    await notifier.notifyEmployee(prev.employeeId, {
      type: 'ok',
      source: 'hr_helpdesk',
      title: 'Ticket resolved',
      body: `Your ticket ${prev.ticketNumber} has been marked resolved.`,
      targetUrl: '/hr/helpdesk',
    });
  }
}

export const helpdeskPerformanceRoutes: FastifyPluginAsync = async (app) => {
  // ====================== HELPDESK ======================
  // Employee creates a ticket for self.
  app.post('/me/tickets', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const input = createTicketSchema.parse(req.body);
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const ticketNumber = await nextTicketNumber(req.server.db, req.tenantId);
    const [row] = await req.server.db
      .insert(hrTickets)
      .values({
        tenantId: req.tenantId,
        ticketNumber,
        employeeId: emp.id,
        subject: input.subject,
        description: input.description,
        category: input.category,
        priority: input.priority,
        slaHours: SLA_BY_CATEGORY[input.category] ?? 48,
        status: 'open',
      })
      .returning();

    // Fire-and-forget agent draft. The agent itself short-circuits if
    // tenants.settings.agentSupport.enabled is false or the category tier is 0.
    runHrAgentInBackground({
      db: req.server.db,
      tenantId: req.tenantId,
      ticketId: row.id,
    });

    // Notify HR admins about the new ticket (exclude the actor).
    new HrNotifier(req.server.db, req.tenantId)
      .notifyHrAdmins(
        {
          source: 'hr_helpdesk',
          title: 'New HR ticket',
          body: `${row.ticketNumber}: ${row.subject} (${row.category}, ${row.priority}).`,
          targetUrl: '/hr/helpdesk',
        },
        req.user!.userId,
      )
      .catch((e) => req.log.error(e, 'helpdesk: ticket-created notify failed'));

    return reply.status(201).send({ data: row });
  });

  app.get('/me/tickets', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const rows = await req.server.db
      .select()
      .from(hrTickets)
      .where(and(
        eq(hrTickets.tenantId, req.tenantId),
        eq(hrTickets.employeeId, emp.id),
      ))
      .orderBy(desc(hrTickets.createdAt));
    return { data: rows };
  });

  // HR / manager view across employees.
  app.get('/tickets', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const q = z.object({
      status: z.string().optional(),
      category: z.string().optional(),
      priority: z.string().optional(),
      assignedTo: z.string().uuid().optional(),
      employeeId: z.string().uuid().optional(),
    }).parse(req.query);
    const conds = [eq(hrTickets.tenantId, req.tenantId)];
    if (q.status) conds.push(sql`${hrTickets.status}::text = ${q.status}`);
    if (q.category) conds.push(sql`${hrTickets.category}::text = ${q.category}`);
    if (q.priority) conds.push(sql`${hrTickets.priority}::text = ${q.priority}`);
    if (q.assignedTo) conds.push(eq(hrTickets.assignedTo, q.assignedTo));
    if (q.employeeId) conds.push(eq(hrTickets.employeeId, q.employeeId));
    const rows = await req.server.db
      .select({
        t: hrTickets,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
      })
      .from(hrTickets)
      .innerJoin(employees, eq(employees.id, hrTickets.employeeId))
      .where(and(...conds))
      .orderBy(desc(hrTickets.createdAt))
      .limit(500);
    return { data: rows.map((r) => ({ ...r.t, firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode })) };
  });

  app.get('/tickets/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [t] = await req.server.db
      .select()
      .from(hrTickets)
      .where(and(eq(hrTickets.id, id), eq(hrTickets.tenantId, req.tenantId)))
      .limit(1);
    if (!t) throw new NotFoundError('Ticket');
    // Employees (viewer) may only open their own ticket; managers see any.
    if (req.user!.role === 'viewer') {
      const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
      if (t.employeeId !== emp.id) throw new ForbiddenError('Not your ticket');
    }
    const comments = await req.server.db
      .select({
        c: hrTicketComments,
        authorEmail: users.email,
        authorName: users.name,
        authorRole: users.role,
      })
      .from(hrTicketComments)
      .innerJoin(users, eq(users.id, hrTicketComments.authorUserId))
      .where(eq(hrTicketComments.ticketId, id))
      .orderBy(asc(hrTicketComments.createdAt));
    return {
      data: {
        ...t,
        comments: comments.map((x) => ({
          ...x.c,
          authorEmail: x.authorEmail,
          authorName: x.authorName,
          authorRole: x.authorRole,
        })),
      },
    };
  });

  app.put('/tickets/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateTicketSchema.parse(req.body);

    // Pre-fetch so we can detect assignedTo changes and know employeeId.
    const [prev] = await req.server.db
      .select({ assignedTo: hrTickets.assignedTo, employeeId: hrTickets.employeeId, ticketNumber: hrTickets.ticketNumber, subject: hrTickets.subject })
      .from(hrTickets)
      .where(and(eq(hrTickets.id, id), eq(hrTickets.tenantId, req.tenantId)))
      .limit(1);
    if (!prev) throw new NotFoundError('Ticket');

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.status !== undefined) {
      patch.status = input.status;
      if (input.status === 'resolved') patch.resolvedAt = new Date();
      if (input.status === 'closed') patch.closedAt = new Date();
    }
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.category !== undefined) patch.category = input.category;
    if (input.assignedTo !== undefined) patch.assignedTo = input.assignedTo;
    const [row] = await req.server.db
      .update(hrTickets)
      .set(patch)
      .where(and(eq(hrTickets.id, id), eq(hrTickets.tenantId, req.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Ticket');
    if (input.status !== undefined) {
      publishHelpdeskEvent({ type: 'status_changed', ticketId: id, tenantId: req.tenantId, status: row.status });
    }

    fireTicketUpdateNotifications(req, row, prev).catch((e) =>
      req.log.error(e, 'helpdesk: ticket-update notify failed'),
    );

    return { data: row };
  });

  app.post('/tickets/:id/comments', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = ticketCommentSchema.parse(req.body);
    const [t] = await req.server.db
      .select()
      .from(hrTickets)
      .where(and(eq(hrTickets.id, id), eq(hrTickets.tenantId, req.tenantId)))
      .limit(1);
    if (!t) throw new NotFoundError('Ticket');
    const [row] = await req.server.db
      .insert(hrTicketComments)
      .values({ ticketId: id, authorUserId: req.user!.userId, body: input.body })
      .returning();
    publishHelpdeskEvent({
      type: 'comment_added',
      ticketId: id,
      tenantId: req.tenantId,
      isAgentDraft: false,
      hasAiBadge: false,
    });

    // Fire the agent if an employee (viewer role) just posted a follow-up.
    // HR / owner / accountant comments don't trigger a re-run.
    if (req.user!.role === 'viewer') {
      runHrAgentInBackground({
        db: req.server.db,
        tenantId: req.tenantId,
        ticketId: id,
      });
    }

    // Skip notification for agent drafts (isAgentDraft guard on insert).
    // Human comments: notify the other party.
    if (!row.isAgentDraft) {
      fireCommentNotification(req, t, req.user!.role, req.user!.userId).catch((e) =>
        req.log.error(e, 'helpdesk: comment notify failed'),
      );
    }

    return reply.status(201).send({ data: row });
  });

  app.post('/tickets/:id/escalate', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [t] = await req.server.db
      .select({ ticketNumber: hrTickets.ticketNumber, subject: hrTickets.subject, agentEscalatedAt: hrTickets.agentEscalatedAt })
      .from(hrTickets)
      .where(and(eq(hrTickets.id, id), eq(hrTickets.tenantId, req.tenantId)))
      .limit(1);
    if (!t) throw new NotFoundError('Ticket');
    const [row] = await req.server.db
      .update(hrTickets)
      .set({ status: 'waiting_human', agentEscalatedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(hrTickets.id, id), eq(hrTickets.tenantId, req.tenantId)))
      .returning();
    publishHelpdeskEvent({ type: 'status_changed', ticketId: id, tenantId: req.tenantId, status: 'waiting_human' });

    new HrNotifier(req.server.db, req.tenantId)
      .notifyHrAdmins(
        {
          type: 'warn',
          source: 'hr_helpdesk',
          title: 'Ticket escalated',
          body: `${t.ticketNumber}: ${t.subject} needs a human response.`,
          targetUrl: '/hr/helpdesk',
        },
        req.user!.userId,
      )
      .catch((e) => req.log.error(e, 'helpdesk: escalate notify failed'));

    return reply.send({ data: row });
  });

  // ---- Helpdesk AI Agent drafts ----
  // Promote a draft comment to a real reply. Optionally overwrite body. Only
  // users with WRITE role can do this.
  app.post('/tickets/:id/agent-drafts/:commentId/accept',
    { preHandler: [rbacHook([...WRITE])] },
    async (req, reply) => {
      const { id, commentId } = z.object({
        id: z.string().uuid(),
        commentId: z.string().uuid(),
      }).parse(req.params);
      const { body } = z.object({ body: z.string().min(1).optional() }).parse(req.body ?? {});

      const [t] = await req.server.db
        .select()
        .from(hrTickets)
        .where(and(eq(hrTickets.id, id), eq(hrTickets.tenantId, req.tenantId)))
        .limit(1);
      if (!t) throw new NotFoundError('Ticket');

      const patch: Record<string, unknown> = {
        isAgentDraft: false,
        authorUserId: req.user!.userId,
      };
      if (body !== undefined) patch.body = body;

      const [row] = await req.server.db
        .update(hrTicketComments)
        .set(patch)
        .where(and(eq(hrTicketComments.id, commentId), eq(hrTicketComments.ticketId, id)))
        .returning();
      if (!row) throw new NotFoundError('Draft comment');

      // Move ticket to in_progress if still open.
      if (t.status === 'open') {
        await req.server.db
          .update(hrTickets)
          .set({ status: 'in_progress', updatedAt: new Date() })
          .where(eq(hrTickets.id, id));
        publishHelpdeskEvent({ type: 'status_changed', ticketId: id, tenantId: req.tenantId, status: 'in_progress' });
      }
      publishHelpdeskEvent({
        type: 'comment_added',
        ticketId: id,
        tenantId: req.tenantId,
        isAgentDraft: false,
        hasAiBadge: !!row.agentConfidence,
      });
      return reply.send({ data: row });
    });

  app.delete('/tickets/:id/agent-drafts/:commentId',
    { preHandler: [rbacHook([...WRITE])] },
    async (req, reply) => {
      const { id, commentId } = z.object({
        id: z.string().uuid(),
        commentId: z.string().uuid(),
      }).parse(req.params);
      const [t] = await req.server.db
        .select({ id: hrTickets.id })
        .from(hrTickets)
        .where(and(eq(hrTickets.id, id), eq(hrTickets.tenantId, req.tenantId)))
        .limit(1);
      if (!t) throw new NotFoundError('Ticket');
      const result = await req.server.db
        .delete(hrTicketComments)
        .where(and(
          eq(hrTicketComments.id, commentId),
          eq(hrTicketComments.ticketId, id),
          eq(hrTicketComments.isAgentDraft, true),
        ))
        .returning({ id: hrTicketComments.id });
      if (result.length === 0) throw new NotFoundError('Draft comment');
      return reply.send({ data: { id: commentId } });
    });

  // ---- Helpdesk AI Agent settings ----
  // Lives in tenants.settings.agentSupport. Controls per-category tier and
  // the FAQ text the agent sees in its system prompt.
  app.get('/helpdesk/agent-settings', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const [t] = await req.server.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId))
      .limit(1);
    const s = (t?.settings ?? {}) as Record<string, unknown>;
    const fallback = {
      enabled: false,
      faqs: '',
      operatorUserId: null,
      perCategory: {
        payroll: { tier: 1, autoResolve: false },
        leave: { tier: 1, autoResolve: false },
        attendance: { tier: 1, autoResolve: false },
        reimbursement: { tier: 1, autoResolve: false },
        asset: { tier: 1, autoResolve: false },
        it: { tier: 1, autoResolve: false },
        document: { tier: 1, autoResolve: false },
        general: { tier: 0, autoResolve: false },
      },
    };
    return { data: { ...fallback, ...(s.agentSupport as object ?? {}) } };
  });

  app.put('/helpdesk/agent-settings', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const input = helpdeskAgentSettingsSchema.parse(req.body);
    const [existing] = await req.server.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId))
      .limit(1);
    const prev = (existing?.settings ?? {}) as Record<string, unknown>;
    const next = { ...prev, agentSupport: input };
    await req.server.db
      .update(tenants)
      .set({ settings: next, updatedAt: new Date() })
      .where(eq(tenants.id, req.tenantId));
    return { data: input };
  });

  // List HR users for the operator picker.
  app.get('/helpdesk/agent-settings/operators', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const rows = await req.server.db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(and(
        eq(users.tenantId, req.tenantId),
        sql`${users.role} IN ('owner', 'hr', 'accountant')`,
      ));
    return { data: rows };
  });

  // ====================== PERFORMANCE ======================
  app.get('/performance/cycles', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const rows = await req.server.db
      .select()
      .from(performanceCycles)
      .where(eq(performanceCycles.tenantId, req.tenantId))
      .orderBy(desc(performanceCycles.startDate));
    return { data: rows };
  });

  app.post('/performance/cycles', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createCycleSchema.parse(req.body);
    const [row] = await req.server.db
      .insert(performanceCycles)
      .values({ tenantId: req.tenantId, ...input })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.put('/performance/cycles/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateCycleSchema.parse(req.body);
    const [row] = await req.server.db
      .update(performanceCycles)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(performanceCycles.id, id), eq(performanceCycles.tenantId, req.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Cycle');
    return { data: row };
  });

  app.delete('/performance/cycles/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [row] = await req.server.db
      .delete(performanceCycles)
      .where(and(eq(performanceCycles.id, id), eq(performanceCycles.tenantId, req.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Cycle');
    return { data: row };
  });

  // Goals
  app.get('/performance/goals', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const q = z.object({
      cycleId: z.string().uuid().optional(),
      employeeId: z.string().uuid().optional(),
    }).parse(req.query);
    const conds = [eq(performanceGoals.tenantId, req.tenantId)];
    if (q.cycleId) conds.push(eq(performanceGoals.cycleId, q.cycleId));
    if (q.employeeId) conds.push(eq(performanceGoals.employeeId, q.employeeId));
    const rows = await req.server.db
      .select({
        g: performanceGoals,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
        departmentName: departments.name,
        designationName: designations.name,
      })
      .from(performanceGoals)
      .innerJoin(employees, eq(employees.id, performanceGoals.employeeId))
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .leftJoin(designations, eq(designations.id, employees.designationId))
      .where(and(...conds))
      .orderBy(desc(performanceGoals.createdAt));
    return { data: rows.map((r) => ({
      ...r.g,
      firstName: r.firstName,
      lastName: r.lastName,
      employeeCode: r.employeeCode,
      departmentName: r.departmentName,
      designationName: r.designationName,
    })) };
  });

  app.post('/performance/goals', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createGoalSchema.parse(req.body);
    // Validate weight cap across goals.
    const existing = await req.server.db
      .select({ weight: performanceGoals.weight })
      .from(performanceGoals)
      .where(and(
        eq(performanceGoals.tenantId, req.tenantId),
        eq(performanceGoals.cycleId, input.cycleId),
        eq(performanceGoals.employeeId, input.employeeId),
      ));
    const used = existing.reduce((s, r) => s + Number(r.weight), 0);
    if (used + input.weight > 100.01) {
      throw new ConflictError(`Goal weights exceed 100 (currently ${used.toFixed(2)})`);
    }
    const [row] = await req.server.db
      .insert(performanceGoals)
      .values({
        tenantId: req.tenantId,
        cycleId: input.cycleId,
        employeeId: input.employeeId,
        title: input.title,
        description: input.description,
        weight: input.weight.toString(),
        targetMetric: input.targetMetric,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.put('/performance/goals/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateGoalSchema.parse(req.body);

    // Viewers (employees) can only update their OWN goals, and only the
    // selfRating/comments/progressPct fields. Anything else is rejected.
    if (req.user!.role === 'viewer') {
      const allowedKeys = new Set(['selfRating', 'comments', 'progressPct']);
      const supplied = Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined);
      for (const k of supplied) {
        if (!allowedKeys.has(k)) {
          throw new ForbiddenError(`You can only update self-rating and comments on your own goals.`);
        }
      }
      // Verify the goal belongs to the viewer's employee record.
      const [goalRow] = await req.server.db
        .select({ employeeId: performanceGoals.employeeId })
        .from(performanceGoals)
        .where(and(eq(performanceGoals.id, id), eq(performanceGoals.tenantId, req.tenantId)))
        .limit(1);
      if (!goalRow) throw new NotFoundError('Goal');
      const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
      if (goalRow.employeeId !== emp.id) {
        throw new ForbiddenError('You can only self-rate your own goals.');
      }
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined) continue;
      if (k === 'weight' || k === 'selfRating' || k === 'managerRating' || k === 'finalRating') {
        patch[k] = typeof v === 'number' ? v.toString() : v;
      } else {
        patch[k] = v;
      }
    }
    const [row] = await req.server.db
      .update(performanceGoals)
      .set(patch)
      .where(and(eq(performanceGoals.id, id), eq(performanceGoals.tenantId, req.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Goal');
    return { data: row };
  });

  app.delete('/performance/goals/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [row] = await req.server.db
      .delete(performanceGoals)
      .where(and(eq(performanceGoals.id, id), eq(performanceGoals.tenantId, req.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Goal');
    return { data: row };
  });

  // ── AI goal generation ───────────────────────────────────────────────
  app.post('/performance/cycles/:id/generate-goals', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const { id: cycleId } = uuidParamSchema.parse(req.params);
    const input = z.object({
      scope: z.enum(['single', 'department', 'designation', 'all']),
      employeeId: z.string().uuid().optional(),
      departmentId: z.string().uuid().optional(),
      designationId: z.string().uuid().optional(),
    }).parse(req.body);

    // Validate cycle
    const [cycle] = await req.server.db
      .select()
      .from(performanceCycles)
      .where(and(eq(performanceCycles.id, cycleId), eq(performanceCycles.tenantId, req.tenantId)))
      .limit(1);
    if (!cycle) throw new NotFoundError('Cycle');

    // Resolve target employees with their dept + designation
    const empConds = [
      eq(employees.tenantId, req.tenantId),
      eq(employees.status, 'active'),
    ];
    if (input.scope === 'single') {
      if (!input.employeeId) throw new ConflictError('employeeId required for single scope');
      empConds.push(eq(employees.id, input.employeeId));
    } else if (input.scope === 'department') {
      if (!input.departmentId) throw new ConflictError('departmentId required for department scope');
      empConds.push(eq(employees.departmentId, input.departmentId));
    } else if (input.scope === 'designation') {
      if (!input.designationId) throw new ConflictError('designationId required for designation scope');
      empConds.push(eq(employees.designationId, input.designationId));
    }

    const targets = await req.server.db
      .select({
        empId: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeStatus: employees.status,
        deptName: departments.name,
        desigName: designations.name,
      })
      .from(employees)
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .leftJoin(designations, eq(designations.id, employees.designationId))
      .where(and(...empConds));

    if (targets.length === 0) {
      return reply.send({ data: { generated: 0, goals: [] } });
    }

    // Tenant industry
    const [tenant] = await req.server.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId))
      .limit(1);
    const industry = (tenant?.settings as Record<string, unknown> | null)?.industry as string | undefined;
    const industryLabel = industry?.trim() || 'Indian SME';

    // Generate per (dept, designation) with caching
    const cache = new GoalGeneratorCache();
    const created: typeof performanceGoals.$inferSelect[] = [];

    for (const t of targets) {
      const dept = t.deptName?.trim() || 'General';
      const desig = t.desigName?.trim() || 'Staff';
      let generated: GeneratedGoal[];
      try {
        generated = await cache.get({
          industry: industryLabel,
          department: dept,
          designation: desig,
          status: t.employeeStatus,
          cycleName: cycle.name,
          cycleStart: cycle.startDate,
          cycleEnd: cycle.endDate,
        });
      } catch (err) {
        req.log.error({ err, employee: t.empId }, 'Goal generation failed');
        continue;
      }
      // Skip if employee already has goals in this cycle (don't double-create).
      const existing = await req.server.db
        .select({ id: performanceGoals.id })
        .from(performanceGoals)
        .where(and(
          eq(performanceGoals.tenantId, req.tenantId),
          eq(performanceGoals.cycleId, cycleId),
          eq(performanceGoals.employeeId, t.empId),
        ))
        .limit(1);
      if (existing.length > 0) continue;

      const inserted = await req.server.db
        .insert(performanceGoals)
        .values(generated.map((g) => ({
          tenantId: req.tenantId,
          cycleId,
          employeeId: t.empId,
          title: g.title,
          description: g.description,
          weight: String(g.weight),
          targetMetric: g.targetMetric,
          status: 'draft' as const,
        })))
        .returning();
      created.push(...inserted);
    }
    return reply.send({ data: { generated: created.length, employees: targets.length, goals: created } });
  });

  // Bulk publish: flip a list of draft goals to active.
  app.post('/performance/goals/bulk-publish', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const input = z.object({ goalIds: z.array(z.string().uuid()).min(1).max(500) }).parse(req.body);
    const rows = await req.server.db
      .update(performanceGoals)
      .set({ status: 'active', updatedAt: new Date() })
      .where(and(
        eq(performanceGoals.tenantId, req.tenantId),
        inArray(performanceGoals.id, input.goalIds),
        eq(performanceGoals.status, 'draft'),
      ))
      .returning({ id: performanceGoals.id, employeeId: performanceGoals.employeeId, cycleId: performanceGoals.cycleId });

    // Notify each affected employee — one notification per employee per cycle,
    // not per goal. Phone-match employee → user.
    const byEmployee = new Map<string, { employeeId: string; cycleId: string; count: number }>();
    for (const r of rows) {
      const e = byEmployee.get(r.employeeId);
      if (e) e.count++;
      else byEmployee.set(r.employeeId, { employeeId: r.employeeId, cycleId: r.cycleId, count: 1 });
    }
    for (const { employeeId, cycleId, count } of byEmployee.values()) {
      const [u] = await req.server.db
        .select({ id: users.id })
        .from(users)
        .innerJoin(employees, sql`regexp_replace(coalesce(${employees.phone}, ''), '\\D', '', 'g') = regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g')`)
        .where(and(
          eq(users.tenantId, req.tenantId),
          eq(employees.id, employeeId),
          sql`coalesce(${users.phone}, '') <> ''`,
        ))
        .limit(1);
      if (!u) continue;
      const [cycle] = await req.server.db
        .select({ name: performanceCycles.name })
        .from(performanceCycles)
        .where(eq(performanceCycles.id, cycleId))
        .limit(1);
      await new NotificationsService(req.server.db, req.tenantId, u.id).create({
        type: 'info',
        source: 'hr_performance',
        title: `Your ${cycle?.name ?? 'performance'} goals are ready`,
        body: `HR has published ${count} goal${count === 1 ? '' : 's'} for you. Open HR → Performance to review and self-rate.`,
        targetUrl: '/hr/performance',
      });
    }
    return { data: { published: rows.length, notified: byEmployee.size } };
  });

  // Reviews
  app.get('/performance/reviews', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const q = z.object({
      cycleId: z.string().uuid().optional(),
      employeeId: z.string().uuid().optional(),
      status: z.string().optional(),
    }).parse(req.query);
    const conds = [eq(performanceReviews.tenantId, req.tenantId)];
    if (q.cycleId) conds.push(eq(performanceReviews.cycleId, q.cycleId));
    if (q.employeeId) conds.push(eq(performanceReviews.employeeId, q.employeeId));
    if (q.status) conds.push(sql`${performanceReviews.status}::text = ${q.status}`);
    const rows = await req.server.db
      .select({
        r: performanceReviews,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
      })
      .from(performanceReviews)
      .innerJoin(employees, eq(employees.id, performanceReviews.employeeId))
      .where(and(...conds))
      .orderBy(desc(performanceReviews.createdAt));

    // Compute weighted scores from each employee's goals in the cycle:
    //   score = Σ(weight × rating) / Σ(weight that has a rating)
    // Returned as computedSelfScore / computedManagerScore so the UI can
    // pre-fill the final rating instead of asking the manager to guess.
    const reviewKeys = rows.map((r) => ({ cycleId: r.r.cycleId, employeeId: r.r.employeeId }));
    const goalRows = reviewKeys.length === 0 ? [] : await req.server.db
      .select({
        cycleId: performanceGoals.cycleId,
        employeeId: performanceGoals.employeeId,
        weight: performanceGoals.weight,
        selfRating: performanceGoals.selfRating,
        managerRating: performanceGoals.managerRating,
      })
      .from(performanceGoals)
      .where(eq(performanceGoals.tenantId, req.tenantId));

    const weightedScore = (
      cycleId: string,
      employeeId: string,
      field: 'selfRating' | 'managerRating',
    ): number | null => {
      const gs = goalRows.filter((g) => g.cycleId === cycleId && g.employeeId === employeeId);
      let num = 0, den = 0;
      for (const g of gs) {
        const rating = g[field];
        if (rating == null) continue;
        const w = Number(g.weight);
        num += w * Number(rating);
        den += w;
      }
      if (den === 0) return null;
      return Math.round((num / den) * 10) / 10;
    };

    return {
      data: rows.map((r) => ({
        ...r.r,
        firstName: r.firstName,
        lastName: r.lastName,
        employeeCode: r.employeeCode,
        computedSelfScore: weightedScore(r.r.cycleId, r.r.employeeId, 'selfRating'),
        computedManagerScore: weightedScore(r.r.cycleId, r.r.employeeId, 'managerRating'),
      })),
    };
  });

  // Upsert a review row for (cycle, employee) — used to start a review.
  app.post('/performance/reviews', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = z.object({
      cycleId: z.string().uuid(),
      employeeId: z.string().uuid(),
      managerUserId: z.string().uuid().optional(),
    }).parse(req.body);
    const [existing] = await req.server.db
      .select()
      .from(performanceReviews)
      .where(and(
        eq(performanceReviews.tenantId, req.tenantId),
        eq(performanceReviews.cycleId, input.cycleId),
        eq(performanceReviews.employeeId, input.employeeId),
      ))
      .limit(1);
    if (existing) return reply.status(200).send({ data: existing });
    const [row] = await req.server.db
      .insert(performanceReviews)
      .values({
        tenantId: req.tenantId,
        cycleId: input.cycleId,
        employeeId: input.employeeId,
        managerUserId: input.managerUserId,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.put('/performance/reviews/:id/self-submit', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = reviewSubmitSchema.parse(req.body);
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const [existing] = await req.server.db
      .select()
      .from(performanceReviews)
      .where(and(
        eq(performanceReviews.id, id),
        eq(performanceReviews.tenantId, req.tenantId),
        eq(performanceReviews.employeeId, emp.id),
      ))
      .limit(1);
    if (!existing) throw new NotFoundError('Review');
    const [row] = await req.server.db
      .update(performanceReviews)
      .set({
        selfComments: input.selfComments,
        selfOverallRating: input.selfOverallRating?.toString(),
        status: 'self_submitted',
        selfSubmittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(performanceReviews.id, id))
      .returning();

    // Notify the manager that the employee submitted their self-review.
    if (row.managerUserId) {
      notifySelfReviewSubmitted(req, row, emp).catch((e) =>
        req.log.error(e, 'performance: self-submit notify failed'),
      );
    }

    return { data: row };
  });

  app.put('/performance/reviews/:id/manager-submit', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = reviewSubmitSchema.parse(req.body);
    const [row] = await req.server.db
      .update(performanceReviews)
      .set({
        managerComments: input.managerComments,
        managerOverallRating: input.managerOverallRating?.toString(),
        status: 'manager_submitted',
        managerSubmittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(performanceReviews.id, id), eq(performanceReviews.tenantId, req.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Review');

    // Notify the employee that their manager submitted the review.
    notifyManagerReviewSubmitted(req, row).catch((e) =>
      req.log.error(e, 'performance: manager-submit notify failed'),
    );

    return { data: row };
  });

  app.put('/performance/reviews/:id/finalise', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = reviewSubmitSchema.parse(req.body);
    const [row] = await req.server.db
      .update(performanceReviews)
      .set({
        finalOverallRating: input.finalOverallRating?.toString(),
        status: 'finalised',
        finalisedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(performanceReviews.id, id), eq(performanceReviews.tenantId, req.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Review');

    // Notify the employee that their review is finalised + awaiting their
    // acknowledgement. Phone-match employee → user.
    const [cycle] = await req.server.db
      .select({ name: performanceCycles.name })
      .from(performanceCycles)
      .where(eq(performanceCycles.id, row.cycleId))
      .limit(1);
    const [u] = await req.server.db
      .select({ id: users.id })
      .from(users)
      .innerJoin(employees, sql`regexp_replace(coalesce(${employees.phone}, ''), '\\D', '', 'g') = regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g')`)
      .where(and(
        eq(users.tenantId, req.tenantId),
        eq(employees.id, row.employeeId),
        sql`coalesce(${users.phone}, '') <> ''`,
      ))
      .limit(1);
    if (u) {
      await new NotificationsService(req.server.db, req.tenantId, u.id).create({
        type: 'info',
        source: 'hr_performance',
        title: `Your ${cycle?.name ?? 'performance'} review is ready`,
        body: 'Your manager has finalised your review. Open HR → Performance to view it and acknowledge.',
        targetUrl: '/hr/performance',
      });
    }
    return { data: row };
  });

  // Employee acknowledges their own finalised review.
  app.put('/performance/reviews/:id/acknowledge', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const { comment } = z.object({ comment: z.string().max(2000).optional() }).parse(req.body ?? {});
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const [existing] = await req.server.db
      .select()
      .from(performanceReviews)
      .where(and(
        eq(performanceReviews.id, id),
        eq(performanceReviews.tenantId, req.tenantId),
        eq(performanceReviews.employeeId, emp.id),
      ))
      .limit(1);
    if (!existing) throw new NotFoundError('Review');
    if (existing.status !== 'finalised') {
      throw new ConflictError('Only a finalised review can be acknowledged.');
    }
    const [row] = await req.server.db
      .update(performanceReviews)
      .set({
        status: 'acknowledged',
        acknowledgedAt: new Date(),
        employeeAckComment: comment ?? null,
        updatedAt: new Date(),
      })
      .where(eq(performanceReviews.id, id))
      .returning();
    return { data: row };
  });

  // Employee view of own reviews + goals.
  app.get('/me/performance', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    // Pull goals joined with their cycle so the mobile can group + label by
    // cycle without a second round-trip.
    const goalRows = await req.server.db
      .select({
        g: performanceGoals,
        cycleName: performanceCycles.name,
        cycleStatus: performanceCycles.status,
        cycleStartDate: performanceCycles.startDate,
        cycleEndDate: performanceCycles.endDate,
      })
      .from(performanceGoals)
      .innerJoin(performanceCycles, eq(performanceCycles.id, performanceGoals.cycleId))
      .where(and(
        eq(performanceGoals.tenantId, req.tenantId),
        eq(performanceGoals.employeeId, emp.id),
      ))
      .orderBy(asc(performanceGoals.createdAt));
    const goals = goalRows.map((r) => ({
      ...r.g,
      cycleName: r.cycleName,
      cycleStatus: r.cycleStatus,
      cycleStartDate: r.cycleStartDate,
      cycleEndDate: r.cycleEndDate,
    }));
    const reviewRows = await req.server.db
      .select()
      .from(performanceReviews)
      .where(and(
        eq(performanceReviews.tenantId, req.tenantId),
        eq(performanceReviews.employeeId, emp.id),
      ))
      .orderBy(desc(performanceReviews.createdAt));

    // Attach the weighted score computed from this employee's goal-level
    // ratings, so the UI can fall back to it when the standalone overall
    // rating wasn't entered.
    const scoreFor = (cycleId: string, field: 'selfRating' | 'managerRating'): number | null => {
      const gs = goals.filter((g) => g.cycleId === cycleId);
      let num = 0, den = 0;
      for (const g of gs) {
        const rating = g[field];
        if (rating == null) continue;
        const w = Number(g.weight);
        num += w * Number(rating);
        den += w;
      }
      if (den === 0) return null;
      return Math.round((num / den) * 10) / 10;
    };
    const reviews = reviewRows.map((r) => ({
      ...r,
      computedSelfScore: scoreFor(r.cycleId, 'selfRating'),
      computedManagerScore: scoreFor(r.cycleId, 'managerRating'),
    }));
    return { data: { goals, reviews } };
  });
};
