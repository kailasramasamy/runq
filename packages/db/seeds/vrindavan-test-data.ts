import type { Db } from '../src/client';
import { bankAccounts } from '../src/schema/banking/bank-accounts';
import { bankTransactions } from '../src/schema/banking/bank-transactions';
import { vendors } from '../src/schema/ap/vendors';
import { customers } from '../src/schema/ar/customers';
import { purchaseInvoices } from '../src/schema/ap/purchase-invoices';
import { salesInvoices, invoiceSequences } from '../src/schema/ar/invoices';
import { payments, paymentAllocations } from '../src/schema/ap/payments';
import { paymentReceipts, receiptAllocations } from '../src/schema/ar/receipts';

// ---------------------------------------------------------------------------
// Data constants
// ---------------------------------------------------------------------------

const BANK_ACCOUNTS = [
  { name: 'HDFC Current Account', bankName: 'HDFC Bank', accountNumber: '50100123456789', ifscCode: 'HDFC0001234', accountType: 'current' as const, openingBalance: '500000' },
  { name: 'ICICI Savings Account', bankName: 'ICICI Bank', accountNumber: '012301234567', ifscCode: 'ICIC0001230', accountType: 'savings' as const, openingBalance: '200000' },
  { name: 'Petty Cash', bankName: 'Cash', accountNumber: 'PETTY-CASH-001', ifscCode: 'CASH0000000', accountType: 'current' as const, openingBalance: '10000' },
];

const VENDOR_DATA = [
  { name: 'Fresh Farms Raw Milk', category: 'raw_material', state: 'Maharashtra', city: 'Pune', gstin: '27AAFCF1234A1Z5', pan: 'AAFCF1234A', paymentTermsDays: 15, email: 'accounts@freshfarms.in', phone: '9876543210' },
  { name: 'Packwell Industries', category: 'equipment', state: 'Maharashtra', city: 'Mumbai', gstin: '27AABCP5678B1Z3', pan: 'AABCP5678B', paymentTermsDays: 30, email: 'billing@packwell.in', phone: '9876543211' },
  { name: 'Swift Logistics', category: 'logistics', state: 'Maharashtra', city: 'Nashik', gstin: '27AADCS9012C1Z1', pan: 'AADCS9012C', paymentTermsDays: 7, email: 'ops@swiftlogistics.in', phone: '9876543212' },
  { name: 'Sharma & Associates', category: 'service_provider', state: 'Maharashtra', city: 'Mumbai', gstin: '27AADCS4567F1Z9', pan: 'AADCS4567F', paymentTermsDays: 15, email: 'ca@sharmaassociates.in', phone: '9876543213' },
  { name: 'Realty Trust Office', category: 'utilities', state: 'Maharashtra', city: 'Mumbai', gstin: '27AABCR3456D1Z7', pan: 'AABCR3456D', paymentTermsDays: 30, email: 'rent@realtytrust.in', phone: '9876543214' },
];

const CUSTOMER_DATA = [
  { name: 'Fresh Dairy Mart', type: 'b2b' as const, state: 'Maharashtra', city: 'Mumbai', gstin: '27AALCF5678G1Z3', pan: 'AALCF5678G', email: 'purchase@freshdairymart.in', phone: '9812345670', paymentTermsDays: 30 },
  { name: 'Bangalore Dairy Hub', type: 'b2b' as const, state: 'Karnataka', city: 'Bangalore', gstin: '29AADCB9876H1Z5', pan: 'AADCB9876H', email: 'orders@bangaloredairy.in', phone: '9812345671', paymentTermsDays: 30 },
  { name: 'Chennai Milk Depot', type: 'b2b' as const, state: 'Tamil Nadu', city: 'Chennai', gstin: '33AABCC1234I1Z9', pan: 'AABCC1234I', email: 'depot@chennaimilk.in', phone: '9812345672', paymentTermsDays: 30 },
  { name: 'Delhi Dairy Distributors', type: 'b2b' as const, state: 'Delhi', city: 'New Delhi', gstin: '07AADC7890J1Z7', pan: 'AADC7890JK', email: 'supply@delhidairy.in', phone: '9812345673', paymentTermsDays: 30 },
  { name: 'PayTM PG Collections', type: 'payment_gateway' as const, state: 'Maharashtra', city: 'Mumbai', gstin: undefined, pan: undefined, email: 'settlements@paytm.com', phone: '1800123456', paymentTermsDays: 0 },
];

