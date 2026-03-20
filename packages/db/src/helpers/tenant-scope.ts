import { Pool, PoolClient } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../schema';

export type DrizzleDb = NodePgDatabase<typeof schema>;

export async function withTenant<T>(
  pool: Pool,
  tenantId: string,
  fn: (db: DrizzleDb) => Promise<T>,
): Promise<T> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query(`SET app.current_tenant_id = $1`, [tenantId]);
    const db = drizzle(client, { schema }) as DrizzleDb;
    return await fn(db);
  } finally {
    await client.query(`RESET app.current_tenant_id`);
    client.release();
  }
}
