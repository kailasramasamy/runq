import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { createDb, type Db } from '@runq/db';

declare module 'fastify' {
  interface FastifyInstance {
    pool: Pool;
    db: Db;
  }
}

export const dbPlugin = fp(async (app: FastifyInstance) => {
  const { db, pool } = createDb(process.env.DATABASE_URL!);

  pool.on('error', (err) => {
    app.log.error(err, 'Unexpected pool error');
  });

  app.decorate('pool', pool);
  app.decorate('db', db);

  app.addHook('onClose', async () => {
    await pool.end();
  });
});
