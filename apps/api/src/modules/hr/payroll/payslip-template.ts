import type { TenantSettings } from '@runq/types';

/**
 * Printable payslip. Standalone HTML with inline styles — the same document
 * backs the on-screen preview and the PDF, so an employee's download matches
 * what payroll saw when they approved it.
 *
 * A payslip is a document employees hand to landlords, banks and visa desks,
 * so it carries the things those readers check: who issued it (legal name,
 * address, GSTIN), who it's for (code, designation, PAN, UAN, bank account),
 * the period, and a full earnings/deductions breakdown that foots to net pay.
 */

export interface PayslipDoc {
  employeeCode: string;
  employeeName: string;
  designation?: string | null;
  department?: string | null;
  joiningDate?: string | null;
  pan?: string | null;
  uan?: string | null;
  esiNumber?: string | null;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  month: number;
  year: number;
  workingDays: string | number;
  paidDays: string | number;
  lopDays: string | number;
  lopDates?: string[];
  earnings: Array<{ code: string; name: string; amount: number }>;
  deductions: Array<{ code: string; name: string; amount: number }>;
  gross: string | number;
  totalDeductions: string | number;
  netPay: string | number;
  /**
   * What the employee still owes on advances, loans and ad-hoc deductions.
   * Deliberately a live figure rather than an as-of-this-run one: the question
   * a payslip in hand actually prompts is "how much is left to repay?", and
   * that answer is today's, not the one from the month it was issued.
   */
  recoveryBalance?: { loans: number; deductions: number; total: number };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  ));

const n = (v: string | number): number => Number(v ?? 0);

