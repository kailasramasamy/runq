import { eq, and, sql } from 'drizzle-orm';
import { creditNotes, customers, salesInvoices } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreditNote } from '@runq/types';
import type { CreateCreditNoteInput, UpdateCreditNoteInput, CreditNoteFilter } from '@runq/validators';
import type { PaginationMeta } from '@runq/types';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { decimalAdd, decimalSubtract, decimalMin, decimalLte, toNumber } from '../../utils/decimal';
import { AuditService } from '../../utils/audit';
import { GLService } from '../gl/gl.service';

export interface CreditNoteListParams {
  page: number;
  limit: number;
  filters: CreditNoteFilter;
}

export interface CreditNoteListResult {
  data: (CreditNote & { customerName: string })[];
  meta: PaginationMeta;
}

export class CreditNoteService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  private audit(): AuditService {
    return new AuditService(this.db, this.tenantId);
  }

  async list(params: CreditNoteListParams): Promise<CreditNoteListResult> {
    const { page, limit, filters } = params;
    const { offset } = applyPagination(page, limit);

    const baseWhere = and(
      eq(creditNotes.tenantId, this.tenantId),
      filters.customerId ? eq(creditNotes.customerId, filters.customerId) : undefined,
      filters.invoiceId ? eq(creditNotes.invoiceId, filters.invoiceId) : undefined,
      filters.status ? eq(creditNotes.status, filters.status) : undefined,
    );

    const [rows, countResult] = await Promise.all([
      this.db
        .select({ creditNote: creditNotes, customerName: customers.name })
        .from(creditNotes)
        .innerJoin(customers, eq(creditNotes.customerId, customers.id))
        .where(baseWhere)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(creditNotes).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    const data = rows.map((r) => ({ ...this.toCreditNote(r.creditNote), customerName: r.customerName }));
    return { data, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(id: string): Promise<CreditNote & { customerName: string }> {
    const [row] = await this.db
      .select({ creditNote: creditNotes, customerName: customers.name })
      .from(creditNotes)
      .innerJoin(customers, eq(creditNotes.customerId, customers.id))
      .where(and(eq(creditNotes.id, id), eq(creditNotes.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Credit note');
    return { ...this.toCreditNote(row.creditNote), customerName: row.customerName };
  }

  async create(input: CreateCreditNoteInput): Promise<CreditNote> {
    if (input.invoiceId) {
      await this.validateInvoiceExists(input.invoiceId);
    }

    const creditNoteNumber = await this.generateNumber();

    const [row] = await this.db
      .insert(creditNotes)
      .values({
        tenantId: this.tenantId,
        creditNoteNumber,
        customerId: input.customerId,
        invoiceId: input.invoiceId ?? null,
        issueDate: input.issueDate,
        amount: input.amount.toString(),
        reason: input.reason,
        status: 'draft',
      })
      .returning();

    return this.toCreditNote(row!);
  }

  async update(id: string, input: UpdateCreditNoteInput): Promise<CreditNote> {
    const existing = await this.findRaw(id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only draft credit notes can be updated');
    }

    if (input.invoiceId) {
      await this.validateInvoiceExists(input.invoiceId);
    }

    const [row] = await this.db
      .update(creditNotes)
      .set({
        ...(input.customerId !== undefined && { customerId: input.customerId }),
        ...(input.invoiceId !== undefined && { invoiceId: input.invoiceId ?? null }),
        ...(input.issueDate !== undefined && { issueDate: input.issueDate }),
        ...(input.amount !== undefined && { amount: input.amount.toString() }),
        ...(input.reason !== undefined && { reason: input.reason }),
        updatedAt: new Date(),
      })
      .where(and(eq(creditNotes.id, id), eq(creditNotes.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Credit note');
    return this.toCreditNote(row);
  }

  async issue(id: string): Promise<CreditNote> {
    const existing = await this.findRaw(id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only draft credit notes can be issued');
    }

    const [row] = await this.db
      .update(creditNotes)
      .set({ status: 'issued', updatedAt: new Date() })
      .where(and(eq(creditNotes.id, id), eq(creditNotes.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Credit note');

    // Post to GL
    const [customerRow] = await this.db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, existing.customerId))
      .limit(1);

    const gl = new GLService(this.db, this.tenantId);
    void gl.postCreditNote({
      amount: toNumber(existing.amount),
      date: row.createdAt.toISOString().split('T')[0],
      id,
      customerName: customerRow?.name ?? '',
    });

    return this.toCreditNote(row);
  }

  async apply(id: string): Promise<CreditNote> {
    const existing = await this.findRaw(id);
    if (existing.status !== 'issued') {
      throw new ConflictError('Only issued credit notes can be applied');
    }

    if (existing.invoiceId) {
      await this.applyToInvoiceId(id, existing.invoiceId);
    } else {
      await this.db
        .update(creditNotes)
        .set({ status: 'adjusted', updatedAt: new Date() })
        .where(and(eq(creditNotes.id, id), eq(creditNotes.tenantId, this.tenantId)));
    }

    await this.audit().log({ action: 'applied', entityType: 'credit_note', entityId: id });
    return this.getById(id);
  }

  async applyToInvoice(id: string, invoiceId: string): Promise<CreditNote> {
    const existing = await this.findRaw(id);
    if (existing.status !== 'issued') {
      throw new ConflictError('Only issued credit notes can be applied');
    }

    await this.applyToInvoiceId(id, invoiceId);
    await this.audit().log({ action: 'applied', entityType: 'credit_note', entityId: id });
    return this.getById(id);
  }

  private async applyToInvoiceId(id: string, invoiceId: string): Promise<void> {
    const [invoice] = await this.db
      .select()
      .from(salesInvoices)
      .where(and(eq(salesInvoices.id, invoiceId), eq(salesInvoices.tenantId, this.tenantId)))
      .limit(1);

    if (!invoice) throw new NotFoundError('Sales invoice');

    const creditNote = await this.findRaw(id);
    const adjustment = decimalMin(creditNote.amount, invoice.balanceDue);
    const newBalance = decimalSubtract(invoice.balanceDue, adjustment);
    const newReceived = decimalAdd(invoice.amountReceived, adjustment);
    const newStatus = decimalLte(newBalance, '0') ? 'paid' : invoice.status;

    await this.db
      .update(salesInvoices)
      .set({ balanceDue: newBalance, amountReceived: newReceived, status: newStatus, updatedAt: new Date() })
      .where(and(eq(salesInvoices.id, invoiceId), eq(salesInvoices.tenantId, this.tenantId)));

    await this.db
      .update(creditNotes)
      .set({ status: 'adjusted', invoiceId, updatedAt: new Date() })
      .where(and(eq(creditNotes.id, id), eq(creditNotes.tenantId, this.tenantId)));
  }

  async cancel(id: string): Promise<void> {
    const existing = await this.findRaw(id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only draft credit notes can be cancelled');
    }

    const [row] = await this.db
      .update(creditNotes)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(creditNotes.id, id), eq(creditNotes.tenantId, this.tenantId)))
      .returning({ id: creditNotes.id });

    if (!row) throw new NotFoundError('Credit note');
  }

  private async findRaw(id: string): Promise<typeof creditNotes.$inferSelect> {
    const [row] = await this.db
      .select()
      .from(creditNotes)
      .where(and(eq(creditNotes.id, id), eq(creditNotes.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Credit note');
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
      .from(creditNotes)
      .where(eq(creditNotes.tenantId, this.tenantId));

    const seq = ((result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `CN-${seq}`;
  }

  private toCreditNote(row: typeof creditNotes.$inferSelect): CreditNote {
    return {
      id: row.id,
      tenantId: row.tenantId,
      creditNoteNumber: row.creditNoteNumber,
      customerId: row.customerId,
      invoiceId: row.invoiceId ?? null,
      issueDate: row.issueDate,
      amount: toNumber(row.amount),
      reason: row.reason,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
