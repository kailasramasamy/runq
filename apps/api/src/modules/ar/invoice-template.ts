import type { SalesInvoice, SalesInvoiceItem } from '@runq/types';

interface CustomerInfo {
  name: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  gstin?: string | null;
}

interface TenantInfo {
  name: string;
  settings: Record<string, unknown>;
}

function fmtINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day}-${months[Number(m) - 1]}-${y}`;
}

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ones[n] ?? '';
  return (tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')).trim();
}

function numToWords(n: number): string {
  const whole = Math.floor(n);
  if (whole === 0) return 'Zero Rupees Only';
  const parts: string[] = [];
  const cr = Math.floor(whole / 10000000);
  const lakh = Math.floor((whole % 10000000) / 100000);
  const thou = Math.floor((whole % 100000) / 1000);
  const rem = whole % 1000;
  if (cr) parts.push(twoDigits(cr) + ' Crore');
  if (lakh) parts.push(twoDigits(lakh) + ' Lakh');
  if (thou) parts.push(twoDigits(thou) + ' Thousand');
  if (rem >= 100) {
    parts.push(ones[Math.floor(rem / 100)] + ' Hundred');
    if (rem % 100) parts.push(twoDigits(rem % 100));
  } else if (rem) {
    parts.push(twoDigits(rem));
  }
  return parts.join(' ') + ' Rupees Only';
}

function buildAddress(c: CustomerInfo): string {
  return [c.addressLine1, c.addressLine2, c.city, c.state, c.pincode]
    .filter(Boolean).join(', ');
}

function buildItemRows(items: SalesInvoiceItem[]): string {
  return items.map((item, i) => `
    <tr>
      <td class="cell center">${i + 1}</td>
      <td class="cell">${item.description}</td>
      <td class="cell right">${fmtINR(item.quantity)}</td>
      <td class="cell right">${fmtINR(item.unitPrice)}</td>
      <td class="cell right">${fmtINR(item.amount)}</td>
    </tr>`).join('');
}

export function renderInvoiceHTML(
  invoice: SalesInvoice,
  items: SalesInvoiceItem[],
  customer: CustomerInfo,
  tenant: TenantInfo,
): string {
  const settings = tenant.settings as {
    bankName?: string; bankAccount?: string; bankIfsc?: string;
    gstin?: string; addressLine1?: string; city?: string;
    paymentTermsDays?: number;
  };

  const tenantAddr = [settings.addressLine1, settings.city].filter(Boolean).join(', ');
  const paymentTerms = settings.paymentTermsDays ?? 30;
  const amountWords = numToWords(invoice.totalAmount);
  const custAddr = buildAddress(customer);
  const itemRows = buildItemRows(items);

  const bankSection = (settings.bankName || settings.bankAccount)
    ? `<p><strong>Bank:</strong> ${settings.bankName ?? ''} &nbsp;|&nbsp;
       <strong>A/C:</strong> ${settings.bankAccount ?? ''} &nbsp;|&nbsp;
       <strong>IFSC:</strong> ${settings.bankIfsc ?? ''}</p>`
    : '<p><em>Bank details not configured in settings.</em></p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice ${invoice.invoiceNumber}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; background: #fff; }
  .page { width: 100%; max-width: 180mm; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
  .company-name { font-size: 20px; font-weight: bold; color: #1a1a1a; }
  .company-sub { color: #555; margin-top: 4px; font-size: 11px; }
  .invoice-title { font-size: 24px; font-weight: bold; color: #2563eb; text-align: right; }
  .invoice-meta { text-align: right; font-size: 11px; color: #444; margin-top: 6px; }
  .divider { border: none; border-top: 1.5px solid #ccc; margin: 12px 0; }
  .two-col { display: flex; gap: 24px; margin-bottom: 12px; }
  .col { flex: 1; }
  .label { font-size: 10px; text-transform: uppercase; color: #888; font-weight: bold; margin-bottom: 2px; }
  .value { font-size: 12px; color: #111; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #f4f6f8; font-size: 11px; text-transform: uppercase; color: #555;
       padding: 6px 8px; border: 1px solid #ddd; }
  .cell { padding: 6px 8px; border: 1px solid #ddd; vertical-align: top; }
  .center { text-align: center; }
  .right { text-align: right; }
  .totals-row td { border: 1px solid #ddd; padding: 6px 8px; }
  .totals-label { text-align: right; color: #555; }
  .grand-total td { background: #f4f6f8; font-weight: bold; font-size: 13px; }
  .words-box { border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin: 12px 0;
               background: #fafafa; font-style: italic; }
  .bank-box { margin-top: 12px; }
  .footer-note { color: #888; font-size: 10px; margin-top: 8px; }
  .print-btn { margin-bottom: 16px; }
  @media print {
    .print-btn { display: none; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="print-btn">
  <button onclick="window.print()" style="padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">
    Print / Save as PDF
  </button>
</div>
<div class="page">
  <div class="header">
    <div>
      <div class="company-name">${tenant.name}</div>
      <div class="company-sub">${tenantAddr}</div>
      ${settings.gstin ? `<div class="company-sub">GSTIN: ${settings.gstin}</div>` : ''}
    </div>
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-meta">
        <div><strong>${invoice.invoiceNumber}</strong></div>
        <div>Date: ${fmtDate(invoice.invoiceDate)}</div>
        <div>Due: ${fmtDate(invoice.dueDate)}</div>
      </div>
    </div>
  </div>
  <hr class="divider">
  <div class="two-col">
    <div class="col">
      <div class="label">Bill To</div>
      <div class="value"><strong>${customer.name}</strong></div>
      ${custAddr ? `<div class="value" style="margin-top:2px">${custAddr}</div>` : ''}
      ${customer.gstin ? `<div class="value" style="margin-top:2px">GSTIN: ${customer.gstin}</div>` : ''}
    </div>
  </div>
  <hr class="divider">
  <table>
    <thead>
      <tr>
        <th style="width:32px">#</th>
        <th style="text-align:left">Description</th>
        <th style="text-align:right;width:70px">Qty</th>
        <th style="text-align:right;width:90px">Rate (₹)</th>
        <th style="text-align:right;width:90px">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      <tr class="totals-row">
        <td colspan="3" class="totals-label">Subtotal</td>
        <td colspan="2" class="right">${fmtINR(invoice.subtotal)}</td>
      </tr>
      <tr class="totals-row">
        <td colspan="3" class="totals-label">Tax</td>
        <td colspan="2" class="right">${fmtINR(invoice.taxAmount)}</td>
      </tr>
      <tr class="totals-row grand-total">
        <td colspan="3" class="totals-label">TOTAL</td>
        <td colspan="2" class="right">₹ ${fmtINR(invoice.totalAmount)}</td>
      </tr>
    </tbody>
  </table>
  <div class="words-box">
    <strong>Amount in words:</strong> ${amountWords}
  </div>
  <hr class="divider">
  <div class="bank-box">
    <div class="label">Bank Details</div>
    ${bankSection}
  </div>
  <div class="footer-note">
    Terms: Payment due within ${paymentTerms} days of invoice date. Thank you for your business.
  </div>
</div>
</body>
</html>`;
}