const inr = (v: string | number): string =>
  `₹${n(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 78412.5 → "Seventy Eight Thousand Four Hundred Twelve and Fifty Paise Only" */
function amountInWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number): string =>
    x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ' ' + ones[x % 10] : ''}`;
  const three = (x: number): string =>
    x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' + two(x % 100) : ''}` : two(x);

  const whole = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - whole) * 100);
  if (whole === 0 && paise === 0) return 'Zero Only';

  // Indian grouping: crore, lakh, thousand, then the last three digits.
  const parts: string[] = [];
  const crore = Math.floor(whole / 10000000);
  const lakh = Math.floor((whole % 10000000) / 100000);
  const thousand = Math.floor((whole % 100000) / 1000);
  const rest = whole % 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${three(lakh)} Lakh`);
  if (thousand) parts.push(`${three(thousand)} Thousand`);
  if (rest) parts.push(three(rest));

  const words = parts.join(' ') || 'Zero';
  return paise
    ? `${words} and ${two(paise)} Paise Only`
    : `${words} Only`;
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}

function row(label: string, amount: number): string {
  return `<tr><td>${esc(label)}</td><td class="amt">${inr(amount)}</td></tr>`;
}

/// Pad the shorter column so earnings and deductions foot on the same line.
function padRows(count: number, target: number): string {
  return Array.from({ length: Math.max(0, target - count) },
    () => '<tr><td>&nbsp;</td><td></td></tr>').join('');
}

/// Omitted entirely when nothing is owed — most payslips shouldn't carry it.
function recoveryBlock(slip: PayslipDoc): string {
  const bal = slip.recoveryBalance;
  if (!bal || bal.total <= 0) return '';
  const parts = [
    bal.loans > 0 ? `Advances &amp; loans ${inr(bal.loans)}` : '',
    bal.deductions > 0 ? `Other recoveries ${inr(bal.deductions)}` : '',
  ].filter(Boolean).join(' &middot; ');
  return `  <div class="note">Outstanding balance as on date: <strong>${inr(bal.total)}</strong>`
    + (parts ? ` (${parts})` : '') + '</div>';
}

export function renderPayslipHTML(
  slip: PayslipDoc,
  tenantName: string,
  settings: TenantSettings,
): string {
  const period = `${MONTHS[slip.month - 1]} ${slip.year}`;
  const company = settings.legalName?.trim() || tenantName;
  const addr = [
    settings.addressLine1, settings.addressLine2,
    [settings.city, settings.state].filter(Boolean).join(', '),
    settings.pincode,
  ].filter(Boolean).map(esc).join(', ');

  const meta = (label: string, value: unknown) =>
    value ? `<div class="meta-row"><span class="meta-k">${esc(label)}</span><span class="meta-v">${esc(value)}</span></div>` : '';

  const rowCount = Math.max(slip.earnings.length, slip.deductions.length);
  const lopNote = (slip.lopDates?.length ?? 0) > 0
    ? `<div class="note">Unpaid days: ${slip.lopDates!.map(shortDate).map(esc).join(', ')}</div>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Payslip ${esc(period)} — ${esc(slip.employeeName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         color: #18181b; margin: 0; padding: 28px; max-width: 780px; margin: 0 auto;
         font-size: 12px; line-height: 1.5; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #18181b; padding-bottom: 14px; }
  .company { font-size: 17px; font-weight: 700; letter-spacing: -0.2px; }
  .company-addr, .company-reg { color: #52525b; font-size: 11px; margin-top: 2px; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 13px; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
  .doc-title .period { font-size: 16px; font-weight: 700; margin-top: 2px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0 32px; margin: 18px 0 6px; }
  .meta-row { display: flex; justify-content: space-between; padding: 3px 0;
              border-bottom: 1px dotted #e4e4e7; }
  .meta-k { color: #71717a; }
  .meta-v { font-weight: 600; text-align: right; }
  .days { display: flex; gap: 24px; margin: 14px 0 4px; padding: 8px 12px;
          background: #f4f4f5; border-radius: 4px; }
  .days div span { color: #71717a; margin-right: 6px; }
  .note { color: #71717a; font-size: 11px; margin: 6px 0 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; margin-top: 16px; }
  th { text-align: left; text-transform: uppercase; letter-spacing: 0.6px; font-size: 10px;
       color: #52525b; border-bottom: 1px solid #d4d4d8; padding: 6px 0; }
  th.amt, td.amt { text-align: right; }
  td { padding: 5px 0; border-bottom: 1px solid #f4f4f5; }
  tfoot td { font-weight: 700; border-top: 1px solid #d4d4d8; border-bottom: none; padding-top: 7px; }
  .net { margin-top: 18px; padding: 12px 14px; background: #18181b; color: #fff;
         border-radius: 4px; display: flex; justify-content: space-between; align-items: center; }
  .net .label { text-transform: uppercase; letter-spacing: 1px; font-size: 11px; }
  .net .value { font-size: 19px; font-weight: 700; }
  .words { margin-top: 6px; color: #52525b; font-size: 11px; font-style: italic; }
  .foot { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e4e4e7;
          color: #a1a1aa; font-size: 10px; text-align: center; }
  @media print { body { padding: 0; } }
</style></head><body>

  <div class="head">
    <div>
      <div class="company">${esc(company)}</div>
      ${addr ? `<div class="company-addr">${addr}</div>` : ''}
      ${settings.gstin ? `<div class="company-reg">GSTIN: ${esc(settings.gstin)}</div>` : ''}
      ${settings.pfEstablishmentCode ? `<div class="company-reg">PF Code: ${esc(settings.pfEstablishmentCode)}</div>` : ''}
    </div>
    <div class="doc-title">
      <h1>Payslip</h1>
      <div class="period">${esc(period)}</div>
    </div>
  </div>

  <div class="meta">
    <div>
      ${meta('Employee', slip.employeeName)}
      ${meta('Employee code', slip.employeeCode)}
      ${meta('Designation', slip.designation)}
      ${meta('Department', slip.department)}
    </div>
    <div>
      ${meta('Date of joining', slip.joiningDate)}
      ${meta('PAN', slip.pan)}
      ${meta('UAN', slip.uan)}
      ${meta('Bank A/C', slip.bankAccountNumber
        ? `${slip.bankAccountNumber}${slip.bankName ? ' · ' + slip.bankName : ''}`
        : null)}
    </div>
  </div>

  <div class="days">
    <div><span>Working days</span><strong>${n(slip.workingDays)}</strong></div>
    <div><span>Paid days</span><strong>${n(slip.paidDays)}</strong></div>
    <div><span>Loss of pay</span><strong>${n(slip.lopDays)}</strong></div>
  </div>
  ${lopNote}

  <div class="cols">
    <table>
      <thead><tr><th>Earnings</th><th class="amt">Amount</th></tr></thead>
      <tbody>
        ${slip.earnings.map((e) => row(e.name, e.amount)).join('')}
        ${padRows(slip.earnings.length, rowCount)}
      </tbody>
      <tfoot><tr><td>Gross earnings</td><td class="amt">${inr(slip.gross)}</td></tr></tfoot>
    </table>
    <table>
      <thead><tr><th>Deductions</th><th class="amt">Amount</th></tr></thead>
      <tbody>
        ${slip.deductions.length
          ? slip.deductions.map((d) => row(d.name, d.amount)).join('')
          : '<tr><td colspan="2" style="color:#a1a1aa">No deductions</td></tr>'}
        ${padRows(Math.max(slip.deductions.length, 1), rowCount)}
      </tbody>
      <tfoot><tr><td>Total deductions</td><td class="amt">${inr(slip.totalDeductions)}</td></tr></tfoot>
    </table>
  </div>

  <div class="net">
    <span class="label">Net pay</span>
    <span class="value">${inr(slip.netPay)}</span>
  </div>
  <div class="words">${esc(amountInWords(n(slip.netPay)))}</div>
${recoveryBlock(slip)}

  <div class="foot">
    This is a computer-generated payslip and does not require a signature.
  </div>
</body></html>`;
}
