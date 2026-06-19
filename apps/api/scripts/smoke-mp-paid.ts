/**
 * Smoke test for per-farmer payout disbursement tracking against runq_dev.
 * Creates a throwaway cycle, marks lines paid, asserts the list aggregates,
 * then deletes the cycle so the DB is left clean.
 *
 * Usage: tsx --env-file=../../.env apps/api/scripts/smoke-mp-paid.ts
 */
import { createDb, mpPayoutCycles, mpPayoutLines, mpPayoutDeductions } from '@runq/db';
import { and, eq, inArray } from 'drizzle-orm';
import { PayoutService } from '../src/modules/milk-procurement/payout.service';

const TENANT = 'a0365382-afa0-48b6-92cd-4db615a7d98b'; // Vrindavan Dairy LLP
const NODE = '7fd4554c-3ec5-4179-9a43-c760cb793c27'; // Kadod VMCC

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function main(): Promise<void> {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const svc = new PayoutService(db, TENANT);

  const cycle = await svc.createCycle({ scopeNodeId: NODE, periodStart: '2026-05-16', periodEnd: '2026-05-31' });
  check('createCycle produced lines', cycle.lines.length > 0, `${cycle.lines.length} farmers`);

  const before = (await svc.listCycles({ scopeNodeId: NODE }, { page: 1, limit: 50 })).data.find((c) => c.id === cycle.id);
  check('list aggregate lineCount matches', before?.lineCount === cycle.lines.length);
  check('list aggregate paidCount starts at 0', before?.paidCount === 0);
  check('list aggregate netTotal > 0', (before?.netTotal ?? 0) > 0, `₹${before?.netTotal}`);

  const [l1, l2] = cycle.lines;
  await svc.markLinePaid(cycle.id, l1!.id, true);
  await svc.markLinePaid(cycle.id, l2!.id, true);
  const after2 = (await svc.listCycles({ scopeNodeId: NODE }, { page: 1, limit: 50 })).data.find((c) => c.id === cycle.id);
  check('paidCount = 2 after marking two', after2?.paidCount === 2, `paidCount=${after2?.paidCount}`);
  check('paidTotal > 0', (after2?.paidTotal ?? 0) > 0, `₹${after2?.paidTotal}`);

  await svc.markLinePaid(cycle.id, l1!.id, false);
  const afterUnpay = (await svc.listCycles({ scopeNodeId: NODE }, { page: 1, limit: 50 })).data.find((c) => c.id === cycle.id);
  check('unpay drops paidCount to 1', afterUnpay?.paidCount === 1, `paidCount=${afterUnpay?.paidCount}`);

  const all = await svc.markAllLinesPaid(cycle.id, true);
  const afterAll = (await svc.listCycles({ scopeNodeId: NODE }, { page: 1, limit: 50 })).data.find((c) => c.id === cycle.id);
  check('markAll updated all lines', all.updated === cycle.lines.length, `${all.updated}`);
  check('paidCount = lineCount after markAll', afterAll?.paidCount === afterAll?.lineCount);

  // cleanup — leave the DB as we found it
  const lineIds = cycle.lines.map((l) => l.id);
  await db.delete(mpPayoutDeductions).where(inArray(mpPayoutDeductions.payoutLineId, lineIds));
  await db.delete(mpPayoutLines).where(eq(mpPayoutLines.payoutCycleId, cycle.id));
  await db.delete(mpPayoutCycles).where(and(eq(mpPayoutCycles.tenantId, TENANT), eq(mpPayoutCycles.id, cycle.id)));
  await pool.end();
  console.log(`\n  ${fail === 0 ? '✓ all passed' : `✗ ${fail} failed`} (${pass}/${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
