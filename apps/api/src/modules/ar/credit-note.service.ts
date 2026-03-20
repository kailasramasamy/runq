import { eq, and, sql } from 'drizzle-orm';
import { creditNotes, customers, salesInvoices } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreditNote } from '@runq/types';
import type { CreateCreditNoteInput, UpdateCreditNoteInput, CreditNoteFilter } from '@runq/validators';
import type { PaginationMeta } from '@runq/types';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';

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
    return this.toCreditNote(row);
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
      amount: parseFloat(row.amount),
      reason: row.reason,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
