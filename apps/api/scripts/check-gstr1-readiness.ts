/**
 * Read-only GSTR-1 readiness check for a tenant + period.
 * Generates the GSTR-1 payload in memory (NO DB writes), runs the validator,
 * and reconciles section totals against the HSN summary and the raw invoices.
 *
 *   DATABASE_URL=... tsx apps/api/scripts/check-gstr1-readiness.ts <TENANT_ID> <MMYYYY>
 */
import { createDb, salesInvoices } from '@runq/db';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { Gstr1Generator } from '../src/modules/gst/gstr1-generator';
import { validateGstr1 } from '../src/modules/gst/gstr1-validator';

const TENANT_ID = process.argv[2]!;
const PERIOD = process.argv[3]!; // MMYYYY

function periodRange(p: string): { start: string; end: string } {
  const m = parseInt(p.slice(0, 2), 10), y = parseInt(p.slice(2), 10);
  const mm = String(m).padStart(2, '0');
  const lastDay = new Date(y, m, 0).getDate(); // day-of-month is TZ-safe
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(lastDay).padStart(2, '0')}` };
}
const r2 = (n: number) => Math.round(n * 100) / 100;

async function main(): Promise<void> {
  if (!TENANT_ID || !PERIOD) throw new Error('Usage: <TENANT_ID> <MMYYYY>');
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const { start, end } = periodRange(PERIOD);

  const profile = { gstin: '', stateCode: '29', gstUsername: '' };
  const gen = new Gstr1Generator(db, TENANT_ID);
  const { data, classifiedInvoices, classifiedCreditNotes } = await gen.generate(start, end, profile);

  // Raw invoice truth from DB for the period
  const [raw] = await db
    .select({
      n: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${salesInvoices.totalAmount}),0)`,
      taxable: sql<number>`coalesce(sum(${salesInvoices.subtotal}),0)`,
      tax: sql<number>`coalesce(sum(${salesInvoices.taxAmount}),0)`,
    })
    .from(salesInvoices)
    .where(and(
      eq(salesInvoices.tenantId, TENANT_ID),
      gte(salesInvoices.invoiceDate, start),
      lte(salesInvoices.invoiceDate, end),
    ));

  const sum = (arr: number[]) => r2(arr.reduce((a, b) => a + b, 0));
  const b2bTax = sum(data.b2b.flatMap((i) => i.items.map((it) => it.cgstAmount + it.sgstAmount + it.igstAmount)));
  const b2bTaxable = sum(data.b2b.flatMap((i) => i.items.map((it) => it.taxableValue)));
  const b2csTax = sum(data.b2cs.map((e) => e.cgstAmount + e.sgstAmount + e.igstAmount));
  const b2csTaxable = sum(data.b2cs.map((e) => e.taxableValue));
  const hsnTax = sum(data.hsn.map((h) => h.cgstAmount + h.sgstAmount + h.igstAmount));
  const hsnTaxable = sum(data.hsn.map((h) => h.taxableValue));
  const nilExempt = sum(data.nil.map((n) => n.nilRatedAmount + n.exemptAmount + n.nonGstAmount));

  const secTax = r2(b2bTax + b2csTax);
  const secTaxable = r2(b2bTaxable + b2csTaxable);

  const errors = validateGstr1(data, PERIOD);

  console.log(`\n=== GSTR-1 readiness — tenant ${TENANT_ID.slice(0, 8)}… period ${PERIOD} (${start}…${end}) ===\n`);
  console.log(`Invoices classified : ${classifiedInvoices.length}   (DB invoices in period: ${raw!.n})`);
  console.log(`Credit notes        : ${classifiedCreditNotes.length}`);
  console.log(`Sections            : B2B=${data.b2b.length}  B2CS=${data.b2cs.length}  B2CL=${data.b2cl.length}  CDN=${data.cdn.length}  EXP=${data.exp.length}  NIL=${data.nil.length}`);
  console.log(`HSN summary rows    : ${data.hsn.length}`);
  console.log(`Doc series (Table13): ${data.docs.length}`);
  console.log('');
  console.log('Reconciliation                 taxable            tax');
  console.log(`  B2B                     ${b2bTaxable.toFixed(2).padStart(14)} ${b2bTax.toFixed(2).padStart(14)}`);
  console.log(`  B2CS                    ${b2csTaxable.toFixed(2).padStart(14)} ${b2csTax.toFixed(2).padStart(14)}`);
  console.log(`  NIL/exempt (non-taxbl)  ${nilExempt.toFixed(2).padStart(14)}`);
  console.log(`  Section total (B2B+B2CS)${secTaxable.toFixed(2).padStart(14)} ${secTax.toFixed(2).padStart(14)}`);
  console.log(`  HSN summary total       ${hsnTaxable.toFixed(2).padStart(14)} ${hsnTax.toFixed(2).padStart(14)}`);
  console.log(`  DB invoices total       ${Number(raw!.taxable).toFixed(2).padStart(14)} ${Number(raw!.tax).toFixed(2).padStart(14)}`);
  console.log('');

  const checks: Array<[string, boolean, string]> = [
    ['All DB invoices classified (none dropped)', classifiedInvoices.length === raw!.n, `${classifiedInvoices.length} vs ${raw!.n}`],
    ['No empty-item B2B (silent-drop risk)', data.b2b.every((i) => i.items.length > 0), `${data.b2b.filter((i) => i.items.length === 0).length} empty`],
    ['Section tax == HSN summary tax', Math.abs(secTax - hsnTax) < 0.5, `Δ ${r2(secTax - hsnTax)}`],
    ['HSN tax == DB tax', Math.abs(hsnTax - Number(raw!.tax)) < 0.5, `Δ ${r2(hsnTax - Number(raw!.tax))}`],
    ['HSN taxable+tax == DB total value', Math.abs(r2(hsnTaxable + hsnTax) - Number(raw!.total)) < 1.0, `Δ ${r2(hsnTaxable + hsnTax - Number(raw!.total))}`],
    ['No 9A/b2ba routing (missed→4A)', !data.b2ba || data.b2ba.length === 0, `b2ba=${data.b2ba?.length ?? 0}`],
    ['Validator: zero errors', errors.length === 0, `${errors.length} errors`],
  ];
  console.log('Checks:');
  for (const [name, ok, detail] of checks) {
    console.log(`  ${ok ? '✅' : '❌'} ${name.padEnd(44)} ${detail}`);
  }

  if (errors.length) {
    console.log('\nValidation errors:');
    for (const e of errors.slice(0, 40)) {
      console.log(`  [${e.section}] ${e.field}: ${e.message}${e.invoiceNumber ? ` (${e.invoiceNumber})` : ''}`);
    }
    if (errors.length > 40) console.log(`  … and ${errors.length - 40} more`);
  }

  const allOk = checks.every(([, ok]) => ok);
  console.log(`\n${allOk ? '✅ READY — GSTR-1 generates clean and reconciles.' : '❌ NOT READY — see failed checks above.'}\n`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
