/**
 * Generate daily AR invoices for "Vrindavan Platform Customers" from the
 * monthly GST sales CSV — one invoice per day, one line per product sold.
 *
 * Mirrors last month's (April) invoices exactly:
 *   - description  = `${Product} (${UOM})`
 *   - uom / pack_size_uqc = canonical UQC (ML/GMS/KGS/LTR/NOS)
 *   - unit_price   = CSV "Unit Price (excl GST)" column (verbatim)
 *   - HSN + tax rate + tax category come from the CANONICAL per-product map
 *     (derived from April's own invoices) — the CSV "GST %" column is ignored,
 *     exactly as April did (e.g. buttermilk → 5%, salt → 0%, balms → 12%,
 *     body-wash → 18%).
 *   - Each line's gross = CSV "Total Amount" (= qty × MRP, the wallet amount).
 *     taxable value = gross / (1 + rate); tax = gross − taxable, split CGST/SGST
 *     (intra-state KA). So every line totals back to the exact wallet amount and
 *     the invoice total equals the day's "Total Order Value".
 *   - status = paid, amount_received = total, balance_due = 0 (prepaid wallet).
 *   - invoice_number continues the FY sequence; invoice_sequences is advanced.
 *
 * Usage (dry-run prints a per-day summary, writes nothing):
 *   DATABASE_URL=... tsx apps/api/scripts/gen-vrindavan-platform-invoices.ts
 * To actually write:
 *   DATABASE_URL=... COMMIT=1 tsx apps/api/scripts/gen-vrindavan-platform-invoices.ts
 */

import { readFileSync } from 'node:fs';
import { createDb } from '@runq/db';
import { sql } from 'drizzle-orm';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b'; // Vrindavan Dairy LLP
const CUSTOMER_ID = 'f6b0b0e2-bd94-44ba-a11a-ef3e2ecfd34b'; // Vrindavan Platform Customers
const FY = '2627';
const GST_CSV = '/Users/vaidehi/Projects/misc/vrindavan-sales-data/sales-gst-2026-05.csv';
const SUMMARY_CSV = '/Users/vaidehi/Projects/misc/vrindavan-sales-data/sales-2026-05.csv';

type Cat = 'taxable' | 'exempt';
type Tax = { hsn: string; cat: Cat; rate: number };

