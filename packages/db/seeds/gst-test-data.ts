/**
 * GST seed data — populates GSTR-1, GSTR-3B and GSTR-2B records so the
 * mobile GST screens render with realistic content for App Store screenshots.
 *
 * Usage: tsx --env-file=../../.env seeds/gst-test-data.ts [--tenant=demo-company]
 */
import { eq, sql } from 'drizzle-orm';
import { createDb, type Db } from '../src/client';
import {
  tenants,
  gstReturns,
  gstr2bData,
  gstr2bMatches,
  type Gstr1Data,
  type Gstr3bData,
  type Gstr2bEntry,
} from '../src/index';

// Periods (MMYYYY)
const MAR = '032026';
const APR = '042026';

const COMPANY_GSTIN = '33AAGCB1286Q2ZA';   // Vrindavan Milk Products — TN
const COMPANY_STATE_CODE = '33';

// Buyers (a slice of the existing customer set for invoice-level B2B)
const B2B_BUYERS = [
  { name: 'Fresh Dairy Mart',          gstin: '27AALCF5678G1Z3', stateCode: '27' },
  { name: 'Bangalore Dairy Hub',       gstin: '29AADCB9876H1Z5', stateCode: '29' },
  { name: 'Chennai Milk Depot',        gstin: '33AABCC1234I1Z9', stateCode: '33' },
  { name: 'Delhi Dairy Distributors',  gstin: '07AADC7890J1Z7',  stateCode: '07' },
  { name: 'Krishna Supermarket',       gstin: '29AAACK4567M1Z2',  stateCode: '29' },
];

// Suppliers for 2B
const SUPPLIERS = [
  { name: 'Fresh Farms Raw Milk',      gstin: '27AAFCF1234A1Z5', stateCode: '27' },
  { name: 'Packwell Industries',       gstin: '27AABCP5678B1Z3', stateCode: '27' },
  { name: 'Swift Logistics',           gstin: '27AADCS9012C1Z1', stateCode: '27' },
  { name: 'Sharma & Associates',       gstin: '27AADCS4567F1Z9', stateCode: '27' },
  { name: 'Mathura Dairy Cooperative', gstin: '09AAACM7654K1Z8', stateCode: '09' },
  { name: 'Sanathana Foods Pvt Ltd',   gstin: '33AABCS2345N1Z6', stateCode: '33' },
];

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function isoMonthEnd(period: string): Date {
  const m = parseInt(period.substring(0, 2), 10);
  const y = parseInt(period.substring(2), 10);
  return new Date(y, m, 0);
}

// ──────────────────────────────────────────────────────────────────
// GSTR-1 builder
// ──────────────────────────────────────────────────────────────────

