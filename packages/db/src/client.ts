import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export function createDb(connectionString: string) {
  const pool = new Pool({
    connectionString,
    // 30 covers a single /finance/analytics page load (~24 parallel queries)
    // without starving transactional traffic on the same tenant. Override with
    // DB_POOL_MAX in production if needed.
    max: Number(process.env.DB_POOL_MAX ?? 30),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];
