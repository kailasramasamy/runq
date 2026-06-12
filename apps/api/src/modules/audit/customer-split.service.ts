import { and, eq, gte, lte, sql, inArray } from 'drizzle-orm';
import { salesInvoices, customers } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { AuditService } from '../../utils/audit';
import { toNumber } from '../../utils/decimal';

export type SplitRule = 'larger_per_day' | 'smaller_per_day';

export interface SplitInput {
  sourceCustomerId: string;
  targetCustomerId: string;
  dateFrom: string;
  dateTo: string;
  rule: SplitRule;
}

export interface SplitInvoiceRow {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  currentCustomerId: string;
  willMoveToCustomerId: string;
}

export interface SplitPreview {
  sourceCustomerName: string;
  targetCustomerName: string;
  toMove: SplitInvoiceRow[];
  daysSkipped: { date: string; reason: string }[];
}

/**
 * Reassigns a subset of past invoices from one customer to another using a
 * per-day rule. Built for the case where a single customer record was used
 * to invoice multiple delivery centres / branches, and only later split
 * into distinct records — past invoices need to be retro-attributed.
 *
 * Safety:
 *   - Only moves invoices whose place-of-supply / GST shape would not change
 *     under the new customer (state + GSTIN match). Anything that would
 *     alter the IGST/CGST split is skipped so books don't silently
 *     re-classify a tax line.
 *   - customer_id is the only field touched on each invoice; receipt_
 *     allocations and journal_entries reference the invoice by id, so
 *     they stay valid automatically.
 */
export class CustomerSplitService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async preview(input: SplitInput): Promise<SplitPreview> {
    const { source, target } = await this.loadCustomers(input);
    this.assertGstCompatible(source, target);

    const dayRows = await this.fetchDayGroups(input);
    const toMove: SplitInvoiceRow[] = [];
    const daysSkipped: SplitPreview['daysSkipped'] = [];

    for (const day of dayRows) {
      if (day.invoices.length < 2) {
        daysSkipped.push({ date: day.date, reason: `Only ${day.invoices.length} invoice on this day — rule needs at least 2` });
        continue;
      }
      const sorted = [...day.invoices].sort((a, b) => b.totalAmount - a.totalAmount);
      const pick = input.rule === 'larger_per_day' ? sorted[0] : sorted[sorted.length - 1];
      if (!pick) continue;
      toMove.push({
        invoiceId: pick.id,
        invoiceNumber: pick.invoiceNumber,
        invoiceDate: pick.invoiceDate,
        totalAmount: pick.totalAmount,
        currentCustomerId: input.sourceCustomerId,
        willMoveToCustomerId: input.targetCustomerId,
      });
    }

    return {
      sourceCustomerName: source.name,
      targetCustomerName: target.name,
      toMove,
      daysSkipped,
    };
  }

  async apply(input: SplitInput, userId?: string): Promise<{ moved: number; daysSkipped: SplitPreview['daysSkipped'] }> {
    const preview = await this.preview(input);
    if (preview.toMove.length === 0) {
      return { moved: 0, daysSkipped: preview.daysSkipped };
    }

    const ids = preview.toMove.map((r) => r.invoiceId);
    await this.db.transaction(async (tx) => {
      await tx.update(salesInvoices)
        .set({ customerId: input.targetCustomerId, updatedAt: new Date() })
        .where(and(
          eq(salesInvoices.tenantId, this.tenantId),
          inArray(salesInvoices.id, ids),
        ));
    });

    await new AuditService(this.db, this.tenantId).log({
      userId,
      action: 'customer_split',
      entityType: 'customer',
      entityId: input.targetCustomerId,
      metadata: {
        sourceCustomerId: input.sourceCustomerId,
        targetCustomerId: input.targetCustomerId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        rule: input.rule,
        invoiceIds: ids,
        count: ids.length,
      },
    });

    return { moved: ids.length, daysSkipped: preview.daysSkipped };
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private async loadCustomers(input: SplitInput) {
    if (input.sourceCustomerId === input.targetCustomerId) {
      throw new ConflictError('Source and target customers must be different');
    }
    const [source] = await this.db.select().from(customers)
      .where(and(eq(customers.id, input.sourceCustomerId), eq(customers.tenantId, this.tenantId))).limit(1);
    if (!source) throw new NotFoundError('Source customer');
    const [target] = await this.db.select().from(customers)
      .where(and(eq(customers.id, input.targetCustomerId), eq(customers.tenantId, this.tenantId))).limit(1);
    if (!target) throw new NotFoundError('Target customer');
    return { source, target };
  }

  private assertGstCompatible(
    source: typeof customers.$inferSelect,
    target: typeof customers.$inferSelect,
  ): void {
    const sState = source.state ?? '';
    const tState = target.state ?? '';
    if (sState !== tState) {
      throw new ConflictError(`Cannot split: source state '${sState || 'unset'}' ≠ target state '${tState || 'unset'}'. GST IGST/CGST split would change. Issue credit + new invoice instead.`);
    }
    const sGstin = source.gstin ?? '';
    const tGstin = target.gstin ?? '';
    if (sGstin && tGstin && sGstin !== tGstin) {
      throw new ConflictError(`Cannot split: source GSTIN '${sGstin}' ≠ target GSTIN '${tGstin}'. Issue credit + new invoice instead.`);
    }
  }

  private async fetchDayGroups(input: SplitInput): Promise<Array<{
    date: string;
    invoices: Array<{ id: string; invoiceNumber: string; invoiceDate: string; totalAmount: number }>;
  }>> {
    const rows = await this.db.select({
      id: salesInvoices.id,
      invoiceNumber: salesInvoices.invoiceNumber,
      invoiceDate: salesInvoices.invoiceDate,
      totalAmount: salesInvoices.totalAmount,
    })
      .from(salesInvoices)
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        eq(salesInvoices.customerId, input.sourceCustomerId),
        gte(salesInvoices.invoiceDate, input.dateFrom),
        lte(salesInvoices.invoiceDate, input.dateTo),
        sql`${salesInvoices.status} NOT IN ('cancelled', 'draft')`,
      ))
      .orderBy(salesInvoices.invoiceDate);

    const byDay = new Map<string, Array<{ id: string; invoiceNumber: string; invoiceDate: string; totalAmount: number }>>();
    for (const r of rows) {
      const list = byDay.get(r.invoiceDate) ?? [];
      list.push({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        invoiceDate: r.invoiceDate,
        totalAmount: toNumber(r.totalAmount),
      });
      byDay.set(r.invoiceDate, list);
    }
    return Array.from(byDay.entries())
      .map(([date, invoices]) => ({ date, invoices }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
