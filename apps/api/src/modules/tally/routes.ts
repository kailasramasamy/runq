import { FastifyPluginAsync } from 'fastify';
import { tallyExportFilterSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { TallyService } from './tally.service';

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
};
