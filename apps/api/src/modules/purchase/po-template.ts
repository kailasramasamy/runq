import type { PurchaseOrder, PurchaseOrderLine } from '@runq/types';
import { fmtINR, fmtDate, numToWords } from '../ar/invoice-template-helpers';

/**
 * PP Phase 5 — Purchase Order print template.
 *
 * Mirrors the bill template shape (header, two-col party block, line table,
 * totals, words) but reframes the document as the BUYER's commitment to the
 * VENDOR. Status pill + sent-on metadata help vendors identify the live
 * version after the buyer re-issues a PO.
 *
 * A PO commits QUANTITY, not price — the rate is only known once the vendor
 * invoices. So the Rate/Amount/totals block renders only for POs that carry
 * a value (the legacy ones raised before that rule); an unpriced PO prints
 * as an item + qty + UOM order sheet and asks the vendor to quote.
 */

export interface PoVendorInfo {
  name: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  gstin?: string | null;
  pan?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface PoTenantInfo {
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
  phone?: string;
  email?: string;
}

function joinAddress(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(', ');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
  );
}

function buildLineRows(
  lines: PurchaseOrderLine[],
  showHsn: boolean,
  showTax: boolean,
  showMoney: boolean,
): string {
  return lines.map((l, i) => {
    const taxRateCell = showTax
      ? `<td class="cell center">${l.taxRate != null ? `${l.taxRate}%` : ''}</td>
         <td class="cell right">${fmtINR(Number(l.taxAmount ?? 0))}</td>`
      : '';
    const hsnCell = showHsn ? `<td class="cell">${escapeHtml(l.hsnSacCode ?? '')}</td>` : '';
    return `
      <tr>
        <td class="cell center">${i + 1}</td>
        <td class="cell">
          <div>${escapeHtml(l.description)}</div>
          ${l.uom ? `<div class="cell-sub">UOM: ${escapeHtml(l.uom)}</div>` : ''}
        </td>
        ${hsnCell}
        <td class="cell right">${fmtINR(Number(l.qtyOrdered))}</td>
        ${showMoney ? `<td class="cell right">${fmtINR(Number(l.unitRate))}</td>
        <td class="cell right">${fmtINR(Number(l.amount))}</td>` : ''}
        ${taxRateCell}
      </tr>`;
  }).join('');
}

function buildTotals(po: PurchaseOrder, totalCols: number): string {
  // `table-layout: fixed` traps each cell at its declared width, so the value
  // cell needs to span the last few columns (Amount + optional Tax %/Tax) to
  // get enough room for "₹ 9,99,999.99" without wrapping. Label takes the
  // remaining width on the left.
  const valueSpan = Math.min(3, totalCols - 1);
  const labelSpan = totalCols - valueSpan;
  const row = (label: string, value: string, cls = '') =>
    `<tr class="totals-row ${cls}">
      <td class="totals-label" colspan="${labelSpan}">${label}</td>
      <td class="right" colspan="${valueSpan}">${value}</td>
    </tr>`;
  const rows = [row('Subtotal', `₹ ${fmtINR(po.subtotal)}`)];
  if (po.taxTotal > 0) rows.push(row('Tax', `₹ ${fmtINR(po.taxTotal)}`));
  rows.push(row('Total', `₹ ${fmtINR(po.total)}`, 'grand-total'));
  return rows.join('');
}

function buildPartyBlock(label: string, name: string, addr: string, gstin?: string | null, extras: string[] = []): string {
  return `
    <div class="col">
      <div class="label">${label}</div>
      <div class="value"><strong>${escapeHtml(name)}</strong></div>
      ${addr ? `<div class="value" style="margin-top:2px">${escapeHtml(addr)}</div>` : ''}
      ${gstin ? `<div class="value" style="margin-top:2px">GSTIN: ${escapeHtml(gstin)}</div>` : ''}
      ${extras.filter(Boolean).map((e) => `<div class="value" style="margin-top:2px">${e}</div>`).join('')}
    </div>`;
}

function buildHeaderMeta(po: PurchaseOrder): string {
  const rows = [
    ['PO #', escapeHtml(po.poNumber)],
    ['PO date', fmtDate(po.poDate)],
  ];
  if (po.expectedDate) rows.push(['Expected', fmtDate(po.expectedDate)]);
  if (po.paymentTerms) rows.push(['Terms', escapeHtml(po.paymentTerms)]);
  rows.push(['Status', po.status.replace('_', ' ').toUpperCase()]);
  return rows.map(([k, v]) =>
    `<div class="invoice-meta-row"><span class="invoice-meta-key">${k}</span><span class="invoice-meta-val">${v}</span></div>`,
  ).join('');
}

