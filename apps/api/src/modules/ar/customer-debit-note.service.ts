import { eq, and, sql } from 'drizzle-orm';
import { customerDebitNotes, customerDebitNoteItems, customers, salesInvoices } from '@runq/db';
import type { Db } from '@runq/db';
import type { CustomerDebitNote, CustomerDebitNoteItem, PaginationMeta } from '@runq/types';
import type {
  CreateCustomerDebitNoteInput,
  UpdateCustomerDebitNoteInput,
  CustomerDebitNoteFilter,
  CreditNoteItemInput,
} from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { decimalAdd, toNumber } from '../../utils/decimal';
import { AuditService } from '../../utils/audit';
import { GLService } from '../gl/gl.service';

export interface CustomerDebitNoteListParams {
  page: number;
  limit: number;
  filters: CustomerDebitNoteFilter;
}

export interface CustomerDebitNoteListResult {
  data: (CustomerDebitNote & { customerName: string })[];
  meta: PaginationMeta;
}

interface TaxRollup {
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  total: number;
}

export class CustomerDebitNoteService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  private audit(): AuditService {
    return new AuditService(this.db, this.tenantId);
  }

  async list(params: CustomerDebitNoteListParams): Promise<CustomerDebitNoteListResult> {
    const { page, limit, filters } = params;
    const { offset } = applyPagination(page, limit);

    const baseWhere = and(
      eq(customerDebitNotes.tenantId, this.tenantId),
      filters.customerId ? eq(customerDebitNotes.customerId, filters.customerId) : undefined,
      filters.invoiceId ? eq(customerDebitNotes.invoiceId, filters.invoiceId) : undefined,
      filters.status ? eq(customerDebitNotes.status, filters.status) : undefined,
    );

    const [rows, countResult] = await Promise.all([
      this.db
        .select({ note: customerDebitNotes, customerName: customers.name })
        .from(customerDebitNotes)
        .innerJoin(customers, eq(customerDebitNotes.customerId, customers.id))
        .where(baseWhere)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(customerDebitNotes).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    const data = rows.map((r) => ({ ...this.toNote(r.note), customerName: r.customerName }));
    return { data, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(id: string): Promise<CustomerDebitNote & { customerName: string }> {
    const [row] = await this.db
      .select({ note: customerDebitNotes, customerName: customers.name })
      .from(customerDebitNotes)
      .innerJoin(customers, eq(customerDebitNotes.customerId, customers.id))
      .where(and(eq(customerDebitNotes.id, id), eq(customerDebitNotes.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Customer debit note');

    const itemRows = await this.db
      .select()
      .from(customerDebitNoteItems)
      .where(eq(customerDebitNoteItems.customerDebitNoteId, id));

    return {
      ...this.toNote(row.note),
      customerName: row.customerName,
      items: itemRows.map((i) => this.toItem(i)),
    };
  }

  async create(input: CreateCustomerDebitNoteInput): Promise<CustomerDebitNote> {
    if (input.invoiceId) await this.validateInvoiceExists(input.invoiceId);

    const debitNoteNumber = await this.generateNumber();
    const rollup = this.rollupTax(input.items);
    const { amendsNumber, amendsDate } = await this.resolveAmendsMeta(
      input.invoiceId ?? null,
      input.amendsInvoiceNumber ?? null,
      input.amendsInvoiceDate ?? null,
    );

    const [row] = await this.db
      .insert(customerDebitNotes)
      .values({
        tenantId: this.tenantId,
        debitNoteNumber,
        customerId: input.customerId,
        invoiceId: input.invoiceId ?? null,
        issueDate: input.issueDate,
        amount: rollup.total.toFixed(2),
        reason: input.reason,
        status: 'draft',
        taxableValue: rollup.taxableValue.toFixed(2),
        cgstAmount: rollup.cgstAmount.toFixed(2),
        sgstAmount: rollup.sgstAmount.toFixed(2),
        igstAmount: rollup.igstAmount.toFixed(2),
        cessAmount: rollup.cessAmount.toFixed(2),
        placeOfSupply: input.placeOfSupply ?? null,
        placeOfSupplyCode: input.placeOfSupplyCode ?? null,
        isInterState: input.isInterState ?? null,
        reverseCharge: input.reverseCharge ?? false,
        amendsInvoiceNumber: amendsNumber,
        amendsInvoiceDate: amendsDate,
      })
      .returning();

    if (!row) throw new ConflictError('Failed to create customer debit note');

    await this.insertItems(row.id, input.items);
    return this.toNote(row);
  }

  async update(id: string, input: UpdateCustomerDebitNoteInput): Promise<CustomerDebitNote> {
    const existing = await this.findRaw(id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only draft customer debit notes can be updated');
    }

    if (input.invoiceId) await this.validateInvoiceExists(input.invoiceId);

    let rollupSet: Partial<typeof customerDebitNotes.$inferInsert> = {};
    if (input.items) {
      const rollup = this.rollupTax(input.items);
      rollupSet = {
        amount: rollup.total.toFixed(2),
        taxableValue: rollup.taxableValue.toFixed(2),
        cgstAmount: rollup.cgstAmount.toFixed(2),
        sgstAmount: rollup.sgstAmount.toFixed(2),
        igstAmount: rollup.igstAmount.toFixed(2),
        cessAmount: rollup.cessAmount.toFixed(2),
      };
      await this.db.delete(customerDebitNoteItems).where(eq(customerDebitNoteItems.customerDebitNoteId, id));
      await this.insertItems(id, input.items);
    }

    const [row] = await this.db
      .update(customerDebitNotes)
      .set({
        ...(input.customerId !== undefined && { customerId: input.customerId }),
        ...(input.invoiceId !== undefined && { invoiceId: input.invoiceId ?? null }),
        ...(input.issueDate !== undefined && { issueDate: input.issueDate }),
        ...(input.reason !== undefined && { reason: input.reason }),
        ...(input.placeOfSupply !== undefined && { placeOfSupply: input.placeOfSupply ?? null }),
        ...(input.placeOfSupplyCode !== undefined && { placeOfSupplyCode: input.placeOfSupplyCode ?? null }),
        ...(input.isInterState !== undefined && { isInterState: input.isInterState ?? null }),
        ...(input.reverseCharge !== undefined && { reverseCharge: input.reverseCharge }),
        ...(input.amendsInvoiceNumber !== undefined && { amendsInvoiceNumber: input.amendsInvoiceNumber ?? null }),
        ...(input.amendsInvoiceDate !== undefined && { amendsInvoiceDate: input.amendsInvoiceDate ?? null }),
        ...rollupSet,
        updatedAt: new Date(),
      })
      .where(and(eq(customerDebitNotes.id, id), eq(customerDebitNotes.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Customer debit note');
    return this.toNote(row);
  }

  async issue(id: string): Promise<CustomerDebitNote> {
    const existing = await this.findRaw(id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only draft customer debit notes can be issued');
    }

    const [row] = await this.db
      .update(customerDebitNotes)
      .set({ status: 'issued', updatedAt: new Date() })
      .where(and(eq(customerDebitNotes.id, id), eq(customerDebitNotes.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Customer debit note');

    const [customerRow] = await this.db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, existing.customerId))
      .limit(1);

    const gl = new GLService(this.db, this.tenantId);
    await gl.postCustomerDebitNote({
      amount: toNumber(existing.amount),
      date: existing.issueDate,
      id,
      customerName: customerRow?.name ?? '',
      taxableValue: toNumber(existing.taxableValue),
      cgstAmount: toNumber(existing.cgstAmount),
      sgstAmount: toNumber(existing.sgstAmount),
      igstAmount: toNumber(existing.igstAmount),
      cessAmount: toNumber(existing.cessAmount),
    });

    return this.toNote(row);
  }

  /**
   * Customer DN is "applied" when associated with an invoice — increases that
   * invoice's totalAmount + balanceDue by the DN amount. If no invoice linked,
   * the DN sits on the customer ledger as an additional receivable.
   */
  async apply(id: string): Promise<CustomerDebitNote> {
    const existing = await this.findRaw(id);
    if (existing.status !== 'issued') {
      throw new ConflictError('Only issued customer debit notes can be applied');
    }

    if (existing.invoiceId) {
      const [invoice] = await this.db
        .select()
        .from(salesInvoices)
        .where(and(eq(salesInvoices.id, existing.invoiceId), eq(salesInvoices.tenantId, this.tenantId)))
        .limit(1);
      if (invoice) {
        const newBalance = decimalAdd(invoice.balanceDue, existing.amount);
        const newTotal   = decimalAdd(invoice.totalAmount, existing.amount);
        await this.db
          .update(salesInvoices)
          .set({ balanceDue: newBalance, totalAmount: newTotal, updatedAt: new Date() })
          .where(and(eq(salesInvoices.id, existing.invoiceId), eq(salesInvoices.tenantId, this.tenantId)));
      }
    }

    await this.db
      .update(customerDebitNotes)
      .set({ status: 'adjusted', updatedAt: new Date() })
      .where(and(eq(customerDebitNotes.id, id), eq(customerDebitNotes.tenantId, this.tenantId)));

    await this.audit().log({ action: 'applied', entityType: 'customer_debit_note', entityId: id });
    return this.toNote(await this.findRaw(id));
  }

  async cancel(id: string): Promise<void> {
    const existing = await this.findRaw(id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only draft customer debit notes can be cancelled');
    }

    await this.db
      .update(customerDebitNotes)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(customerDebitNotes.id, id), eq(customerDebitNotes.tenantId, this.tenantId)));
  }

  // ─── helpers ──────────────────────────────────────────────────────────

  private rollupTax(items: CreditNoteItemInput[]): TaxRollup {
    const r: TaxRollup = { taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, cessAmount: 0, total: 0 };
    for (const it of items) {
      r.taxableValue += it.amount;
      r.cgstAmount   += it.cgstAmount;
      r.sgstAmount   += it.sgstAmount;
      r.igstAmount   += it.igstAmount;
      r.cessAmount   += it.cessAmount;
    }
    r.total = r.taxableValue + r.cgstAmount + r.sgstAmount + r.igstAmount + r.cessAmount;
    for (const k of ['taxableValue','cgstAmount','sgstAmount','igstAmount','cessAmount','total'] as const) {
      r[k] = Math.round(r[k] * 100) / 100;
    }
    return r;
  }

  private async insertItems(noteId: string, items: CreditNoteItemInput[]): Promise<void> {
    if (items.length === 0) return;
    await this.db.insert(customerDebitNoteItems).values(items.map((it) => ({
      tenantId: this.tenantId,
      customerDebitNoteId: noteId,
      itemId: it.itemId ?? null,
      description: it.description,
      uom: it.uom ?? null,
      packSizeValue: it.packSizeValue.toString(),
      packSizeUqc: it.packSizeUqc ?? null,
      quantity: it.quantity.toString(),
      unitPrice: it.unitPrice.toString(),
      amount: it.amount.toString(),
      hsnSacCode: it.hsnSacCode ?? null,
      taxCategory: it.taxCategory ?? null,
      taxRate: it.taxRate?.toString() ?? null,
      cgstRate: it.cgstRate.toString(),
      cgstAmount: it.cgstAmount.toString(),
      sgstRate: it.sgstRate.toString(),
      sgstAmount: it.sgstAmount.toString(),
      igstRate: it.igstRate.toString(),
      igstAmount: it.igstAmount.toString(),
      cessRate: it.cessRate.toString(),
      cessAmount: it.cessAmount.toString(),
    })));
  }

  private async resolveAmendsMeta(
    invoiceId: string | null,
    fallbackNumber: string | null,
    fallbackDate: string | null,
  ): Promise<{ amendsNumber: string | null; amendsDate: string | null }> {
    if (invoiceId) {
      const [inv] = await this.db
        .select({ n: salesInvoices.invoiceNumber, d: salesInvoices.invoiceDate })
        .from(salesInvoices)
        .where(and(eq(salesInvoices.id, invoiceId), eq(salesInvoices.tenantId, this.tenantId)))
        .limit(1);
      if (inv) return { amendsNumber: inv.n, amendsDate: inv.d };
    }
    return { amendsNumber: fallbackNumber, amendsDate: fallbackDate };
  }

  private async findRaw(id: string): Promise<typeof customerDebitNotes.$inferSelect> {
    const [row] = await this.db
      .select()
      .from(customerDebitNotes)
      .where(and(eq(customerDebitNotes.id, id), eq(customerDebitNotes.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Customer debit note');
    return row;
  }

  private async validateInvoiceExists(invoiceId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: salesInvoices.id })
      .from(salesInvoices)
      .where(and(eq(salesInvoices.id, invoiceId), eq(salesInvoices.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Sales invoice');
  }

  private async generateNumber(): Promise<string> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(customerDebitNotes)
      .where(eq(customerDebitNotes.tenantId, this.tenantId));

    const seq = ((result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `CDN-${seq}`;
  }

  private toNote(row: typeof customerDebitNotes.$inferSelect): CustomerDebitNote {
    return {
      id: row.id,
      tenantId: row.tenantId,
      debitNoteNumber: row.debitNoteNumber,
      customerId: row.customerId,
      invoiceId: row.invoiceId ?? null,
      issueDate: row.issueDate,
      amount: toNumber(row.amount),
      reason: row.reason,
      status: row.status,
      taxableValue: toNumber(row.taxableValue),
      cgstAmount: toNumber(row.cgstAmount),
      sgstAmount: toNumber(row.sgstAmount),
      igstAmount: toNumber(row.igstAmount),
      cessAmount: toNumber(row.cessAmount),
      placeOfSupply: row.placeOfSupply,
      placeOfSupplyCode: row.placeOfSupplyCode,
      isInterState: row.isInterState,
      reverseCharge: row.reverseCharge,
      amendsInvoiceNumber: row.amendsInvoiceNumber,
      amendsInvoiceDate: row.amendsInvoiceDate,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toItem(row: typeof customerDebitNoteItems.$inferSelect): CustomerDebitNoteItem {
    return {
      id: row.id,
      customerDebitNoteId: row.customerDebitNoteId,
      itemId: row.itemId,
      description: row.description,
      uom: row.uom,
      packSizeValue: toNumber(row.packSizeValue),
      packSizeUqc: row.packSizeUqc,
      quantity: toNumber(row.quantity),
      unitPrice: toNumber(row.unitPrice),
      amount: toNumber(row.amount),
      hsnSacCode: row.hsnSacCode,
      taxCategory: row.taxCategory,
      taxRate: row.taxRate ? toNumber(row.taxRate) : null,
      cgstRate: toNumber(row.cgstRate),
      cgstAmount: toNumber(row.cgstAmount),
      sgstRate: toNumber(row.sgstRate),
      sgstAmount: toNumber(row.sgstAmount),
      igstRate: toNumber(row.igstRate),
      igstAmount: toNumber(row.igstAmount),
      cessRate: toNumber(row.cessRate),
      cessAmount: toNumber(row.cessAmount),
    };
  }
}
