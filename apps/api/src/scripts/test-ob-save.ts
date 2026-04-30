import { createDb } from '@runq/db';
import { OpeningBalanceService } from '../modules/settings/opening-balance.service';

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const svc = new OpeningBalanceService(db, 'a0365382-afa0-48b6-92cd-4db615a7d98b');
  try {
    const r = await svc.save({
      effectiveDate: '2026-03-31',
      customers: [{ id: 'b6b8bb9b-5106-4254-a45e-9850f226272c', amount: 3424 }],
      vendors: [],
    });
    console.log('OK', r);
  } catch (e: unknown) {
    const err = e as Error;
    console.error('ERR', err.message);
    console.error(err.stack?.split('\n').slice(0, 8).join('\n'));
  }
  await pool.end();
}
main();