// ---------------------------------------------------------------------------
// Bank transaction raw data: [date, type, amount, narration, reconStatus]
// ---------------------------------------------------------------------------
type TxnTuple = [string, 'credit' | 'debit', number, string, 'unreconciled' | 'matched'];

const BANK_TXN_DATA: TxnTuple[] = [
  // January credits
  ['2026-01-05', 'credit', 125000, 'NEFT/FRESH DAIRY MART/UTR2601001', 'matched'],
  ['2026-01-10', 'credit', 95000, 'IMPS/BANGALORE DAIRY/UTR2601002', 'matched'],
  ['2026-01-15', 'credit', 78000, 'UPI/CHENNAI MILK/UTR2601003', 'matched'],
  ['2026-01-20', 'credit', 110000, 'NEFT/DELHI DAIRY DIST/UTR2601004', 'matched'],
  ['2026-01-25', 'credit', 65000, 'NEFT/FRESH DAIRY MART/UTR2601005', 'matched'],
  // January debits
  ['2026-01-07', 'debit', 85000, 'NEFT/FRESH FARMS/UTR2601101', 'matched'],
  ['2026-01-12', 'debit', 32000, 'NEFT/PACKWELL IND/UTR2601102', 'matched'],
  ['2026-01-14', 'debit', 12000, 'IMPS/SWIFT LOGISTICS/UTR2601103', 'matched'],
  ['2026-01-18', 'debit', 35000, 'NEFT/REALTY TRUST/RENT-JAN26', 'matched'],
  ['2026-01-28', 'debit', 150000, 'SALARY-JAN26', 'unreconciled'],
  ['2026-01-30', 'debit', 750, 'BANK CHARGES-JAN26', 'unreconciled'],
  ['2026-01-22', 'debit', 2500, 'UPI/MISC/OFFICE SUPPLIES', 'unreconciled'],
  // February credits
  ['2026-02-03', 'credit', 130000, 'NEFT/FRESH DAIRY MART/UTR2602001', 'matched'],
  ['2026-02-08', 'credit', 88000, 'IMPS/BANGALORE DAIRY/UTR2602002', 'matched'],
  ['2026-02-12', 'credit', 72000, 'NEFT/CHENNAI MILK/UTR2602003', 'matched'],
  ['2026-02-18', 'credit', 105000, 'NEFT/DELHI DAIRY DIST/UTR2602004', 'unreconciled'],
  ['2026-02-22', 'credit', 55000, 'NEFT/FRESH DAIRY MART/UTR2602005', 'unreconciled'],
  ['2026-02-28', 'credit', 1250, 'INTEREST CREDIT-FEB26', 'unreconciled'],
  // February debits
  ['2026-02-05', 'debit', 92000, 'NEFT/FRESH FARMS/UTR2602101', 'matched'],
  ['2026-02-10', 'debit', 28000, 'NEFT/PACKWELL IND/UTR2602102', 'unreconciled'],
  ['2026-02-13', 'debit', 9500, 'IMPS/SWIFT LOGISTICS/UTR2602103', 'unreconciled'],
  ['2026-02-17', 'debit', 35000, 'NEFT/REALTY TRUST/RENT-FEB26', 'matched'],
  ['2026-02-20', 'debit', 75000, 'NEFT/SHARMA ASSOC/CA-FEES-FY26', 'matched'],
  ['2026-02-25', 'debit', 150000, 'SALARY-FEB26', 'unreconciled'],
  ['2026-02-27', 'debit', 850, 'BANK CHARGES-FEB26', 'unreconciled'],
  ['2026-02-15', 'debit', 3200, 'UPI/MISC/COURIER CHARGES', 'unreconciled'],
  // March credits
  ['2026-03-02', 'credit', 140000, 'NEFT/FRESH DAIRY MART/UTR2603001', 'matched'],
  ['2026-03-07', 'credit', 92000, 'IMPS/BANGALORE DAIRY/UTR2603002', 'unreconciled'],
  ['2026-03-10', 'credit', 85000, 'UPI/CHENNAI MILK/UTR2603003', 'matched'],
  ['2026-03-14', 'credit', 115000, 'NEFT/DELHI DAIRY DIST/UTR2603004', 'unreconciled'],
  ['2026-03-18', 'credit', 70000, 'NEFT/FRESH DAIRY MART/UTR2603005', 'unreconciled'],
  ['2026-03-22', 'credit', 48000, 'IMPS/BANGALORE DAIRY/UTR2603006', 'unreconciled'],
  // March debits
  ['2026-03-03', 'debit', 98000, 'NEFT/FRESH FARMS/UTR2603101', 'matched'],
  ['2026-03-06', 'debit', 500000, 'NEFT/FRESH FARMS/UTR2603102-ANOMALY', 'unreconciled'],
  ['2026-03-08', 'debit', 38000, 'NEFT/PACKWELL IND/UTR2603103', 'unreconciled'],
  ['2026-03-11', 'debit', 14000, 'IMPS/SWIFT LOGISTICS/UTR2603104', 'unreconciled'],
  ['2026-03-15', 'debit', 35000, 'NEFT/REALTY TRUST/RENT-MAR26', 'unreconciled'],
  ['2026-03-19', 'debit', 30000, 'NEFT/SHARMA ASSOC/TDS-CONSULT', 'unreconciled'],
  ['2026-03-22', 'debit', 150000, 'SALARY-MAR26', 'unreconciled'],
  ['2026-03-24', 'debit', 900, 'BANK CHARGES-MAR26', 'unreconciled'],
  // Extra transactions to reach 50
  ['2026-01-03', 'credit', 25000, 'NEFT/FRESH DAIRY MART/ADV-JAN26', 'unreconciled'],
  ['2026-01-09', 'debit', 4500, 'UPI/MISC/STATIONERY', 'unreconciled'],
  ['2026-02-01', 'credit', 15000, 'UPI/CHENNAI MILK/ADVANCE-FEB26', 'unreconciled'],
  ['2026-02-09', 'debit', 6800, 'IMPS/SWIFT LOGISTICS/SPOT-FEB26', 'unreconciled'],
  ['2026-03-01', 'credit', 20000, 'NEFT/DELHI DAIRY DIST/ADV-MAR26', 'unreconciled'],
  ['2026-03-05', 'debit', 78000, 'NEFT/FRESH FARMS/UTR2603105', 'matched'],
  ['2026-03-09', 'debit', 82000, 'NEFT/FRESH FARMS/UTR2603106', 'matched'],
  ['2026-03-12', 'credit', 45000, 'NEFT/FRESH DAIRY MART/UTR2603007', 'unreconciled'],
  ['2026-03-20', 'debit', 5500, 'UPI/MISC/MAINTENANCE', 'unreconciled'],
  ['2026-03-25', 'credit', 62000, 'IMPS/BANGALORE DAIRY/UTR2603008', 'unreconciled'],
];

