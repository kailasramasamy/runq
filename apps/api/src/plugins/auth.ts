import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fjwt from '@fastify/jwt';
import { JWTPayload, PlatformRole } from '@runq/types';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticatePlatform: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePlatformRole: (...roles: PlatformRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  await app.register(fjwt, {
    secret: process.env.JWT_SECRET!,
  });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const blacklisted = await app.redis.get(`bl:${token}`);
        if (blacklisted) {
          return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Token has been invalidated' });
        }
      }
    } catch (err) {
      reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });

  app.decorate('authenticatePlatform', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const payload = request.user as JWTPayload;
      if (!payload.platformUserId || !payload.platformRole) {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Platform access required' });
      }
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const blacklisted = await app.redis.get(`bl:${token}`);
        if (blacklisted) {
          return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Token has been invalidated' });
        }
      }
    } catch (err) {
      reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });

  app.decorate('requirePlatformRole', (...roles: PlatformRole[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as JWTPayload;
      if (!payload.platformRole || !roles.includes(payload.platformRole)) {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Insufficient platform privileges' });
      }
    };
  });
});
