/**
 * One-shot: create single correct consolidated OB journal entry.
 *
 *   cd apps/api
 *   node --env-file=../../.env --import tsx src/scripts/fix-ob-je.ts
 */
import { createDb } from '@runq/db';
import { GLService } from '../modules/gl/gl.service';

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const gl = new GLService(db, 'a0365382-afa0-48b6-92cd-4db615a7d98b');

  const totalAR = 14528.89;
  const totalAP = 1176960.60;
  const net = totalAR - totalAP;

  const lines: { accountCode: string; debit?: number; credit?: number }[] = [
    { accountCode: '1103', debit: totalAR },
    { accountCode: '2101', credit: totalAP },
  ];
  // net is negative (AP > AR), so debit Retained Earnings
  lines.push({ accountCode: '3002', debit: Math.abs(net) });

  const je = await gl.createJournalEntry({
    date: '2026-03-31',
    description: 'Opening balances as of 2026-03-31 (consolidated)',
    sourceType: 'opening_balance',
    sourceId: 'a0365382-afa0-48b6-92cd-4db615a7d98b',
    lines,
  });

  console.log('Created JE:', je.entryNumber, 'Total:', je.totalDebit);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
