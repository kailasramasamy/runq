/**
 * Smoke-test the MP billing WhatsApp templates without creating any cycle/bill.
 *
 * Sends a sample VMCC bill notice + farmer bill notice to a test phone, using
 * the SAME production code path (Interakt provider, PDF token signer, format
 * helpers) AND the same services the PDFs render from — so the message body and
 * the attached PDF always agree:
 *   - VMCC bill  → VmccBillService.billStatementData (priced dispatches)
 *   - farmer     → StatementService.forFarmer (pours)
 * A real VMCC + period is auto-picked from mp_consignments (dispatch data), and a
 * real farmer from mp_pours, so neither PDF is empty. Read-only — nothing written.
 *
 * Run on the prod server (needs INTERAKT_API_KEY, INTERAKT_TEMPLATE_VMCC_BILL,
 * INTERAKT_TEMPLATE_FARMER_BILL, JWT_SECRET, APP_BASE_URL, DATABASE_URL):
 *
 *   TEST_PHONE=+918971805878 tsx src/scripts/test-billing-whatsapp.ts
 *   TEST_PHONE=+918971805878 TENANT_ID=<uuid> tsx src/scripts/test-billing-whatsapp.ts
 */
import { createDb } from '@runq/db';
import { getInteraktProvider } from '../utils/messaging';
import { statementPdfUrl } from '../modules/milk-procurement/mp-statement-token';
import { VmccBillService } from '../modules/milk-procurement/vmcc-bill.service';
import { StatementService } from '../modules/milk-procurement/statement.service';
import { cycleLabel, trimNum, rupees, nz, pdfName } from '../modules/milk-procurement/mp-notify-format';

const PHONE = process.env.TEST_PHONE ?? '+918971805878';
const TENANT_ID = process.env.TENANT_ID; // optional; else inferred from the data

/** Half-month window + vb-token fields for the date's month. */
function halfMonth(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const first = d! <= 15;
  const end = new Date(Date.UTC(y!, m!, 0)).getUTCDate(); // last day of month m
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    from: `${y}-${pad(m!)}-${first ? '01' : '16'}`,
    to: `${y}-${pad(m!)}-${first ? '15' : pad(end)}`,
    year: y!, month: m!, half: (first ? 'first' : 'second') as 'first' | 'second',
  };
}

function isoOf(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
}

/** A VMCC with real billable dispatch data. Must match drBaseConds (the VMCC
 *  bill's source): kind vmcc_to_cc, direct_receive, status received. */
async function findVmcc(pool: import('pg').Pool) {
  const scope = TENANT_ID ? 'and c.tenant_id = $1' : '';
  const { rows } = await pool.query(
    `select c.tenant_id, c.from_node_id as node_id, c.collection_date
     from mp_consignments c
     where c.kind = 'vmcc_to_cc' and c.direct_receive = true and c.status = 'received'
       and c.receipt_qty > 0 and c.collection_date >= current_date - interval '150 days' ${scope}
     order by c.collection_date desc limit 1`, TENANT_ID ? [TENANT_ID] : [],
  );
  if (!rows.length) throw new Error('No recent billable VMCC receipts (vmcc_to_cc, direct_receive, received) to build a bill from.');
  return { tenantId: rows[0].tenant_id as string, nodeId: rows[0].node_id as string, ...halfMonth(isoOf(rows[0].collection_date)) };
}

/** A farmer with recent pours (the farmer statement's source), in one tenant. */
async function findFarmer(pool: import('pg').Pool, tenantId: string) {
  const { rows } = await pool.query(
    `select farmer_id, collection_date from mp_pours
     where tenant_id = $1 and collection_date >= current_date - interval '150 days'
     order by collection_date desc limit 1`, [tenantId],
  );
  if (!rows.length) throw new Error('No recent pours to build a farmer statement from.');
  return { farmerId: rows[0].farmer_id as string, ...halfMonth(isoOf(rows[0].collection_date)) };
}