function buildGstr1(period: string, scale: number): Gstr1Data {
  const monthEnd = isoMonthEnd(period);
  const yyyy = monthEnd.getFullYear();
  const mm = String(monthEnd.getMonth() + 1).padStart(2, '0');

  // ── B2B (invoice-level to registered buyers) ──
  const b2b: Gstr1Data['b2b'] = [];
  let invSeq = 1;
  for (const buyer of B2B_BUYERS) {
    // 2-3 invoices per buyer
    const count = 2 + (B2B_BUYERS.indexOf(buyer) % 2);
    for (let i = 0; i < count; i++) {
      const day = String(3 + invSeq * 2).padStart(2, '0');
      const taxable = Math.round((45000 + invSeq * 7350) * scale);
      const isInter = buyer.stateCode !== COMPANY_STATE_CODE;
      const igst = isInter ? Math.round(taxable * 0.05) : 0;
      const cgst = isInter ? 0 : Math.round(taxable * 0.025);
      const sgst = isInter ? 0 : Math.round(taxable * 0.025);
      const total = taxable + igst + cgst + sgst;
      b2b.push({
        buyerGstin: buyer.gstin,
        invoiceNumber: `VMP-2627-${String(1000 + invSeq).padStart(4, '0')}`,
        invoiceDate: `${day}-${mm}-${yyyy}`,
        invoiceValue: total,
        placeOfSupply: buyer.stateCode,
        reverseCharge: 'N',
        invoiceType: 'R',
        items: [{
          taxableValue: taxable,
          igstAmount: igst,
          cgstAmount: cgst,
          sgstAmount: sgst,
          cessAmount: 0,
          gstRate: 5,
        }],
      });
      invSeq++;
    }
  }

  // ── B2CS (aggregated small retail, intra-state) ──
  const b2csTaxable = Math.round(180000 * scale);
  const b2cs: Gstr1Data['b2cs'] = [{
    placeOfSupply: COMPANY_STATE_CODE,
    supplyType: 'INTRA',
    gstRate: 5,
    taxableValue: b2csTaxable,
    igstAmount: 0,
    cgstAmount: Math.round(b2csTaxable * 0.025),
    sgstAmount: Math.round(b2csTaxable * 0.025),
    cessAmount: 0,
  }];

  // ── HSN summary ──
  const totalTaxable = b2b.reduce((s, i) => s + i.items[0].taxableValue, 0) + b2csTaxable;
  const totalIgst = b2b.reduce((s, i) => s + i.items[0].igstAmount, 0);
  const totalCgst = b2b.reduce((s, i) => s + i.items[0].cgstAmount, 0) + (b2cs[0].cgstAmount as number);
  const totalSgst = b2b.reduce((s, i) => s + i.items[0].sgstAmount, 0) + (b2cs[0].sgstAmount as number);

  const hsn: Gstr1Data['hsn'] = [
    {
      hsnCode: '0401',
      description: 'Milk and cream, not concentrated',
      uqc: 'LTR',
      totalQuantity: Math.round(48000 * scale),
      taxableValue: Math.round(totalTaxable * 0.62),
      igstAmount: Math.round(totalIgst * 0.62),
      cgstAmount: Math.round(totalCgst * 0.62),
      sgstAmount: Math.round(totalSgst * 0.62),
      cessAmount: 0,
      gstRate: 5,
    },
    {
      hsnCode: '0406',
      description: 'Cheese and curd',
      uqc: 'KGS',
      totalQuantity: Math.round(2400 * scale),
      taxableValue: Math.round(totalTaxable * 0.28),
      igstAmount: Math.round(totalIgst * 0.28),
      cgstAmount: Math.round(totalCgst * 0.28),
      sgstAmount: Math.round(totalSgst * 0.28),
      cessAmount: 0,
      gstRate: 5,
    },
    {
      hsnCode: '0403',
      description: 'Buttermilk, curdled milk, yoghurt',
      uqc: 'LTR',
      totalQuantity: Math.round(7800 * scale),
      taxableValue: Math.round(totalTaxable * 0.10),
      igstAmount: Math.round(totalIgst * 0.10),
      cgstAmount: Math.round(totalCgst * 0.10),
      sgstAmount: Math.round(totalSgst * 0.10),
      cessAmount: 0,
      gstRate: 5,
    },
  ];

  return {
    b2b,
    b2cs,
    b2cl: [],
    cdn: [],
    exp: [],
    nil: [],
    hsn,
    docs: [{
      docType: 'invoice',
      fromSerial: `VMP-2627-${String(1000).padStart(4, '0')}`,
      toSerial: `VMP-2627-${String(1000 + b2b.length).padStart(4, '0')}`,
      totalIssued: b2b.length + 6,
      totalCancelled: 1,
      netIssued: b2b.length + 5,
    }],
  };
}

// ──────────────────────────────────────────────────────────────────
// GSTR-3B builder (derived from 1 + ITC from purchases)
// ──────────────────────────────────────────────────────────────────

