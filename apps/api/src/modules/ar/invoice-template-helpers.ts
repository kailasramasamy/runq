import type { SalesInvoice, SalesInvoiceItem } from '@runq/types';

export interface HsnSummaryRow {
  hsnSacCode: string;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  totalTax: number;
}

export function fmtINR(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${day}-${months[Number(m) - 1]}-${y}`;
}

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const tens = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
  'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function twoDigits(n: number): string {
  if (n < 20) return ones[n] ?? '';
  return (tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')).trim();
}

export function numToWords(n: number): string {
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

/** True when any item has non-zero GST tax fields */
export function hasGstData(invoice: SalesInvoice): boolean {
  return (
    invoice.cgstAmount > 0 ||
    invoice.sgstAmount > 0 ||
    invoice.igstAmount > 0 ||
    invoice.cessAmount > 0 ||
    invoice.placeOfSupply != null
  );
}

/** True when any line item carries an HSN/SAC code */
export function hasHsnCodes(items: SalesInvoiceItem[]): boolean {
  return items.some((item) => item.hsnSacCode != null && item.hsnSacCode !== '');
}

/** Total per-line tax (CGST + SGST + IGST + Cess) */
export function lineTaxAmount(item: SalesInvoiceItem): number {
  return item.cgstAmount + item.sgstAmount + item.igstAmount + item.cessAmount;
}

/** Groups items by HSN/SAC code and aggregates tax amounts */
export function buildHsnSummary(items: SalesInvoiceItem[]): HsnSummaryRow[] {
  const map = new Map<string, HsnSummaryRow>();

  for (const item of items) {
    const code = item.hsnSacCode ?? '';
    if (!code) continue;
    const existing = map.get(code);
    if (existing) {
      existing.taxableValue += item.amount;
      existing.cgstAmount += item.cgstAmount;
      existing.sgstAmount += item.sgstAmount;
      existing.igstAmount += item.igstAmount;
      existing.cessAmount += item.cessAmount;
      existing.totalTax += lineTaxAmount(item);
    } else {
      map.set(code, {
        hsnSacCode: code,
        taxableValue: item.amount,
        cgstAmount: item.cgstAmount,
        sgstAmount: item.sgstAmount,
        igstAmount: item.igstAmount,
        cessAmount: item.cessAmount,
        totalTax: lineTaxAmount(item),
      });
    }
  }

  return Array.from(map.values());
}

/** Returns HTML table rows for GST tax breakdown in the totals section */
export function formatTaxBreakdownRows(invoice: SalesInvoice): string {
  const rows: string[] = [];

  if (invoice.cgstAmount > 0) {
    rows.push(taxRow('CGST', invoice.cgstAmount));
  }
  if (invoice.sgstAmount > 0) {
    rows.push(taxRow('SGST', invoice.sgstAmount));
  }
  if (invoice.igstAmount > 0) {
    rows.push(taxRow('IGST', invoice.igstAmount));
  }
  if (invoice.cessAmount > 0) {
    rows.push(taxRow('Cess', invoice.cessAmount));
  }

  return rows.join('');
}

function taxRow(label: string, amount: number): string {
  return `<tr class="totals-row">
        <td colspan="5" class="totals-label">${label}</td>
        <td colspan="3" class="right">${fmtINR(amount)}</td>
      </tr>`;
}

/** Renders the HSN-wise summary table (required by GST when 2+ distinct HSN codes) */
export function renderHsnSummaryTable(items: SalesInvoiceItem[]): string {
  const summary = buildHsnSummary(items);
  const uniqueHsn = summary.length;
  if (uniqueHsn < 2) return '';

  const isInterState = items.some((i) => i.igstAmount > 0);
  const headerCols = isInterState
    ? '<th style="text-align:right">IGST</th>'
    : '<th style="text-align:right">CGST</th><th style="text-align:right">SGST</th>';

  const bodyRows = summary.map((row) => {
    const taxCols = isInterState
      ? `<td class="cell right">${fmtINR(row.igstAmount)}</td>`
      : `<td class="cell right">${fmtINR(row.cgstAmount)}</td>
         <td class="cell right">${fmtINR(row.sgstAmount)}</td>`;
    return `<tr>
        <td class="cell">${row.hsnSacCode}</td>
        <td class="cell right">${fmtINR(row.taxableValue)}</td>
        ${taxCols}
        <td class="cell right">${fmtINR(row.totalTax)}</td>
      </tr>`;
  }).join('');

  return `
  <div style="margin-top:12px">
    <div class="label">HSN/SAC Summary</div>
    <table style="margin-top:4px">
      <thead>
        <tr>
          <th style="text-align:left">HSN/SAC</th>
          <th style="text-align:right">Taxable Value</th>
          ${headerCols}
          <th style="text-align:right">Total Tax</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>`;
}

/** Renders IRN and QR code placeholder section */
export function renderIrnSection(invoice: SalesInvoice): string {
  if (!invoice.irnNumber) return '';

  return `
  <div style="margin-top:12px;padding:10px;border:1px solid #ddd;border-radius:4px;background:#fafafa">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div class="label">IRN (Invoice Reference Number)</div>
        <div class="value" style="font-size:10px;word-break:break-all;max-width:400px;margin-top:2px">
          ${invoice.irnNumber}
        </div>
        ${invoice.irnDate ? `<div class="value" style="margin-top:2px;font-size:10px">Date: ${fmtDate(invoice.irnDate)}</div>` : ''}
      </div>
      <div style="width:80px;height:80px;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;font-size:9px;color:#999">
        QR Code
      </div>
    </div>
  </div>`;
}

/** Supply type label for the invoice header */
export function supplyTypeLabel(invoice: SalesInvoice): string {
  if (invoice.isInterState == null) return '';
  return invoice.isInterState ? 'Inter-State' : 'Intra-State';
}

/** Place of supply display string, e.g. "Maharashtra (27)" */
export function placeOfSupplyDisplay(invoice: SalesInvoice): string {
  if (!invoice.placeOfSupply) return '';
  const code = invoice.placeOfSupplyCode ? ` (${invoice.placeOfSupplyCode})` : '';
  return `${invoice.placeOfSupply}${code}`;
}
