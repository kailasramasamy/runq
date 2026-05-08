import type { PurchaseInvoice, PurchaseInvoiceItem } from '@runq/types';
import { fmtINR, fmtDate, numToWords } from '../ar/invoice-template-helpers';

export interface VendorInfo {
  name: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  gstin?: string | null;
  pan?: string | null;
}

export interface TenantInfo {
  name: string;
  settings: Record<string, unknown>;
}

interface TenantSettings {
  gstin?: string;
  legalName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

function joinAddress(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(', ');
}

function buildItemRows(items: PurchaseInvoiceItem[], showHsn: boolean, showTax: boolean): string {
  return items.map((item, i) => {
    const tax = item.cgstAmount + item.sgstAmount + item.igstAmount + item.cessAmount;
    const taxRate = item.taxRate != null ? `${item.taxRate}%` : '';
    const hsnCell = showHsn ? `<td class="cell">${item.hsnSacCode ?? ''}</td>` : '';
    const taxCells = showTax
      ? `<td class="cell center">${taxRate}</td><td class="cell right">${fmtINR(tax)}</td>`
      : '';
    return `
      <tr>
        <td class="cell center">${i + 1}</td>
        <td class="cell">${escapeHtml(item.itemName)}</td>
        ${hsnCell}
        <td class="cell right">${fmtINR(item.quantity)}</td>
        <td class="cell right">${fmtINR(item.unitPrice)}</td>
        <td class="cell right">${fmtINR(item.amount)}</td>
        ${taxCells}
      </tr>`;
  }).join('');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
  );
}