// ---------------------------------------------------------------------------
// Purchase invoice data: [vendorIdx, invNo, date, subtotal, gstRate, hsnSac, desc, tdsSection, tdsRate, status]
// ---------------------------------------------------------------------------
type PITuple = [number, string, string, number, number, string, string, string | null, number, string];

const PI_DATA: PITuple[] = [
  // Fresh Farms (idx 0) — raw milk, 0% GST
  [0, 'FF-2026-001', '2026-01-05', 65000, 0, '0401', 'Raw milk supply - Jan Wk1', null, 0, 'paid'],
  [0, 'FF-2026-002', '2026-01-20', 78000, 0, '0401', 'Raw milk supply - Jan Wk3', null, 0, 'paid'],
  [0, 'FF-2026-003', '2026-02-05', 92000, 0, '0401', 'Raw milk supply - Feb Wk1', null, 0, 'approved'],
  [0, 'FF-2026-004', '2026-03-03', 98000, 0, '0401', 'Raw milk supply - Mar Wk1', null, 0, 'approved'],
  [0, 'FF-2026-005', '2026-03-05', 500000, 0, '0401', 'BULK: Raw milk emergency purchase', null, 0, 'draft'],
  // Packwell (idx 1) — packaging, 18% GST
  [1, 'PWI-2026-001', '2026-01-10', 25000, 18, '3923', 'HDPE milk pouches - 1L', null, 0, 'paid'],
  [1, 'PWI-2026-002', '2026-02-08', 28000, 18, '3923', 'Tetra packs & cartons', null, 0, 'partially_paid'],
  [1, 'PWI-2026-003', '2026-03-08', 38000, 18, '3923', 'Packaging material - Q4', null, 0, 'approved'],
  // Swift Logistics (idx 2) — freight, 5% GST
  [2, 'SL-2026-001', '2026-01-12', 12000, 5, '996511', 'Local freight - Jan', null, 0, 'paid'],
  [2, 'SL-2026-002', '2026-02-13', 9500, 5, '996511', 'Freight - Feb consignments', null, 0, 'partially_paid'],
  [2, 'SL-2026-003', '2026-03-11', 14000, 5, '996511', 'Freight - Mar inter-city', null, 0, 'approved'],
  // Sharma & Associates (idx 3) — CA services, 18% GST, TDS 194J 10%
  [3, 'SA-2026-001', '2026-02-20', 75000, 18, '998221', 'Statutory audit FY25-26', '194J', 10, 'paid'],
  [3, 'SA-2026-002', '2026-03-19', 30000, 18, '998221', 'GST consulting - Q4', '194J', 10, 'partially_paid'],
  // Realty Trust (idx 4) — rent, 18% GST, TDS 194I 10%
  [4, 'RT-2026-001', '2026-01-01', 35000, 18, '997212', 'Office rent - January 2026', '194I', 10, 'paid'],
  [4, 'RT-2026-002', '2026-02-01', 35000, 18, '997212', 'Office rent - February 2026', '194I', 10, 'draft'],
];

