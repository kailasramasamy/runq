import { FastifyPluginAsync } from 'fastify';
import {
  createAccountSchema,
  updateAccountSchema,
  createJournalEntrySchema,
  journalEntryFilterSchema,
  paginationSchema,
  uuidParamSchema,
  createFiscalPeriodSchema,
  closeFiscalPeriodSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { GLService } from './gl.service';
import { FiscalService } from './fiscal.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;

export const glRoutes: FastifyPluginAsync = async (app) => {
  // GET /gl/accounts
  app.get(
    '/accounts',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const service = new GLService(request.server.db, request.tenantId);
      const data = await service.listAccounts();
      return { data };
    },
  );

  // POST /gl/accounts
  app.post(
    '/accounts',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const input = createAccountSchema.parse(request.body);
      const service = new GLService(request.server.db, request.tenantId);
      const data = await service.createAccount(input);
      return reply.status(201).send({ data });
    },
  );

  // PUT /gl/accounts/:id
  app.put(
    '/accounts/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateAccountSchema.parse(request.body);
      const service = new GLService(request.server.db, request.tenantId);
      const data = await service.updateAccount(id, input);
      return { data };
    },
  );

  // GET /gl/journal-entries
  app.get(
    '/journal-entries',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const filters = journalEntryFilterSchema.parse(request.query);
      const pagination = paginationSchema.parse(request.query);
      const service = new GLService(request.server.db, request.tenantId);
      return service.listJournalEntries(filters, pagination);
    },
  );

  // GET /gl/journal-entries/:id
  app.get(
    '/journal-entries/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new GLService(request.server.db, request.tenantId);
      const data = await service.getJournalEntry(id);
      return { data };
    },
  );

  // POST /gl/journal-entries
  app.post(
    '/journal-entries',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createJournalEntrySchema.parse(request.body);
      const service = new GLService(request.server.db, request.tenantId);
      const data = await service.createJournalEntry({ ...input, createdBy: request.user?.userId });
      return reply.status(201).send({ data });
    },
  );

  // GET /gl/trial-balance
  app.get(
    '/trial-balance',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const query = request.query as { asOfDate?: string };
      const service = new GLService(request.server.db, request.tenantId);
      const data = await service.getTrialBalance(query.asOfDate);
      return { data };
    },
  );

  // GET /gl/fiscal-periods
  app.get(
    '/fiscal-periods',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const service = new FiscalService(request.server.db, request.tenantId);
      const data = await service.listPeriods();
      return { data };
    },
  );

  // POST /gl/fiscal-periods
  app.post(
    '/fiscal-periods',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const input = createFiscalPeriodSchema.parse(request.body);
      const service = new FiscalService(request.server.db, request.tenantId);
      const data = await service.createPeriod(input);
      return reply.status(201).send({ data });
    },
  );

  // PUT /gl/fiscal-periods/:id/close
  app.put(
    '/fiscal-periods/:id/close',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = closeFiscalPeriodSchema.parse(request.body);
      const service = new FiscalService(request.server.db, request.tenantId);
      const data = await service.closePeriod(id, input, request.user?.userId ?? '');
      return { data };
    },
  );

  // PUT /gl/fiscal-periods/:id/lock
  app.put(
    '/fiscal-periods/:id/lock',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new FiscalService(request.server.db, request.tenantId);
      const data = await service.lockPeriod(id, request.user?.userId ?? '');
      return { data };
    },
  );

  // PUT /gl/fiscal-periods/:id/unlock
  app.put(
    '/fiscal-periods/:id/unlock',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new FiscalService(request.server.db, request.tenantId);
      const data = await service.unlockPeriod(id);
      return { data };
    },
  );
};