export function renderPoHTML(
  po: PurchaseOrder,
  lines: PurchaseOrderLine[],
  vendor: PoVendorInfo,
  tenant: PoTenantInfo,
): string {
  const settings = (tenant.settings ?? {}) as TenantSettings;
  const tenantAddr = joinAddress([settings.addressLine1, settings.addressLine2, settings.city, settings.state, settings.pincode]);
  const vendorAddr = joinAddress([vendor.addressLine1, vendor.addressLine2, vendor.city, vendor.state, vendor.pincode]);
  const showHsn = lines.some((l) => !!l.hsnSacCode);
  const showMoney = po.total > 0;
  const showTax = po.taxTotal > 0;
  const colCount = 3 + (showMoney ? 2 : 0) + (showHsn ? 1 : 0) + (showTax ? 2 : 0);
  const itemRows = buildLineRows(lines, showHsn, showTax, showMoney);
  const totalsRows = showMoney ? buildTotals(po, colCount) : '';
  const vendorExtras = [
    vendor.pan ? `PAN: ${escapeHtml(vendor.pan)}` : '',
    vendor.phone ? `Phone: ${escapeHtml(vendor.phone)}` : '',
    vendor.email ? `Email: ${escapeHtml(vendor.email)}` : '',
  ];
  const tenantExtras = [
    settings.phone ? `Phone: ${escapeHtml(settings.phone)}` : '',
    settings.email ? `Email: ${escapeHtml(settings.email)}` : '',
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Purchase Order ${escapeHtml(po.poNumber)}</title>
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
      <div class="invoice-label">Purchase Order</div>
      <div class="invoice-title">PO</div>
      <div class="invoice-meta">${buildHeaderMeta(po)}</div>
    </div>
  </div>
  <hr class="divider">
  <div class="two-col">
    ${buildPartyBlock('Vendor', vendor.name, vendorAddr, vendor.gstin, vendorExtras)}
    ${buildPartyBlock('Ship to', tenant.name, po.deliveryAddress ?? tenantAddr, settings.gstin, tenantExtras)}
  </div>
  <hr class="divider">
  <table>
    <thead>
      <tr>
        <th style="width:32px">#</th>
        <th style="text-align:left">Description</th>
        ${showHsn ? '<th style="text-align:left;width:80px">HSN/SAC</th>' : ''}
        <th style="text-align:right;width:70px">Qty</th>
        ${showMoney ? `<th style="text-align:right;width:80px">Rate (₹)</th>
        <th style="text-align:right;width:100px">Amount (₹)</th>` : ''}
        ${showTax ? '<th style="text-align:center;width:55px">Tax %</th><th style="text-align:right;width:90px">Tax (₹)</th>' : ''}
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      ${totalsRows}
    </tbody>
  </table>
  ${showMoney
    ? `<div class="words-box"><strong>Amount in words:</strong> ${numToWords(po.total)}</div>`
    : `<div class="words-box">Rates are not fixed on this order. Please quote your rates on the invoice against PO ${escapeHtml(po.poNumber)}.</div>`}
  ${po.notes ? `<div class="notes-box"><div class="label">Notes</div><div class="value">${escapeHtml(po.notes)}</div></div>` : ''}
  <div class="footer-note">
    This is a Purchase Order issued by ${escapeHtml(tenant.name)} to ${escapeHtml(vendor.name)}.
    Goods/services must match the line items above. Reply with your invoice quoting PO ${escapeHtml(po.poNumber)}.
  </div>
</div>
</body>
</html>`;
}

function buildStyleBlock(): string {
  return `<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 12px; color: #111; background: #fff; }
  /* A4 content area = 210mm - 2×15mm puppeteer margin = 180mm. Leave a 4mm
     buffer so sub-pixel rounding (and emails/long PO numbers) can't push
     content under the right margin. */
  .page { width: 100%; max-width: 176mm; margin: 0 auto; overflow: hidden; }
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
  .divider { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
  .two-col { display: flex; gap: 24px; margin-bottom: 12px; }
  .col { flex: 1; }
  .label { font-size: 10px; text-transform: uppercase; color: #888; font-weight: bold; margin-bottom: 2px; letter-spacing: 0.4px; }
  .value { font-size: 12px; color: #111; overflow-wrap: anywhere; word-break: break-word; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; table-layout: fixed; }
  th { background: #f4f6f8; font-size: 11px; text-transform: uppercase; color: #555; padding: 6px 8px; border: 1px solid #ddd; letter-spacing: 0.3px; }
  .cell { padding: 6px 8px; border: 1px solid #ddd; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
  .cell-sub { color: #888; font-size: 10px; margin-top: 2px; }
  .center { text-align: center; }
  .right { text-align: right; }
  .totals-row td { border: 1px solid #ddd; padding: 6px 8px; }
  .totals-label { text-align: right; color: #555; }
  .grand-total td { background: #f4f6f8; font-weight: bold; font-size: 13px; }
  .words-box { border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin: 12px 0; background: #fafafa; font-style: italic; }
  .notes-box { border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin: 12px 0; }
  .notes-box .value { white-space: pre-wrap; margin-top: 4px; }
  .footer-note { color: #888; font-size: 10px; margin-top: 8px; }
  .print-btn { margin-bottom: 16px; }
  @media print {
    .print-btn { display: none; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>`;
}
