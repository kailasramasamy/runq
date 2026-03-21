import { eq, and, sql } from 'drizzle-orm';
import { debitNotes, vendors, purchaseInvoices } from '@runq/db';
import type { Db } from '@runq/db';
import type { DebitNote } from '@runq/types';
import type { CreateDebitNoteInput, UpdateDebitNoteInput, DebitNoteFilter } from '@runq/validators';
import type { PaginationMeta } from '@runq/types';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';

export interface DebitNoteListParams {
  page: number;
  limit: number;
  filters: DebitNoteFilter;
}

export interface DebitNoteListResult {
  data: (DebitNote & { vendorName: string })[];
  meta: PaginationMeta;
}

export class DebitNoteService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(params: DebitNoteListParams): Promise<DebitNoteListResult> {
    const { page, limit, filters } = params;
    const { offset } = applyPagination(page, limit);

    const baseWhere = and(
      eq(debitNotes.tenantId, this.tenantId),
      filters.vendorId ? eq(debitNotes.vendorId, filters.vendorId) : undefined,
      filters.invoiceId ? eq(debitNotes.invoiceId, filters.invoiceId) : undefined,
      filters.status ? eq(debitNotes.status, filters.status) : undefined,
    );

    const [rows, countResult] = await Promise.all([
      this.db
        .select({ debitNote: debitNotes, vendorName: vendors.name, invoiceNumber: purchaseInvoices.invoiceNumber })
        .from(debitNotes)
        .innerJoin(vendors, eq(debitNotes.vendorId, vendors.id))
        .leftJoin(purchaseInvoices, eq(debitNotes.invoiceId, purchaseInvoices.id))
        .where(baseWhere)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(debitNotes)
        .where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    const data = rows.map((r) => ({ ...this.toDebitNote(r.debitNote), vendorName: r.vendorName, invoiceNumber: r.invoiceNumber ?? null }));

    return { data, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(id: string): Promise<DebitNote & { vendorName: string }> {
    const [row] = await this.db
      .select({ debitNote: debitNotes, vendorName: vendors.name })
      .from(debitNotes)
      .innerJoin(vendors, eq(debitNotes.vendorId, vendors.id))
      .where(and(eq(debitNotes.id, id), eq(debitNotes.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Debit note');
    return { ...this.toDebitNote(row.debitNote), vendorName: row.vendorName };
  }

  async create(input: CreateDebitNoteInput): Promise<DebitNote> {
    if (input.invoiceId) {
      await this.validateInvoiceExists(input.invoiceId);
    }

    const debitNoteNumber = await this.generateNumber();

    const [row] = await this.db
      .insert(debitNotes)
      .values({
        tenantId: this.tenantId,
        debitNoteNumber,
        vendorId: input.vendorId,
        invoiceId: input.invoiceId ?? null,
        issueDate: input.issueDate,
        amount: String(input.amount),
        reason: input.reason,
        status: 'draft',
      })
      .returning();

    return this.toDebitNote(row!);
  }

  async update(id: string, input: UpdateDebitNoteInput): Promise<DebitNote> {
    const existing = await this.findRaw(id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only draft debit notes can be updated');
    }

    if (input.invoiceId) {
      await this.validateInvoiceExists(input.invoiceId);
    }

    const [row] = await this.db
      .update(debitNotes)
      .set({
        ...(input.vendorId !== undefined && { vendorId: input.vendorId }),
        ...(input.invoiceId !== undefined && { invoiceId: input.invoiceId ?? null }),
        ...(input.issueDate !== undefined && { issueDate: input.issueDate }),
        ...(input.amount !== undefined && { amount: String(input.amount) }),
        ...(input.reason !== undefined && { reason: input.reason }),
        updatedAt: new Date(),
      })
      .where(and(eq(debitNotes.id, id), eq(debitNotes.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Debit note');
    return this.toDebitNote(row);
  }

  async issue(id: string): Promise<DebitNote> {
    const existing = await this.findRaw(id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only draft debit notes can be issued');
    }

    const [row] = await this.db
      .update(debitNotes)
      .set({ status: 'issued', updatedAt: new Date() })
      .where(and(eq(debitNotes.id, id), eq(debitNotes.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Debit note');
    return this.toDebitNote(row);
  }

  async cancel(id: string): Promise<void> {
    const existing = await this.findRaw(id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only draft debit notes can be cancelled');
    }

    const [row] = await this.db
      .update(debitNotes)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(debitNotes.id, id), eq(debitNotes.tenantId, this.tenantId)))
      .returning({ id: debitNotes.id });

    if (!row) throw new NotFoundError('Debit note');
  }

  private async findRaw(id: string): Promise<typeof debitNotes.$inferSelect> {
    const [row] = await this.db
      .select()
      .from(debitNotes)
      .where(and(eq(debitNotes.id, id), eq(debitNotes.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Debit note');
    return row;
  }

  private async validateInvoiceExists(invoiceId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: purchaseInvoices.id })
      .from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.id, invoiceId), eq(purchaseInvoices.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Purchase invoice');
  }

  private async generateNumber(): Promise<string> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(debitNotes)
      .where(eq(debitNotes.tenantId, this.tenantId));

    const seq = ((result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `DN-${seq}`;
  }

  private toDebitNote(row: typeof debitNotes.$inferSelect): DebitNote {
    return {
      id: row.id,
      tenantId: row.tenantId,
      debitNoteNumber: row.debitNoteNumber,
      vendorId: row.vendorId,
      invoiceId: row.invoiceId ?? null,
      issueDate: row.issueDate,
      amount: Number(row.amount),
      reason: row.reason,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
