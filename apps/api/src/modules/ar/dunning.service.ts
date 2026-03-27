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

  async autoSendDunning(): Promise<{ sent: number; skipped: number }> {
    const [rules, overdueInvoices] = await Promise.all([
      this.db
        .select()
        .from(dunningRules)
        .where(and(eq(dunningRules.tenantId, this.tenantId), eq(dunningRules.isActive, true)))
        .orderBy(dunningRules.escalationLevel),
      this.getOverdueInvoices(),
    ]);

    if (rules.length === 0 || overdueInvoices.length === 0) return { sent: 0, skipped: overdueInvoices.length };

    const invoiceIds = overdueInvoices.map((i) => i.id);
    const existingLogs = await this.db
      .select({
        invoiceId: dunningLog.invoiceId,
        ruleId: dunningLog.ruleId,
        sentAt: dunningLog.sentAt,
      })
      .from(dunningLog)
      .where(and(eq(dunningLog.tenantId, this.tenantId), inArray(dunningLog.invoiceId, invoiceIds)));

    const sentByInvoice = this.groupLogsByInvoice(existingLogs);
    const toInsert = this.buildEscalationInserts(rules, overdueInvoices, sentByInvoice);

    if (toInsert.length > 0) await this.db.insert(dunningLog).values(toInsert);
    return { sent: toInsert.length, skipped: overdueInvoices.length - toInsert.length };
  }

  private groupLogsByInvoice(logs: { invoiceId: string; ruleId: string; sentAt: Date }[]) {
    const map = new Map<string, { ruleId: string; sentAt: Date }[]>();
    for (const log of logs) {
      const existing = map.get(log.invoiceId) ?? [];
      existing.push({ ruleId: log.ruleId, sentAt: log.sentAt });
      map.set(log.invoiceId, existing);
    }
    return map;
  }

  private buildEscalationInserts(
    rules: (typeof dunningRules.$inferSelect)[],
    invoices: OverdueInvoice[],
    sentByInvoice: Map<string, { ruleId: string; sentAt: Date }[]>,
  ) {
    type Insert = { tenantId: string; invoiceId: string; ruleId: string; channel: typeof dunningRules.$inferSelect['channel']; status: string };
    const toInsert: Insert[] = [];
    const ruleIds = new Set(rules.map((r) => r.id));

    for (const invoice of invoices) {
      const logs = sentByInvoice.get(invoice.id) ?? [];
      const sentRuleIds = new Set(logs.map((l) => l.ruleId));
      const nextRule = this.findNextEscalation(rules, ruleIds, sentRuleIds, logs, invoice);
      if (!nextRule) continue;

      toInsert.push({
        tenantId: this.tenantId,
        invoiceId: invoice.id,
        ruleId: nextRule.id,
        channel: nextRule.channel,
        status: 'sent',
      });
    }
    return toInsert;
  }

  private findNextEscalation(
    rules: (typeof dunningRules.$inferSelect)[],
    _ruleIds: Set<string>,
    sentRuleIds: Set<string>,
    logs: { ruleId: string; sentAt: Date }[],
    invoice: OverdueInvoice,
  ) {
    for (const rule of rules) {
      if (invoice.daysOverdue < rule.daysAfterDue) continue;
      if (sentRuleIds.has(rule.id)) continue;

      const prevLevel = rule.escalationLevel - 1;
      if (prevLevel >= 1) {
        const prevRule = rules.find((r) => r.escalationLevel === prevLevel);
        if (prevRule && !sentRuleIds.has(prevRule.id)) continue;
      }
      return rule;
    }
    return null;
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
      this.db
        .select({
          id: dunningLog.id,
          tenantId: dunningLog.tenantId,
          invoiceId: dunningLog.invoiceId,
          ruleId: dunningLog.ruleId,
          sentAt: dunningLog.sentAt,
          channel: dunningLog.channel,
          status: dunningLog.status,
          createdAt: dunningLog.createdAt,
          invoiceNumber: salesInvoices.invoiceNumber,
          customerName: customers.name,
          customerEmail: customers.email,
        })
        .from(dunningLog)
        .innerJoin(salesInvoices, eq(dunningLog.invoiceId, salesInvoices.id))
        .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
        .where(baseWhere)
        .orderBy(dunningLog.sentAt)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(dunningLog).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => ({
        ...this.toLogEntry(r),
        invoiceNumber: r.invoiceNumber,
        customerName: r.customerName,
        customerEmail: r.customerEmail,
      })),
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
