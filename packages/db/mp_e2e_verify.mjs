import { Client } from 'pg';
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const fid = '57c3ae29-c4b9-4ac5-8bb3-30166a1a4779';
  const f = await c.query('SELECT vendor_id, default_milk_type, is_active FROM mp_farmers WHERE id=$1', [fid]);
  console.log('farmer:', JSON.stringify(f.rows[0]));
  const v = await c.query('SELECT name, category, phone, bank_ifsc FROM vendors WHERE id=$1', [f.rows[0].vendor_id]);
  console.log('auto-vendor:', JSON.stringify(v.rows[0]));
  const m = await c.query('SELECT node_id, is_primary, left_on FROM mp_farmer_memberships WHERE farmer_id=$1', [fid]);
  console.log('membership:', JSON.stringify(m.rows));
  await c.end();
})();