// ---------------------------------------------------------------------------
// Sales invoice: [custIdx, invNo, date, subtotal, gstRate, isInterState, status]
// ---------------------------------------------------------------------------
type SITuple = [number, string, string, number, number, boolean, string];

const SI_DATA: SITuple[] = [
  // Fresh Dairy Mart (idx 0) — intra-state
  [0, 'VMP-2526-0101', '2026-01-04', 120000, 5, false, 'paid'],
  [0, 'VMP-2526-0102', '2026-01-18', 62000, 5, false, 'paid'],
  [0, 'VMP-2526-0103', '2026-02-02', 125000, 5, false, 'paid'],
  [0, 'VMP-2526-0104', '2026-02-20', 52000, 5, false, 'paid'],
  [0, 'VMP-2526-0105', '2026-03-01', 135000, 5, false, 'paid'],
  [0, 'VMP-2526-0106', '2026-03-10', 43000, 5, false, 'sent'],
  [0, 'VMP-2526-0107', '2026-03-18', 68000, 5, false, 'partially_paid'],
  [0, 'VMP-2526-0108', '2026-03-22', 60000, 5, false, 'draft'],
  // Bangalore Dairy Hub (idx 1) — inter-state
  [1, 'VMP-2526-0109', '2026-01-08', 92000, 5, true, 'paid'],
  [1, 'VMP-2526-0110', '2026-02-06', 85000, 5, true, 'paid'],
  [1, 'VMP-2526-0111', '2026-03-05', 90000, 5, true, 'partially_paid'],
  [1, 'VMP-2526-0112', '2026-03-20', 46000, 5, true, 'sent'],
  [1, 'VMP-2526-0113', '2026-03-24', 60000, 5, true, 'draft'],
  // Chennai Milk Depot (idx 2) — inter-state
  [2, 'VMP-2526-0114', '2026-01-14', 75000, 5, true, 'paid'],
  [2, 'VMP-2526-0115', '2026-02-11', 70000, 5, true, 'partially_paid'],
  [2, 'VMP-2526-0116', '2026-03-09', 82000, 5, true, 'partially_paid'],
  [2, 'VMP-2526-0117', '2026-03-15', 28000, 5, true, 'sent'],
  // Delhi Dairy Distributors (idx 3) — inter-state
  [3, 'VMP-2526-0118', '2026-01-19', 105000, 5, true, 'paid'],
  [3, 'VMP-2526-0119', '2026-02-16', 100000, 5, true, 'sent'],
  [3, 'VMP-2526-0120', '2026-03-13', 112000, 5, true, 'draft'],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function computeGst(subtotal: number, rate: number, isInterState: boolean) {
  const tax = Math.round(subtotal * rate) / 100;
  return {
    taxAmount: String(tax),
    cgstAmount: isInterState ? '0' : String(tax / 2),
    sgstAmount: isInterState ? '0' : String(tax / 2),
    igstAmount: isInterState ? String(tax) : '0',
    totalAmount: String(subtotal + tax),
  };
}

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

async function seedBankAccounts(db: Db, tenantId: string) {
  const rows = BANK_ACCOUNTS.map((a) => ({
    tenantId,
    ...a,
    currentBalance: a.openingBalance,
  }));
  return db.insert(bankAccounts).values(rows).returning({ id: bankAccounts.id });
}

async function seedVendors(db: Db, tenantId: string) {
  const rows = VENDOR_DATA.map((v) => ({ tenantId, ...v }));
  return db.insert(vendors).values(rows).onConflictDoNothing().returning({ id: vendors.id, name: vendors.name });
}

async function seedCustomers(db: Db, tenantId: string) {
  const rows = CUSTOMER_DATA.map((c) => ({ tenantId, ...c }));
  return db.insert(customers).values(rows).onConflictDoNothing().returning({ id: customers.id, name: customers.name });
}

async function seedBankTransactions(db: Db, tenantId: string, hdfcId: string) {
  // Sort by date for correct running balance
  const sorted = [...BANK_TXN_DATA].sort((a, b) => a[0].localeCompare(b[0]));
  let balance = 500000;
  const rows = sorted.map(([date, type, amount, narration, reconStatus]) => {
    balance = type === 'credit' ? balance + amount : balance - amount;
    return {
      tenantId,
      bankAccountId: hdfcId,
      transactionDate: date,
      valueDate: date,
      type,
      amount: String(amount),
      narration,
      reference: extractUtr(narration),
      runningBalance: String(balance),
      reconStatus,
    };
  });
  return db.insert(bankTransactions).values(rows).returning({ id: bankTransactions.id });
}

function extractUtr(narration: string): string | undefined {
  const match = narration.match(/UTR\d+/);
  return match ? match[0] : undefined;
}

async function seedPurchaseInvoices(
  db: Db, tenantId: string, vendorIds: string[],
) {
  const rows = PI_DATA.map(([vIdx, invNo, date, subtotal, gstRate, hsnSac, _desc, tds, tdsRate, status]) => {
    const gst = computeGst(subtotal, gstRate, false); // all intra-state MH
    const tdsAmt = tds ? Math.round(subtotal * tdsRate) / 100 : 0;
    const total = subtotal + Number(gst.taxAmount);
    const paid = status === 'paid' ? total : status === 'partially_paid' ? Math.round(total * 0.5) : 0;
    return {
      tenantId,
      invoiceNumber: invNo,
      vendorId: vendorIds[vIdx],
      invoiceDate: date,
      dueDate: addDays(date, VENDOR_DATA[vIdx].paymentTermsDays),
      subtotal: String(subtotal),
      taxAmount: gst.taxAmount,
      totalAmount: String(total),
      amountPaid: String(paid),
      balanceDue: String(total - paid),
      status: status as 'draft' | 'approved' | 'paid' | 'partially_paid',
      placeOfSupply: 'Maharashtra',
      placeOfSupplyCode: '27',
      isInterState: false,
      cgstAmount: gst.cgstAmount,
      sgstAmount: gst.sgstAmount,
      igstAmount: '0',
      cessAmount: '0',
      tdsSection: tds,
      tdsAmount: String(tdsAmt),
    };
  });
  return db.insert(purchaseInvoices).values(rows).returning({ id: purchaseInvoices.id });
}

async function seedSalesInvoices(
  db: Db, tenantId: string, customerIds: string[],
) {
  const stateMap: Record<number, [string, string]> = {
    0: ['Maharashtra', '27'],
    1: ['Karnataka', '29'],
    2: ['Tamil Nadu', '33'],
    3: ['Delhi', '07'],
  };
  const rows = SI_DATA.map(([cIdx, invNo, date, subtotal, gstRate, isInter, status]) => {
    const gst = computeGst(subtotal, gstRate, isInter);
    const total = subtotal + Number(gst.taxAmount);
    const received = status === 'paid' ? total : status === 'partially_paid' ? Math.round(total * 0.6) : 0;
    const [pos, posCode] = stateMap[cIdx] ?? ['Maharashtra', '27'];
    return {
      tenantId,
      invoiceNumber: invNo,
      customerId: customerIds[cIdx],
      invoiceDate: date,
      dueDate: addDays(date, 30),
      subtotal: String(subtotal),
      taxAmount: gst.taxAmount,
      totalAmount: String(total),
      amountReceived: String(received),
      balanceDue: String(total - received),
      status: status as 'draft' | 'sent' | 'paid' | 'partially_paid',
      placeOfSupply: pos,
      placeOfSupplyCode: posCode,
      isInterState: isInter,
      cgstAmount: gst.cgstAmount,
      sgstAmount: gst.sgstAmount,
      igstAmount: gst.igstAmount,
      cessAmount: '0',
    };
  });
  const result = await db.insert(salesInvoices).values(rows).returning({ id: salesInvoices.id });

  // Update invoice sequence
  await db.insert(invoiceSequences).values({
    tenantId,
    financialYear: '2025-26',
    lastSequence: 20,
  }).onConflictDoNothing();

  return result;
}

async function seedPayments(
  db: Db, tenantId: string, vendorIds: string[], piIds: string[], hdfcId: string,
) {
  // 10 payments linked to purchase invoices that are paid or partially_paid
  const paymentData: Array<{ vIdx: number; piIdx: number; date: string; utr: string; amount: number }> = [
    { vIdx: 0, piIdx: 0, date: '2026-01-07', utr: 'UTR2601101', amount: 65000 },
    { vIdx: 0, piIdx: 1, date: '2026-02-05', utr: 'UTR2602101', amount: 78000 },
    { vIdx: 1, piIdx: 5, date: '2026-01-12', utr: 'UTR2601102', amount: 29500 },
    { vIdx: 1, piIdx: 6, date: '2026-02-10', utr: 'UTR2602102', amount: 16520 },
    { vIdx: 2, piIdx: 8, date: '2026-01-14', utr: 'UTR2601103', amount: 12600 },
    { vIdx: 2, piIdx: 9, date: '2026-02-13', utr: 'UTR2602103', amount: 4988 },
    { vIdx: 3, piIdx: 11, date: '2026-02-20', utr: 'UTR2602104', amount: 79650 },
    { vIdx: 4, piIdx: 13, date: '2026-01-18', utr: 'UTR2601104', amount: 37450 },
    { vIdx: 4, piIdx: 14, date: '2026-02-17', utr: 'UTR2602105', amount: 37450 },
    { vIdx: 0, piIdx: 3, date: '2026-03-03', utr: 'UTR2603101', amount: 98000 },
  ];

  const paymentRows = paymentData.map((p) => ({
    tenantId,
    vendorId: vendorIds[p.vIdx],
    bankAccountId: hdfcId,
    paymentDate: p.date,
    amount: String(p.amount),
    paymentMethod: 'bank_transfer' as const,
    utrNumber: p.utr,
    status: 'completed' as const,
  }));

  const inserted = await db.insert(payments).values(paymentRows)
    .returning({ id: payments.id });

  // Allocations
  const allocRows = inserted.map((pay, i) => ({
    tenantId,
    paymentId: pay.id,
    invoiceId: piIds[paymentData[i].piIdx],
    amount: String(paymentData[i].amount),
  }));
  await db.insert(paymentAllocations).values(allocRows);

  return inserted;
}

async function seedReceipts(
  db: Db, tenantId: string, customerIds: string[], siIds: string[], hdfcId: string,
) {
  // 15 receipts matching paid / partially_paid sales invoices
  const receiptData: Array<{ cIdx: number; siIdx: number; date: string; ref: string; amount: number }> = [
    { cIdx: 0, siIdx: 0, date: '2026-01-05', ref: 'UTR2601001', amount: 126000 },
    { cIdx: 0, siIdx: 1, date: '2026-01-25', ref: 'UTR2601005', amount: 65100 },
    { cIdx: 0, siIdx: 2, date: '2026-02-03', ref: 'UTR2602001', amount: 131250 },
    { cIdx: 0, siIdx: 3, date: '2026-02-22', ref: 'UTR2602005', amount: 54600 },
    { cIdx: 0, siIdx: 4, date: '2026-03-02', ref: 'UTR2603001', amount: 141750 },
    { cIdx: 1, siIdx: 8, date: '2026-01-10', ref: 'UTR2601002', amount: 96600 },
    { cIdx: 1, siIdx: 9, date: '2026-02-08', ref: 'UTR2602002', amount: 89250 },
    { cIdx: 1, siIdx: 10, date: '2026-03-07', ref: 'UTR2603002', amount: 56700 },
    { cIdx: 2, siIdx: 13, date: '2026-01-15', ref: 'UTR2601003', amount: 78750 },
    { cIdx: 2, siIdx: 14, date: '2026-02-12', ref: 'UTR2602003', amount: 44100 },
    { cIdx: 2, siIdx: 15, date: '2026-03-10', ref: 'UTR2603003', amount: 51660 },
    { cIdx: 3, siIdx: 17, date: '2026-01-20', ref: 'UTR2601004', amount: 110250 },
    { cIdx: 3, siIdx: 18, date: '2026-02-18', ref: 'UTR2602004', amount: 105000 },
    { cIdx: 0, siIdx: 6, date: '2026-03-18', ref: 'UTR2603005', amount: 42840 },
    { cIdx: 0, siIdx: 7, date: '2026-03-12', ref: 'UTR2603007', amount: 45000 },
  ];

  const receiptRows = receiptData.map((r) => ({
    tenantId,
    customerId: customerIds[r.cIdx],
    bankAccountId: hdfcId,
    receiptDate: r.date,
    amount: String(r.amount),
    paymentMethod: 'bank_transfer' as const,
    referenceNumber: r.ref,
  }));

  const inserted = await db.insert(paymentReceipts).values(receiptRows)
    .returning({ id: paymentReceipts.id });

  const allocRows = inserted.map((rec, i) => ({
    tenantId,
    receiptId: rec.id,
    invoiceId: siIds[receiptData[i].siIdx],
    amount: String(receiptData[i].amount),
  }));
  await db.insert(receiptAllocations).values(allocRows);

  return inserted;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function seedVrindavanData(db: Db, tenantId: string) {
  console.log('Seeding Vrindavan Milk Products test data...');

  const accts = await seedBankAccounts(db, tenantId);
  const hdfcId = accts[0].id;
  console.log(`  Bank accounts: ${accts.length}`);

  const vRows = await seedVendors(db, tenantId);
  const vendorIds = vRows.map((v) => v.id);
  console.log(`  Vendors: ${vRows.length}`);

  const cRows = await seedCustomers(db, tenantId);
  const customerIds = cRows.map((c) => c.id);
  console.log(`  Customers: ${cRows.length}`);

  const txns = await seedBankTransactions(db, tenantId, hdfcId);
  console.log(`  Bank transactions: ${txns.length}`);

  const piRows = await seedPurchaseInvoices(db, tenantId, vendorIds);
  const piIds = piRows.map((p) => p.id);
  console.log(`  Purchase invoices: ${piRows.length}`);

  const siRows = await seedSalesInvoices(db, tenantId, customerIds);
  const siIds = siRows.map((s) => s.id);
  console.log(`  Sales invoices: ${siRows.length}`);

  const payRows = await seedPayments(db, tenantId, vendorIds, piIds, hdfcId);
  console.log(`  Payments: ${payRows.length}`);

  const recRows = await seedReceipts(db, tenantId, customerIds, siIds, hdfcId);
  console.log(`  Receipts: ${recRows.length}`);

  console.log('Vrindavan seed complete.');
}
