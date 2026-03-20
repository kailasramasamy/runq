import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

export const redisPlugin = fp(async (app: FastifyInstance) => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  redis.on('error', (err) => {
    app.log.error(err, 'Redis connection error');
  });

  app.decorate('redis', redis);

  app.addHook('onClose', async () => {
    await redis.quit();
  });
});
