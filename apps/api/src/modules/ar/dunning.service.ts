import { eq, and, lt, inArray, gte, lte, sql } from 'drizzle-orm';
import { dunningRules, dunningLog, salesInvoices, customers, tenants } from '@runq/db';
import type { Db } from '@runq/db';
import type { DunningRule, DunningLogEntry, TenantSettings } from '@runq/types';
import type { DunningRuleInput, SendRemindersInput, DunningLogFilter } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { createEmailProvider } from '../../utils/email-provider';
import { sendEmail } from '../../utils/email';
import { overdueReminder, type OverdueInvoiceItem } from '../../utils/email-templates';
import { getTenantName } from '../../utils/tenant-name';

export interface OverdueInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  dueDate: string;
  totalAmount: number;
  balanceDue: number;
  daysOverdue: number;
}

export interface RenderedDunningMessage {
  channel: 'whatsapp' | 'sms' | 'email';
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  subject?: string;
  text: string;
  invoiceCount: number;
  totalDue: number;
}

export interface DunningLogListResult {
  data: DunningLogEntry[];
  meta: PaginationMeta;
}

function parseEmails(csv: string): string[] {
  return csv.split(',').map((e) => e.trim()).filter(Boolean);
}

const DEFAULT_DUNNING_RULES = [
  {
    name: 'Gentle Reminder (7 days)', daysAfterDue: 7, escalationLevel: 1,
    channel: 'email' as const, action: 'send_reminder' as const,
    subjectTemplate: 'Friendly Reminder — Invoice {{invoice_number}} is overdue',
    bodyTemplate: 'Dear {{customer_name}},\n\nThis is a gentle reminder that invoice {{invoice_number}} for ₹{{amount}} was due on {{due_date}}. We understand that payments can sometimes be delayed. Kindly arrange payment at the earliest.\n\nThank you for your continued business.',
  },
  {
    name: 'Firm Reminder (15 days)', daysAfterDue: 15, escalationLevel: 2,
    channel: 'email' as const, action: 'send_reminder' as const,
    subjectTemplate: 'Second Reminder — Invoice {{invoice_number}} is {{days_overdue}} days overdue',
    bodyTemplate: 'Dear {{customer_name}},\n\nWe notice that invoice {{invoice_number}} for ₹{{amount}} remains unpaid and is now {{days_overdue}} days past due. Please arrange payment immediately to avoid further action.\n\nIf you have already made the payment, please disregard this message.',
  },
  {
    name: 'Escalation Notice (30 days)', daysAfterDue: 30, escalationLevel: 3,
    channel: 'email' as const, action: 'escalate_to_manager' as const,
    subjectTemplate: 'Urgent — Invoice {{invoice_number}} is 30+ days overdue',
    bodyTemplate: 'Dear {{customer_name}},\n\nDespite previous reminders, invoice {{invoice_number}} for ₹{{amount}} remains unpaid ({{days_overdue}} days overdue). This matter has been escalated to our management.\n\nPlease treat this as urgent and arrange immediate payment to avoid disruption to your account.',
  },
  {
    name: 'Final Notice — Supply Hold (45 days)', daysAfterDue: 45, escalationLevel: 4,
    channel: 'email' as const, action: 'stop_supply' as const,
    subjectTemplate: 'Final Notice — Invoice {{invoice_number}} | Supply Hold',
    bodyTemplate: 'Dear {{customer_name}},\n\nThis is a final notice regarding invoice {{invoice_number}} for ₹{{amount}}, now {{days_overdue}} days overdue. As per our credit policy, further supplies to your account have been placed on hold until this balance is cleared.\n\nPlease contact us immediately to resolve this matter.',
  },
];

