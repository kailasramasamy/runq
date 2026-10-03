import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  recurringBills, purchaseInvoices, vendors, payments, paymentAllocations,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateRecurringBillInput, UpdateRecurringBillInput } from '@runq/validators';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import type { StorageProvider } from '../../utils/storage';
import { PurchaseInvoiceService } from './purchase-invoice.service';
import { generateForAgreement, periodLabel } from './recurring-bill-generator';

/** Expense account a new agreement books to when none is chosen. */
const DEFAULT_ACCOUNT = { rent: '5301', transport: '5700', other: '5002' } as const;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Rent / transport agreements and the money owed or held against each. */
export class RecurringBillService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async create(input: CreateRecurringBillInput, userId: string) {
    if (input.endMonth && input.endMonth < input.startMonth) {
      throw new ValidationError('End month is before the start month');
    }
    const [row] = await this.db.insert(recurringBills).values({
      tenantId: this.tenantId,
      vendorId: input.vendorId,
      title: input.title,
      category: input.category,
      expenseAccountCode: input.expenseAccountCode || DEFAULT_ACCOUNT[input.category],
      amount: String(input.amount),
      frequency: input.frequency,
      billDay: input.billDay,
      startMonth: input.startMonth,
      endMonth: input.endMonth ?? null,
      createdBy: userId,
    }).returning();
    // Raise this month's bill now if its day has already come, rather than
    // waiting for the next scheduler tick.
    await generateForAgreement(this.db, row!);
    return row!;
  }

  /** Changes apply to bills raised from now on; past months keep their amount. */
  async update(id: string, input: UpdateRecurringBillInput) {
    await this.load(id);
    const [row] = await this.db.update(recurringBills).set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.expenseAccountCode !== undefined && { expenseAccountCode: input.expenseAccountCode }),
      ...(input.amount !== undefined && { amount: String(input.amount) }),
      ...(input.billDay !== undefined && { billDay: input.billDay }),
      ...(input.endMonth !== undefined && { endMonth: input.endMonth }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedAt: new Date(),
    }).where(eq(recurringBills.id, id)).returning();
    if (row!.isActive) await generateForAgreement(this.db, row!);
    return row!;
  }

  /**
   * Delete an agreement set up by mistake. Its bills go with it — unwound from
   * the GL — but only while nothing has been paid against any of them; once
   * money has moved, the history stays and the agreement can be paused or
   * given an end month instead.
   */
  async remove(id: string, storage: StorageProvider, userId: string) {
    await this.load(id);
    const bills = await this.db
      .select({ id: purchaseInvoices.id, paid: purchaseInvoices.amountPaid })
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.recurringBillId, id));
    const [allocated] = bills.length ? await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(paymentAllocations)
      .where(inArray(paymentAllocations.invoiceId, bills.map((b) => b.id))) : [{ n: 0 }];
    if (bills.some((b) => Number(b.paid) > 0) || (allocated?.n ?? 0) > 0) {
      throw new ConflictError('Payments are recorded against this agreement — pause it or set an end month instead');
    }
    const invoices = new PurchaseInvoiceService(this.db, this.tenantId);
    for (const b of bills) await invoices.hardDelete(b.id, storage, userId);
    await this.db.delete(recurringBills).where(eq(recurringBills.id, id));
    return { id, billsRemoved: bills.length };
  }

  /** Every agreement with what's outstanding, advance held and last payment. */
  async list() {
    const rows = await this.db
      .select({ a: recurringBills, vendorName: vendors.name })
      .from(recurringBills)
      .innerJoin(vendors, eq(vendors.id, recurringBills.vendorId))
      .where(eq(recurringBills.tenantId, this.tenantId))
      .orderBy(desc(recurringBills.isActive), asc(recurringBills.category), asc(recurringBills.title));
    const totals = await this.billTotals(rows.map((r) => r.a.id));
    const bills = new PurchaseInvoiceService(this.db, this.tenantId);
    return Promise.all(rows.map(async ({ a, vendorName }) => ({
      ...a,
      vendorName,
      ...(totals.get(a.id) ?? { billed: 0, paid: 0, outstanding: 0 }),
      advanceHeld: r2(await bills.getOpenAdvanceBalance(a.vendorId)),
      lastPayment: await this.lastPayment(a.vendorId),
    })));
  }

  /** One agreement with its month-by-month bills and the payments against it. */
  async detail(id: string) {
    const a = await this.load(id);
    const [vendor] = await this.db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, a.vendorId));
    const months = await this.db
      .select({
        id: purchaseInvoices.id,
        period: purchaseInvoices.recurringPeriod,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        invoiceDate: purchaseInvoices.invoiceDate,
        total: purchaseInvoices.totalAmount,
        paid: purchaseInvoices.amountPaid,
        balance: purchaseInvoices.balanceDue,
        status: purchaseInvoices.status,
      })
      .from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.recurringBillId, id), ne(purchaseInvoices.status, 'cancelled')))
      .orderBy(desc(purchaseInvoices.recurringPeriod));
    const labelled = months.map((m) => ({ ...m, label: periodLabel(m.period!, a.frequency) }));
    const totals = (await this.billTotals([id])).get(id) ?? { billed: 0, paid: 0, outstanding: 0 };
    const advanceHeld = r2(await new PurchaseInvoiceService(this.db, this.tenantId).getOpenAdvanceBalance(a.vendorId));
    return {
      ...a, vendorName: vendor?.name ?? '', ...totals, advanceHeld,
      months: labelled, payments: await this.vendorPayments(a),
    };
  }

  private async load(id: string) {
    const [a] = await this.db.select().from(recurringBills)
      .where(and(eq(recurringBills.tenantId, this.tenantId), eq(recurringBills.id, id)));
    if (!a) throw new NotFoundError('Recurring bill');
    return a;
  }

  private async billTotals(ids: string[]) {
    if (!ids.length) return new Map<string, { billed: number; paid: number; outstanding: number }>();
    const rows = await this.db
      .select({
        id: purchaseInvoices.recurringBillId,
        billed: sql<string>`coalesce(sum(${purchaseInvoices.totalAmount}), 0)`,
        paid: sql<string>`coalesce(sum(${purchaseInvoices.amountPaid}), 0)`,
        outstanding: sql<string>`coalesce(sum(${purchaseInvoices.balanceDue}), 0)`,
      })
      .from(purchaseInvoices)
      .where(and(inArray(purchaseInvoices.recurringBillId, ids), ne(purchaseInvoices.status, 'cancelled')))
      .groupBy(purchaseInvoices.recurringBillId);
    return new Map(rows.map((r) => [r.id!, {
      billed: r2(Number(r.billed)), paid: r2(Number(r.paid)), outstanding: r2(Number(r.outstanding)),
    }]));
  }

  private async lastPayment(vendorId: string) {
    const [p] = await this.db
      .select({ date: payments.paymentDate, amount: payments.amount })
      .from(payments)
      .where(and(eq(payments.tenantId, this.tenantId), eq(payments.vendorId, vendorId), eq(payments.status, 'completed')))
      .orderBy(desc(payments.paymentDate), desc(payments.createdAt))
      .limit(1);
    return p ? { date: p.date, amount: Number(p.amount) } : null;
  }

  /**
   * Payments that touched this agreement's months, plus unused advances.
   * Pending ones (recorded on the AP payments page, awaiting approval) are
   * included so a payment never silently goes missing from the ledger.
   */
  private async vendorPayments(a: { id: string; vendorId: string; frequency: 'monthly' | 'semi_monthly' }) {
    const rows = await this.db
      .select({
        id: payments.id,
        date: payments.paymentDate,
        amount: payments.amount,
        reference: payments.utrNumber,
        status: payments.status,
      })
      .from(payments)
      .where(and(
        eq(payments.tenantId, this.tenantId),
        eq(payments.vendorId, a.vendorId),
        inArray(payments.status, ['completed', 'pending']),
      ))
      .orderBy(desc(payments.paymentDate), desc(payments.createdAt));
    const applied = await this.appliedTotals(rows.map((p) => p.id));
    const paidFor = await this.paidFor(rows.map((p) => p.id), a.id, a.frequency);
    return rows
      .map((p) => ({
        id: p.id, date: p.date, amount: Number(p.amount), reference: p.reference,
        status: p.status, unapplied: r2(Number(p.amount) - (applied.get(p.id) ?? 0)),
        paidFor: paidFor.get(p.id) ?? [],
      }))
      // This agreement's payments, plus any advance still waiting to be used.
      .filter((p) => p.paidFor.length > 0 || p.unapplied > 0);
  }

  /** How much of each payment has been applied to any bill. */
  private async appliedTotals(paymentIds: string[]) {
    if (!paymentIds.length) return new Map<string, number>();
    const rows = await this.db
      .select({
        paymentId: paymentAllocations.paymentId,
        total: sql<string>`sum(${paymentAllocations.amount})`,
      })
      .from(paymentAllocations)
      .where(inArray(paymentAllocations.paymentId, paymentIds))
      .groupBy(paymentAllocations.paymentId);
    return new Map(rows.map((r) => [r.paymentId, Number(r.total)]));
  }

  /** Which of this agreement's periods each payment settled, oldest first. */
  private async paidFor(paymentIds: string[], agreementId: string, frequency: 'monthly' | 'semi_monthly') {
    const out = new Map<string, Array<{ label: string; amount: number }>>();
    if (!paymentIds.length) return out;
    const rows = await this.db
      .select({
        paymentId: paymentAllocations.paymentId,
        period: purchaseInvoices.recurringPeriod,
        amount: paymentAllocations.amount,
      })
      .from(paymentAllocations)
      .innerJoin(purchaseInvoices, eq(purchaseInvoices.id, paymentAllocations.invoiceId))
      .where(and(
        inArray(paymentAllocations.paymentId, paymentIds),
        eq(purchaseInvoices.recurringBillId, agreementId),
      ))
      .orderBy(asc(purchaseInvoices.recurringPeriod));
    for (const r of rows) {
      const list = out.get(r.paymentId) ?? [];
      list.push({ label: periodLabel(r.period!, frequency), amount: Number(r.amount) });
      out.set(r.paymentId, list);
    }
    return out;
  }
}
