import { FastifyPluginAsync } from 'fastify';
import { companySettingsSchema, invoiceNumberingSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { SettingsService } from './settings.service';
import { userRoutes } from './user.routes';
import { auditRoutes } from './audit.routes';

const ALL_ROLES = ['owner', 'accountant', 'viewer'] as const;
const OWNER_ROLES = ['owner'] as const;

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/company',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const service = new SettingsService(request.server.db, request.tenantId);
      const tenant = await service.getCompanySettings();
      return { data: { name: tenant.name, id: tenant.id, ...tenant.settings } };
    },
  );

  app.put(
    '/company',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const input = companySettingsSchema.parse(request.body);
      const service = new SettingsService(request.server.db, request.tenantId);
      const data = await service.updateCompanySettings(input);
      return { data };
    },
  );

  app.get(
    '/invoice-numbering',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const service = new SettingsService(request.server.db, request.tenantId);
      const data = await service.getInvoiceNumbering();
      return { data };
    },
  );

  app.put(
    '/invoice-numbering',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const input = invoiceNumberingSchema.parse(request.body);
      const service = new SettingsService(request.server.db, request.tenantId);
      const data = await service.updateInvoiceNumbering(input);
      return { data };
    },
  );

  await app.register(userRoutes, { prefix: '/users' });
  await app.register(auditRoutes, { prefix: '/audit-log' });
};
