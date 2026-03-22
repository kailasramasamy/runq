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
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px">
        <tr><td style="background:#4f46e5;padding:24px 32px">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${companyName}</p>
          <p style="margin:4px 0 0;color:#c7d2fe;font-size:14px">${title}</p>
        </td></tr>
        <tr><td style="padding:32px">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 32px;background:#f4f4f5;border-top:1px solid #e4e4e7">
          <p style="margin:0;color:#71717a;font-size:12px">${footerNote ?? `This is an automated email from ${companyName} via runQ.`}</p>
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

export interface OverdueReminderParams {
  customerName: string;
  invoiceNumber: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
  companyName: string;
}

export function overdueReminder(p: OverdueReminderParams): EmailTemplate {
  const subject = `Payment Reminder — Invoice ${p.invoiceNumber} Overdue`;
  const bodyHtml = `
    <p style="color:#18181b;font-size:15px">Dear ${p.customerName},</p>
    <p style="color:#3f3f46;font-size:14px;line-height:1.6">This is a reminder that invoice <strong>${p.invoiceNumber}</strong> for <strong>₹${formatINR(p.amount)}</strong> was due on <strong>${p.dueDate}</strong> (${p.daysOverdue} day${p.daysOverdue !== 1 ? 's' : ''} ago).</p>
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e4e4e7;border-radius:6px;width:100%">
      <tr style="background:#f4f4f5"><td style="padding:10px 16px;color:#71717a;font-size:13px;width:40%">Invoice</td><td style="padding:10px 16px;color:#18181b;font-size:13px;font-weight:600">${p.invoiceNumber}</td></tr>
      <tr><td style="padding:10px 16px;color:#71717a;font-size:13px">Amount Due</td><td style="padding:10px 16px;color:#dc2626;font-size:13px;font-weight:600">₹${formatINR(p.amount)}</td></tr>
      <tr style="background:#f4f4f5"><td style="padding:10px 16px;color:#71717a;font-size:13px">Due Date</td><td style="padding:10px 16px;color:#dc2626;font-size:13px">${p.dueDate}</td></tr>
      <tr><td style="padding:10px 16px;color:#71717a;font-size:13px">Days Overdue</td><td style="padding:10px 16px;color:#dc2626;font-size:13px;font-weight:600">${p.daysOverdue} days</td></tr>
    </table>
    <p style="color:#3f3f46;font-size:14px">Please settle this invoice at the earliest to avoid any disruption. Contact us if you need assistance.</p>`;
  const text = `Dear ${p.customerName}, invoice ${p.invoiceNumber} for ₹${formatINR(p.amount)} was due on ${p.dueDate} (${p.daysOverdue} days ago). Please settle at the earliest.`;
  return { subject, html: layout(p.companyName, 'Payment Reminder', bodyHtml), text };
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
