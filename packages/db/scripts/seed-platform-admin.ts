/**
 * Seed an initial super_admin platform user.
 *
 * Usage:
 *   PLATFORM_ADMIN_EMAIL=admin@runq.in PLATFORM_ADMIN_PASSWORD=secret \
 *     PLATFORM_ADMIN_NAME="Super Admin" \
 *     DATABASE_URL=... npx tsx scripts/seed-platform-admin.ts
 */

import { Client } from 'pg';
import argon2 from 'argon2';

const DATABASE_URL = process.env.DATABASE_URL;
const email = process.env.PLATFORM_ADMIN_EMAIL;
const password = process.env.PLATFORM_ADMIN_PASSWORD;
const name = process.env.PLATFORM_ADMIN_NAME ?? 'Super Admin';

if (!DATABASE_URL || !email || !password) {
  console.error('ERROR: DATABASE_URL, PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD required');
  process.exit(1);
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const hash = await argon2.hash(password!);
    const { rows } = await client.query(
      `INSERT INTO platform_users (email, name, password_hash, role)
       VALUES ($1, $2, $3, 'super_admin')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, updated_at = NOW()
       RETURNING id, email, role`,
      [email, name, hash],
    );
    console.log('Platform admin seeded:', rows[0]);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
