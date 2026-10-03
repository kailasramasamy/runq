import { and, eq, notInArray, sql } from 'drizzle-orm';
import { purchaseInvoices, vendors, recurringBills } from '@runq/db';
import type { Db } from '@runq/db';
import { periodLabel } from '../../ap/recurring-bill-generator';
import { inScope, money, monthEnd, monthOf, rangeLabel, WHOLE_MONTH, type ToPayItem, type ToPayScope } from '../types';

/**
 * Vendor bills. Bills raised by a rent / transport agreement are reported
 * under their own category and belong to the period they bill; other bills
 * belong to their bill date's month.
 */
export async function financeItems(db: Db, tenantId: string, scope: ToPayScope): Promise<ToPayItem[]> {
  // A 2nd-half rent bill's period is the 16th — compare on the month.
  const period = sql`date_trunc('month', coalesce(${purchaseInvoices.recurringPeriod}, ${purchaseInvoices.invoiceDate}))::date`;
  const rows = await db
    .select({
      id: purchaseInvoices.id,
      number: purchaseInvoices.invoiceNumber,
      invoiceDate: purchaseInvoices.invoiceDate,
      dueDate: purchaseInvoices.dueDate,
      total: purchaseInvoices.totalAmount,
      paid: purchaseInvoices.amountPaid,
      vendor: vendors.name,
      agreementId: recurringBills.id,
      agreementTitle: recurringBills.title,
      frequency: recurringBills.frequency,
      recurringPeriod: purchaseInvoices.recurringPeriod,
    })
    .from(purchaseInvoices)
    .innerJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId))
    .leftJoin(recurringBills, eq(recurringBills.id, purchaseInvoices.recurringBillId))
    .where(and(
      eq(purchaseInvoices.tenantId, tenantId),
      notInArray(purchaseInvoices.status, ['draft', 'cancelled']),
      scope.kind === 'month' ? sql`${period} = ${scope.month}` : sql`${purchaseInvoices.balanceDue} > 0`,
    ));
  return rows.map(toItem).filter((i) => inScope(scope, i));
}

type Row = {
  id: string; number: string; invoiceDate: string; dueDate: string; total: string; paid: string;
  vendor: string; agreementId: string | null; agreementTitle: string | null;
  frequency: 'monthly' | 'semi_monthly' | null; recurringPeriod: string | null;
};

/** A twice-monthly bill covers the 1st–15th or the 16th–month end. */
function halfOf(period: string, frequency: Row['frequency']) {
  if (frequency !== 'semi_monthly') return WHOLE_MONTH;
  const first = period.endsWith('-01');
  const end = first ? `${period.slice(0, 8)}15` : monthEnd(period);
  return { subPeriod: rangeLabel(period, end), subPeriodStart: period, detail: null };
}

function toItem(r: Row): ToPayItem {
  const base = { id: r.id, dueDate: r.dueDate, ...money(Number(r.total), Number(r.paid)) };
  if (r.agreementId && r.recurringPeriod) {
    return {
      ...base,
      category: 'rent_transport',
      title: r.agreementTitle ?? r.vendor,
      subtitle: `${periodLabel(r.recurringPeriod, r.frequency ?? 'monthly')} · ${r.vendor}`,
      period: monthOf(r.recurringPeriod),
      ...halfOf(r.recurringPeriod, r.frequency),
      webLink: `/finance/ap/recurring/${r.agreementId}`,
      mobileLink: `/recurring-bills/${r.agreementId}`,
    };
  }
  return {
    ...base,
    category: 'bills',
    title: r.vendor,
    subtitle: `Bill ${r.number}`,
    period: monthOf(r.invoiceDate),
    ...WHOLE_MONTH,
    webLink: `/finance/ap/bills/${r.id}`,
    mobileLink: '/purchases/bills',
  };
}
