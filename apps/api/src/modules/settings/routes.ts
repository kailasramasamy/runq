import { FastifyPluginAsync } from 'fastify';
import { companySettingsSchema, invoiceNumberingSchema, emailProviderConfigSchema, testEmailSchema } from '@runq/validators';
import { eq } from 'drizzle-orm';
import { tenants } from '@runq/db';
import { rbacHook } from '../../hooks/rbac';
import { SettingsService } from './settings.service';
import { CAPortalService } from '../ca-portal/ca-portal.service';
import { userRoutes } from './user.routes';
import { auditRoutes } from './audit.routes';
import { OpeningBalanceService } from './opening-balance.service';
import { z } from 'zod';

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

  // Active FY for the dashboard FY switcher. Stored on tenants.current_fy
  // as a 4-char code (e.g. '2526'). Null means "use today's date" — the
  // FE derives the active FY in that case.
  app.get(
    '/current-fy',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const rows = await request.server.db
        .select({ currentFy: tenants.currentFy })
        .from(tenants)
        .where(eq(tenants.id, request.tenantId))
        .limit(1);
      return { data: { currentFy: rows[0]?.currentFy ?? null } };
    },
  );

  app.put(
    '/current-fy',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const body = z
        .object({ currentFy: z.string().regex(/^\d{4}$/).nullable() })
        .parse(request.body);
      await request.server.db
        .update(tenants)
        .set({ currentFy: body.currentFy, updatedAt: new Date() })
        .where(eq(tenants.id, request.tenantId));
      return { data: { currentFy: body.currentFy } };
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

  // Email provider
  app.get(
    '/email-provider',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const service = new SettingsService(request.server.db, request.tenantId);
      const data = await service.getEmailProviderConfig();
      return { data };
    },
  );

  app.put(
    '/email-provider',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const input = emailProviderConfigSchema.parse(request.body);
      const service = new SettingsService(request.server.db, request.tenantId);
      const data = await service.updateEmailProviderConfig(input);
      return { data };
    },
  );

  app.post(
    '/email-provider/test',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { to } = testEmailSchema.parse(request.body);
      const service = new SettingsService(request.server.db, request.tenantId);
      await service.sendTestEmail(to);
      return { success: true, message: `Test email sent to ${to}` };
    },
  );

  // CA Portal
  app.get(
    '/ca-portal',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const svc = new CAPortalService(request.server.db, request.tenantId);
      const slug = await svc.getOrCreateSlug();
      return { data: { slug, portalUrl: `/ca/${slug}` } };
    },
  );

  app.post(
    '/ca-portal/regenerate',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      // Clear existing slug, then generate new one
      const svc = new CAPortalService(request.server.db, request.tenantId);
      const settingsSvc = new SettingsService(request.server.db, request.tenantId);
      const tenant = await settingsSvc.getCompanySettings();
      const settings = { ...(tenant.settings as unknown as Record<string, unknown>), caPortalSlug: undefined };
      await request.server.db.update(tenants).set({ settings, updatedAt: new Date() }).where(eq(tenants.id, request.tenantId));
      const slug = await svc.getOrCreateSlug();
      return { data: { slug, portalUrl: `/ca/${slug}` } };
    },
  );

  // Onboarding
  app.get(
    '/onboarding',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const service = new SettingsService(request.server.db, request.tenantId);
      const data = await service.getOnboarding();
      return { data };
    },
  );

  app.post(
    '/onboarding/complete-step',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { step } = request.body as { step: string };
      if (!step || typeof step !== 'string') throw new Error('step is required');
      const service = new SettingsService(request.server.db, request.tenantId);
      const data = await service.completeOnboardingStep(step);
      return { data };
    },
  );

  app.post(
    '/onboarding/dismiss',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const service = new SettingsService(request.server.db, request.tenantId);
      const data = await service.dismissOnboarding();
      return { data };
    },
  );

  // ── Opening Balances ────────────────────────────────────────────

  app.get(
    '/opening-balances',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const service = new OpeningBalanceService(request.server.db, request.tenantId);
      const data = await service.getStatus();
      return { data };
    },
  );

  const openingBalanceSchema = z.object({
    effectiveDate: z.string(),
    customers: z.array(z.object({ id: z.string().uuid(), amount: z.number().min(0) })),
    vendors: z.array(z.object({ id: z.string().uuid(), amount: z.number().min(0) })),
  });

  app.post(
    '/opening-balances',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const input = openingBalanceSchema.parse(request.body);
      const service = new OpeningBalanceService(request.server.db, request.tenantId);
      const result = await service.save(input);
      return reply.status(200).send({ data: result });
    },
  );

  const singleOBSchema = z.object({
    id: z.string().uuid(),
    amount: z.number().positive(),
    effectiveDate: z.string(),
  });

  app.post(
    '/opening-balances/customer',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const input = singleOBSchema.parse(request.body);
      const service = new OpeningBalanceService(request.server.db, request.tenantId);
      const result = await service.saveCustomer(input.id, input.amount, input.effectiveDate);
      return reply.status(200).send({ data: result });
    },
  );

  app.post(
    '/opening-balances/vendor',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const input = singleOBSchema.parse(request.body);
      const service = new OpeningBalanceService(request.server.db, request.tenantId);
      const result = await service.saveVendor(input.id, input.amount, input.effectiveDate);
      return reply.status(200).send({ data: result });
    },
  );

  await app.register(userRoutes, { prefix: '/users' });
  await app.register(auditRoutes, { prefix: '/audit-log' });
};