export class DunningService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /** Seed industry-standard 4-level dunning rules if tenant has none */
  async seedDefaultRules(): Promise<DunningRule[]> {
    const existing = await this.db
      .select({ id: dunningRules.id })
      .from(dunningRules)
      .where(eq(dunningRules.tenantId, this.tenantId))
      .limit(1);

    if (existing.length > 0) return this.listRules();

    const rows = await this.db.insert(dunningRules).values(
      DEFAULT_DUNNING_RULES.map((d) => ({ tenantId: this.tenantId, ...d, isActive: true })),
    ).returning();

    return rows.map((r) => this.toRule(r));
  }

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
        customerPhone: customers.phone,
        customerEmail: customers.email,
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
      )
      .orderBy(salesInvoices.dueDate)
      .limit(500);

    const todayMs = new Date(today).getTime();
    return rows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      customerId: r.customerId,
      customerName: r.customerName,
      customerPhone: r.customerPhone ?? null,
      customerEmail: r.customerEmail ?? null,
      dueDate: r.dueDate,
      totalAmount: parseFloat(r.totalAmount),
      balanceDue: parseFloat(r.balanceDue),
      daysOverdue: Math.floor((todayMs - new Date(r.dueDate).getTime()) / 86_400_000),
    }));
  }

  /**
   * Render a single, ready-to-send dunning message for one customer's overdue
   * invoices. Used by the mobile app, which then either deeplinks into
   * WhatsApp/SMS using the returned text, or falls back to the email send
   * pipeline. Server-side rendering keeps the wording consistent across
   * channels and means the client never composes the message.
   */
  async renderForCustomer(
    customerId: string,
    channel: 'whatsapp' | 'sms' | 'email',
  ): Promise<RenderedDunningMessage> {
    const all = await this.getOverdueInvoices();
    const ours = all.filter((i) => i.customerId === customerId);
    if (ours.length === 0) {
      throw new NotFoundError('No overdue invoices for this customer');
    }
    const totalDue = ours.reduce((s, i) => s + i.balanceDue, 0);
    const maxDays = ours.reduce((m, i) => Math.max(m, i.daysOverdue), 0);
    const companyName = await getTenantName(this.db, this.tenantId);
    const first = ours[0]!;

    if (channel === 'email') {
      const items: OverdueInvoiceItem[] = ours.map((i) => ({
        invoiceNumber: i.invoiceNumber,
        amount: i.balanceDue,
        dueDate: i.dueDate,
        daysOverdue: i.daysOverdue,
      }));
      // Match the escalation level to the worst-offending invoice so wording
      // stays consistent with the auto-run pipeline.
      const escalationLevel = maxDays >= 45 ? 4 : maxDays >= 30 ? 3 : maxDays >= 15 ? 2 : 1;
      const action = escalationLevel >= 4 ? 'stop_supply' : 'send_reminder';
      const tpl = overdueReminder({
        customerName: first.customerName,
        invoices: items,
        totalDue,
        companyName,
        escalationLevel,
        action,
      });
      return {
        channel,
        customerName: first.customerName,
        customerPhone: first.customerPhone,
        customerEmail: first.customerEmail,
        subject: tpl.subject,
        text: tpl.text,
        invoiceCount: ours.length,
        totalDue,
      };
    }

    // Short-form channels: WhatsApp / SMS — single concise message that lists
    // the offending invoices and asks for payment.
    const lines = ours
      .map((i) => `• ${i.invoiceNumber} — ₹${i.balanceDue.toLocaleString('en-IN')} (${i.daysOverdue}d overdue)`)
      .join('\n');
    const opener = channel === 'whatsapp'
      ? `Hi ${first.customerName}, this is a friendly reminder from ${companyName}.`
      : `${companyName}: Hi ${first.customerName}, payment reminder.`;
    const text =
      `${opener}\n\nThe following ${ours.length === 1 ? 'invoice is' : `${ours.length} invoices are`} past due:\n${lines}\n\nTotal outstanding: ₹${totalDue.toLocaleString('en-IN')}\n\nKindly arrange payment at the earliest. Reply here if you have already paid so we can update our records.\n\nThanks,\n${companyName}`;

    return {
      channel,
      customerName: first.customerName,
      customerPhone: first.customerPhone,
      customerEmail: first.customerEmail,
      text,
      invoiceCount: ours.length,
      totalDue,
    };
  }

  async sendReminders(input: SendRemindersInput): Promise<{ logged: number; queued: number }> {
    const ruleId = await this.resolveRuleId(input);

    // Fetch the matched rule for escalation context
    const [rule] = await this.db.select().from(dunningRules)
      .where(eq(dunningRules.id, ruleId)).limit(1);

    const invoiceRows = await this.db
      .select({
        id: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
        customerId: salesInvoices.customerId,
        customerName: customers.name,
        customerEmail: customers.email,
        customerCcEmail: customers.ccEmail,
        dueDate: salesInvoices.dueDate,
        balanceDue: salesInvoices.balanceDue,
      })
      .from(salesInvoices)
      .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
      .where(and(eq(salesInvoices.tenantId, this.tenantId), inArray(salesInvoices.id, input.invoiceIds)));

    if (invoiceRows.length !== input.invoiceIds.length) {
      throw new NotFoundError('One or more invoices');
    }

    const logRows = await this.db.insert(dunningLog).values(
      invoiceRows.map((inv) => ({
        tenantId: this.tenantId,
        invoiceId: inv.id,
        ruleId,
        channel: input.channel,
        status: 'pending',
      })),
    ).returning({ id: dunningLog.id, invoiceId: dunningLog.invoiceId });

    const logByInvoice = new Map(logRows.map((r) => [r.invoiceId, r.id]));

    // Fire-and-forget delivery so the request returns quickly. Email/SMS/
    // WhatsApp dispatch can take seconds (SMTP, Gupshup) and shouldn't block
    // the user. The dunning_log row stays 'pending' until the background
    // task flips it to 'sent' or 'failed'. Callers should treat the
    // response as "queued, not delivered" and inspect the log later for
    // actual outcomes.
    if (input.channel === 'email') {
      void this.deliverEmailsInBackground(invoiceRows, logByInvoice, rule?.escalationLevel, rule?.action);
    }
    // SMS/WhatsApp delivery is not yet wired (Gupshup TBD). Rows stay
    // 'pending' until that integration lands; until then the dunning log
    // surfaces a clear "queued" state.

    return { logged: invoiceRows.length, queued: invoiceRows.length };
  }

  private async deliverEmailsInBackground(
    invoiceRows: Parameters<DunningService['sendDunningEmails']>[0],
    logByInvoice: Map<string, string>,
    escalationLevel: number | undefined,
    action: string | undefined,
  ): Promise<void> {
    try {
      const results = await this.sendDunningEmails(invoiceRows, escalationLevel, action);
      for (const r of results) {
        const logId = logByInvoice.get(r.invoiceId);
        if (logId) {
          await this.db.update(dunningLog)
            .set({ status: r.success ? 'sent' : 'failed' })
            .where(eq(dunningLog.id, logId));
        }
      }
    } catch (err) {
      console.error('Background dunning email dispatch failed:', err);
      const ids = [...logByInvoice.values()];
      if (ids.length > 0) {
        await this.db.update(dunningLog)
          .set({ status: 'failed' })
          .where(inArray(dunningLog.id, ids));
      }
    }
  }

  private async sendDunningEmails(
    invoices: { id: string; invoiceNumber: string; customerName: string; customerEmail: string | null; customerCcEmail: string | null; dueDate: string; balanceDue: string }[],
    escalationLevel?: number,
    action?: string,
    ruleByInvoice?: Map<string, { escalationLevel: number; action: string }>,
  ): Promise<{ invoiceId: string; success: boolean }[]> {
    const [companyName, tenantRow] = await Promise.all([
      getTenantName(this.db, this.tenantId),
      this.db.select({ settings: tenants.settings }).from(tenants)
        .where(eq(tenants.id, this.tenantId)).limit(1),
    ]);

    const settings = (tenantRow[0]?.settings ?? {}) as TenantSettings;
    const provider = createEmailProvider(settings);
    const todayMs = Date.now();
    const dryRunEmail = process.env.DUNNING_DRY_RUN_EMAIL;

    // Group invoices by customer email for consolidated emails
    const byCustomer = new Map<string, typeof invoices>();
    for (const inv of invoices) {
      if (!inv.customerEmail) continue;
      const key = inv.customerEmail;
      const group = byCustomer.get(key) ?? [];
      group.push(inv);
      byCustomer.set(key, group);
    }

    const results: { invoiceId: string; success: boolean }[] = [];
    // Mark invoices without email as failed
    for (const inv of invoices) {
      if (!inv.customerEmail) results.push({ invoiceId: inv.id, success: false });
    }

    for (const [customerEmail, custInvoices] of byCustomer) {
      const first = custInvoices[0]!;
      // Use highest escalation level among this customer's invoices
      let maxLevel = escalationLevel ?? 1;
      let maxAction = action ?? 'send_reminder';
      for (const inv of custInvoices) {
        const ctx = ruleByInvoice?.get(inv.id);
        if (ctx && ctx.escalationLevel > maxLevel) {
          maxLevel = ctx.escalationLevel;
          maxAction = ctx.action;
        }
      }

      const invoiceItems: OverdueInvoiceItem[] = custInvoices.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        amount: parseFloat(inv.balanceDue),
        dueDate: inv.dueDate,
        daysOverdue: Math.floor((todayMs - new Date(inv.dueDate).getTime()) / 86_400_000),
      }));
      const totalDue = invoiceItems.reduce((sum, i) => sum + i.amount, 0);

      const template = overdueReminder({
        customerName: first.customerName,
        invoices: invoiceItems,
        totalDue,
        companyName,
        escalationLevel: maxLevel,
        action: maxAction,
      });

      const toAddresses = dryRunEmail ? [dryRunEmail] : parseEmails(customerEmail);
      if (!dryRunEmail && maxLevel >= 3 && first.customerCcEmail) {
        toAddresses.push(...parseEmails(first.customerCcEmail));
      }
      if (dryRunEmail) {
        template.subject = `[DRY RUN → ${customerEmail}] ${template.subject}`;
      }

      try {
        for (const to of toAddresses) {
          if (provider) {
            await provider.send({ to, ...template });
          } else {
            await sendEmail({ to, fromName: companyName, ...template });
          }
        }
        for (const inv of custInvoices) results.push({ invoiceId: inv.id, success: true });
      } catch (err) {
        console.error(`Dunning email failed for ${first.customerName}:`, err);
        for (const inv of custInvoices) results.push({ invoiceId: inv.id, success: false });
      }
    }

    return results;
  }

  async autoSendDunning(): Promise<{ sent: number; failed: number; skipped: number }> {
    const [rules, overdueInvoices] = await Promise.all([
      this.db
        .select()
        .from(dunningRules)
        .where(and(eq(dunningRules.tenantId, this.tenantId), eq(dunningRules.isActive, true)))
        .orderBy(dunningRules.escalationLevel),
      this.getOverdueInvoices(),
    ]);

    if (rules.length === 0 || overdueInvoices.length === 0) return { sent: 0, failed: 0, skipped: overdueInvoices.length };

    const isDryRun = !!process.env.DUNNING_DRY_RUN_EMAIL;
    let toInsert: ReturnType<typeof this.buildEscalationInserts>;

    if (isDryRun) {
      // Dry-run: skip escalation history — match every invoice to its first applicable rule
      toInsert = this.buildEscalationInserts(rules, overdueInvoices, new Map());
    } else {
      const invoiceIds = overdueInvoices.map((i) => i.id);
      const existingLogs = await this.db
        .select({
          invoiceId: dunningLog.invoiceId,
          ruleId: dunningLog.ruleId,
          sentAt: dunningLog.sentAt,
        })
        .from(dunningLog)
        .where(and(
          eq(dunningLog.tenantId, this.tenantId),
          inArray(dunningLog.invoiceId, invoiceIds),
          sql`${dunningLog.status} != 'dry_run'`,
        ));

      const sentByInvoice = this.groupLogsByInvoice(existingLogs);
      toInsert = this.buildEscalationInserts(rules, overdueInvoices, sentByInvoice);
    }

    if (toInsert.length === 0) return { sent: 0, failed: 0, skipped: overdueInvoices.length };

    // Insert log rows — mark as dry_run so they don't block real runs
    const logStatus = isDryRun ? 'dry_run' : 'pending';
    const logRows = await this.db.insert(dunningLog)
      .values(toInsert.map((r) => ({ ...r, status: logStatus })))
      .returning({ id: dunningLog.id, invoiceId: dunningLog.invoiceId, channel: dunningLog.channel });

    // Send emails for email-channel entries
    // Fetch ALL overdue invoices with customer details (not just triggered ones)
    // so the email shows the full picture per customer
    const allOverdueIds = overdueInvoices.map((i) => i.id);
    const allInvoiceDetails = await this.db
      .select({
        id: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
        customerId: salesInvoices.customerId,
        customerName: customers.name,
        customerEmail: customers.email,
        customerCcEmail: customers.ccEmail,
        dueDate: salesInvoices.dueDate,
        balanceDue: salesInvoices.balanceDue,
      })
      .from(salesInvoices)
      .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
      .where(inArray(salesInvoices.id, allOverdueIds));

    // Determine which customers should receive an email (those with triggered invoices)
    const emailLogRows = logRows.filter((r) => r.channel === 'email');
    const triggeredInvoiceIds = new Set(emailLogRows.map((r) => r.invoiceId));
    const triggeredCustomerIds = new Set(
      allInvoiceDetails.filter((i) => triggeredInvoiceIds.has(i.id)).map((i) => i.customerId),
    );

    // Pass all overdue invoices for triggered customers (so email shows full list)
    const emailInvoices = allInvoiceDetails.filter((i) => triggeredCustomerIds.has(i.customerId));

    // Build per-invoice rule context from toInsert
    const ruleByInvoice = new Map(toInsert.map((r) => [r.invoiceId, { escalationLevel: r.escalationLevel, action: r.action }]));
    const emailResults = await this.sendDunningEmails(emailInvoices, undefined, undefined, ruleByInvoice);
    // Map results back to triggered invoice IDs for log updates
    const resultByCustomer = new Map<string, boolean>();
    for (const r of emailResults) {
      const inv = allInvoiceDetails.find((i) => i.id === r.invoiceId);
      if (inv) resultByCustomer.set(inv.customerId, r.success);
    }
    const resultMap = new Map<string, boolean>();
    for (const row of emailLogRows) {
      const inv = allInvoiceDetails.find((i) => i.id === row.invoiceId);
      if (inv) resultMap.set(row.invoiceId, resultByCustomer.get(inv.customerId) ?? false);
    }

    let sent = 0;
    let failed = 0;
    for (const row of logRows) {
      const success = row.channel === 'email' ? (resultMap.get(row.invoiceId) ?? false) : true;
      const newStatus = isDryRun
        ? (success ? 'dry_run' : 'dry_run_failed')
        : (success ? 'sent' : 'failed');
      await this.db.update(dunningLog)
        .set({ status: newStatus })
        .where(eq(dunningLog.id, row.id));
      if (success) sent++; else failed++;
    }

    return { sent, failed, skipped: overdueInvoices.length - toInsert.length };
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
    type Insert = { tenantId: string; invoiceId: string; ruleId: string; channel: typeof dunningRules.$inferSelect['channel']; status: string; escalationLevel: number; action: string };
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
        escalationLevel: nextRule.escalationLevel,
        action: nextRule.action,
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
    if (input.ruleId) {
      const [rule] = await this.db
        .select({ id: dunningRules.id })
        .from(dunningRules)
        .where(and(eq(dunningRules.id, input.ruleId), eq(dunningRules.tenantId, this.tenantId)))
        .limit(1);

      if (!rule) throw new NotFoundError('Dunning rule');
      return rule.id;
    }

    // Fallback: pick any active rule for this channel. If none exists for
    // the requested channel (e.g. tenant only has email rules but is sending
    // WhatsApp), fall back to any active rule — the rule provides escalation
    // context and the body template, both of which are channel-agnostic.
    const byChannel = await this.db
      .select({ id: dunningRules.id })
      .from(dunningRules)
      .where(and(eq(dunningRules.tenantId, this.tenantId), eq(dunningRules.channel, input.channel), eq(dunningRules.isActive, true)))
      .limit(1);

    if (byChannel[0]) return byChannel[0].id;

    const anyActive = await this.db
      .select({ id: dunningRules.id })
      .from(dunningRules)
      .where(and(eq(dunningRules.tenantId, this.tenantId), eq(dunningRules.isActive, true)))
      .limit(1);

    if (!anyActive[0]) {
      throw new ConflictError('No active dunning rule configured for this tenant');
    }
    return anyActive[0].id;
  }

  private toRule(row: typeof dunningRules.$inferSelect): DunningRule {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      daysAfterDue: row.daysAfterDue,
      channel: row.channel,
      action: row.action,
      escalationLevel: row.escalationLevel,
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