// Canonical product → (HSN8, tax category, rate). Source of truth = April's
// invoices for this customer. Four names new in May are mapped by family.
const TAX_MAP: Record<string, Tax> = {
  'A2 Desi Cow Butter': { hsn: '04051000', cat: 'taxable', rate: 5 },
  'A2 Desi Cow Buttermilk (Plain)': { hsn: '04039090', cat: 'taxable', rate: 5 },
  'A2 Desi Cow Curd': { hsn: '04031000', cat: 'taxable', rate: 5 },
  'A2 Desi Cow Ghee': { hsn: '04059020', cat: 'taxable', rate: 5 }, // new in May
  'A2 Desi Cow Milk': { hsn: '04012000', cat: 'exempt', rate: 0 },
  'A2 Desi Cow Paneer': { hsn: '04061000', cat: 'exempt', rate: 0 },
  'Black Pepper': { hsn: '09041110', cat: 'taxable', rate: 5 }, // new in May
  'Buffalo Curd': { hsn: '04031000', cat: 'taxable', rate: 5 },
  'Buffalo Ghee': { hsn: '04059020', cat: 'taxable', rate: 5 },
  'Buffalo Milk': { hsn: '04012000', cat: 'exempt', rate: 0 },
  'Cardamon (Elakki)': { hsn: '090830', cat: 'taxable', rate: 5 },
  'Cashew Diced': { hsn: '08013220', cat: 'taxable', rate: 5 },
  'Cashew Whole': { hsn: '08013210', cat: 'taxable', rate: 5 },
  'Chakki Atta - 100% Whole Wheat': { hsn: '11010000', cat: 'taxable', rate: 5 },
  'Chia Seeds': { hsn: '12079990', cat: 'taxable', rate: 5 },
  'Cold  Caugh & Headache Roll On': { hsn: '30049011', cat: 'taxable', rate: 12 },
  'Cold Pressed Castor Oil': { hsn: '15153010', cat: 'taxable', rate: 5 },
  'Cold Pressed Coconut Oil': { hsn: '15131100', cat: 'taxable', rate: 5 },
  'Cold Pressed Groundnut Oil': { hsn: '15081000', cat: 'taxable', rate: 5 },
  'Cold Pressed Mustard Oil': { hsn: '15141190', cat: 'taxable', rate: 5 },
  'Cold Pressed Sesame (Gingly) Oil': { hsn: '15155010', cat: 'taxable', rate: 5 },
  'Cold Pressed Sunflower Oil': { hsn: '15121110', cat: 'taxable', rate: 5 },
  'Cold and Headache Balm - Shoola Hara': { hsn: '30049011', cat: 'taxable', rate: 12 },
  'Cow Dung Cake': { hsn: '31010099', cat: 'taxable', rate: 5 },
  'Farm Fresh Natural Cow Milk': { hsn: '04012000', cat: 'exempt', rate: 0 },
  'Farm Fresh Natural Curd': { hsn: '04031000', cat: 'taxable', rate: 5 },
  'Farm Fresh Natural Paneer': { hsn: '04061000', cat: 'exempt', rate: 0 },
  'Farm Fresh Traditional Cow Ghee': { hsn: '04059020', cat: 'taxable', rate: 5 },
  'Farm Fresh Traditional Cow Ghee (4Kg)': { hsn: '04059020', cat: 'taxable', rate: 5 },
  'Hand/Body Wash - Swachha': { hsn: '34011190', cat: 'taxable', rate: 18 },
  'Himalayan Rock Salt (Powder)': { hsn: '25010020', cat: 'taxable', rate: 0 },
  'Horse Gram - Kulthi Dal': { hsn: '07139090', cat: 'taxable', rate: 5 }, // new in May
  'Idli Rice - Ponmani Gundu': { hsn: '10063090', cat: 'taxable', rate: 5 },
  'Methi (Fenugreek)': { hsn: '09109929', cat: 'taxable', rate: 5 },
  'Muscle & Joint Pain Balm - Vaata Haara': { hsn: '30049011', cat: 'taxable', rate: 12 },
  'Organic Jaggery Powder': { hsn: '17011490', cat: 'taxable', rate: 5 },
  'Ponni Hand Pounded Rice': { hsn: '10063090', cat: 'taxable', rate: 5 }, // new in May
  'Premium Crystal Sugar': { hsn: '17019100', cat: 'taxable', rate: 5 },
  'Premium Sona Masuri Rice': { hsn: '10063090', cat: 'taxable', rate: 5 },
  'Pumpkin Seeds': { hsn: '12079990', cat: 'taxable', rate: 5 },
  'Ragi Flour': { hsn: '11029090', cat: 'taxable', rate: 5 },
  'Raisin Yellow': { hsn: '08062010', cat: 'taxable', rate: 5 },
  'Toor Dal': { hsn: '07139090', cat: 'taxable', rate: 5 },
  'Urad Dal Round (Gota)': { hsn: '07139090', cat: 'taxable', rate: 5 },
};

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Normalise a CSV date to ISO. Handles "DD/MM/YY", "DD/MM/YYYY" and "YYYY-MM-DD". */
function toIso(raw: string): string {
  const v = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) throw new Error(`Unrecognised date "${raw}"`);
  const [, dd, mm, yy] = m;
  const year = yy!.length === 2 ? `20${yy}` : yy!;
  return `${year}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`;
}

