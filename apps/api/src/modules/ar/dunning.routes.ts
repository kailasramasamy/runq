import { FastifyPluginAsync } from 'fastify';
import { dunningRuleSchema, sendRemindersSchema, dunningLogFilterSchema, paginationSchema, uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { DunningService } from './dunning.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const dunningRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/rules',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const service = new DunningService(request.server.db, request.tenantId);
      const rules = await service.listRules();
      return { data: rules };
    },
  );

  app.post(
    '/rules',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = dunningRuleSchema.parse(request.body);
      const service = new DunningService(request.server.db, request.tenantId);
      const rule = await service.createRule(input);
      return reply.status(201).send({ data: rule });
    },
  );

  app.put(
    '/rules/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = dunningRuleSchema.parse(request.body);
      const service = new DunningService(request.server.db, request.tenantId);
      const rule = await service.updateRule(id, input);
      return { data: rule };
    },
  );

  app.get(
    '/overdue',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const service = new DunningService(request.server.db, request.tenantId);
      const invoices = await service.getOverdueInvoices();
      return { data: invoices };
    },
  );

  app.post(
    '/send-reminders',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const input = sendRemindersSchema.parse(request.body);
      const service = new DunningService(request.server.db, request.tenantId);
      const result = await service.sendReminders(input);
      return { data: result };
    },
  );

  app.get(
    '/log',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = dunningLogFilterSchema.parse(request.query);
      const service = new DunningService(request.server.db, request.tenantId);
      return service.getLog(filters, pagination.page, pagination.limit);
    },
  );

  app.post(
    '/auto-run',
    { preHandler: [rbacHook(['owner'])] },
    async (request) => {
      const service = new DunningService(request.server.db, request.tenantId);
      const result = await service.autoSendDunning();
      return { data: result };
    },
  );
};