export function renderBillHTML(
  bill: PurchaseInvoice,
  items: PurchaseInvoiceItem[],
  vendor: VendorInfo,
  tenant: TenantInfo,
): string {
  const settings = (tenant.settings ?? {}) as TenantSettings;
  const tenantAddr = joinAddress([settings.addressLine1, settings.addressLine2, settings.city, settings.state, settings.pincode]);
  const vendorAddr = joinAddress([vendor.addressLine1, vendor.addressLine2, vendor.city, vendor.state, vendor.pincode]);
  const showHsn = items.some((i) => !!i.hsnSacCode);
  const showTax = bill.cgstAmount + bill.sgstAmount + bill.igstAmount + bill.cessAmount > 0;
  const itemRows = buildItemRows(items, showHsn, showTax);
  const colCount = 5 + (showHsn ? 1 : 0) + (showTax ? 2 : 0);
  const totalsRows = buildTotals(bill, colCount);
  const amountWords = numToWords(bill.totalAmount);
  const supplyMeta = buildSupplyMeta(bill);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Bill ${escapeHtml(bill.invoiceNumber)}</title>
${buildStyleBlock()}
</head>
<body>
<div class="print-btn">
  <button onclick="window.print()" style="padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">
    Print / Save as PDF
  </button>
</div>
<div class="page">
  <div class="header">
    <div class="header-left">
      <div class="company-name">${escapeHtml(tenant.name)}</div>
      ${settings.legalName && settings.legalName !== tenant.name ? `<div class="company-legal">${escapeHtml(settings.legalName)}</div>` : ''}
      ${tenantAddr ? `<div class="company-address">${escapeHtml(tenantAddr)}</div>` : ''}
      ${settings.gstin ? `<div class="company-gstin">GSTIN: ${escapeHtml(settings.gstin)}</div>` : ''}
    </div>
    <div class="header-right">
      <div class="invoice-label">Vendor Bill</div>
      <div class="invoice-title">BILL</div>
      <div class="invoice-meta">
        <div class="invoice-meta-row"><span class="invoice-meta-key">Bill #</span><span class="invoice-meta-val">${escapeHtml(bill.invoiceNumber)}</span></div>
        <div class="invoice-meta-row"><span class="invoice-meta-key">Bill date</span><span class="invoice-meta-val">${fmtDate(bill.invoiceDate)}</span></div>
        <div class="invoice-meta-row"><span class="invoice-meta-key">Due</span><span class="invoice-meta-val">${fmtDate(bill.dueDate)}</span></div>
        <div class="invoice-meta-row"><span class="invoice-meta-key">Status</span><span class="invoice-meta-val">${bill.status.replace('_', ' ').toUpperCase()}</span></div>
      </div>
      ${supplyMeta ? `<div class="gst-meta">${supplyMeta}</div>` : ''}
    </div>
  </div>
  <hr class="divider">
  <div class="two-col">
    <div class="col">
      <div class="label">Vendor</div>
      <div class="value"><strong>${escapeHtml(vendor.name)}</strong></div>
      ${vendorAddr ? `<div class="value" style="margin-top:2px">${escapeHtml(vendorAddr)}</div>` : ''}
      ${vendor.gstin ? `<div class="value" style="margin-top:2px">GSTIN: ${escapeHtml(vendor.gstin)}</div>` : ''}
      ${vendor.pan ? `<div class="value" style="margin-top:2px">PAN: ${escapeHtml(vendor.pan)}</div>` : ''}
    </div>
    <div class="col">
      <div class="label">Received by</div>
      <div class="value"><strong>${escapeHtml(tenant.name)}</strong></div>
      ${tenantAddr ? `<div class="value" style="margin-top:2px">${escapeHtml(tenantAddr)}</div>` : ''}
      ${settings.gstin ? `<div class="value" style="margin-top:2px">GSTIN: ${escapeHtml(settings.gstin)}</div>` : ''}
    </div>
  </div>
  <hr class="divider">
  <table>
    <thead>
      <tr>
        <th style="width:32px">#</th>
        <th style="text-align:left">Item</th>
        ${showHsn ? '<th style="text-align:left;width:80px">HSN/SAC</th>' : ''}
        <th style="text-align:right;width:70px">Qty</th>
        <th style="text-align:right;width:90px">Rate (₹)</th>
        <th style="text-align:right;width:90px">Amount (₹)</th>
        ${showTax ? '<th style="text-align:center;width:60px">Tax %</th><th style="text-align:right;width:80px">Tax (₹)</th>' : ''}
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      ${totalsRows}
    </tbody>
  </table>
  <div class="words-box">
    <strong>Amount in words:</strong> ${amountWords}
  </div>
  <div class="footer-note">
    Internal vendor bill record generated by runQ. Refer to the vendor's original invoice for the legal tax document.
  </div>
</div>
</body>
</html>`;
}

function buildSupplyMeta(bill: PurchaseInvoice): string {
  const parts: string[] = [];
  if (bill.placeOfSupply) parts.push(`Place of supply: <strong>${escapeHtml(bill.placeOfSupply)}</strong>`);
  if (bill.isInterState != null) parts.push(bill.isInterState ? 'Inter-State' : 'Intra-State');
  if (bill.reverseCharge) parts.push('<strong>Reverse charge</strong>');
  return parts.join(' &middot; ');
}

function buildTotals(bill: PurchaseInvoice, colCount: number): string {
  const rows: string[] = [];
  const labelSpan = colCount - 1;
  const row = (label: string, value: string, cls = '') =>
    `<tr class="totals-row ${cls}">
      <td class="totals-label" colspan="${labelSpan}">${label}</td>
      <td class="right">${value}</td>
    </tr>`;
  rows.push(row('Subtotal', `₹ ${fmtINR(bill.subtotal)}`));
  if (bill.cgstAmount > 0) rows.push(row('CGST', `₹ ${fmtINR(bill.cgstAmount)}`));
  if (bill.sgstAmount > 0) rows.push(row('SGST', `₹ ${fmtINR(bill.sgstAmount)}`));
  if (bill.igstAmount > 0) rows.push(row('IGST', `₹ ${fmtINR(bill.igstAmount)}`));
  if (bill.cessAmount > 0) rows.push(row('Cess', `₹ ${fmtINR(bill.cessAmount)}`));
  if (bill.tdsAmount > 0) rows.push(row(`TDS${bill.tdsSection ? ` (${bill.tdsSection})` : ''}`, `− ₹ ${fmtINR(bill.tdsAmount)}`));
  rows.push(row('Total', `₹ ${fmtINR(bill.totalAmount)}`, 'grand-total'));
  if (bill.amountPaid > 0) rows.push(row('Paid', `₹ ${fmtINR(bill.amountPaid)}`));
  if (bill.balanceDue > 0 && bill.amountPaid > 0) rows.push(row('Balance due', `₹ ${fmtINR(bill.balanceDue)}`));
  return rows.join('');
}

function buildStyleBlock(): string {
  return `<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 12px; color: #111; background: #fff; }
  .page { width: 100%; max-width: 180mm; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 14px; margin-bottom: 18px; }
  .header-left { flex: 1.4; min-width: 0; }
  .header-right { flex: 1; text-align: right; min-width: 0; }
  .company-name { font-size: 22px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.2px; line-height: 1.15; }
  .company-legal { font-size: 11px; color: #777; margin-top: 2px; font-style: italic; }
  .company-address { color: #555; margin-top: 6px; font-size: 11px; line-height: 1.4; }
  .company-gstin { display: inline-block; margin-top: 6px; padding: 2px 8px; font-size: 11px; font-weight: 600; color: #4f46e5; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 4px; letter-spacing: 0.3px; }
  .invoice-label { font-size: 11px; font-weight: 600; color: #4f46e5; letter-spacing: 2.5px; text-transform: uppercase; }
  .invoice-title { font-size: 26px; font-weight: 700; color: #1a1a1a; line-height: 1.05; margin-top: 2px; }
  .invoice-meta { margin-top: 12px; font-size: 11px; color: #444; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 12px; background: #fafafa; text-align: left; display: inline-block; min-width: 200px; }
  .invoice-meta-row { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
  .invoice-meta-row + .invoice-meta-row { border-top: 1px dashed #e5e7eb; }
  .invoice-meta-key { color: #777; font-weight: 500; }
  .invoice-meta-val { color: #111; font-weight: 600; font-variant-numeric: tabular-nums; }
  .gst-meta { margin-top: 8px; font-size: 10px; color: #444; line-height: 1.5; }
  .divider { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
  .two-col { display: flex; gap: 24px; margin-bottom: 12px; }
  .col { flex: 1; }
  .label { font-size: 10px; text-transform: uppercase; color: #888; font-weight: bold; margin-bottom: 2px; letter-spacing: 0.4px; }
  .value { font-size: 12px; color: #111; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #f4f6f8; font-size: 11px; text-transform: uppercase; color: #555; padding: 6px 8px; border: 1px solid #ddd; letter-spacing: 0.3px; }
  .cell { padding: 6px 8px; border: 1px solid #ddd; vertical-align: top; }
  .center { text-align: center; }
  .right { text-align: right; }
  .totals-row td { border: 1px solid #ddd; padding: 6px 8px; }
  .totals-label { text-align: right; color: #555; }
  .grand-total td { background: #f4f6f8; font-weight: bold; font-size: 13px; }
  .words-box { border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin: 12px 0; background: #fafafa; font-style: italic; }
  .footer-note { color: #888; font-size: 10px; margin-top: 8px; }
  .print-btn { margin-bottom: 16px; }
  @media print {
    .print-btn { display: none; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>`;
}
