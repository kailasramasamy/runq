/**
 * Email templates for GST automation:
 * - Draft ready notification (after auto-generation)
 * - Due-date reminders (T-6, T-1, T+0)
 * - Overdue escalation
 */

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount);
}

function layout(companyName: string, title: string, bodyHtml: string, footerNote?: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;max-width:600px">
        <tr><td style="background-color:#4f46e5;padding:24px 32px">
          <p style="margin:0;color:#ffffff !important;font-size:20px;font-weight:700">${companyName}</p>
          <p style="margin:4px 0 0;color:#e0e7ff !important;font-size:14px;font-weight:500">${title}</p>
        </td></tr>
        <tr><td style="padding:32px;background-color:#ffffff">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 32px;background-color:#f4f4f5;border-top:1px solid #e4e4e7">
          <p style="margin:0;color:#71717a;font-size:12px">${footerNote ?? `Automated GST notification from ${companyName} via runQ.`}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Draft ready ────────────────────────────────────────────────────────

export interface GstDraftReadyParams {
  companyName: string;
  periodLabel: string; // e.g. "Mar 2026"
}

export function gstDraftReady(p: GstDraftReadyParams): EmailTemplate {
  const subject = `GST drafts ready for ${p.periodLabel} — please review`;
  const body = `
    <p>Hi,</p>
    <p>Your GSTR-1 and GSTR-3B drafts for <strong>${p.periodLabel}</strong> have been auto-generated and are ready for review.</p>
    <p style="margin:24px 0">
      <a href="https://app.runq.in/finance/gst/returns" style="background-color:#4f46e5;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Review Drafts</a>
    </p>
    <p style="color:#71717a;font-size:13px">Please review and file before the due dates: GSTR-1 by 11th, GSTR-3B by 20th of this month.</p>
  `;
  const text = `Your GSTR-1 and GSTR-3B drafts for ${p.periodLabel} are ready. Visit https://app.runq.in/finance/gst/returns to review.`;
  return { subject, html: layout(p.companyName, 'GST Returns Ready', body), text };
}

// ── Due reminder ───────────────────────────────────────────────────────

export interface GstDueReminderParams {
  companyName: string;
  returnLabel: string;     // 'GSTR1' | 'GSTR3B'
  periodLabel: string;
  daysRemaining: number;   // 6, 1, 0 (today)
}

export function gstDueReminder(p: GstDueReminderParams): EmailTemplate {
  const urgency = p.daysRemaining === 0 ? 'TODAY' : p.daysRemaining === 1 ? 'TOMORROW' : `in ${p.daysRemaining} days`;
  const subject = `${p.returnLabel} for ${p.periodLabel} due ${urgency}`;
  const body = `
    <p>Hi,</p>
    <p>Your <strong>${p.returnLabel}</strong> return for <strong>${p.periodLabel}</strong> is due <strong>${urgency}</strong>.</p>
    <p>Late filing attracts daily late fees and interest. Please file before the deadline to avoid penalties.</p>
    <p style="margin:24px 0">
      <a href="https://app.runq.in/finance/gst/returns" style="background-color:#dc2626;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">File Now</a>
    </p>
  `;
  const text = `${p.returnLabel} for ${p.periodLabel} is due ${urgency}. File at https://app.runq.in/finance/gst/returns`;
  return { subject, html: layout(p.companyName, 'GST Filing Due', body), text };
}

// ── Overdue escalation ─────────────────────────────────────────────────

export interface GstOverdueEscalationParams {
  companyName: string;
  returnLabel: string;
  periodLabel: string;
  daysOverdue: number;
  lateFeeEstimate: number;
}

export function gstOverdueEscalation(p: GstOverdueEscalationParams): EmailTemplate {
  const subject = `OVERDUE: ${p.returnLabel} for ${p.periodLabel} (${p.daysOverdue} days late, est. ₹${formatINR(p.lateFeeEstimate)} fee)`;
  const body = `
    <p style="color:#dc2626;font-weight:600;font-size:16px">⚠ Your ${p.returnLabel} for ${p.periodLabel} is ${p.daysOverdue} day${p.daysOverdue > 1 ? 's' : ''} overdue.</p>
    <p>Estimated late fee accrued: <strong>₹${formatINR(p.lateFeeEstimate)}</strong> (additional interest applies on outstanding tax).</p>
    <p>Please file the return immediately to stop further accrual.</p>
    <p style="margin:24px 0">
      <a href="https://app.runq.in/finance/gst/returns" style="background-color:#dc2626;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">File Immediately</a>
    </p>
    <p style="color:#71717a;font-size:13px">Late fee: Rs 50/day for nil returns or Rs 200/day for non-nil (capped at Rs 5,000). Interest at 18% p.a. on outstanding tax.</p>
  `;
  const text = `OVERDUE: ${p.returnLabel} for ${p.periodLabel} is ${p.daysOverdue} days late. Estimated late fee: Rs ${formatINR(p.lateFeeEstimate)}. File at https://app.runq.in/finance/gst/returns`;
  return { subject, html: layout(p.companyName, 'GST Filing Overdue', body), text };
}
