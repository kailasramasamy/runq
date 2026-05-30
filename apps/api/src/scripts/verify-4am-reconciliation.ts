/**
 * Direct DB verification of the 4am reconciliation — bypasses the GSTR-1
 * generator's HSN aggregation (which crashes on a pre-existing data issue
 * with curd items: HSN 04031000 has mixed LTR/KGS/GMS line-level UoMs).
 *
 * Reports the exact rows that will land in May GSTR-1's b2b, b2ba and cdn
 * sections, scoped to 4am, plus a net-delta sanity check.
 *
 * Usage: pnpm --filter @runq/api exec tsx src/scripts/verify-4am-reconciliation.ts
 */
import { createDb } from '@runq/db';
import { sql } from 'drizzle-orm';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const CUSTOMER_ID = '22a2b7da-2adf-484d-8496-962897132d30';

async function main(): Promise<void> {
  const { db } = createDb(process.env.DATABASE_URL!);
  await db.execute(sql.raw(`SET app.current_tenant_id = '${TENANT_ID}'`));

  console.log('━'.repeat(70));
  console.log('4am reconciliation verification (May 2026 GSTR-1 readiness)');
  console.log('━'.repeat(70));

  // 1) Table 9A (B2BA) — missed invoices: invoice_date BETWEEN filing-start AND May AND not in any filed return.
  // Filing start is tenant.settings.gstFilingStartPeriod — Vrindavan = '042026' → '2026-04-01'. Below that,
  // OB-* opening balance entries live and are correctly excluded from GST reporting.
  const b2ba = await db.execute<{ invoice_number: string; invoice_date: string; total_amount: string; status: string }>(sql`
    SELECT si.invoice_number, si.invoice_date::text, si.total_amount, si.status
    FROM sales_invoices si
    WHERE si.tenant_id = ${TENANT_ID}
      AND si.customer_id = ${CUSTOMER_ID}
      AND si.invoice_date BETWEEN '2026-04-01' AND '2026-04-30'
      AND si.status IN ('sent','partially_paid','paid','overdue')
      AND NOT EXISTS (
        SELECT 1 FROM gst_return_invoices gri
        JOIN gst_returns gr ON gr.id = gri.return_id
        WHERE gri.invoice_id = si.id AND gr.status = 'filed'
      )
    ORDER BY si.invoice_number
  `);
  const b2baRows = ((b2ba as unknown) as { rows: any[] }).rows ?? (b2ba as unknown as any[]);
  console.log(`\nTable 9A (B2BA) — missed-invoice amendments [${b2baRows.length}]:`);
  let b2baTotal = 0;
  for (const r of b2baRows) {
    console.log(`  ${r.invoice_number}  date=${r.invoice_date}  value=₹${Number(r.total_amount).toFixed(2)}  status=${r.status}`);
    b2baTotal += Number(r.total_amount);
  }

  // 2) Table 9B (CDN) — credit notes issued in May for this customer
  const cn = await db.execute<{ credit_note_number: string; issue_date: string; amends_invoice_number: string; amount: string; cgst_amount: string; sgst_amount: string; igst_amount: string; status: string }>(sql`
    SELECT credit_note_number, issue_date::text, amends_invoice_number,
           amount, cgst_amount, sgst_amount, igst_amount, status::text
    FROM credit_notes
    WHERE tenant_id = ${TENANT_ID}
      AND customer_id = ${CUSTOMER_ID}
      AND issue_date BETWEEN '2026-05-01' AND '2026-05-31'
      AND status IN ('issued', 'adjusted')
    ORDER BY credit_note_number
  `);
  const cnRows = ((cn as unknown) as { rows: any[] }).rows ?? (cn as unknown as any[]);
  console.log(`\nTable 9B (CDN) — credit notes [${cnRows.length}]:`);
  let cnTotal = 0;
  for (const r of cnRows) {
    console.log(`  ${r.credit_note_number}  date=${r.issue_date}  refInvoice=${r.amends_invoice_number ?? '-'}  value=₹${Number(r.amount).toFixed(2)}  cgst=₹${Number(r.cgst_amount).toFixed(2)}  sgst=₹${Number(r.sgst_amount).toFixed(2)}  status=${r.status}`);
    cnTotal += Number(r.amount);
  }

  // 3) Table 9B (CDN) — customer debit notes issued in May for this customer
  const dn = await db.execute<{ debit_note_number: string; issue_date: string; amends_invoice_number: string; amount: string; cgst_amount: string; sgst_amount: string; status: string }>(sql`
    SELECT debit_note_number, issue_date::text, amends_invoice_number,
           amount, cgst_amount, sgst_amount, status::text
    FROM customer_debit_notes
    WHERE tenant_id = ${TENANT_ID}
      AND customer_id = ${CUSTOMER_ID}
      AND issue_date BETWEEN '2026-05-01' AND '2026-05-31'
      AND status IN ('issued', 'adjusted')
    ORDER BY debit_note_number
  `);
  const dnRows = ((dn as unknown) as { rows: any[] }).rows ?? (dn as unknown as any[]);
  console.log(`\nTable 9B (CDN) — customer debit notes [${dnRows.length}]:`);
  let dnTotal = 0;
  for (const r of dnRows) {
    console.log(`  ${r.debit_note_number}  date=${r.issue_date}  refInvoice=${r.amends_invoice_number ?? '-'}  value=₹${Number(r.amount).toFixed(2)}  status=${r.status}`);
    dnTotal += Number(r.amount);
  }

  // 4) Net delta sanity check
  console.log('\n' + '═'.repeat(70));
  console.log('Net delta sanity check');
  console.log('═'.repeat(70));
  console.log(`  Missed-invoice (B2BA):   +₹${b2baTotal.toFixed(2)}`);
  console.log(`  Customer DN total:       +₹${dnTotal.toFixed(2)}`);
  console.log(`  Credit note total:       -₹${cnTotal.toFixed(2)}`);
  const net = b2baTotal + dnTotal - cnTotal;
  console.log(`  ──────────────────────────────────`);
  console.log(`  Net delta:                ₹${net.toFixed(2)}`);
  console.log(`  Expected (4am paid - runq booked, before recon):  ₹12,418.68`);
  console.log(`  Difference from expected: ₹${(net - 12418.68).toFixed(2)}  ${Math.abs(net - 12418.68) < 1 ? '✅' : '⚠️  investigate'}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
