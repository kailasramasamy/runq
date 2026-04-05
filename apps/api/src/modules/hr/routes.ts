import { FastifyPluginAsync } from 'fastify';
import {
  createExpenseClaimSchema,
  approveClaimSchema,
  expenseClaimFilterSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ExpenseClaimService } from './expense-claim.service';

const ALL_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const hrRoutes: FastifyPluginAsync = async (app) => {
  // --- Expense Claims ---

  app.get(
    '/expense-claims',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const filters = expenseClaimFilterSchema.parse(request.query);
      const service = new ExpenseClaimService(request.server.db, request.tenantId);
      const data = await service.list(filters);
      return { data };
    },
  );

  app.post(
    '/expense-claims',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request, reply) => {
      const input = createExpenseClaimSchema.parse(request.body);
      const service = new ExpenseClaimService(request.server.db, request.tenantId);
      const data = await service.create(input, request.user!.id);
      return reply.status(201).send({ data });
    },
  );

  app.get(
    '/expense-claims/:id',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ExpenseClaimService(request.server.db, request.tenantId);
      const data = await service.getById(id);
      return { data };
    },
  );

  app.put(
    '/expense-claims/:id/submit',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ExpenseClaimService(request.server.db, request.tenantId);
      const data = await service.submit(id);
      return { data };
    },
  );

  app.put(
    '/expense-claims/:id/approve',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = approveClaimSchema.parse(request.body);
      const service = new ExpenseClaimService(request.server.db, request.tenantId);
      const data = await service.approve(id, request.user!.id, input.approved, input.rejectionReason);
      return { data };
    },
  );

  app.put(
    '/expense-claims/:id/reimburse',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ExpenseClaimService(request.server.db, request.tenantId);
      const data = await service.markReimbursed(id);
      return { data };
    },
  );
};
