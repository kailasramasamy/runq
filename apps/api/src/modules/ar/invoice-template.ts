import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SalesInvoice, SalesInvoiceItem } from '@runq/types';
import {
  fmtINR, fmtDate, numToWords, hasGstData, hasHsnCodes,
  lineTaxAmount, formatTaxBreakdownRows, renderHsnSummaryTable,
  renderIrnSection, supplyTypeLabel, placeOfSupplyDisplay,
} from './invoice-template-helpers';

// One-time read of the brand mark used in the PDF footer's "Powered by"
// stamp. Inlined as a data URI so the rendered HTML is self-contained
// and Puppeteer doesn't need to fetch a separate asset.
const RUNQ_LOGO_DATA_URI: string = (() => {
  try {
    const buf = readFileSync(join(__dirname, 'assets', 'runq-logo.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
})();

interface CustomerInfo {
  name: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  gstin?: string | null;
  paymentTermsDays?: number | null;
}

interface TenantInfo {
  name: string;
  settings: Record<string, unknown>;
}

export interface BankAccountInfo {
  name: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
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
      <td class="cell center">${item.uom ?? ''}</td>
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
    // Amount column shows the GST-INCLUSIVE line total (qty × rate + line
    // tax) so what the customer reads per row matches what they pay. The
    // pre-tax subtotal + per-component tax breakdown still appears in the
    // totals block below for accounting traceability.
    const lineTotal = item.amount + lineTaxAmount(item);
    return `
    <tr>
      <td class="cell center">${i + 1}</td>
      <td class="cell">${item.description}</td>
      <td class="cell center">${item.uom ?? ''}</td>
      ${hsnCell}
      <td class="cell right">${fmtINR(item.quantity)}</td>
      <td class="cell right">${fmtINR(item.unitPrice)}</td>
      <td class="cell center">${taxRate}</td>
      <td class="cell right">${fmtINR(lineTotal)}</td>
    </tr>`;
  }).join('');
}

function buildSimpleTotals(invoice: SalesInvoice): string {
  // Simple table: # | Desc | UOM | Qty | Rate | Amount = 6 cols
  return `
      <tr class="totals-row">
        <td colspan="4" class="totals-label">Subtotal</td>
        <td colspan="2" class="right">${fmtINR(invoice.subtotal)}</td>
      </tr>
      <tr class="totals-row">
        <td colspan="4" class="totals-label">Tax</td>
        <td colspan="2" class="right">${fmtINR(invoice.taxAmount)}</td>
      </tr>
      <tr class="totals-row grand-total">
        <td colspan="4" class="totals-label">TOTAL</td>
        <td colspan="2" class="right">\u20B9 ${fmtINR(invoice.totalAmount)}</td>
      </tr>`;
}

function buildGstTotals(invoice: SalesInvoice, colSpan: number): string {
  const labelSpan = colSpan - 1;
  const taxRows = formatTaxBreakdownRows(invoice, colSpan);
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

/**
 * Returns just the inner rows for the GST place-of-supply / supply type /
 * reverse-charge block. The caller wraps it in whatever container class
 * fits the layout — header section uses .gst-meta, other sections may use
 * something else.
 */
function buildGstHeaderFields(invoice: SalesInvoice): string {
  const pos = placeOfSupplyDisplay(invoice);
  const supply = supplyTypeLabel(invoice);
  if (!pos && !supply) return '';

  const rows: string[] = [];
  if (pos) rows.push(`<div>Place of Supply: <strong>${pos}</strong></div>`);
  if (supply) rows.push(`<div>Supply Type: <strong>${supply}</strong></div>`);
  rows.push(`<div>Reverse Charge: <strong>${invoice.reverseCharge ? 'Yes' : 'No'}</strong></div>`);
  return rows.join('');
}

/**
 * Resolve which payment-terms-days value to print on the invoice. The
 * customer's configured terms take priority — that's the contractual default
 * the seller has agreed with this specific buyer. The invoice-date math is
 * a defensive fallback for invoices created before the customer field existed,
 * and the tenant setting is the legacy fallback.
 */
function resolvePaymentTermsDays(
  invoice: SalesInvoice,
  customer: CustomerInfo,
  settings: TenantSettings,
): number {
  if (customer.paymentTermsDays != null && customer.paymentTermsDays >= 0) {
    return customer.paymentTermsDays;
  }
  try {
    const issued = new Date(invoice.invoiceDate + 'T00:00:00Z').getTime();
    const due = new Date(invoice.dueDate + 'T00:00:00Z').getTime();
    if (Number.isFinite(issued) && Number.isFinite(due) && due >= issued) {
      return Math.round((due - issued) / (1000 * 60 * 60 * 24));
    }
  } catch {
    // Fall through
  }
  return settings.paymentTermsDays ?? 30;
}

/**
 * Renders the bank details section. Prefers real bank_accounts rows over the
 * legacy `tenant.settings.bankName` fallback. If multiple accounts exist, all
 * are shown so the customer can pay to whichever they prefer.
 */
function buildBankSection(banks: BankAccountInfo[], settings: TenantSettings): string {
  if (banks.length > 0) {
    const rows = banks.map((b) => `
      <p style="margin-bottom:4px">
        <strong>${b.bankName}</strong>
        ${b.name && b.name !== b.bankName ? ` (${b.name})` : ''}
        &nbsp;|&nbsp; <strong>A/C:</strong> ${b.accountNumber}
        &nbsp;|&nbsp; <strong>IFSC:</strong> ${b.ifscCode}
      </p>`).join('');
    return rows;
  }

  // Legacy fallback for tenants that haven't migrated to bank_accounts.
  if (settings.bankName || settings.bankAccount) {
    return `<p><strong>Bank:</strong> ${settings.bankName ?? ''} &nbsp;|&nbsp;
       <strong>A/C:</strong> ${settings.bankAccount ?? ''} &nbsp;|&nbsp;
       <strong>IFSC:</strong> ${settings.bankIfsc ?? ''}</p>`;
  }

  return '<p><em>Bank details not configured.</em></p>';
}

function buildGstItemTableHeader(items: SalesInvoiceItem[]): string {
  const showHsn = hasHsnCodes(items);
  const hsnTh = showHsn ? '<th style="text-align:left;width:80px">HSN/SAC</th>' : '';
  return `<tr>
        <th style="width:32px">#</th>
        <th style="text-align:left">Description</th>
        <th style="text-align:center;width:50px">UOM</th>
        ${hsnTh}
        <th style="text-align:right;width:60px">Qty</th>
        <th style="text-align:right;width:80px">Rate (\u20B9)</th>
        <th style="text-align:center;width:60px">Tax %</th>
        <th style="text-align:right;width:90px">Amount (\u20B9)</th>
      </tr>`;
}

export function renderInvoiceHTML(
  invoice: SalesInvoice,
  items: SalesInvoiceItem[],
  customer: CustomerInfo,
  tenant: TenantInfo,
  banks: BankAccountInfo[] = [],
): string {
  const settings = tenant.settings as TenantSettings;
  const tenantAddr = buildTenantAddress(settings);
  // Resolve payment terms with this priority:
  //   1. Customer's configured paymentTermsDays — what the customer agreed to
  //   2. Computed from this invoice's own dueDate - invoiceDate
  //   3. Tenant default in settings (legacy)
  //   4. Hardcoded 30 (last resort)
  const paymentTerms = resolvePaymentTermsDays(invoice, customer, settings);
  const amountWords = numToWords(invoice.totalAmount);
  const custAddr = buildAddress(customer);
  const gst = hasGstData(invoice);

  const bankSection = buildBankSection(banks, settings);

  const gstHeaderFields = gst ? buildGstHeaderFields(invoice) : '';
  const irnSection = gst ? renderIrnSection(invoice) : '';
  const hsnSummary = gst ? renderHsnSummaryTable(items) : '';

  const itemTableHeader = gst
    ? buildGstItemTableHeader(items)
    : `<tr>
        <th style="width:32px">#</th>
        <th style="text-align:left">Description</th>
        <th style="text-align:center;width:50px">UOM</th>
        <th style="text-align:right;width:70px">Qty</th>
        <th style="text-align:right;width:90px">Rate (\u20B9)</th>
        <th style="text-align:right;width:90px">Amount (\u20B9)</th>
      </tr>`;

  const itemRows = gst ? buildItemRowsGst(items) : buildItemRowsSimple(items);
  const showHsn = gst && hasHsnCodes(items);
  // GST table: # | Desc | UOM | (HSN) | Qty | Rate | Tax% | Amount = 8 (or 7 without HSN)
  // Simple table: # | Desc | UOM | Qty | Rate | Amount = 6
  const totalCols = gst ? (showHsn ? 8 : 7) : 6;
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
  <div class="powered-by">
    <span class="powered-by-text">Invoiced with</span>
    ${RUNQ_LOGO_DATA_URI
      ? `<img class="powered-by-logo" src="${RUNQ_LOGO_DATA_URI}" alt="runQ" />`
      : '<span class="powered-by-name">runQ</span>'}
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
  .page { width: 100%; max-width: 180mm; margin: 0 auto; }

  /* ─── Header ──────────────────────────────────────────────────────── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    gap: 24px;
    padding-bottom: 14px;
    margin-bottom: 18px;
    border-bottom: none;
  }
  .header-left { flex: 1.4; min-width: 0; }
  .header-right { flex: 1; text-align: right; min-width: 0; }
  .company-name {
    font-size: 22px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: -0.2px;
    line-height: 1.15;
  }
  .company-legal {
    font-size: 11px;
    color: #777;
    margin-top: 2px;
    font-style: italic;
  }
  .company-address {
    color: #555;
    margin-top: 6px;
    font-size: 11px;
    line-height: 1.4;
  }
  .company-gstin {
    display: inline-block;
    margin-top: 6px;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 600;
    color: #4f46e5;
    background: #eef2ff;
    border: 1px solid #c7d2fe;
    border-radius: 4px;
    letter-spacing: 0.3px;
  }
  .invoice-label {
    font-size: 11px;
    font-weight: 600;
    color: #4f46e5;
    letter-spacing: 2.5px;
    text-transform: uppercase;
  }
  .invoice-title {
    font-size: 26px;
    font-weight: 700;
    color: #1a1a1a;
    line-height: 1.05;
    margin-top: 2px;
  }
  .invoice-meta {
    margin-top: 12px;
    font-size: 11px;
    color: #444;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 8px 12px;
    background: #fafafa;
    text-align: left;
    display: inline-block;
    min-width: 200px;
  }
  .invoice-meta-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 2px 0;
  }
  .invoice-meta-row + .invoice-meta-row { border-top: 1px dashed #e5e7eb; }
  .invoice-meta-key { color: #777; font-weight: 500; }
  .invoice-meta-val { color: #111; font-weight: 600; font-variant-numeric: tabular-nums; }
  .gst-meta { margin-top: 8px; font-size: 10px; color: #444; line-height: 1.5; }

  /* ─── Body ────────────────────────────────────────────────────────── */
  .divider { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
  .two-col { display: flex; gap: 24px; margin-bottom: 12px; }
  .col { flex: 1; }
  .label { font-size: 10px; text-transform: uppercase; color: #888; font-weight: bold; margin-bottom: 2px; letter-spacing: 0.4px; }
  .value { font-size: 12px; color: #111; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #f4f6f8; font-size: 11px; text-transform: uppercase; color: #555;
       padding: 6px 8px; border: 1px solid #ddd; letter-spacing: 0.3px; }
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
  .powered-by {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid #eee;
    color: #888;
    font-size: 9.5px;
  }
  .powered-by-logo {
    height: 16px;
    width: auto;
    display: inline-block;
    vertical-align: middle;
  }
  .powered-by-name { color: #4F46E5; font-weight: 700; letter-spacing: 0.2px; }
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
  // Display name takes the dba/trading name; legal name (LLP, Pvt Ltd, etc.)
  // is shown smaller below if it differs. This matches how most B2B invoices
  // present a brand identity even though the legal entity may be different.
  const showLegal = settings.legalName && settings.legalName.trim() && settings.legalName !== tenantName;
  const legalLine = showLegal
    ? `<div class="company-legal">${settings.legalName}</div>`
    : '';

  const gstinLine = settings.gstin
    ? `<div class="company-gstin">GSTIN: ${settings.gstin}</div>`
    : '';

  // Invoice metadata as a labelled key/value list inside a soft box. The
  // PO Number row appears only when populated.
  const metaRows: string[] = [];
  metaRows.push(`
    <div class="invoice-meta-row">
      <span class="invoice-meta-key">Invoice #</span>
      <span class="invoice-meta-val">${invoice.invoiceNumber}</span>
    </div>`);
  metaRows.push(`
    <div class="invoice-meta-row">
      <span class="invoice-meta-key">Issued</span>
      <span class="invoice-meta-val">${fmtDate(invoice.invoiceDate)}</span>
    </div>`);
  metaRows.push(`
    <div class="invoice-meta-row">
      <span class="invoice-meta-key">Due</span>
      <span class="invoice-meta-val">${fmtDate(invoice.dueDate)}</span>
    </div>`);
  if (invoice.poNumber) {
    metaRows.push(`
    <div class="invoice-meta-row">
      <span class="invoice-meta-key">PO #</span>
      <span class="invoice-meta-val">${invoice.poNumber}</span>
    </div>`);
  }

  // GST place-of-supply / supply type / reverse charge sit BELOW the meta
  // box rather than inside it — they're per-invoice tax fields, not
  // identification fields, and they crowd the box when present.
  const gstSupplemental = gstHeaderFields ? `<div class="gst-meta">${gstHeaderFields}</div>` : '';

  return `<div class="header">
    <div class="header-left">
      <div class="company-name">${tenantName}</div>
      ${legalLine}
      ${tenantAddr ? `<div class="company-address">${tenantAddr}</div>` : ''}
      ${gstinLine}
    </div>
    <div class="header-right">
      <div class="invoice-label">Tax Invoice</div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-meta">${metaRows.join('')}</div>
      ${gstSupplemental}
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