async function sendVmcc(db: ReturnType<typeof createDb>['db'], v: Awaited<ReturnType<typeof findVmcc>>): Promise<void> {
  const provider = getInteraktProvider()!;
  const s = await new VmccBillService(db, v.tenantId)
    .billStatementData({ year: v.year, month: v.month, half: v.half }, v.nodeId);
  const periodLabel = cycleLabel(v.from, v.to);
  const url = statementPdfUrl(
    { k: 'vb', t: v.tenantId, n: v.nodeId, y: v.year, m: v.month, h: v.half },
    pdfName('VMCC bill', s.vmcc.name, periodLabel),
  );
  if (!url) throw new Error('statementPdfUrl returned null — JWT_SECRET or APP_BASE_URL missing.');
  const net = s.detail.totalAmount + s.commission; // milk cost + operator comp = bill total
  const templateParams = {
    name: nz(s.vmcc.name), period: nz(periodLabel), code: nz(s.vmcc.code),
    litres: nz(trimNum(String(s.detail.totalQty))), milkCost: nz(rupees(s.detail.totalAmount)),
    commission: nz(rupees(s.commission)), net: nz(rupees(net)),
  };
  const res = await provider.sendWhatsApp({ to: PHONE, templateName: process.env.INTERAKT_TEMPLATE_VMCC_BILL!, templateParams, mediaUrl: url });
  console.log(`VMCC bill  → ${res.success ? `sent (id=${res.messageId})` : `FAILED: ${res.error}`} · ${s.vmcc.name} ${s.detail.totalQty}L`);
}

async function sendFarmer(db: ReturnType<typeof createDb>['db'], tenantId: string, f: Awaited<ReturnType<typeof findFarmer>>): Promise<void> {
  const provider = getInteraktProvider()!;
  const s = await new StatementService(db, tenantId).forFarmer(f.farmerId, f.from, f.to, { kind: 'all' });
  const periodLabel = cycleLabel(f.from, f.to);
  const url = statementPdfUrl(
    { k: 'fs', t: tenantId, f: f.farmerId, from: f.from, to: f.to },
    pdfName('Milk statement', s.farmer.name, periodLabel),
  );
  if (!url) throw new Error('statementPdfUrl returned null — JWT_SECRET or APP_BASE_URL missing.');
  const templateParams = {
    name: nz(s.farmer.name), period: nz(periodLabel), litres: nz(trimNum(String(s.totals.litres))),
    gross: nz(rupees(s.totals.amount)), deductions: nz(rupees('0')), net: nz(rupees(s.totals.amount)),
  };
  const res = await provider.sendWhatsApp({ to: PHONE, templateName: process.env.INTERAKT_TEMPLATE_FARMER_BILL!, templateParams, mediaUrl: url });
  console.log(`Farmer bill → ${res.success ? `sent (id=${res.messageId})` : `FAILED: ${res.error}`} · ${s.farmer.name} ${s.totals.litres}L`);
}

async function main(): Promise<void> {
  if (!getInteraktProvider()) throw new Error('Interakt not configured (INTERAKT_API_KEY missing).');
  if (!process.env.INTERAKT_TEMPLATE_VMCC_BILL || !process.env.INTERAKT_TEMPLATE_FARMER_BILL) {
    throw new Error('INTERAKT_TEMPLATE_VMCC_BILL / INTERAKT_TEMPLATE_FARMER_BILL not set.');
  }
  const { db, pool } = createDb(process.env.DATABASE_URL ?? '');
  try {
    const v = await findVmcc(pool);
    const f = await findFarmer(pool, v.tenantId);
    console.log(`Sending to ${PHONE} — VMCC period ${v.from}→${v.to}, farmer period ${f.from}→${f.to}`);
    await sendVmcc(db, v);
    await sendFarmer(db, v.tenantId, f);
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
