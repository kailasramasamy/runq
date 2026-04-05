import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createApprovalWorkflowSchema,
  approvalDecisionSchema,
  createCommentSchema,
  createTaskSchema,
  updateTaskStatusSchema,
  entityFilterSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { WorkflowService } from './workflow.service';
import { CollaborationService } from './collaboration.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;

const submitSchema = z.object({
  entityType: z.string().min(1).max(50),
  entityId: z.string().uuid(),
  amount: z.number().min(0),
});

const instanceQuerySchema = z.object({
  entityType: z.string().min(1).max(50),
  entityId: z.string().uuid(),
});

const taskQuerySchema = z.object({
  assignedTo: z.string().uuid().optional(),
  entityType: z.string().max(50).optional(),
  entityId: z.string().uuid().optional(),
});

const statusQuerySchema = z.object({
  status: z.string().max(50).optional(),
});

export const workflowRoutes: FastifyPluginAsync = async (app) => {
  // --- Approval Workflows ---
  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const svc = new WorkflowService(request.server.db, request.tenantId);
    return { data: await svc.listWorkflows() };
  });

  app.post('/', { preHandler: [rbacHook([...OWNER_ROLES])] }, async (request, reply) => {
    const input = createApprovalWorkflowSchema.parse(request.body);
    const svc = new WorkflowService(request.server.db, request.tenantId);
    const data = await svc.createWorkflow(input);
    return reply.status(201).send({ data });
  });

  app.post('/submit', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const { entityType, entityId, amount } = submitSchema.parse(request.body);
    const svc = new WorkflowService(request.server.db, request.tenantId);
    const data = await svc.submitForApproval(entityType, entityId, amount, request.user.userId);
    return reply.status(201).send({ data });
  });

  app.get('/instance', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { entityType, entityId } = instanceQuerySchema.parse(request.query);
    const svc = new WorkflowService(request.server.db, request.tenantId);
    return { data: await svc.getApprovalInstance(entityType, entityId) };
  });

  app.put('/steps/:id/decide', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id: stepId } = uuidParamSchema.parse(request.params);
    const body = approvalDecisionSchema.parse(request.body);
    const instanceId = (request.query as { instanceId?: string }).instanceId;
    if (!instanceId) throw new Error('instanceId query param required');
    const svc = new WorkflowService(request.server.db, request.tenantId);
    return { data: await svc.decide(instanceId, stepId, body, request.user.userId, request.user.role) };
  });

  // --- Workflow management ---
  app.put('/:id/toggle', { preHandler: [rbacHook([...OWNER_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const svc = new WorkflowService(request.server.db, request.tenantId);
    return { data: await svc.toggleWorkflow(id) };
  });

  app.delete('/:id', { preHandler: [rbacHook([...OWNER_ROLES])] }, async (request, reply) => {
    const { id } = uuidParamSchema.parse(request.params);
    const svc = new WorkflowService(request.server.db, request.tenantId);
    await svc.deleteWorkflow(id);
    return reply.status(204).send();
  });

  // --- Pending approvals inbox ---
  app.get('/pending-approvals', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const svc = new WorkflowService(request.server.db, request.tenantId);
    return { data: await svc.listPendingApprovals(request.user.role) };
  });

  // --- Comments ---
  app.get('/comments', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { entityType, entityId } = entityFilterSchema.parse(request.query);
    if (!entityType || !entityId) throw new Error('entityType and entityId required');
    const svc = new CollaborationService(request.server.db, request.tenantId);
    return { data: await svc.listComments(entityType, entityId) };
  });

  app.post('/comments', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createCommentSchema.parse(request.body);
    const svc = new CollaborationService(request.server.db, request.tenantId);
    const data = await svc.createComment(input, request.user.userId);
    return reply.status(201).send({ data });
  });

  // --- Tasks ---
  app.get('/tasks', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const filters = taskQuerySchema.parse(request.query);
    const svc = new CollaborationService(request.server.db, request.tenantId);
    return { data: await svc.listTasks(filters) };
  });

  app.post('/tasks', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createTaskSchema.parse(request.body);
    const svc = new CollaborationService(request.server.db, request.tenantId);
    const data = await svc.createTask(input, request.user.userId);
    return reply.status(201).send({ data });
  });

  app.put('/tasks/:id/status', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const { status } = updateTaskStatusSchema.parse(request.body);
    const svc = new CollaborationService(request.server.db, request.tenantId);
    return { data: await svc.updateTaskStatus(id, status, request.user.userId) };
  });

  // --- Activity ---
  app.get('/activity', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { entityType, entityId } = entityFilterSchema.parse(request.query);
    if (!entityType || !entityId) throw new Error('entityType and entityId required');
    const svc = new CollaborationService(request.server.db, request.tenantId);
    return { data: await svc.getActivityTimeline(entityType, entityId) };
  });
};
