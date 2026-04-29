import { FastifyPluginAsync } from 'fastify';
import { impersonationRoutes } from './impersonation.routes';
import { adminAuditRoutes } from './audit.routes';
import { tenantAdminRoutes } from './tenants.routes';
import { billingAdminRoutes } from './billing.routes';
import { adminUsersRoutes } from './users.routes';
import { observabilityRoutes } from './observability.routes';
import { featureFlagsRoutes } from './feature-flags.routes';
import { appConfigAdminRoutes } from './app-config.routes';
import { announcementsAdminRoutes } from './announcements.routes';
import { analyticsRoutes } from './analytics.routes';
import { systemRoutes } from './system.routes';

export const adminRoutes: FastifyPluginAsync = async (app) => {
  await app.register(impersonationRoutes);
  await app.register(adminAuditRoutes);
  await app.register(tenantAdminRoutes);
  await app.register(billingAdminRoutes, { prefix: '/billing' });
  await app.register(adminUsersRoutes);
  await app.register(observabilityRoutes);
  await app.register(featureFlagsRoutes);
  await app.register(appConfigAdminRoutes);
  await app.register(announcementsAdminRoutes);
  await app.register(analyticsRoutes);
  await app.register(systemRoutes);
};
