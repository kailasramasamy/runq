/**
 * Smoke-test the MP billing WhatsApp templates without creating any cycle/bill.
 *
 * Sends a sample VMCC bill notice + farmer bill notice to a test phone, using
 * the SAME production code path (Interakt provider, PDF token signer, format
 * helpers) as the real sends. A real farmer/VMCC + half-month period is pulled
 * from live pours so the attached statement PDFs are valid and the body params
 * look real. Read-only DB lookups — nothing is written.
 *
 * Run on the prod server (needs INTERAKT_API_KEY, INTERAKT_TEMPLATE_VMCC_BILL,
 * INTERAKT_TEMPLATE_FARMER_BILL, JWT_SECRET, APP_BASE_URL, DATABASE_URL):
 *
 *   TEST_PHONE=+918971805878 tsx src/scripts/test-billing-whatsapp.ts
 *   TEST_PHONE=+918971805878 TENANT_ID=<uuid> tsx src/scripts/test-billing-whatsapp.ts
 */
import { Client } from 'pg';
import { getInteraktProvider } from '../utils/messaging';
import { statementPdfUrl } from '../modules/milk-procurement/mp-statement-token';
import { cycleLabel, trimNum, rupees, nz, pdfName } from '../modules/milk-procurement/mp-notify-format';

const PHONE = process.env.TEST_PHONE ?? '+918971805878';
const TENANT_ID = process.env.TENANT_ID; // optional; else the most recent pour's tenant

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

interface Sample {
  tenantId: string; farmerId: string; farmerName: string;
  nodeId: string; nodeName: string; nodeCode: string;
  from: string; to: string; year: number; month: number; half: 'first' | 'second';
  farmerLitres: string; farmerGross: string; vmccLitres: string; vmccMilkCost: string;
}

/** Find a real farmer + collection node from a recent pour, with period totals. */
async function discover(c: Client): Promise<Sample> {
  const scope = TENANT_ID ? 'and p.tenant_id = $1' : '';
  const params = TENANT_ID ? [TENANT_ID] : [];
  const { rows } = await c.query(
    `select p.tenant_id, p.farmer_id, p.node_id, p.collection_date
     from mp_pours p
     where p.collection_date >= current_date - interval '150 days' ${scope}
     order by p.collection_date desc limit 1`, params,
  );
  if (!rows.length) throw new Error('No recent pours found to build a test statement from.');
  const { tenant_id, farmer_id, node_id, collection_date } = rows[0];
  const iso = collection_date instanceof Date ? collection_date.toISOString().slice(0, 10) : String(collection_date);
  const { from, to, year, month, half } = halfMonth(iso);

  const [{ rows: fr }, { rows: nr }, { rows: fa }, { rows: na }] = await Promise.all([
    c.query('select name from mp_farmers where id = $1', [farmer_id]),
    c.query('select name, code from mp_nodes where id = $1', [node_id]),
    c.query(`select coalesce(sum(qty_litres),0) litres, coalesce(sum(line_amount),0) gross
             from mp_pours where farmer_id = $1 and collection_date between $2 and $3`, [farmer_id, from, to]),
    c.query(`select coalesce(sum(qty_litres),0) litres, coalesce(sum(line_amount),0) cost
             from mp_pours where node_id = $1 and collection_date between $2 and $3`, [node_id, from, to]),
  ]);
  return {
    tenantId: tenant_id, farmerId: farmer_id, farmerName: fr[0]?.name ?? 'Test Farmer',
    nodeId: node_id, nodeName: nr[0]?.name ?? 'Test VMCC', nodeCode: nr[0]?.code ?? '',
    from, to, year, month, half,
    farmerLitres: String(fa[0]?.litres ?? '0'), farmerGross: String(fa[0]?.gross ?? '0'),
    vmccLitres: String(na[0]?.litres ?? '0'), vmccMilkCost: String(na[0]?.cost ?? '0'),
  };
}

async function sendVmcc(s: Sample): Promise<void> {
  const provider = getInteraktProvider()!;
  const templateName = process.env.INTERAKT_TEMPLATE_VMCC_BILL!;
  const periodLabel = cycleLabel(s.from, s.to);
  const url = statementPdfUrl(
    { k: 'vb', t: s.tenantId, n: s.nodeId, y: s.year, m: s.month, h: s.half },
    pdfName('VMCC bill', s.nodeName, periodLabel),
  );
  if (!url) throw new Error('statementPdfUrl returned null — JWT_SECRET or APP_BASE_URL missing.');
  const commission = 500; // sample operator comp for the template preview
  const net = Math.round(Number(s.vmccMilkCost)) + commission;
  const templateParams = {
    name: nz(s.nodeName), period: nz(periodLabel), code: nz(s.nodeCode),
    litres: nz(trimNum(s.vmccLitres)), milkCost: nz(rupees(s.vmccMilkCost)),
    commission: nz(rupees(commission)), net: nz(rupees(net)),
  };
  const res = await provider.sendWhatsApp({ to: PHONE, templateName, templateParams, mediaUrl: url });
  console.log('VMCC bill  →', res.success ? `sent (id=${res.messageId})` : `FAILED: ${res.error}`);
}

async function sendFarmer(s: Sample): Promise<void> {
  const provider = getInteraktProvider()!;
  const templateName = process.env.INTERAKT_TEMPLATE_FARMER_BILL!;
  const periodLabel = cycleLabel(s.from, s.to);
  const url = statementPdfUrl(
    { k: 'fs', t: s.tenantId, f: s.farmerId, from: s.from, to: s.to },
    pdfName('Milk statement', s.farmerName, periodLabel),
  );
  if (!url) throw new Error('statementPdfUrl returned null — JWT_SECRET or APP_BASE_URL missing.');
  const templateParams = {
    name: nz(s.farmerName), period: nz(periodLabel), litres: nz(trimNum(s.farmerLitres)),
    gross: nz(rupees(s.farmerGross)), deductions: nz(rupees('0')), net: nz(rupees(s.farmerGross)),
  };
  const res = await provider.sendWhatsApp({ to: PHONE, templateName, templateParams, mediaUrl: url });
  console.log('Farmer bill →', res.success ? `sent (id=${res.messageId})` : `FAILED: ${res.error}`);
}

async function main(): Promise<void> {
  if (!getInteraktProvider()) throw new Error('Interakt not configured (INTERAKT_API_KEY missing).');
  if (!process.env.INTERAKT_TEMPLATE_VMCC_BILL || !process.env.INTERAKT_TEMPLATE_FARMER_BILL) {
    throw new Error('INTERAKT_TEMPLATE_VMCC_BILL / INTERAKT_TEMPLATE_FARMER_BILL not set.');
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const s = await discover(c);
    console.log(`Sending to ${PHONE} — farmer "${s.farmerName}", VMCC "${s.nodeName}", period ${s.from} → ${s.to}`);
    await sendVmcc(s);
    await sendFarmer(s);
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
