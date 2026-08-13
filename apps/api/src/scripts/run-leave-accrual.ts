/**
 * Run monthly leave accrual on demand.
 *
 * The scheduler only fires on the 1st at 03:30 IST, which makes a leave
 * policy that depends on accrual (monthly quota, max-balance cap) impossible
 * to check without waiting for a month boundary. This runs the same service
 * against a chosen month so the effect is visible immediately.
 *
 * Idempotent, exactly like the scheduler: `last_accrued_month` means
 * re-running for the same month is a no-op, and running for a later month
 * catches up the months in between in one pass.
 *
 * Usage (from apps/api):
 *   tsx --env-file=../../.env src/scripts/run-leave-accrual.ts [month] [year]
 *
 * `month` defaults to the current month, `year` to the current year. Pass a
 * month to simulate time passing — e.g. `... run-leave-accrual.ts 9` credits
 * everyone up through September.
 */
import { createDb } from '@runq/db';
import { LeaveAccrualService } from '../modules/hr/leave-accrual.service';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required (run with --env-file=../../.env)');
  }
  const now = new Date();
  const month = Number(process.argv[2] ?? now.getMonth() + 1);
  const year = Number(process.argv[3] ?? now.getFullYear());
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`month must be 1-12, got ${process.argv[2]}`);
  }

  const { db, pool } = createDb(process.env.DATABASE_URL);
  try {
    const summaries = await new LeaveAccrualService(db).runForAllTenants(year, month);
    const touched = summaries.filter((s) => s.rowsUpdated > 0);
    console.log(`Accrued up through ${year}-${String(month).padStart(2, '0')}`);
    if (touched.length === 0) {
      console.log('  no rows needed accrual (already up to date, or nothing on monthly mode)');
    }
    for (const s of touched) {
      console.log(`  tenant ${s.tenantId}: ${s.rowsUpdated} row(s), +${s.daysAdded} day(s)`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
