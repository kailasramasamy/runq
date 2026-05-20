/**
 * Sends an email to the HR operator when the helpdesk agent escalates a
 * ticket. Operator is the user configured in tenants.settings.agentSupport.
 *
 * Silent if no operator is configured or the operator has no email.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { tenants, users, employees, hrTickets } from '@runq/db';
import { sendEmail } from '../../../utils/email';

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://app.runq.in';

export async function notifyHrEscalation(opts: {
  db: Db;
  ticketId: string;
  tenantId: string;
  operatorUserId: string;
  agentSummary?: string;
  ticketSubject: string;
  ticketNumber: string;
  category: string;
  employeeId: string;
}): Promise<void> {
  const [op] = await opts.db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, opts.operatorUserId))
    .limit(1);
  if (!op?.email) return;

  const [tenant] = await opts.db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, opts.tenantId))
    .limit(1);

  const [emp] = await opts.db
    .select({ firstName: employees.firstName, lastName: employees.lastName, employeeCode: employees.employeeCode })
    .from(employees)
    .where(eq(employees.id, opts.employeeId))
    .limit(1);

  const empName = [emp?.firstName, emp?.lastName].filter(Boolean).join(' ') || 'an employee';
  const link = `${APP_BASE_URL}/hr/helpdesk?ticket=${opts.ticketId}`;
  const subject = `[HR Helpdesk] AI flagged: ${truncate(opts.ticketSubject, 60)}`;

  const text = [
    `An HR helpdesk ticket has been flagged for you by the AI assistant.`,
    ``,
    `Ticket:    ${opts.ticketNumber} (${opts.category})`,
    `Subject:   ${opts.ticketSubject}`,
    `Employee:  ${empName}${emp?.employeeCode ? ` (${emp.employeeCode})` : ''}`,
    `Tenant:    ${tenant?.name ?? '-'}`,
    ``,
    opts.agentSummary ? `Agent's note:\n  ${opts.agentSummary}\n` : '',
    `Open ticket:`,
    `  ${link}`,
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:ui-sans-serif,system-ui,Inter,Arial,sans-serif;max-width:560px">
      <h2 style="margin:0 0 12px;color:#18181b">HR ticket flagged for review</h2>
      <table style="border-collapse:collapse;font-size:14px;color:#3f3f46">
        <tr><td style="padding:4px 12px 4px 0;color:#71717a">Ticket</td><td><strong>${escapeHtml(opts.ticketNumber)}</strong> · ${escapeHtml(opts.category)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#71717a">Subject</td><td>${escapeHtml(opts.ticketSubject)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#71717a">Employee</td><td>${escapeHtml(empName)}${emp?.employeeCode ? ` · ${escapeHtml(emp.employeeCode)}` : ''}</td></tr>
      </table>
      ${opts.agentSummary ? `
      <div style="margin-top:16px;padding:12px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:4px">
        <div style="font-size:12px;color:#92400e;margin-bottom:4px">Why I escalated</div>
        <div style="font-size:14px;color:#18181b;white-space:pre-wrap">${escapeHtml(opts.agentSummary)}</div>
      </div>` : ''}
      <div style="margin-top:20px">
        <a href="${link}" style="display:inline-block;padding:10px 16px;background:#0891b2;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">Open ticket</a>
      </div>
    </div>
  `;

  const fromAddress = process.env.SUPPORT_MAIL_FROM || undefined;
  try {
    await sendEmail({ to: op.email, subject, text, html, fromName: 'runQ HR Assistant', fromAddress });
  } catch (err) {
    console.error('HR escalation email failed:', err);
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
