/**
 * One-off: untangle two blind-FIFO FreshFirst receipts so each matches its
 * remittance advice. It's a cross-swap (each receipt holds invoices the other
 * needs), so it runs in 3 reallocations through the real ReceiptService:
 *   1. Park R_MAIN on its 23 already-correct invoices  → frees 260870/878/900
 *   2. Fix R_SIB to its 8 advice invoices              → frees R_MAIN's 18
 *   3. Finalize R_MAIN to its full 43 advice invoices
 * Same code path as the app's PUT /ar/receipts/:id/allocations, so GL,
 * invoice status and round-off all post correctly.
 *
 * Usage: DATABASE_URL=... tsx src/scripts/reallocate-freshfirst-remittance.ts
 */
import { createDb, salesInvoices, receiptAllocations } from '@runq/db';
import { and, eq, inArray } from 'drizzle-orm';
import { ReceiptService } from '../modules/ar/receipt.service';

const TID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const R_MAIN = '7da5b052-4b66-48ad-9e65-1a864f7bf2fd'; // ₹2,32,986
const R_SIB = '0a00c56c-119f-4dbc-a90b-15f3be4831e7';  // ₹3,07,472

// R_MAIN's 23 currently-correct invoices — the parking set (step 1).
const MAIN_KEEP_23 = [
  '260864', '260865', '260866', '260867', '260868', '260872', '260873', '260874',
  '260876', '260877', '260880', '260881', '260882', '260883', '260886', '260887',
  '260888', '260890', '260891', '260892', '260893', '260895', '260901',
];
// R_SIB's remittance advice (step 2).
const SIB_8 = ['260870', '260878', '260898', '260899', '260900', '260919', '260920', '260928'];
// R_MAIN's full remittance advice (step 3).
const MAIN_43 = [
  '260864', '260865', '260868', '260867', '260866', '260873', '260872', '260876',
  '260877', '260874', '260880', '260881', '260882', '260883', '260886', '260887',
  '260888', '260891', '260892', '260890', '260893', '260895', '260896', '260901',
  '260902', '260904', '260903', '260907', '260906', '260908', '260910', '260913',
  '260914', '260917', '260916', '260918', '260915', '260927', '260923', '260925',
  '260924', '260926', '260921',
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(url);
  try {
    const allNums = [...new Set([...MAIN_KEEP_23, ...SIB_8, ...MAIN_43])];
    const invs = await db.select({ id: salesInvoices.id, number: salesInvoices.invoiceNumber, total: salesInvoices.totalAmount })
      .from(salesInvoices)
      .where(and(eq(salesInvoices.tenantId, TID), inArray(salesInvoices.invoiceNumber, allNums)));
    const byNum = new Map(invs.map((i) => [i.number, i]));
    for (const n of allNums) if (!byNum.has(n)) throw new Error(`invoice ${n} not found`);

    // Settle each listed invoice in full (its total); aggregate over/under is
    // absorbed as round-off / on-account by the service.
    const lines = (nums: string[]) => nums.map((n) => ({ invoiceId: byNum.get(n)!.id, amount: Number(byNum.get(n)!.total) }));

    // Pre-flight guard: only run from the pre-swap state (R_MAIN still holds 260870).
    const held = await db.select({ n: salesInvoices.invoiceNumber })
      .from(receiptAllocations)
      .innerJoin(salesInvoices, eq(salesInvoices.id, receiptAllocations.invoiceId))
      .where(and(eq(receiptAllocations.tenantId, TID), eq(receiptAllocations.receiptId, R_MAIN)));
    const mainHeld = new Set(held.map((h) => h.n));
    if (!mainHeld.has('260870')) {
      console.log('ABORT: R_MAIN no longer holds 260870 — looks already reconciled or unexpected state. No changes made.');
      return;
    }

    const svc = new ReceiptService(db, TID);
    const report = (r: { amount: string | number; allocations: { amount: string | number }[] }): string => {
      const allocated = r.allocations.reduce((s, a) => s + Number(a.amount), 0);
      const unalloc = Math.round((Number(r.amount) - allocated) * 100) / 100;
      return `${r.allocations.length} allocs · allocated ₹${allocated.toFixed(2)} · on-account ₹${unalloc.toFixed(2)}`;
    };

    console.log('Step 1: park R_MAIN on its 23 correct invoices…');
    console.log('  R_MAIN → ' + report(await svc.reallocate(R_MAIN, lines(MAIN_KEEP_23))));

    console.log('Step 2: fix R_SIB to its 8 advice invoices…');
    console.log('  R_SIB → ' + report(await svc.reallocate(R_SIB, lines(SIB_8))));

    console.log('Step 3: finalize R_MAIN to its 43 advice invoices…');
    console.log('  R_MAIN → ' + report(await svc.reallocate(R_MAIN, lines(MAIN_43))));

    console.log('Done.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