function buildGstr3b(g1: Gstr1Data, scale: number): Gstr3bData {
  const interTaxable = g1.b2b.filter(b => b.placeOfSupply !== COMPANY_STATE_CODE)
    .reduce((s, b) => s + b.items[0].taxableValue, 0);
  const interIgst = g1.b2b.filter(b => b.placeOfSupply !== COMPANY_STATE_CODE)
    .reduce((s, b) => s + b.items[0].igstAmount, 0);
  const intraTaxable = g1.b2b.filter(b => b.placeOfSupply === COMPANY_STATE_CODE)
    .reduce((s, b) => s + b.items[0].taxableValue, 0) + g1.b2cs[0].taxableValue;
  const intraCgst = g1.b2b.filter(b => b.placeOfSupply === COMPANY_STATE_CODE)
    .reduce((s, b) => s + b.items[0].cgstAmount, 0) + (g1.b2cs[0].cgstAmount as number);
  const intraSgst = g1.b2b.filter(b => b.placeOfSupply === COMPANY_STATE_CODE)
    .reduce((s, b) => s + b.items[0].sgstAmount, 0) + (g1.b2cs[0].sgstAmount as number);

  // ITC from purchases (~20% of sales taxable, 5%)
  const itcIgst = Math.round(interTaxable * 0.18);
  const itcCgst = Math.round(intraTaxable * 0.09);
  const itcSgst = Math.round(intraTaxable * 0.09);

  return {
    table31: {
      outwardTaxableInterState: { taxableValue: interTaxable, igst: interIgst, cess: 0 },
      outwardTaxableIntraState: { taxableValue: intraTaxable, cgst: intraCgst, sgst: intraSgst, cess: 0 },
      zeroRatedSupplies: { taxableValue: 0, igst: 0, cess: 0 },
      nilRatedExempt: { taxableValue: 0 },
      nonGstOutward: { taxableValue: 0 },
    },
    table32: g1.b2b.filter(b => b.placeOfSupply !== COMPANY_STATE_CODE).map(b => ({
      placeOfSupply: b.placeOfSupply,
      taxableValue: b.items[0].taxableValue,
      igst: b.items[0].igstAmount,
    })).slice(0, 4),
    table4: {
      itcAvailable: {
        importGoods: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
        importServices: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
        inwardReverseCharge: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
        isd: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
        allOtherItc: { igst: itcIgst, cgst: itcCgst, sgst: itcSgst, cess: 0 },
      },
      itcReversed: {
        rule4243: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
        others: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
      },
      netItc: { igst: itcIgst, cgst: itcCgst, sgst: itcSgst, cess: 0 },
    },
    table5: {
      interState: { nilRated: 0, exempt: 0, nonGst: 0 },
      intraState: { nilRated: 0, exempt: 0, nonGst: 0 },
    },
    table51: { interestAmount: 0, lateFee: 0 },
    table61: {
      igst: { payable: interIgst, itcUsed: Math.min(itcIgst, interIgst), cashPaid: Math.max(0, interIgst - itcIgst) },
      cgst: { payable: intraCgst, itcUsed: Math.min(itcCgst, intraCgst), cashPaid: Math.max(0, intraCgst - itcCgst) },
      sgst: { payable: intraSgst, itcUsed: Math.min(itcSgst, intraSgst), cashPaid: Math.max(0, intraSgst - itcSgst) },
      cess: { payable: 0, itcUsed: 0, cashPaid: 0 },
    },
  };
}

// ──────────────────────────────────────────────────────────────────
// GSTR-2B builder
// ──────────────────────────────────────────────────────────────────

function buildGstr2b(period: string): { entries: Gstr2bEntry[]; rawData: object } {
  const yyyy = parseInt(period.substring(2));
  const mm = period.substring(0, 2);
  const entries: Gstr2bEntry[] = SUPPLIERS.map((s, i) => {
    const taxable = 80000 + i * 32500;
    const isInter = s.stateCode !== COMPANY_STATE_CODE;
    const igst = isInter ? Math.round(taxable * 0.05) : 0;
    const cgst = isInter ? 0 : Math.round(taxable * 0.025);
    const sgst = isInter ? 0 : Math.round(taxable * 0.025);
    return {
      supplierGstin: s.gstin,
      supplierName: s.name,
      invoiceNumber: `${s.name.split(' ')[0].toUpperCase()}/${period.substring(0,2)}/${1000 + i}`,
      invoiceDate: `${String(5 + i * 4).padStart(2, '0')}-${mm}-${yyyy}`,
      invoiceValue: taxable + igst + cgst + sgst,
      taxableValue: taxable,
      igstAmount: igst,
      cgstAmount: cgst,
      sgstAmount: sgst,
      cessAmount: 0,
      gstRate: 5,
      placeOfSupply: COMPANY_STATE_CODE,
      reverseCharge: false,
    };
  });
  return { entries, rawData: { docdata: { b2b: entries }, gstin: COMPANY_GSTIN, rtnprd: period } };
}

// ──────────────────────────────────────────────────────────────────
// Seed orchestrator
// ──────────────────────────────────────────────────────────────────

async function upsertReturn(
  db: Db,
  tenantId: string,
  period: string,
  returnType: 'gstr1' | 'gstr3b',
  status: 'draft' | 'validated' | 'uploaded' | 'filed',
  data: object,
  arn?: string,
) {
  const filedAt = status === 'filed' ? new Date(`2026-${period.substring(0,2)}-18T10:00:00Z`) : null;
  await db.delete(gstReturns).where(
    sql`tenant_id = ${tenantId} AND return_type = ${returnType} AND period = ${period}`
  );
  await db.insert(gstReturns).values({
    tenantId,
    gstin: COMPANY_GSTIN,
    returnType,
    period,
    filingFrequency: 'monthly',
    status,
    data: data as never,
    arn: arn ?? null,
    filedAt,
    notes: null,
  });
  console.log(`  ✓ ${returnType.toUpperCase()} ${period} → ${status}${arn ? ` (ARN ${arn})` : ''}`);
}

