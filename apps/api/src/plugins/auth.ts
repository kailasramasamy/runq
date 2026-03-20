import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fjwt from '@fastify/jwt';
import { JWTPayload } from '@runq/types';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
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
    } catch (err) {
      reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });
});
