/**
 * Process the seeded Vrindavan draft payroll runs so the UI shows populated
 * payslips and totals. Idempotent — re-runs the processor on any drafts or
 * already-processed runs (which is what the API endpoint does).
 *
 * Run from apps/api: pnpm tsx --env-file=../../.env scripts/process-vrindavan-payroll.ts
 */

import { createDb } from '@runq/db';
import { eq, and, inArray } from 'drizzle-orm';
import { payrollRuns, users } from '@runq/db';
import { PayrollRunService } from '../src/modules/hr/payroll/payroll-run.service';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b'; // Vrindavan Dairy LLP

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set');
  }
  const { db, pool } = createDb(process.env.DATABASE_URL);

  // Find any user on this tenant to attribute the processing to
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.tenantId, TENANT_ID))
    .limit(1);

  const userId = user?.id ?? '00000000-0000-0000-0000-000000000000';

  const runs = await db
    .select()
    .from(payrollRuns)
    .where(and(
      eq(payrollRuns.tenantId, TENANT_ID),
      inArray(payrollRuns.status, ['draft', 'processed']),
    ));

  if (runs.length === 0) {
    console.log('No draft/processed runs to process.');
    await pool.end();
    return;
  }

  const svc = new PayrollRunService(db, TENANT_ID);
  for (const r of runs) {
    const result = await svc.process(r.id, userId);
    console.log(
      `✓ ${r.year}-${String(r.month).padStart(2, '0')} — employees: ${result.totalEmployees}, ` +
      `gross: ₹${Number(result.totalGross).toLocaleString('en-IN')}, ` +
      `net: ₹${Number(result.totalNet).toLocaleString('en-IN')}`,
    );
  }

  await pool.end();
  console.log('\n✅ Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
