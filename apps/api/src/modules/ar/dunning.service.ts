import { eq, and, lt, inArray, gte, lte, sql } from 'drizzle-orm';
import { dunningRules, dunningLog, salesInvoices, customers } from '@runq/db';
import type { Db } from '@runq/db';
import type { DunningRule, DunningLogEntry } from '@runq/types';
import type { DunningRuleInput, SendRemindersInput, DunningLogFilter } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import { NotFoundError, ConflictError } from '../../utils/errors';

export interface OverdueInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  dueDate: string;
  totalAmount: number;
  balanceDue: number;
  daysOverdue: number;
}

export interface DunningLogListResult {
  data: DunningLogEntry[];
  meta: PaginationMeta;
}

export class DunningService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async listRules(): Promise<DunningRule[]> {
    const rows = await this.db
      .select()
      .from(dunningRules)
      .where(eq(dunningRules.tenantId, this.tenantId));

    return rows.map((r) => this.toRule(r));
  }

  async createRule(input: DunningRuleInput): Promise<DunningRule> {
    const [row] = await this.db
      .insert(dunningRules)
      .values({
        tenantId: this.tenantId,
        name: input.name,
        daysAfterDue: input.daysAfterDue,
        channel: input.channel,
        subjectTemplate: input.subjectTemplate ?? null,
        bodyTemplate: input.bodyTemplate,
        isActive: input.isActive,
      })
      .returning();

    return this.toRule(row!);
  }

  async updateRule(id: string, input: DunningRuleInput): Promise<DunningRule> {
    const [row] = await this.db
      .update(dunningRules)
      .set({
        name: input.name,
        daysAfterDue: input.daysAfterDue,
        channel: input.channel,
        subjectTemplate: input.subjectTemplate ?? null,
        bodyTemplate: input.bodyTemplate,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(and(eq(dunningRules.id, id), eq(dunningRules.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Dunning rule');
    return this.toRule(row);
  }

  async getOverdueInvoices(): Promise<OverdueInvoice[]> {
    const today = new Date().toISOString().slice(0, 10);

    const rows = await this.db
      .select({
        id: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
        customerId: salesInvoices.customerId,
        customerName: customers.name,
        dueDate: salesInvoices.dueDate,
        totalAmount: salesInvoices.totalAmount,
        balanceDue: salesInvoices.balanceDue,
      })
      .from(salesInvoices)
      .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
      .where(
        and(
          eq(salesInvoices.tenantId, this.tenantId),
          lt(salesInvoices.dueDate, today),
          inArray(salesInvoices.status, ['sent', 'partially_paid']),
        ),
      );

    const todayMs = new Date(today).getTime();
    return rows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      customerId: r.customerId,
      customerName: r.customerName,
      dueDate: r.dueDate,
      totalAmount: parseFloat(r.totalAmount),
      balanceDue: parseFloat(r.balanceDue),
      daysOverdue: Math.floor((todayMs - new Date(r.dueDate).getTime()) / 86_400_000),
    }));
  }

  async sendReminders(input: SendRemindersInput): Promise<{ logged: number }> {
    const ruleId = await this.resolveRuleId(input);

    const invoiceRows = await this.db
      .select({ id: salesInvoices.id })
      .from(salesInvoices)
      .where(and(eq(salesInvoices.tenantId, this.tenantId), inArray(salesInvoices.id, input.invoiceIds)));

    if (invoiceRows.length !== input.invoiceIds.length) {
      throw new NotFoundError('One or more invoices');
    }

    await this.db.insert(dunningLog).values(
      input.invoiceIds.map((invoiceId) => ({
        tenantId: this.tenantId,
        invoiceId,
        ruleId,
        channel: input.channel,
        status: 'sent',
      })),
    );

    return { logged: input.invoiceIds.length };
  }

  async getLog(filters: DunningLogFilter, page: number, limit: number): Promise<DunningLogListResult> {
    const { offset } = applyPagination(page, limit);

    const baseWhere = and(
      eq(dunningLog.tenantId, this.tenantId),
      filters.invoiceId ? eq(dunningLog.invoiceId, filters.invoiceId) : undefined,
      filters.dateFrom ? gte(dunningLog.sentAt, new Date(filters.dateFrom)) : undefined,
      filters.dateTo ? lte(dunningLog.sentAt, new Date(filters.dateTo)) : undefined,
    );

    const [rows, countResult] = await Promise.all([
      this.db.select().from(dunningLog).where(baseWhere).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(dunningLog).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => this.toLogEntry(r)),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  private async resolveRuleId(input: SendRemindersInput): Promise<string> {
    if (input.templateId) {
      const [rule] = await this.db
        .select({ id: dunningRules.id })
        .from(dunningRules)
        .where(and(eq(dunningRules.id, input.templateId), eq(dunningRules.tenantId, this.tenantId)))
        .limit(1);

      if (!rule) throw new NotFoundError('Dunning rule');
      return rule.id;
    }

    const [rule] = await this.db
      .select({ id: dunningRules.id })
      .from(dunningRules)
      .where(and(eq(dunningRules.tenantId, this.tenantId), eq(dunningRules.channel, input.channel), eq(dunningRules.isActive, true)))
      .limit(1);

    if (!rule) throw new ConflictError(`No active dunning rule found for channel: ${input.channel}`);
    return rule.id;
  }

  private toRule(row: typeof dunningRules.$inferSelect): DunningRule {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      daysAfterDue: row.daysAfterDue,
      channel: row.channel,
      subjectTemplate: row.subjectTemplate ?? null,
      bodyTemplate: row.bodyTemplate,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toLogEntry(row: typeof dunningLog.$inferSelect): DunningLogEntry {
    return {
      id: row.id,
      tenantId: row.tenantId,
      invoiceId: row.invoiceId,
      ruleId: row.ruleId,
      sentAt: row.sentAt.toISOString(),
      channel: row.channel,
      status: row.status as DunningLogEntry['status'],
      createdAt: row.createdAt.toISOString(),
    };
  }
}
