/**
 * Sends an email to the runQ team when a support conversation gets escalated
 * to a human. Configure via:
 *   SUPPORT_NOTIFY_EMAIL=kailasr@gmail.com
 *
 * Optional — if unset, escalations are silent (only visible in admin inbox).
 */
import { eq } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { tenants, users } from '@runq/db';
import { sendEmail } from '../../utils/email';

const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL ?? 'https://www.runq.in/finance/admin/support';

export async function notifyEscalation(opts: {
  db: Db;
  conversationId: string;
  tenantId: string;
  userId: string;
  agentSummary?: string;
  lastUserMessage: string;
}): Promise<void> {
  const recipient = process.env.SUPPORT_NOTIFY_EMAIL;
  if (!recipient) return;

  const [tenant] = await opts.db
    .select({ name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, opts.tenantId))
    .limit(1);
  const [user] = await opts.db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, opts.userId))
    .limit(1);

  const subject = `[runQ Support] ${tenant?.name ?? 'Unknown'} — ${truncate(opts.lastUserMessage, 60)}`;
  const link = `${ADMIN_BASE_URL}?conversation=${opts.conversationId}`;

  const text = [
    `A support conversation has been escalated to you.`,
    ``,
    `Tenant: ${tenant?.name ?? '-'} (${tenant?.slug ?? '-'})`,
    `User:   ${user?.name ?? '-'} <${user?.email ?? '-'}>`,
    ``,
    `User's last message:`,
    `  "${opts.lastUserMessage}"`,
    ``,
    opts.agentSummary ? `Agent's note:\n  ${opts.agentSummary}\n` : '',
    `Open in admin:`,
    `  ${link}`,
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:ui-sans-serif,system-ui,Inter,Arial,sans-serif;max-width:560px">
      <h2 style="margin:0 0 12px;color:#18181b">New support escalation</h2>
      <table style="border-collapse:collapse;font-size:14px;color:#3f3f46">
        <tr><td style="padding:4px 12px 4px 0;color:#71717a">Tenant</td><td><strong>${escapeHtml(tenant?.name ?? '-')}</strong> · ${escapeHtml(tenant?.slug ?? '-')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#71717a">User</td><td>${escapeHtml(user?.name ?? '-')} &lt;${escapeHtml(user?.email ?? '-')}&gt;</td></tr>
      </table>
      <div style="margin-top:16px;padding:12px;background:#fafafa;border-left:3px solid #4f46e5;border-radius:4px">
        <div style="font-size:12px;color:#71717a;margin-bottom:4px">User's last message</div>
        <div style="font-size:14px;color:#18181b;white-space:pre-wrap">${escapeHtml(opts.lastUserMessage)}</div>
      </div>
      ${opts.agentSummary ? `
      <div style="margin-top:12px;padding:12px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:4px">
        <div style="font-size:12px;color:#92400e;margin-bottom:4px">Agent's note</div>
        <div style="font-size:14px;color:#18181b;white-space:pre-wrap">${escapeHtml(opts.agentSummary)}</div>
      </div>` : ''}
      <div style="margin-top:20px">
        <a href="${link}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">Open conversation</a>
      </div>
    </div>
  `;

  // SUPPORT_MAIL_FROM lets you ship support emails from a different mailbox
  // than transactional emails (e.g. hello@quartex.in vs noreply@runq.in).
  // Falls back to MAIL_FROM via sendEmail's default.
  const fromAddress = process.env.SUPPORT_MAIL_FROM || undefined;

  try {
    await sendEmail({ to: recipient, subject, text, html, fromName: 'runQ Support', fromAddress });
  } catch (err) {
    console.error('Support escalation email failed:', err);
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
