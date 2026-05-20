function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(amount);
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function layout(companyName: string, title: string, bodyHtml: string, footerNote?: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
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
          <p style="margin:0;color:#71717a;font-size:12px">${footerNote ?? `This is an automated email from ${companyName} via runQ.`}</p>
          <p style="margin:8px 0 0;color:#a1a1aa;font-size:11px">Powered by <a href="https://www.runq.in" style="color:#4f46e5;text-decoration:none;font-weight:600">runQ</a> — Simple accounting for Indian businesses</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface PaymentConfirmationParams {
  vendorName: string;
  amount: number;
  utr: string;
  date: string;
  ref: string;
  companyName: string;
}

export function paymentConfirmation(p: PaymentConfirmationParams): EmailTemplate {
  const subject = `Payment Confirmation — ₹${formatINR(p.amount)} from ${p.companyName}`;
  const bodyHtml = `
    <p style="color:#18181b;font-size:15px">Dear ${p.vendorName},</p>
    <p style="color:#3f3f46;font-size:14px;line-height:1.6">We have processed a payment of <strong>₹${formatINR(p.amount)}</strong> to your account.</p>
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e4e4e7;border-radius:6px;width:100%">
      <tr style="background:#f4f4f5"><td style="padding:10px 16px;color:#71717a;font-size:13px;width:40%">UTR / Reference</td><td style="padding:10px 16px;color:#18181b;font-size:13px;font-weight:600">${p.utr}</td></tr>
      <tr><td style="padding:10px 16px;color:#71717a;font-size:13px">Payment Date</td><td style="padding:10px 16px;color:#18181b;font-size:13px">${p.date}</td></tr>
      <tr style="background:#f4f4f5"><td style="padding:10px 16px;color:#71717a;font-size:13px">Internal Reference</td><td style="padding:10px 16px;color:#18181b;font-size:13px">${p.ref}</td></tr>
      <tr><td style="padding:10px 16px;color:#71717a;font-size:13px">Amount</td><td style="padding:10px 16px;color:#18181b;font-size:13px;font-weight:600">₹${formatINR(p.amount)}</td></tr>
    </table>
    <p style="color:#3f3f46;font-size:14px">Please allow 1–2 business days for the credit to appear in your account.</p>`;
  const text = `Dear ${p.vendorName}, we have processed a payment of ₹${formatINR(p.amount)} to your account. UTR: ${p.utr}. Date: ${p.date}. Reference: ${p.ref}.`;
  return { subject, html: layout(p.companyName, 'Payment Confirmation', bodyHtml), text };
}

export interface PaymentApprovedParams {
  vendorName: string;
  amount: number;
  approvedBy: string;
  companyName: string;
}

export function paymentApproved(p: PaymentApprovedParams): EmailTemplate {
  const subject = `Payment Approved — ₹${formatINR(p.amount)} to ${p.vendorName}`;
  const bodyHtml = `
    <p style="color:#18181b;font-size:15px">Payment Approved</p>
    <p style="color:#3f3f46;font-size:14px;line-height:1.6">A payment of <strong>₹${formatINR(p.amount)}</strong> to <strong>${p.vendorName}</strong> has been approved by <strong>${p.approvedBy}</strong>.</p>
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e4e4e7;border-radius:6px;width:100%">
      <tr style="background:#f4f4f5"><td style="padding:10px 16px;color:#71717a;font-size:13px;width:40%">Vendor</td><td style="padding:10px 16px;color:#18181b;font-size:13px">${p.vendorName}</td></tr>
      <tr><td style="padding:10px 16px;color:#71717a;font-size:13px">Amount</td><td style="padding:10px 16px;color:#18181b;font-size:13px;font-weight:600">₹${formatINR(p.amount)}</td></tr>
      <tr style="background:#f4f4f5"><td style="padding:10px 16px;color:#71717a;font-size:13px">Approved By</td><td style="padding:10px 16px;color:#18181b;font-size:13px">${p.approvedBy}</td></tr>
    </table>`;
  const text = `Payment of ₹${formatINR(p.amount)} to ${p.vendorName} has been approved by ${p.approvedBy}.`;
  return { subject, html: layout(p.companyName, 'Payment Approved', bodyHtml), text };
}

export interface InvoiceSentParams {
  customerName: string;
  invoiceNumber: string;
  amount: number;
  dueDate: string;
  terms: number;
  companyName: string;
}

export function invoiceSent(p: InvoiceSentParams): EmailTemplate {
  const subject = `Invoice ${p.invoiceNumber} — ₹${formatINR(p.amount)} from ${p.companyName}`;
  const bodyHtml = `
    <p style="color:#18181b;font-size:15px">Dear ${p.customerName},</p>
    <p style="color:#3f3f46;font-size:14px;line-height:1.6">Please find your invoice <strong>${p.invoiceNumber}</strong> for <strong>₹${formatINR(p.amount)}</strong> attached for your records.</p>
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e4e4e7;border-radius:6px;width:100%">
      <tr style="background:#f4f4f5"><td style="padding:10px 16px;color:#71717a;font-size:13px;width:40%">Invoice Number</td><td style="padding:10px 16px;color:#18181b;font-size:13px;font-weight:600">${p.invoiceNumber}</td></tr>
      <tr><td style="padding:10px 16px;color:#71717a;font-size:13px">Amount Due</td><td style="padding:10px 16px;color:#18181b;font-size:13px;font-weight:600">₹${formatINR(p.amount)}</td></tr>
      <tr style="background:#f4f4f5"><td style="padding:10px 16px;color:#71717a;font-size:13px">Due Date</td><td style="padding:10px 16px;color:#18181b;font-size:13px">${p.dueDate}</td></tr>
      <tr><td style="padding:10px 16px;color:#71717a;font-size:13px">Payment Terms</td><td style="padding:10px 16px;color:#18181b;font-size:13px">Net ${p.terms} days</td></tr>
    </table>
    <p style="color:#3f3f46;font-size:14px">Please make payment by the due date. Contact us if you have any questions.</p>`;
  const text = `Dear ${p.customerName}, please find your invoice ${p.invoiceNumber} for ₹${formatINR(p.amount)}. Due date: ${p.dueDate}. Payment terms: ${p.terms} days.`;
  return { subject, html: layout(p.companyName, 'Invoice', bodyHtml), text };
}

export interface ReceiptConfirmationParams {
  customerName: string;
  amount: number;
  invoiceNumber: string;
  ref: string;
  balance: number;
  companyName: string;
}

export function receiptConfirmation(p: ReceiptConfirmationParams): EmailTemplate {
  const subject = `Payment Received — ₹${formatINR(p.amount)} | ${p.companyName}`;
  const bodyHtml = `
    <p style="color:#18181b;font-size:15px">Dear ${p.customerName},</p>
    <p style="color:#3f3f46;font-size:14px;line-height:1.6">We have received a payment of <strong>₹${formatINR(p.amount)}</strong> against invoice <strong>${p.invoiceNumber}</strong>. Thank you!</p>
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e4e4e7;border-radius:6px;width:100%">
      <tr style="background:#f4f4f5"><td style="padding:10px 16px;color:#71717a;font-size:13px;width:40%">Invoice</td><td style="padding:10px 16px;color:#18181b;font-size:13px;font-weight:600">${p.invoiceNumber}</td></tr>
      <tr><td style="padding:10px 16px;color:#71717a;font-size:13px">Amount Received</td><td style="padding:10px 16px;color:#18181b;font-size:13px;font-weight:600">₹${formatINR(p.amount)}</td></tr>
      <tr style="background:#f4f4f5"><td style="padding:10px 16px;color:#71717a;font-size:13px">Reference</td><td style="padding:10px 16px;color:#18181b;font-size:13px">${p.ref}</td></tr>
      <tr><td style="padding:10px 16px;color:#71717a;font-size:13px">Balance Remaining</td><td style="padding:10px 16px;color:#18181b;font-size:13px;font-weight:600">₹${formatINR(p.balance)}</td></tr>
    </table>`;
  const text = `Dear ${p.customerName}, we have received ₹${formatINR(p.amount)} against invoice ${p.invoiceNumber}. Reference: ${p.ref}. Balance remaining: ₹${formatINR(p.balance)}.`;
  return { subject, html: layout(p.companyName, 'Payment Receipt', bodyHtml), text };
}

export interface OverdueInvoiceItem {
  invoiceNumber: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
}

export interface OverdueReminderParams {
  customerName: string;
  invoices: OverdueInvoiceItem[];
  totalDue: number;
  companyName: string;
  escalationLevel?: number;
  action?: string;
}

export function overdueReminder(p: OverdueReminderParams): EmailTemplate {
  const level = p.escalationLevel ?? 1;
  const action = p.action ?? 'send_reminder';
  const maxOverdue = Math.max(...p.invoices.map((i) => i.daysOverdue));
  const invoiceCount = p.invoices.length;
  const invoiceLabel = invoiceCount === 1 ? 'invoice' : `${invoiceCount} invoices`;

  const { subject, body, urgencyColor, badgeLabel, closing } = getDunningCopy(p, level, action, maxOverdue, invoiceLabel);

  const invoiceRows = p.invoices
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .map((inv, i) => `
      <tr style="${i % 2 === 0 ? 'background:#f4f4f5' : ''}">
        <td style="padding:10px 16px;color:#18181b;font-size:13px;font-weight:600;border-bottom:1px solid #e4e4e7">${inv.invoiceNumber}</td>
        <td style="padding:10px 16px;color:${urgencyColor};font-size:13px;font-weight:600;border-bottom:1px solid #e4e4e7">₹${formatINR(inv.amount)}</td>
        <td style="padding:10px 16px;color:#3f3f46;font-size:13px;border-bottom:1px solid #e4e4e7">${inv.dueDate}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e4e4e7">
          <span style="display:inline-block;background:${urgencyColor};color:#fff;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600">${inv.daysOverdue}d</span>
        </td>
      </tr>`)
    .join('');

  const invoiceTable = `
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e4e4e7;border-radius:6px;width:100%;border-collapse:separate">
      <tr>
        <td style="padding:10px 16px;color:#71717a;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e4e4e7">Invoice</td>
        <td style="padding:10px 16px;color:#71717a;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e4e4e7">Amount</td>
        <td style="padding:10px 16px;color:#71717a;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e4e4e7">Due Date</td>
        <td style="padding:10px 16px;color:#71717a;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e4e4e7">Overdue</td>
      </tr>
      ${invoiceRows}
      <tr style="background:#18181b">
        <td style="padding:12px 16px;color:#ffffff;font-size:13px;font-weight:700">Total Due</td>
        <td style="padding:12px 16px;color:#ffffff;font-size:13px;font-weight:700" colspan="3">₹${formatINR(p.totalDue)}</td>
      </tr>
    </table>`;

  const actionBanner = action === 'stop_supply'
    ? `<div style="margin:20px 0;padding:14px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px">
        <p style="margin:0;color:#991b1b;font-size:13px;font-weight:600">⚠ Supply Hold Notice</p>
        <p style="margin:4px 0 0;color:#b91c1c;font-size:13px">Further supplies have been placed on hold until this balance is cleared.</p>
      </div>`
    : action === 'escalate_to_manager'
      ? `<div style="margin:20px 0;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
          <p style="margin:0;color:#92400e;font-size:13px;font-weight:600">⚠ Escalation Notice</p>
          <p style="margin:4px 0 0;color:#a16207;font-size:13px">This matter has been escalated to our management team for review.</p>
        </div>`
      : '';

  const bodyHtml = `
    <div style="text-align:center;margin-bottom:24px">
      <span style="display:inline-block;background:${urgencyColor}1a;color:${urgencyColor};padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600;letter-spacing:0.5px">${badgeLabel}</span>
    </div>
    <p style="color:#18181b;font-size:15px;line-height:1.5">Dear ${p.customerName},</p>
    <p style="color:#3f3f46;font-size:14px;line-height:1.7">${body}</p>
    ${invoiceTable}
    ${actionBanner}
    <p style="color:#3f3f46;font-size:14px;line-height:1.7">${closing}</p>
    <p style="color:#71717a;font-size:13px;margin-top:24px;font-style:italic">If you have already made the payment, please disregard this email.</p>`;

  const titleMap: Record<number, string> = { 1: 'Payment Reminder', 2: 'Second Reminder', 3: 'Escalation Notice', 4: 'Final Notice' };
  const invList = p.invoices.map((i) => i.invoiceNumber).join(', ');
  const text = `Dear ${p.customerName}, you have ${invoiceLabel} totalling ₹${formatINR(p.totalDue)} overdue. Invoices: ${invList}. Please settle at the earliest.`;

  return { subject, html: layout(p.companyName, titleMap[level] ?? 'Payment Reminder', bodyHtml), text };
}

function getDunningCopy(
  p: OverdueReminderParams,
  level: number,
  action: string,
  maxOverdue: number,
  invoiceLabel: string,
): { subject: string; body: string; urgencyColor: string; badgeLabel: string; closing: string } {
  const totalStr = `₹${formatINR(p.totalDue)}`;
  switch (level) {
    case 1:
      return {
        subject: `Friendly Reminder — ${invoiceLabel} overdue (${totalStr})`,
        body: `We hope this message finds you well. This is a friendly reminder that you have <strong>${invoiceLabel}</strong> totalling <strong>${totalStr}</strong> past due. We understand payments can sometimes be delayed — kindly arrange payment at your earliest convenience.`,
        urgencyColor: '#f59e0b',
        badgeLabel: 'GENTLE REMINDER',
        closing: 'Thank you for your continued business. Please don\'t hesitate to reach out if you have any questions.',
      };
    case 2:
      return {
        subject: `Second Reminder — ${invoiceLabel} overdue, up to ${maxOverdue} days (${totalStr})`,
        body: `This is a follow-up regarding <strong>${invoiceLabel}</strong> totalling <strong>${totalStr}</strong>, now up to <strong>${maxOverdue} days past due</strong>. We kindly request that you arrange payment immediately to keep your account in good standing.`,
        urgencyColor: '#ea580c',
        badgeLabel: 'SECOND REMINDER',
        closing: 'We value our relationship and would like to resolve this promptly. Please contact us if you need to discuss payment arrangements.',
      };
    case 3:
      return {
        subject: `Urgent — ${invoiceLabel} overdue, up to ${maxOverdue} days (${totalStr})`,
        body: `Despite previous reminders, <strong>${invoiceLabel}</strong> totalling <strong>${totalStr}</strong> remain unpaid, up to <strong>${maxOverdue} days overdue</strong>. This matter requires your immediate attention and has been escalated within our organization.`,
        urgencyColor: '#dc2626',
        badgeLabel: 'ESCALATION NOTICE',
        closing: 'Please treat this as urgent. Contact us immediately to arrange payment and avoid any impact to your account.',
      };
    default:
      return {
        subject: `Final Notice — ${invoiceLabel} overdue (${totalStr}) | ${action === 'stop_supply' ? 'Supply Hold' : 'Action Required'}`,
        body: `This is a <strong>final notice</strong> regarding <strong>${invoiceLabel}</strong> totalling <strong>${totalStr}</strong>, now up to <strong>${maxOverdue} days overdue</strong>. As per our credit policy, we have been compelled to take further action on your account.`,
        urgencyColor: '#991b1b',
        badgeLabel: 'FINAL NOTICE',
        closing: 'We strongly urge you to clear this balance immediately. Please contact our accounts team to discuss resolution options.',
      };
  }
}

export interface UserInviteParams {
  userName: string;
  email: string;
  role: string;
  invitedBy: string;
  companyName: string;
  loginUrl: string;
}

export function userInvite(p: UserInviteParams): EmailTemplate {
  const subject = `You've been invited to ${p.companyName} on runQ`;
  const bodyHtml = `
    <p style="color:#18181b;font-size:15px">Hi ${p.userName},</p>
    <p style="color:#3f3f46;font-size:14px;line-height:1.6"><strong>${p.invitedBy}</strong> has invited you to join <strong>${p.companyName}</strong> on runQ as <strong>${p.role}</strong>.</p>
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e4e4e7;border-radius:6px;width:100%">
      <tr style="background:#f4f4f5"><td style="padding:10px 16px;color:#71717a;font-size:13px;width:40%">Email</td><td style="padding:10px 16px;color:#18181b;font-size:13px;font-weight:600">${p.email}</td></tr>
      <tr><td style="padding:10px 16px;color:#71717a;font-size:13px">Role</td><td style="padding:10px 16px;color:#18181b;font-size:13px">${p.role}</td></tr>
    </table>
    <p style="color:#3f3f46;font-size:14px;line-height:1.6">Your login credentials have been set by your admin. Please contact them for your password, then sign in at the link below.</p>
    <p style="margin:24px 0;text-align:center">
      <a href="${p.loginUrl}" style="display:inline-block;padding:12px 32px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">Sign In to runQ</a>
    </p>
    <p style="color:#71717a;font-size:12px">Or copy this link: ${p.loginUrl}</p>`;
  const text = `Hi ${p.userName}, ${p.invitedBy} has invited you to ${p.companyName} on runQ as ${p.role}. Sign in at: ${p.loginUrl}`;
  return { subject, html: layout(p.companyName, 'Team Invitation', bodyHtml), text };
}

export interface TenantInviteParams {
  inviteType: 'new_tenant' | 'join_tenant';
  /// Distinguishes employee app invites from CA/collab invites so the
  /// email copy talks about "your HR portal" rather than "their books."
  /// Only meaningful for join_tenant invites.
  audience?: 'finance_collab' | 'employee';
  inviterName: string;
  inviterTenantName: string;
  role: string;
  inviteUrl: string;
  expiresAtIso: string;
  note?: string | null;
  // For new_tenant invites — the prospective company's name (CA-prefilled).
  prospectCompanyName?: string | null;
}

export function tenantInviteEmail(p: TenantInviteParams): EmailTemplate {
  const expires = new Date(p.expiresAtIso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const isNewTenant = p.inviteType === 'new_tenant';
  const isEmployee = !isNewTenant && p.audience === 'employee';

  const subject = isNewTenant
    ? `${p.inviterName} invited you to runQ`
    : isEmployee
      ? `${p.inviterTenantName} invited you to runQ`
      : `${p.inviterName} invited you to ${p.inviterTenantName}'s books on runQ`;

  const heading = isNewTenant
    ? 'Get started on runQ'
    : isEmployee
      ? `Set up your ${p.inviterTenantName} runQ access`
      : `Join ${p.inviterTenantName}'s books`;
  const intro = isNewTenant
    ? `<p style="color:#3f3f46;font-size:14px;line-height:1.6"><strong>${p.inviterName}</strong> from <strong>${p.inviterTenantName}</strong> has invited you to runQ. Sign up to start your books — they'll be added as your <strong>${p.role}</strong> automatically.</p>`
    : isEmployee
      ? `<p style="color:#3f3f46;font-size:14px;line-height:1.6"><strong>${p.inviterTenantName}</strong> uses runQ for HR. Set a password to view your attendance, leave, and payslips on the runQ app.</p>`
      : `<p style="color:#3f3f46;font-size:14px;line-height:1.6"><strong>${p.inviterName}</strong> has invited you to join <strong>${p.inviterTenantName}</strong> on runQ as <strong>${p.role}</strong>.</p>`;

  const detailsTable = `
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e4e4e7;border-radius:6px;width:100%">
      <tr style="background:#f4f4f5"><td style="padding:10px 16px;color:#71717a;font-size:13px;width:40%">Role</td><td style="padding:10px 16px;color:#18181b;font-size:13px;font-weight:600">${p.role}</td></tr>
      ${p.prospectCompanyName ? `<tr><td style="padding:10px 16px;color:#71717a;font-size:13px">Company</td><td style="padding:10px 16px;color:#18181b;font-size:13px">${p.prospectCompanyName}</td></tr>` : ''}
      ${p.note ? `<tr style="background:#f4f4f5"><td style="padding:10px 16px;color:#71717a;font-size:13px">Note</td><td style="padding:10px 16px;color:#18181b;font-size:13px">${p.note}</td></tr>` : ''}
      <tr><td style="padding:10px 16px;color:#71717a;font-size:13px">Expires</td><td style="padding:10px 16px;color:#18181b;font-size:13px">${expires}</td></tr>
    </table>`;

  const bodyHtml = `
    <p style="color:#18181b;font-size:15px">${heading}</p>
    ${intro}
    ${detailsTable}
    <p style="margin:24px 0;text-align:center">
      <a href="${p.inviteUrl}" style="display:inline-block;padding:12px 32px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">${isNewTenant ? 'Start your books' : isEmployee ? 'Set up access' : 'Accept invite'}</a>
    </p>
    <p style="color:#71717a;font-size:12px">Or copy this link into your browser:<br/><span style="word-break:break-all">${p.inviteUrl}</span></p>`;

  const text = `${p.inviterName} invited you to ${isNewTenant ? 'runQ' : p.inviterTenantName + ' on runQ'}. Open this link to ${isNewTenant ? 'sign up' : 'accept'}: ${p.inviteUrl} — expires ${expires}.`;
  return { subject, html: layout(p.inviterTenantName, heading, bodyHtml), text };
}

export interface BatchPaymentSummaryParams {
  count: number;
  totalAmount: number;
  companyName: string;
  payments: { vendorName: string; amount: number; reference: string | null }[];
}

export function batchPaymentSummary(p: BatchPaymentSummaryParams): EmailTemplate {
  const subject = `Batch Payment Executed — ${p.count} payments, ₹${formatINR(p.totalAmount)}`;
  const rows = p.payments.map((r) =>
    `<tr><td style="padding:10px 16px;color:#18181b;font-size:13px;border-top:1px solid #e4e4e7">${r.vendorName}</td><td style="padding:10px 16px;color:#18181b;font-size:13px;border-top:1px solid #e4e4e7;text-align:right">₹${formatINR(r.amount)}</td><td style="padding:10px 16px;color:#71717a;font-size:13px;border-top:1px solid #e4e4e7">${r.reference ?? '—'}</td></tr>`
  ).join('');
  const bodyHtml = `
    <p style="color:#18181b;font-size:15px">Batch Payment Summary</p>
    <p style="color:#3f3f46;font-size:14px;line-height:1.6">A batch of <strong>${p.count} payment${p.count !== 1 ? 's' : ''}</strong> totalling <strong>₹${formatINR(p.totalAmount)}</strong> has been executed successfully.</p>
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e4e4e7;border-radius:6px;width:100%">
      <tr style="background:#f4f4f5">
        <th style="padding:10px 16px;color:#71717a;font-size:12px;text-align:left;font-weight:600">Vendor</th>
        <th style="padding:10px 16px;color:#71717a;font-size:12px;text-align:right;font-weight:600">Amount</th>
        <th style="padding:10px 16px;color:#71717a;font-size:12px;text-align:left;font-weight:600">Reference</th>
      </tr>
      ${rows}
      <tr style="background:#f4f4f5">
        <td style="padding:10px 16px;color:#18181b;font-size:13px;font-weight:700;border-top:2px solid #e4e4e7">Total</td>
        <td style="padding:10px 16px;color:#18181b;font-size:13px;font-weight:700;text-align:right;border-top:2px solid #e4e4e7">₹${formatINR(p.totalAmount)}</td>
        <td style="padding:10px 16px;border-top:2px solid #e4e4e7"></td>
      </tr>
    </table>`;
  const text = `Batch Payment Executed: ${p.count} payments, ₹${formatINR(p.totalAmount)}. ${p.payments.map(r => `${r.vendorName}: ₹${formatINR(r.amount)}`).join(', ')}.`;
  return { subject, html: layout(p.companyName, 'Batch Payment Summary', bodyHtml), text };
}
