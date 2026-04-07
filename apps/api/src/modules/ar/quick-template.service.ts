import { eq, and } from 'drizzle-orm';
import { quickInvoiceTemplates, customers } from '@runq/db';
import type { Db } from '@runq/db';
import type { QuickInvoiceTemplate, QuickTemplateItem } from '@runq/types';
import type { CreateQuickTemplateInput, UpdateQuickTemplateInput, GenerateFromTemplateInput } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';
import { InvoiceService } from './invoice.service';

export class QuickTemplateService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(): Promise<QuickInvoiceTemplate[]> {
    const rows = await this.db
      .select({ template: quickInvoiceTemplates, customerName: customers.name })
      .from(quickInvoiceTemplates)
      .innerJoin(customers, eq(quickInvoiceTemplates.customerId, customers.id))
      .where(eq(quickInvoiceTemplates.tenantId, this.tenantId))
      .orderBy(quickInvoiceTemplates.name);

    return rows.map((r) => ({ ...this.toTemplate(r.template), customerName: r.customerName }));
  }

  async getById(id: string): Promise<QuickInvoiceTemplate> {
    const [row] = await this.db
      .select({ template: quickInvoiceTemplates, customerName: customers.name })
      .from(quickInvoiceTemplates)
      .innerJoin(customers, eq(quickInvoiceTemplates.customerId, customers.id))
      .where(and(eq(quickInvoiceTemplates.id, id), eq(quickInvoiceTemplates.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('QuickInvoiceTemplate');
    return { ...this.toTemplate(row.template), customerName: row.customerName };
  }

  async create(input: CreateQuickTemplateInput): Promise<QuickInvoiceTemplate> {
    const [row] = await this.db
      .insert(quickInvoiceTemplates)
      .values({
        tenantId: this.tenantId,
        customerId: input.customerId,
        name: input.name,
        paymentTermsDays: input.paymentTermsDays,
        notes: input.notes ?? null,
        items: input.items,
      })
      .returning();

    return this.getById(row!.id);
  }

  async update(id: string, input: UpdateQuickTemplateInput): Promise<QuickInvoiceTemplate> {
    await this.getById(id);

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.customerId !== undefined) updateData.customerId = input.customerId;
    if (input.name !== undefined) updateData.name = input.name;
    if (input.paymentTermsDays !== undefined) updateData.paymentTermsDays = input.paymentTermsDays;
    if (input.notes !== undefined) updateData.notes = input.notes ?? null;
    if (input.items !== undefined) updateData.items = input.items;

    await this.db
      .update(quickInvoiceTemplates)
      .set(updateData)
      .where(and(eq(quickInvoiceTemplates.id, id), eq(quickInvoiceTemplates.tenantId, this.tenantId)));

    return this.getById(id);
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(quickInvoiceTemplates)
      .where(and(eq(quickInvoiceTemplates.id, id), eq(quickInvoiceTemplates.tenantId, this.tenantId)));
  }

  async generateInvoice(templateId: string, input: GenerateFromTemplateInput, userId?: string) {
    const template = await this.getById(templateId);
    const templateItems = template.items as QuickTemplateItem[];

    const activeItems = templateItems
      .map((item) => {
        const quantity = input.quantities[item.itemId] ?? 0;
        if (quantity === 0) return null;
        const amount = quantity * item.unitPrice;
        const cat = item.taxCategory;
        const taxAmount =
          cat === 'exempt' || cat === 'nil_rated' || cat === 'zero_rated'
            ? 0
            : amount * (item.taxRate ?? 0) / 100;
        return { item, quantity, amount, taxAmount };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (activeItems.length === 0) {
      throw new Error('No items with non-zero quantity provided');
    }

    const subtotal = activeItems.reduce((sum, x) => sum + x.amount, 0);
    const totalTax = activeItems.reduce((sum, x) => sum + x.taxAmount, 0);
    const totalAmount = Math.round((subtotal + totalTax) * 100) / 100;

    const dueDate = input.dueDate ?? this.addDays(input.invoiceDate, template.paymentTermsDays);

    const invoiceService = new InvoiceService(this.db, this.tenantId);
    return invoiceService.create(
      {
        customerId: template.customerId,
        invoiceDate: input.invoiceDate,
        dueDate,
        subtotal: Math.round(subtotal * 100) / 100,
        taxAmount: Math.round(totalTax * 100) / 100,
        totalAmount,
        notes: input.notes ?? template.notes ?? null,
        reverseCharge: false,
        items: activeItems.map(({ item, quantity, amount }) => ({
          description: item.description,
          quantity,
          unitPrice: item.unitPrice,
          amount: Math.round(amount * 100) / 100,
          hsnSacCode: item.hsnSacCode ?? null,
          taxRate: item.taxRate ?? null,
          taxCategory: item.taxCategory as 'taxable' | 'exempt' | 'nil_rated' | 'zero_rated' | 'reverse_charge' | undefined,
        })),
      },
      userId,
    );
  }

  private addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0]!;
  }

  private toTemplate(row: typeof quickInvoiceTemplates.$inferSelect): QuickInvoiceTemplate {
    return {
      id: row.id,
      tenantId: row.tenantId,
      customerId: row.customerId,
      name: row.name,
      paymentTermsDays: row.paymentTermsDays,
      notes: row.notes ?? null,
      items: row.items as QuickTemplateItem[],
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
