import { and, eq, inArray } from 'drizzle-orm';
import { recurringBills, purchaseInvoices, vendors } from '@runq/db';
import type { Db } from '@runq/db';
import { GLService } from '../gl/gl.service';
import { PurchaseInvoiceService } from './purchase-invoice.service';

type Agreement = typeof recurringBills.$inferSelect;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date in IST as YYYY-MM-DD — bills are dated in the tenant's calendar. */
export function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

type Frequency = 'monthly' | 'semi_monthly';
type Schedule = { startMonth: string; endMonth: string | null; billDay: number; frequency?: Frequency };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** "Sep 2026", or "Sep 2026 — 1st half" / "2nd half" for a twice-monthly bill. */
export function periodLabel(period: string, frequency: Frequency = 'monthly'): string {
  const month = `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
  if (frequency !== 'semi_monthly') return month;
  return `${month} — ${period.endsWith('-16') ? '2nd' : '1st'} half`;
}

/** First of the month after [period]'s month, as YYYY-MM-DD. */
function nextMonthStart(period: string): string {
  let y = Number(period.slice(0, 4));
  let m = Number(period.slice(5, 7)) + 1;
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${pad(m)}-01`;
}

/**
 * Date a period's bill is raised and due — after the period, since these are
 * paid in arrears. Monthly: the bill day of the following month (Oct → 1 Nov).
 * Twice-monthly: the 1st half (1–15) on the 16th, the 2nd half on the 1st of
 * the next month.
 */
export function billDateFor(a: Schedule, period: string): string {
  if (a.frequency === 'semi_monthly') {
    return period.endsWith('-01') ? `${period.slice(0, 8)}16` : nextMonthStart(period);
  }
  return `${nextMonthStart(period).slice(0, 8)}${pad(a.billDay)}`;
}

/** A period's share of the monthly amount; the 2nd half absorbs any odd paisa. */
export function billAmount(a: { amount: string; frequency?: Frequency }, period: string): number {
  const amount = Number(a.amount);
  if (a.frequency !== 'semi_monthly') return amount;
  const half = r2(amount / 2);
  return period.endsWith('-16') ? r2(amount - half) : half;
}

/**
 * Periods an agreement should have billed by [today], from its start month,
 * stopping at its end month, each only once the period is over and its bill
 * date has arrived. Monthly periods are the 1st of the month; twice-monthly
 * ones are the 1st and the 16th.
 */
export function duePeriods(a: Schedule, today: string): string[] {
  const out: string[] = [];
  let y = Number(a.startMonth.slice(0, 4));
  let m = Number(a.startMonth.slice(5, 7));
  for (;;) {
    const month = `${y}-${pad(m)}-01`;
    if (a.endMonth && month > a.endMonth) break;
    const slots = a.frequency === 'semi_monthly' ? [month, `${y}-${pad(m)}-16`] : [month];
    const due = slots.filter((p) => billDateFor(a, p) <= today);
    out.push(...due);
    if (due.length < slots.length) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * Raise every bill an agreement is owed but doesn't have yet. Each bill is
 * approved straight away (the amount is fixed by the agreement), posted to
 * the agreement's expense account, and draws down any open vendor advance.
 * Safe to re-run: one bill per agreement per month, enforced by a unique index.
 */
export async function generateForAgreement(db: Db, a: Agreement, today = todayIst()): Promise<number> {
  if (!a.isActive) return 0;
  const periods = duePeriods(a, today);
  if (!periods.length) return 0;
  const have = await db
    .select({ period: purchaseInvoices.recurringPeriod })
    .from(purchaseInvoices)
    .where(and(eq(purchaseInvoices.recurringBillId, a.id), inArray(purchaseInvoices.recurringPeriod, periods)));
  const billed = new Set(have.map((h) => h.period));
  let created = 0;
  for (const period of periods) {
    if (billed.has(period)) continue;
    await raiseBill(db, a, period);
    created += 1;
  }
  return created;
}

async function raiseBill(db: Db, a: Agreement, period: string): Promise<void> {
  const billDate = billDateFor(a, period);
  const amount = billAmount(a, period);
  const half = a.frequency === 'semi_monthly' ? (period.endsWith('-16') ? 'H2' : 'H1') : '';
  const bills = new PurchaseInvoiceService(db, a.tenantId);
  const bill = await bills.create({
    vendorId: a.vendorId,
    invoiceNumber: `REC-${period.slice(0, 4)}${period.slice(5, 7)}${half}-${a.id.slice(0, 6).toUpperCase()}`,
    invoiceDate: billDate,
    dueDate: billDate,
    items: [{ itemName: `${a.title} — ${periodLabel(period, a.frequency)}`, quantity: 1, unitPrice: amount, amount }],
    subtotal: amount,
    taxAmount: 0,
    totalAmount: amount,
    reverseCharge: false,
  });
  await db.update(purchaseInvoices).set({
    status: 'approved',
    matchStatus: 'matched',
    approvedAt: new Date(),
    recurringBillId: a.id,
    recurringPeriod: period,
    updatedAt: new Date(),
  }).where(eq(purchaseInvoices.id, bill.id));

  const [vendor] = await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, a.vendorId));
  await new GLService(db, a.tenantId).postPurchaseInvoice({
    totalAmount: amount,
    date: billDate,
    id: bill.id,
    vendorName: vendor?.name ?? '',
    invoiceNumber: bill.invoiceNumber,
    expenseAccountCode: a.expenseAccountCode,
  });
  await bills.applyAdvancesToBill(bill.id);
}
