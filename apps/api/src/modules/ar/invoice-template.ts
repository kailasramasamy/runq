import type { SalesInvoice, SalesInvoiceItem } from '@runq/types';
import {
  fmtINR, fmtDate, numToWords, hasGstData, hasHsnCodes,
  lineTaxAmount, formatTaxBreakdownRows, renderHsnSummaryTable,
  renderIrnSection, supplyTypeLabel, placeOfSupplyDisplay,
} from './invoice-template-helpers';

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

interface TenantSettings {
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  gstin?: string;
  legalName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
  paymentTermsDays?: number;
}

function buildAddress(c: CustomerInfo): string {
  return [c.addressLine1, c.addressLine2, c.city, c.state, c.pincode]
    .filter(Boolean).join(', ');
}

function buildTenantAddress(s: TenantSettings): string {
  return [s.addressLine1, s.addressLine2, s.city, s.state, s.pincode]
    .filter(Boolean).join(', ');
}

function buildItemRowsSimple(items: SalesInvoiceItem[]): string {
  return items.map((item, i) => `
    <tr>
      <td class="cell center">${i + 1}</td>
      <td class="cell">${item.description}</td>
      <td class="cell right">${fmtINR(item.quantity)}</td>
      <td class="cell right">${fmtINR(item.unitPrice)}</td>
      <td class="cell right">${fmtINR(item.amount)}</td>
    </tr>`).join('');
}

function buildItemRowsGst(items: SalesInvoiceItem[]): string {
  const showHsn = hasHsnCodes(items);
  return items.map((item, i) => {
    const hsnCell = showHsn
      ? `<td class="cell">${item.hsnSacCode ?? ''}</td>`
      : '';
    const taxRate = item.taxRate != null ? `${item.taxRate}%` : '';
    return `
    <tr>
      <td class="cell center">${i + 1}</td>
      <td class="cell">${item.description}</td>
      ${hsnCell}
      <td class="cell right">${fmtINR(item.quantity)}</td>
      <td class="cell right">${fmtINR(item.unitPrice)}</td>
      <td class="cell right">${fmtINR(item.amount)}</td>
      <td class="cell center">${taxRate}</td>
      <td class="cell right">${fmtINR(lineTaxAmount(item))}</td>
    </tr>`;
  }).join('');
}

function buildSimpleTotals(invoice: SalesInvoice): string {
  return `
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
        <td colspan="2" class="right">\u20B9 ${fmtINR(invoice.totalAmount)}</td>
      </tr>`;
}

function buildGstTotals(invoice: SalesInvoice, colSpan: number): string {
  const labelSpan = colSpan - 1;
  const taxRows = formatTaxBreakdownRows(invoice);
  const fallbackTax = !taxRows
    ? `<tr class="totals-row">
        <td colspan="${labelSpan}" class="totals-label">Tax</td>
        <td colspan="1" class="right">${fmtINR(invoice.taxAmount)}</td>
      </tr>`
    : '';

  return `
      <tr class="totals-row">
        <td colspan="${labelSpan}" class="totals-label">Subtotal</td>
        <td colspan="1" class="right">${fmtINR(invoice.subtotal)}</td>
      </tr>
      ${taxRows}${fallbackTax}
      <tr class="totals-row grand-total">
        <td colspan="${labelSpan}" class="totals-label">TOTAL</td>
        <td colspan="1" class="right">\u20B9 ${fmtINR(invoice.totalAmount)}</td>
      </tr>`;
}

function buildGstHeaderFields(invoice: SalesInvoice): string {
  const pos = placeOfSupplyDisplay(invoice);
  const supply = supplyTypeLabel(invoice);
  if (!pos && !supply) return '';

  const rows: string[] = [];
  if (pos) rows.push(`<div>Place of Supply: <strong>${pos}</strong></div>`);
  if (supply) rows.push(`<div>Supply Type: <strong>${supply}</strong></div>`);
  rows.push(`<div>Reverse Charge: <strong>${invoice.reverseCharge ? 'Yes' : 'No'}</strong></div>`);
  return `<div style="font-size:11px;color:#444;margin-top:4px">${rows.join('')}</div>`;
}

function buildGstItemTableHeader(items: SalesInvoiceItem[]): string {
  const showHsn = hasHsnCodes(items);
  const hsnTh = showHsn ? '<th style="text-align:left;width:80px">HSN/SAC</th>' : '';
  return `<tr>
        <th style="width:32px">#</th>
        <th style="text-align:left">Description</th>
        ${hsnTh}
        <th style="text-align:right;width:60px">Qty</th>
        <th style="text-align:right;width:80px">Rate (\u20B9)</th>
        <th style="text-align:right;width:80px">Amount (\u20B9)</th>
        <th style="text-align:center;width:60px">Tax %</th>
        <th style="text-align:right;width:80px">Tax (\u20B9)</th>
      </tr>`;
}