async function seedReconciliation(db: Db, tenantId: string, period: string) {
  await db.delete(gstr2bMatches).where(
    sql`tenant_id = ${tenantId} AND period = ${period}`
  );
  await db.delete(gstr2bData).where(
    sql`tenant_id = ${tenantId} AND period = ${period}`
  );

  const { entries, rawData } = buildGstr2b(period);
  const [row] = await db.insert(gstr2bData).values({
    tenantId, gstin: COMPANY_GSTIN, period, data: rawData,
  }).returning();

  // 6 entries: 3 matched, 1 mismatched, 1 not_in_books, 1 not_in_2b (synthetic)
  const statuses: Array<'matched' | 'mismatched' | 'not_in_books' | 'not_in_2b'> = [
    'matched', 'matched', 'matched', 'mismatched', 'not_in_books', 'matched',
  ];

  const matchRows = entries.map((e, i) => {
    const status = statuses[i];
    const booksDelta = status === 'mismatched' ? 1500 : 0;
    return {
      tenantId,
      gstr2bId: row.id,
      period,
      supplierGstin: e.supplierGstin,
      supplierName: e.supplierName,
      invoiceNumber2b: e.invoiceNumber,
      invoiceDate2b: e.invoiceDate,
      taxableValue2b: String(e.taxableValue),
      igst2b: String(e.igstAmount),
      cgst2b: String(e.cgstAmount),
      sgst2b: String(e.sgstAmount),
      purchaseInvoiceId: null,
      invoiceNumberBooks: status === 'not_in_books' ? null : e.invoiceNumber,
      taxableValueBooks: status === 'not_in_books' ? null : String(e.taxableValue - booksDelta),
      igstBooks: status === 'not_in_books' ? null : String(e.igstAmount),
      cgstBooks: status === 'not_in_books' ? null : String(e.cgstAmount),
      sgstBooks: status === 'not_in_books' ? null : String(e.sgstAmount),
      matchStatus: status,
      valueDiff: status === 'mismatched' ? String(booksDelta) : null,
    };
  });

  // Add a "not_in_2b" synthetic — book-only entry that supplier hasn't filed
  matchRows.push({
    tenantId,
    gstr2bId: row.id,
    period,
    supplierGstin: '27AABCO5500D1ZE',
    supplierName: 'Indian Oil Corporation',
    invoiceNumber2b: 'IOC-IN-2627-7782',
    invoiceDate2b: `12-${period.substring(0,2)}-${period.substring(2)}`,
    taxableValue2b: '0',
    igst2b: '0',
    cgst2b: '0',
    sgst2b: '0',
    purchaseInvoiceId: null,
    invoiceNumberBooks: 'IOC-IN-2627-7782',
    taxableValueBooks: '34500',
    igstBooks: '1725',
    cgstBooks: '0',
    sgstBooks: '0',
    matchStatus: 'not_in_2b',
    valueDiff: null,
  });

  await db.insert(gstr2bMatches).values(matchRows);
  console.log(`  ✓ GSTR-2B ${period} → ${matchRows.length} entries (${matchRows.filter(m => m.matchStatus==='matched').length} matched)`);
}

export async function seedGstData(db: Db, tenantId: string) {
  console.log('Seeding GST returns + 2B reconciliation...');

  // March 2026 — both filed (historical, before filing-start period)
  const marG1 = buildGstr1(MAR, 0.92);
  await upsertReturn(db, tenantId, MAR, 'gstr1', 'filed', marG1, 'AB330426012345A');
  await upsertReturn(db, tenantId, MAR, 'gstr3b', 'filed', buildGstr3b(marG1, 0.92), 'AC330426098765B');

  // April 2026 — current filing period (data = uploaded G1, draft 3B)
  const aprG1 = buildGstr1(APR, 1.0);
  await upsertReturn(db, tenantId, APR, 'gstr1', 'uploaded', aprG1);
  await upsertReturn(db, tenantId, APR, 'gstr3b', 'draft', buildGstr3b(aprG1, 1.0));

  // GSTR-2B for April
  await seedReconciliation(db, tenantId, APR);

  console.log('GST seed complete.');
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const slug = process.argv.find(a => a.startsWith('--tenant='))?.split('=')[1] ?? 'demo-company';
  const { db, pool } = createDb(dbUrl);

  (async () => {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (!tenant) {
      console.error(`Tenant "${slug}" not found.`);
      process.exit(1);
    }
    console.log(`Tenant: ${tenant.name} (${tenant.id})`);
    await seedGstData(db, tenant.id);
    await pool.end();
  })().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