/** "500ml" → {uqc:'ML', pack:500}; "1 Litre" → {uqc:'LTR', pack:1}; "9 count" → {uqc:'NOS', pack:9}. */
function parseUom(uom: string): { uqc: string; pack: number } {
  const m = uom.trim().match(/^([\d.]+)\s*(ml|g|kg|litre|l|count|nos)\s*$/i);
  if (!m) throw new Error(`Cannot parse UOM "${uom}"`);
  const pack = parseFloat(m[1]!);
  const unit = m[2]!.toLowerCase();
  const uqc = unit === 'ml' ? 'ML'
    : unit === 'g' ? 'GMS'
    : unit === 'kg' ? 'KGS'
    : (unit === 'litre' || unit === 'l') ? 'LTR'
    : 'NOS';
  return { uqc, pack };
}

type Line = {
  description: string; uqc: string; pack: number; qty: number; unitPrice: number;
  amount: number; cgst: number; sgst: number; rate: number; cat: Cat; hsn: string;
};
type Day = { date: string; lines: Line[]; subtotal: number; tax: number; total: number };

function buildLine(cols: string[]): Line {
  const [, product, uom, , qtyS, unitPriceS, , , , totalS] = cols;
  const tax = TAX_MAP[product!];
  if (!tax) throw new Error(`No canonical tax mapping for product "${product}"`);
  const { uqc, pack } = parseUom(uom!);
  const qty = parseFloat(qtyS!);
  const gross = parseFloat(totalS!); // CSV "Total Amount" = qty × MRP (wallet amount)
  const amount = tax.rate > 0 ? r2(gross / (1 + tax.rate / 100)) : gross;
  const totalTax = r2(gross - amount);
  const cgst = r2(totalTax / 2);
  const sgst = r2(totalTax - cgst);
  return {
    description: `${product} (${uom})`, uqc, pack, qty,
    unitPrice: parseFloat(unitPriceS!), amount, cgst, sgst,
    rate: tax.rate, cat: tax.cat, hsn: tax.hsn,
  };
}

function loadDays(): Day[] {
  const rows = readFileSync(GST_CSV, 'utf8').split('\n').slice(2)
    .map((l) => l.trim()).filter(Boolean).map((l) => l.split(','));
  const byDate = new Map<string, Line[]>();
  for (const cols of rows) {
    if (!cols[0] || !/^[\d/-]+$/.test(cols[0])) continue;
    const date = toIso(cols[0]);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(buildLine(cols));
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, lines]) => {
    const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0));
    const tax = r2(lines.reduce((s, l) => s + l.cgst + l.sgst, 0));
    return { date, lines, subtotal, tax, total: r2(subtotal + tax) };
  });
}

