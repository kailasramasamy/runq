import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { tallyExportFilterSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { TallyService } from './tally.service';
import { TallyImportService } from './tally-import.service';

const ALLOWED_ROLES = ['owner', 'accountant'] as const;

export const tallyRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/export',
    { preHandler: [rbacHook([...ALLOWED_ROLES])] },
    async (request, reply) => {
      const { dateFrom, dateTo } = tallyExportFilterSchema.parse(request.query);
      const service = new TallyService(request.server.db, request.tenantId);
      const xml = await service.exportVouchers(dateFrom, dateTo);

      const month = dateFrom.slice(0, 7);
      reply.header('Content-Type', 'application/xml');
      reply.header('Content-Disposition', `attachment; filename="tally-export-${month}.xml"`);
      return reply.send(xml);
    },
  );

  app.get(
    '/ledgers',
    { preHandler: [rbacHook([...ALLOWED_ROLES])] },
    async (request, reply) => {
      const service = new TallyService(request.server.db, request.tenantId);
      const xml = await service.exportLedgerMasters();

      reply.header('Content-Type', 'application/xml');
      reply.header('Content-Disposition', 'attachment; filename="tally-ledgers.xml"');
      return reply.send(xml);
    },
  );
  // --- Import endpoints ---

  const importBodySchema = z.object({ csvData: z.string().min(1) });
  const importTBSchema = z.object({ csvData: z.string().min(1), asOfDate: z.string().date() });

  app.post(
    '/import/preview-trial-balance',
    { preHandler: [rbacHook([...ALLOWED_ROLES])] },
    async (request) => {
      const { csvData } = importBodySchema.parse(request.body);
      const svc = new TallyImportService(request.server.db, request.tenantId);
      return { data: await svc.previewTrialBalance(csvData) };
    },
  );

  app.post(
    '/import/trial-balance',
    { preHandler: [rbacHook([...ALLOWED_ROLES])] },
    async (request) => {
      const { csvData, asOfDate } = importTBSchema.parse(request.body);
      const svc = new TallyImportService(request.server.db, request.tenantId);
      return { data: await svc.importTrialBalance(csvData, asOfDate, request.user?.userId) };
    },
  );

  app.post(
    '/import/receivables',
    { preHandler: [rbacHook([...ALLOWED_ROLES])] },
    async (request) => {
      const { csvData } = importBodySchema.parse(request.body);
      const svc = new TallyImportService(request.server.db, request.tenantId);
      return { data: await svc.importReceivables(csvData, request.user?.userId) };
    },
  );

  app.post(
    '/import/payables',
    { preHandler: [rbacHook([...ALLOWED_ROLES])] },
    async (request) => {
      const { csvData } = importBodySchema.parse(request.body);
      const svc = new TallyImportService(request.server.db, request.tenantId);
      return { data: await svc.importPayables(csvData, request.user?.userId) };
    },
  );

  app.post(
    '/import/bank-accounts',
    { preHandler: [rbacHook([...ALLOWED_ROLES])] },
    async (request) => {
      const { csvData } = importBodySchema.parse(request.body);
      const svc = new TallyImportService(request.server.db, request.tenantId);
      return { data: await svc.importBankAccounts(csvData) };
    },
  );
};