export function renderInvoiceHTML(
  invoice: SalesInvoice,
  items: SalesInvoiceItem[],
  customer: CustomerInfo,
  tenant: TenantInfo,
): string {
  const settings = tenant.settings as TenantSettings;
  const tenantAddr = buildTenantAddress(settings);
  const paymentTerms = settings.paymentTermsDays ?? 30;
  const amountWords = numToWords(invoice.totalAmount);
  const custAddr = buildAddress(customer);
  const gst = hasGstData(invoice);

  const bankSection = (settings.bankName || settings.bankAccount)
    ? `<p><strong>Bank:</strong> ${settings.bankName ?? ''} &nbsp;|&nbsp;
       <strong>A/C:</strong> ${settings.bankAccount ?? ''} &nbsp;|&nbsp;
       <strong>IFSC:</strong> ${settings.bankIfsc ?? ''}</p>`
    : '<p><em>Bank details not configured in settings.</em></p>';

  const gstHeaderFields = gst ? buildGstHeaderFields(invoice) : '';
  const irnSection = gst ? renderIrnSection(invoice) : '';
  const hsnSummary = gst ? renderHsnSummaryTable(items) : '';

  const itemTableHeader = gst
    ? buildGstItemTableHeader(items)
    : `<tr>
        <th style="width:32px">#</th>
        <th style="text-align:left">Description</th>
        <th style="text-align:right;width:70px">Qty</th>
        <th style="text-align:right;width:90px">Rate (\u20B9)</th>
        <th style="text-align:right;width:90px">Amount (\u20B9)</th>
      </tr>`;

  const itemRows = gst ? buildItemRowsGst(items) : buildItemRowsSimple(items);
  const showHsn = gst && hasHsnCodes(items);
  const totalCols = gst ? (showHsn ? 8 : 7) : 5;
  const totalsRows = gst
    ? buildGstTotals(invoice, totalCols)
    : buildSimpleTotals(invoice);

  const p = {
    invoice, tenantName: tenant.name, settings, tenantAddr, custAddr,
    customer, gstHeaderFields, itemTableHeader, itemRows,
    totalsRows, amountWords, bankSection, hsnSummary,
    irnSection, paymentTerms,
  };
  return buildHtmlDocument(p);
}

interface DocParams {
  invoice: SalesInvoice; tenantName: string; settings: TenantSettings;
  tenantAddr: string; custAddr: string; customer: CustomerInfo;
  gstHeaderFields: string; itemTableHeader: string; itemRows: string;
  totalsRows: string; amountWords: string; bankSection: string;
  hsnSummary: string; irnSection: string; paymentTerms: number;
}

function buildHtmlDocument(p: DocParams): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice ${p.invoice.invoiceNumber}</title>
${buildStyleBlock()}
</head>
<body>
<div class="print-btn">
  <button onclick="window.print()" style="padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">
    Print / Save as PDF
  </button>
</div>
<div class="page">
  ${buildHeaderSection(p.invoice, p.tenantName, p.settings, p.tenantAddr, p.gstHeaderFields)}
  <hr class="divider">
  ${buildBillToSection(p.customer, p.custAddr)}
  <hr class="divider">
  <table>
    <thead>${p.itemTableHeader}</thead>
    <tbody>
      ${p.itemRows}
      ${p.totalsRows}
    </tbody>
  </table>
  <div class="words-box">
    <strong>Amount in words:</strong> ${p.amountWords}
  </div>
  ${p.hsnSummary}
  ${p.irnSection}
  <hr class="divider">
  <div class="bank-box">
    <div class="label">Bank Details</div>
    ${p.bankSection}
  </div>
  <div class="footer-note">
    Terms: Payment due within ${p.paymentTerms} days of invoice date. Thank you for your business.
  </div>
</div>
</body>
</html>`;
}

function buildStyleBlock(): string {
  return `<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; background: #fff; }
  .page { width: 100%; max-width: 180mm; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
  .company-name { font-size: 20px; font-weight: bold; color: #1a1a1a; }
  .company-sub { color: #555; margin-top: 4px; font-size: 11px; }
  .gstin-badge { font-size: 12px; font-weight: bold; color: #4f46e5; margin-top: 4px; }
  .invoice-title { font-size: 24px; font-weight: bold; color: #4f46e5; text-align: right; }
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
</style>`;
}

function buildHeaderSection(
  invoice: SalesInvoice,
  tenantName: string,
  settings: TenantSettings,
  tenantAddr: string,
  gstHeaderFields: string,
): string {
  const gstinLine = settings.gstin
    ? `<div class="gstin-badge">GSTIN: ${settings.gstin}</div>`
    : '';

  return `<div class="header">
    <div>
      <div class="company-name">${tenantName}</div>
      <div class="company-sub">${tenantAddr}</div>
      ${gstinLine}
    </div>
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-meta">
        <div><strong>${invoice.invoiceNumber}</strong></div>
        <div>Date: ${fmtDate(invoice.invoiceDate)}</div>
        <div>Due: ${fmtDate(invoice.dueDate)}</div>
        ${gstHeaderFields}
      </div>
    </div>
  </div>`;
}

function buildBillToSection(customer: CustomerInfo, custAddr: string): string {
  return `<div class="two-col">
    <div class="col">
      <div class="label">Bill To</div>
      <div class="value"><strong>${customer.name}</strong></div>
      ${custAddr ? `<div class="value" style="margin-top:2px">${custAddr}</div>` : ''}
      ${customer.gstin ? `<div class="value" style="margin-top:2px">GSTIN: ${customer.gstin}</div>` : ''}
    </div>
  </div>`;
}