/** Daily Number of Orders + Total Order Value from the summary CSV, for the note + reconciliation. */
function loadSummary(): Map<string, { orders: number; value: number }> {
  const out = new Map<string, { orders: number; value: number }>();
  for (const l of readFileSync(SUMMARY_CSV, 'utf8').split('\n').slice(2)) {
    // The file concatenates a 3-column daily-summary block with a wide raw-order
    // dump; only the summary rows (exactly 3 numeric-ish columns) are wanted.
    const parts = l.trim().split(',');
    if (parts.length !== 3) continue;
    const [date, orders, value] = parts;
    if (!/^[\d/-]+$/.test(date!) || !/^\d+$/.test(orders!) || !/^[\d.]+$/.test(value!)) continue;
    out.set(toIso(date), { orders: parseInt(orders!, 10), value: parseFloat(value!) });
  }
  return out;
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const commit = process.env.COMMIT === '1';
  const { db, pool } = createDb(dbUrl);
  const days = loadDays();
  const summary = loadSummary();

  console.log(`\n=== Vrindavan Platform daily invoices — ${days.length} days ===`);
  console.log(`Mode: ${commit ? 'COMMIT (writing to DB)' : 'DRY-RUN (no writes)'}\n`);
  console.log('Date        Lines  Subtotal      Tax      Total   vs OrderValue  Orders');
  let mismatch = 0;
  for (const d of days) {
    const s = summary.get(d.date);
    const diff = s ? r2(d.total - s.value) : NaN;
    if (s && Math.abs(diff) > 0.5) mismatch++;
    console.log(
      `${d.date}  ${String(d.lines.length).padStart(4)}  ${d.subtotal.toFixed(2).padStart(10)}  ${d.tax.toFixed(2).padStart(7)}  ${d.total.toFixed(2).padStart(9)}  ${(s ? diff.toFixed(2) : 'n/a').padStart(12)}  ${String(s?.orders ?? '?').padStart(6)}`,
    );
  }
  const grand = r2(days.reduce((s, d) => s + d.total, 0));
  console.log(`\nGrand total: ₹${grand.toFixed(2)}  |  reconciliation mismatches (>₹0.50): ${mismatch}`);

  if (!commit) {
    console.log('\nDry-run only. Re-run with COMMIT=1 to write.');
    await pool.end();
    return;
  }
  if (mismatch > 0) throw new Error(`Aborting: ${mismatch} day(s) do not reconcile to Total Order Value`);

  await db.transaction(async (tx) => {
    const exists = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM sales_invoices
      WHERE customer_id = ${CUSTOMER_ID} AND invoice_date >= '2026-05-01' AND invoice_date <= '2026-05-31'`);
    if ((exists.rows[0]?.n ?? 0) > 0) throw new Error('May invoices already exist for this customer — aborting.');

    const seqRow = await tx.execute<{ last_sequence: number }>(sql`
      SELECT last_sequence FROM invoice_sequences
      WHERE tenant_id = ${TENANT_ID} AND financial_year = ${FY} FOR UPDATE`);
    let seq = seqRow.rows[0]?.last_sequence ?? 0;

    for (const d of days) {
      seq += 1;
      const invNo = `26${String(seq).padStart(4, '0')}`;
      const s = summary.get(d.date)!;
      const cgst = r2(d.lines.reduce((a, l) => a + l.cgst, 0));
      const sgst = r2(d.lines.reduce((a, l) => a + l.sgst, 0));
      const inv = await tx.execute<{ id: string }>(sql`
        INSERT INTO sales_invoices (
          tenant_id, invoice_number, customer_id, invoice_date, due_date,
          subtotal, tax_amount, total_amount, amount_received, balance_due, status,
          notes, place_of_supply, place_of_supply_code, is_inter_state,
          cgst_amount, sgst_amount, igst_amount, cess_amount, reverse_charge
        ) VALUES (
          ${TENANT_ID}, ${invNo}, ${CUSTOMER_ID}, ${d.date}, ${d.date},
          ${d.subtotal}, ${d.tax}, ${d.total}, ${d.total}, 0, 'paid',
          ${`Daily Vrindavan Platform wallet sales — ${s.orders} orders`},
          'Karnataka', '29', false, ${cgst}, ${sgst}, 0, 0, false
        ) RETURNING id`);
      const invoiceId = inv.rows[0]!.id;

      for (const l of d.lines) {
        const half = l.cat === 'taxable' ? r2(l.rate / 2) : 0;
        await tx.execute(sql`
          INSERT INTO sales_invoice_items (
            tenant_id, invoice_id, description, uom, pack_size_value, pack_size_uqc,
            quantity, unit_price, amount, hsn_sac_code, tax_category, tax_rate,
            cgst_rate, cgst_amount, sgst_rate, sgst_amount, igst_rate, igst_amount,
            cess_rate, cess_amount
          ) VALUES (
            ${TENANT_ID}, ${invoiceId}, ${l.description}, ${l.uqc}, ${l.pack}, ${l.uqc},
            ${l.qty}, ${l.unitPrice}, ${l.amount}, ${l.hsn}, ${l.cat}, ${l.rate},
            ${half}, ${l.cgst}, ${half}, ${l.sgst}, 0, 0, 0, 0
          )`);
      }
      console.log(`  ${invNo}  ${d.date}  ₹${d.total.toFixed(2)}  (${d.lines.length} lines)`);
    }

    await tx.execute(sql`
      UPDATE invoice_sequences SET last_sequence = ${seq}, updated_at = now()
      WHERE tenant_id = ${TENANT_ID} AND financial_year = ${FY}`);
    console.log(`\nDone. Sequence advanced to ${seq}.`);
  });

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
