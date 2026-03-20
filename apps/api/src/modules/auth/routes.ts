import { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { users, tenants } from '@runq/db';
import { loginSchema } from '@runq/validators';
import argon2 from 'argon2';
import { UnauthorizedError } from '../../utils/errors';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/login', async (request, reply) => {
    const { email, password, tenant: tenantSlug } = loginSchema.parse(request.body);

    const [tenant] = await app.db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);
    if (!tenant) throw new UnauthorizedError('Invalid credentials');

    const [user] = await app.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.tenantId, tenant.id)))
      .limit(1);

    if (!user || !user.isActive) throw new UnauthorizedError('Invalid credentials');

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) throw new UnauthorizedError('Invalid credentials');

    const token = app.jwt.sign({ userId: user.id, tenantId: tenant.id, role: user.role });

    return reply.send({
      data: {
        token,
        user: { id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, role: user.role, isActive: user.isActive },
      },
    });
  });

  app.post('/logout', async (_request, reply) => {
    return reply.send({ data: { success: true } });
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const [user] = await app.db
      .select({ id: users.id, tenantId: users.tenantId, email: users.email, name: users.name, role: users.role, isActive: users.isActive, createdAt: users.createdAt, updatedAt: users.updatedAt })
      .from(users)
      .where(and(eq(users.id, request.user.userId), eq(users.tenantId, request.user.tenantId)))
      .limit(1);

    const [tenant] = await app.db
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug, settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, request.user.tenantId))
      .limit(1);

    return {
      data: {
        user: user ? { ...user, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() } : null,
        tenant: tenant ?? null,
      },
    };
  });
};
