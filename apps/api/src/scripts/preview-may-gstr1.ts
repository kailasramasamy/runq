/**
 * Generate May 2026 GSTR-1 preview for Vrindavan Dairy and dump the key
 * sections (b2b, b2ba, cdn) plus a focused 4am summary. Read-only — does
 * not insert/update gst_returns.
 *
 * Usage: pnpm --filter @runq/api exec tsx src/scripts/preview-may-gstr1.ts
 */
import { createDb } from '@runq/db';
import { sql } from 'drizzle-orm';
import { Gstr1Generator } from '../modules/gst/gstr1-generator';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const FREE_FIRST_GSTIN_PREFIX = '29';   // 4am's POS (Karnataka)
const CUSTOMER_DEBIT_PREFIXES = ['CN-', 'CDN-']; // local note prefixes for 4am fixes
const PERIOD_START = '2026-05-01';
const PERIOD_END   = '2026-05-31';

async function main(): Promise<void> {
  const { db } = createDb(process.env.DATABASE_URL!);
  await db.execute(sql.raw(`SET app.current_tenant_id = '${TENANT_ID}'`));

  const gen = new Gstr1Generator(db, TENANT_ID);
  const { data, classifiedInvoices, classifiedCreditNotes } = await gen.generate(
    PERIOD_START, PERIOD_END, { gstin: '29AALFV5152D1ZZ', stateCode: '29' },
  );

  console.log('━'.repeat(70));
  console.log('May 2026 GSTR-1 preview — Vrindavan Dairy LLP');
  console.log('━'.repeat(70));
  console.log(`Period:    ${PERIOD_START} → ${PERIOD_END}`);
  console.log(`Tenant:    ${TENANT_ID}`);
  console.log('');

  // ─── Summary ────────────────────────────────────────────────────────
  console.log('Section counts:');
  console.log(`  B2B:   ${data.b2b.length}`);
  console.log(`  B2BA:  ${data.b2ba?.length ?? 0}   ← Table 9A amendments (missed invoices)`);
  console.log(`  B2CS:  ${data.b2cs.length}`);
  console.log(`  B2CL:  ${data.b2cl.length}`);
  console.log(`  CDN:   ${data.cdn.length}   ← Table 9B credit/debit notes`);
  console.log(`  NIL:   ${data.nil.length}`);
  console.log(`  HSN:   ${data.hsn.length}`);
  console.log('');

  // ─── 4am-focused detail ─────────────────────────────────────────────
  const b2baFor4am = (data.b2ba ?? []).filter((e) => e.buyerGstin?.startsWith(FREE_FIRST_GSTIN_PREFIX));
  const cdnFor4am  = data.cdn.filter((e) => e.buyerGstin?.startsWith(FREE_FIRST_GSTIN_PREFIX));

  console.log('═'.repeat(70));
  console.log('4am-specific entries');
  console.log('═'.repeat(70));

  console.log(`\nTable 9A (B2BA) — missed-invoice amendments [${b2baFor4am.length}]:`);
  for (const e of b2baFor4am) {
    console.log(`  ${e.invoiceNumber}  date=${e.invoiceDate}  origPeriod=${e.originalPeriod ?? '-'}  value=₹${e.invoiceValue.toFixed(2)}  items=${e.items.length}`);
  }

  console.log(`\nTable 9B (CDN) — credit / customer-debit notes [${cdnFor4am.length}]:`);
  for (const e of cdnFor4am) {
    const flag = e.noteType === 'C' ? 'CN' : 'DN';
    console.log(`  ${flag} ${e.noteNumber}  date=${e.noteDate}  refInvoice=${e.originalInvoiceNumber || '-'}  value=₹${e.noteValue.toFixed(2)}`);
  }

  // ─── Net delta sanity check ─────────────────────────────────────────
  const cnTotal = cdnFor4am.filter((e) => e.noteType === 'C').reduce((s, e) => s + e.noteValue, 0);
  const dnTotal = cdnFor4am.filter((e) => e.noteType === 'D').reduce((s, e) => s + e.noteValue, 0);
  const b2baTotal = b2baFor4am.reduce((s, e) => s + e.invoiceValue, 0);
  const netDelta = b2baTotal + dnTotal - cnTotal;

  console.log('\n═'.repeat(70));
  console.log('Net delta sanity check');
  console.log('═'.repeat(70));
  console.log(`Missed-invoice (B2BA):    +₹${b2baTotal.toFixed(2)}`);
  console.log(`Customer DN total:        +₹${dnTotal.toFixed(2)}`);
  console.log(`Credit note total:        -₹${cnTotal.toFixed(2)}`);
  console.log(`────────────────────────────────────────────`);
  console.log(`Net taxable delta:         ₹${netDelta.toFixed(2)}`);
  console.log(`Expected (4am file - runq): ₹12,418.68 (incl. the ₹0.89 micro-rounding)`);
  console.log('');
  console.log(`Classified: ${classifiedInvoices.length} invoices, ${classifiedCreditNotes.length} credit notes`);
}

main().catch((err) => { console.error(err); process.exit(1); });
