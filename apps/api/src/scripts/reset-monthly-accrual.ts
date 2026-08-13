/**
 * Hand a leave type over from upfront to monthly accrual.
 *
 * Switching a type's accrual_mode doesn't touch balances that were already
 * provisioned: they hold the old annual quota and `last_accrued_month = 12`,
 * which reads as "fully accrued for the year". The scheduler skips them
 * forever, so the monthly rate and any max_balance cap never take effect —
 * the balance just sits at whatever the upfront quota happened to be.
 *
 * This clears those rows back to zero and rewinds `last_accrued_month` to the
 * month before accrual should begin (the joining month for someone who joined
 * this year, January otherwise), then credits up through `--through`.
 *
 * Destructive: accrued days are recomputed from the monthly rate, so a balance
 * that was inflated by the old quota will drop. Days already *used* are left
 * untouched. Deliberately a script and not a migration — no tenant should get
 * this by surprise on a deploy.
 *
 * Usage (from apps/api):
 *   tsx --env-file=../../.env src/scripts/reset-monthly-accrual.ts <TENANT_ID> <CODE> [--through=8] [--apply]
 *
 * Without --apply it prints what would change and exits.
 */
import { and, eq, sql } from 'drizzle-orm';
import { createDb, leaveBalances, leaveTypes, employees } from '@runq/db';
import { LeaveAccrualService } from '../modules/hr/leave-accrual.service';

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}

async function main() {
  const [tenantId, code] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required (--env-file)');
  if (!tenantId || !code) {
    throw new Error('Usage: reset-monthly-accrual.ts <TENANT_ID> <LEAVE_TYPE_CODE> [--through=N] [--apply]');
  }
  const year = new Date().getUTCFullYear();
  const through = Number(arg('through') ?? new Date().getUTCMonth() + 1);
  const apply = process.argv.includes('--apply');

  const { db, pool } = createDb(process.env.DATABASE_URL);
  try {
    const [type] = await db
      .select()
      .from(leaveTypes)
      .where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.code, code)))
      .limit(1);
    if (!type) throw new Error(`No leave type ${code} in tenant ${tenantId}`);
    if (type.accrualMode !== 'monthly') {
      throw new Error(`${code} is '${type.accrualMode}', not monthly — nothing to reset`);
    }

    const rows = await db
      .select({
        id: leaveBalances.id,
        accrued: leaveBalances.accrued,
        used: leaveBalances.used,
        employeeCode: employees.employeeCode,
        joiningDate: employees.joiningDate,
      })
      .from(leaveBalances)
      .innerJoin(employees, eq(employees.id, leaveBalances.employeeId))
      .where(and(
        eq(leaveBalances.tenantId, tenantId),
        eq(leaveBalances.leaveTypeId, type.id),
        eq(leaveBalances.year, year),
      ));

    console.log(`${code}: ${Number(type.daysPerYear) / 12}/month, cap ${type.maxBalance ?? 'none'}`);
    console.log(`${rows.length} balance row(s) for ${year}, crediting through month ${through}\n`);
    for (const r of rows) {
      const join = new Date(r.joiningDate);
      const startMonth = join.getUTCFullYear() < year ? 0 : join.getUTCMonth();
      console.log(`  ${r.employeeCode}: accrued ${r.accrued} → 0, restart from month ${startMonth + 1} (used ${r.used} kept)`);
    }
    if (!apply) {
      console.log('\nDry run — pass --apply to write.');
      return;
    }

    for (const r of rows) {
      const join = new Date(r.joiningDate);
      const startMonth = join.getUTCFullYear() < year ? 0 : join.getUTCMonth();
      await db
        .update(leaveBalances)
        .set({ accrued: '0', lastAccruedMonth: startMonth, updatedAt: new Date() })
        .where(eq(leaveBalances.id, r.id));
    }
    const summary = await new LeaveAccrualService(db).accrueUpThrough(tenantId, year, through);
    console.log(`\nAccrued: ${summary.rowsUpdated} row(s), +${summary.daysAdded} day(s)`);

    const after = await db
      .select({
        employeeCode: employees.employeeCode,
        available: sql<string>`${leaveBalances.opening} + ${leaveBalances.accrued} - ${leaveBalances.used}`,
      })
      .from(leaveBalances)
      .innerJoin(employees, eq(employees.id, leaveBalances.employeeId))
      .where(and(
        eq(leaveBalances.tenantId, tenantId),
        eq(leaveBalances.leaveTypeId, type.id),
        eq(leaveBalances.year, year),
      ));
    for (const r of after) console.log(`  ${r.employeeCode}: ${r.available} available`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
