// Reset test data so we can re-run the Phase 1 verification cleanly.
// Removes:
//   - Vaidehi's memberships in everything except her home tenant (demo-company / Vrindavan)
//   - Tenants created by smoke tests (slugs starting with 'acme-' or 'beta-')
//   - Users created by smoke tests (Rohit at Acme, Priya at Sharma, Vinay at Beta Foods)
//   - All open or accepted tenant_invites
// Safe to re-run.
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  // 1. Find Vaidehi
  const { rows: [vaidehi] } = await c.query(`SELECT id FROM users WHERE email = $1`, ['vaidehi@vrindavandairy.com']);
  if (!vaidehi) { console.log('vaidehi not found — nothing to reset'); process.exit(0); }

  // 2. Find Vrindavan tenant id
  const { rows: [vrindavan] } = await c.query(`SELECT id FROM tenants WHERE slug = 'demo-company'`);
  if (!vrindavan) { console.error('vrindavan tenant not found'); process.exit(1); }

  // 3. Drop Vaidehi's memberships in all tenants except Vrindavan
  const r1 = await c.query(
    `DELETE FROM user_tenants WHERE user_id = $1 AND tenant_id != $2 RETURNING tenant_id`,
    [vaidehi.id, vrindavan.id],
  );
  console.log(`removed ${r1.rowCount} stray memberships for vaidehi`);

  // 4. Wipe ALL tenant_invites (used + open) — they're all test data
  const r2 = await c.query(`DELETE FROM tenant_invites RETURNING token`);
  console.log(`removed ${r2.rowCount} test invites`);

  // 5. Drop test tenants (slugs from smoke tests)
  const TEST_TENANT_SLUGS = ['acme-test-1', 'acme-pvt-ltd', 'beta-foods'];
  for (const slug of TEST_TENANT_SLUGS) {
    const { rows: [t] } = await c.query(`SELECT id, name FROM tenants WHERE slug = $1`, [slug]);
    if (!t) continue;
    // Cascade-delete: user_tenants has ON DELETE CASCADE on tenant_id
    // Other tables (sales_invoices etc) are safer left intact — test tenants
    // shouldn't have written much data anyway. We just nuke the tenant row;
    // FK errors will tell us if any module needs cleanup first.
    try {
      await c.query(`DELETE FROM tenants WHERE id = $1`, [t.id]);
      console.log(`removed test tenant: ${t.name} (${slug})`);
    } catch (err) {
      console.log(`  could not remove ${slug} (has data): ${err.message.split('\n')[0]}`);
    }
  }

  // 6. Drop test users (created by smoke tests)
  const TEST_EMAILS = [
    'rohit@acme-test-1.com',
    'rohit@acme.com',
    'vinay@betafoods.in',
    'priya-flowc@sharma-ca.in',
    'priya@sharma-ca.in',
  ];
  for (const email of TEST_EMAILS) {
    const r = await c.query(`DELETE FROM users WHERE email = $1 RETURNING email`, [email]);
    if (r.rowCount > 0) console.log(`removed test user: ${email}`);
  }

  // 7. Show final state
  const { rows: final } = await c.query(
    `SELECT t.name AS tenant, ut.role
     FROM user_tenants ut
     JOIN tenants t ON t.id = ut.tenant_id
     WHERE ut.user_id = $1`,
    [vaidehi.id],
  );
  console.log('\nvaidehi now belongs to:');
  console.table(final);
} finally {
  await c.end();
}
