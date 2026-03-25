import { eq, and, lte, sql } from 'drizzle-orm';
import { recurringInvoiceTemplates, customers } from '@runq/db';
import type { Db } from '@runq/db';
import type { RecurringInvoiceTemplate, RecurringLineItem } from '@runq/types';
import type { CreateRecurringInvoiceInput, UpdateRecurringInvoiceInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { InvoiceService } from './invoice.service';

export class RecurringInvoiceService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(status?: string): Promise<RecurringInvoiceTemplate[]> {
    const conditions = [eq(recurringInvoiceTemplates.tenantId, this.tenantId)];
    if (status) conditions.push(eq(recurringInvoiceTemplates.status, status as 'active' | 'paused' | 'completed'));

    const rows = await this.db
      .select({ template: recurringInvoiceTemplates, customerName: customers.name })
      .from(recurringInvoiceTemplates)
      .innerJoin(customers, eq(recurringInvoiceTemplates.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(recurringInvoiceTemplates.nextRunDate);

    return rows.map((r) => ({ ...this.toTemplate(r.template), customerName: r.customerName }));
  }

  async getById(id: string): Promise<RecurringInvoiceTemplate> {
    const [row] = await this.db
      .select({ template: recurringInvoiceTemplates, customerName: customers.name })
      .from(recurringInvoiceTemplates)
      .innerJoin(customers, eq(recurringInvoiceTemplates.customerId, customers.id))
      .where(and(eq(recurringInvoiceTemplates.id, id), eq(recurringInvoiceTemplates.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('RecurringInvoiceTemplate');
    return { ...this.toTemplate(row.template), customerName: row.customerName };
  }

  async create(input: CreateRecurringInvoiceInput): Promise<RecurringInvoiceTemplate> {
    const [row] = await this.db
      .insert(recurringInvoiceTemplates)
      .values({
        tenantId: this.tenantId,
        customerId: input.customerId,
        frequency: input.frequency,
        intervalDays: input.intervalDays ?? null,
        dayOfMonth: input.dayOfMonth,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        nextRunDate: input.startDate,
        items: input.items,
        notes: input.notes ?? null,
        autoSend: input.autoSend,
      })
      .returning();

    return this.getById(row!.id);
  }

  async update(id: string, input: UpdateRecurringInvoiceInput): Promise<RecurringInvoiceTemplate> {
    const existing = await this.getById(id);
    if (existing.status === 'completed') throw new ConflictError('Cannot update a completed template');

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.customerId !== undefined) updateData.customerId = input.customerId;
    if (input.frequency !== undefined) updateData.frequency = input.frequency;
    if (input.intervalDays !== undefined) updateData.intervalDays = input.intervalDays;
    if (input.dayOfMonth !== undefined) updateData.dayOfMonth = input.dayOfMonth;
    if (input.startDate !== undefined) updateData.startDate = input.startDate;
    if (input.endDate !== undefined) updateData.endDate = input.endDate ?? null;
    if (input.items !== undefined) updateData.items = input.items;
    if (input.notes !== undefined) updateData.notes = input.notes ?? null;
    if (input.autoSend !== undefined) updateData.autoSend = input.autoSend;

    await this.db
      .update(recurringInvoiceTemplates)
      .set(updateData)
      .where(and(eq(recurringInvoiceTemplates.id, id), eq(recurringInvoiceTemplates.tenantId, this.tenantId)));

    return this.getById(id);
  }

  async pause(id: string): Promise<RecurringInvoiceTemplate> {
    await this.db
      .update(recurringInvoiceTemplates)
      .set({ status: 'paused', updatedAt: new Date() })
      .where(and(eq(recurringInvoiceTemplates.id, id), eq(recurringInvoiceTemplates.tenantId, this.tenantId)));
    return this.getById(id);
  }

  async resume(id: string): Promise<RecurringInvoiceTemplate> {
    await this.db
      .update(recurringInvoiceTemplates)
      .set({ status: 'active', updatedAt: new Date() })
      .where(and(eq(recurringInvoiceTemplates.id, id), eq(recurringInvoiceTemplates.tenantId, this.tenantId)));
    return this.getById(id);
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(recurringInvoiceTemplates)
      .where(and(eq(recurringInvoiceTemplates.id, id), eq(recurringInvoiceTemplates.tenantId, this.tenantId)));
  }

  async generateDueInvoices(): Promise<{ generated: number; errors: string[] }> {
    const today = new Date().toISOString().split('T')[0]!;
    const dueTemplates = await this.db
      .select()
      .from(recurringInvoiceTemplates)
      .where(and(
        eq(recurringInvoiceTemplates.tenantId, this.tenantId),
        eq(recurringInvoiceTemplates.status, 'active'),
        lte(recurringInvoiceTemplates.nextRunDate, today),
      ));

    const invoiceService = new InvoiceService(this.db, this.tenantId);
    let generated = 0;
    const errors: string[] = [];

    for (const template of dueTemplates) {
      try {
        await this.generateFromTemplate(template, invoiceService);
        generated++;
      } catch (err) {
        errors.push(`Template ${template.id}: ${(err as Error).message}`);
      }
    }

    return { generated, errors };
  }

  private async generateFromTemplate(
    template: typeof recurringInvoiceTemplates.$inferSelect,
    invoiceService: InvoiceService,
  ): Promise<void> {
    const items = template.items as RecurringLineItem[];
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = items.reduce((sum, item) => {
      const cat = item.taxCategory;
      if (cat === 'exempt' || cat === 'nil_rated' || cat === 'zero_rated') return sum;
      return sum + item.amount * (item.taxRate ?? 0) / 100;
    }, 0);

    const dueDate = this.addDays(template.nextRunDate, 30);

    await invoiceService.create({
      customerId: template.customerId,
      invoiceDate: template.nextRunDate,
      dueDate,
      subtotal,
      taxAmount: Math.round(taxAmount * 100) / 100,
      totalAmount: Math.round((subtotal + taxAmount) * 100) / 100,
      notes: template.notes,
      reverseCharge: false,
      items: items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
        hsnSacCode: item.hsnSacCode,
        taxRate: item.taxRate,
        taxCategory: item.taxCategory as 'taxable' | 'exempt' | 'nil_rated' | 'zero_rated' | 'reverse_charge' | undefined,
      })),
    });

    const nextRunDate = this.computeNextRunDate(template);
    const isCompleted = template.endDate && nextRunDate > template.endDate;

    await this.db
      .update(recurringInvoiceTemplates)
      .set({
        nextRunDate: isCompleted ? template.nextRunDate : nextRunDate,
        lastGeneratedAt: new Date(),
        totalGenerated: sql`${recurringInvoiceTemplates.totalGenerated} + 1`,
        status: isCompleted ? 'completed' : 'active',
        updatedAt: new Date(),
      })
      .where(eq(recurringInvoiceTemplates.id, template.id));
  }

  private computeNextRunDate(template: typeof recurringInvoiceTemplates.$inferSelect): string {
    const current = new Date(template.nextRunDate);
    switch (template.frequency) {
      case 'monthly':
        current.setMonth(current.getMonth() + 1);
        break;
      case 'quarterly':
        current.setMonth(current.getMonth() + 3);
        break;
      case 'yearly':
        current.setFullYear(current.getFullYear() + 1);
        break;
      case 'custom':
        current.setDate(current.getDate() + (template.intervalDays ?? 30));
        break;
    }
    current.setDate(Math.min(template.dayOfMonth, 28));
    return current.toISOString().split('T')[0]!;
  }

  private addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0]!;
  }

  private toTemplate(row: typeof recurringInvoiceTemplates.$inferSelect): RecurringInvoiceTemplate {
    return {
      id: row.id,
      tenantId: row.tenantId,
      customerId: row.customerId,
      frequency: row.frequency,
      intervalDays: row.intervalDays,
      dayOfMonth: row.dayOfMonth,
      startDate: row.startDate,
      endDate: row.endDate ?? null,
      nextRunDate: row.nextRunDate,
      status: row.status,
      items: row.items as RecurringLineItem[],
      notes: row.notes ?? null,
      autoSend: row.autoSend,
      lastGeneratedAt: row.lastGeneratedAt?.toISOString() ?? null,
      totalGenerated: row.totalGenerated,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
