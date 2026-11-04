// HTML template for a farmer's per-cycle milk collection statement. Rendered to
// PDF via the shared Puppeteer helper (renderHtmlToPdf) so mobile + web share an
// identical document. Self-contained: inline CSS, no external assets.

export interface StatementPour {
  collectionDate: string; // YYYY-MM-DD
  shift: 'am' | 'pm';
  milkType: string;
  qtyLitres: number;
  fat: number | null;
  snf: number | null;
  water: number | null;
  ratePerLitre: number;
  lineAmount: number;
  receiptNo?: string | null;
  /** Litres off this pour later refused. The row still shows what was poured and
   *  billed at gross — the settlement block takes the money back. */
  rejectedQty?: number;
}

/** One refusal on the statement — litres brought that were not kept. */
export interface StatementRejection {
  collectionDate: string;
  shift: 'am' | 'pm' | null;
  milkType: string | null;
  qtyLitres: number;
  reason: string;
  notes?: string | null;
}

/** Per-milk-type subtotal for the breakup section. Quality is litres-weighted. */
export interface MilkTypeBreakdown {
  milkType: string;
  litres: number;
  amount: number;
  count: number;
  avgFat: number | null;
  avgSnf: number | null;
}

/** One deduction the cycle takes off the milk value, with the detail lines the
 *  farmer needs to check it (which sale, which day). */
export interface StatementDeduction {
  type: string;
  amount: number;
  lines?: {
    date: string; qty: number; unit: string; ratePerUnit: number; amount: number;
    /** One of the two is set: a product names its item, bulk milk its type. */
    itemName: string | null; milkType: string | null;
    /** Trailing qualifier — the refusal reason on a rejection line. */
    note?: string | null;
  }[];
  /** Purchases only: still owed from before this period. */
  openingBalance?: number;
}

type DeductionLine = NonNullable<StatementDeduction['lines']>[number];

/** Gross → deductions → net, as the cycle will actually settle it. */
export interface StatementSettlement {
  gross: number;
  deductions: StatementDeduction[];
  totalDeductions: number;
  net: number;
  /** The cycle hasn't been generated yet, so this is what it WILL recover. */
  provisional: boolean;
}

export interface PourStatementData {
  tenantName: string;
  farmer: {
    name: string; code: string;
    village?: string | null; phone?: string | null; nodeName?: string | null;
    bankName?: string | null; bankAccountNumber?: string | null;
    bankIfsc?: string | null; upiId?: string | null;
  };
  period: { from: string; to: string; label?: string | null };
  pours: StatementPour[];
  /** One row per milk type the farmer supplied this cycle. Shown only when the
   *  farmer poured more than one type (otherwise it just restates the totals). */
  byType: MilkTypeBreakdown[];
  /** Litres brought this cycle that were refused. Empty for most farmers. */
  rejections: StatementRejection[];
  totals: {
    litres: number; amount: number; count: number;
    amLitres: number; pmLitres: number;
    avgFat: number | null; avgSnf: number | null; avgWater: number | null;
  };
  /** Null when the farmer has nothing to deduct — the milk total is the payout. */
  settlement: StatementSettlement | null;
  generatedAt: string; // ISO
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}
export function inr(n: number): string {
  return `₹ ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function num(n: number | null, dp = 1): string {
  return n == null ? '–' : n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
export const milkLabel = (m: string): string =>
  ({ cow: 'Cow', buffalo: 'Buffalo', mixed: 'Mixed', cow_a1: 'Cow A1', cow_a2: 'Cow A2' }[m] ?? m);

export function metaRow(k: string, v: string): string {
  return `<div class="meta-row"><span class="meta-k">${esc(k)}</span><span class="meta-v">${esc(v)}</span></div>`;
}

export function summaryCard(label: string, value: string): string {
  return `<div class="card"><div class="card-v">${value}</div><div class="card-l">${esc(label)}</div></div>`;
}

function pourRow(p: StatementPour): string {
  const refused = p.rejectedQty ?? 0;
  return `<tr${refused > 0 ? ' class="rej"' : ''}>
    <td>${fmtDate(p.collectionDate)}${refused > 0
      ? `<div class="rej-note">${num(refused, 1)} L not accepted</div>` : ''}</td>
    <td class="center">${p.shift === 'am' ? 'AM' : 'PM'}</td>
    <td class="center">${esc(milkLabel(p.milkType))}</td>
    <td class="right">${num(p.qtyLitres, 1)}</td>
    <td class="right">${num(p.fat, 1)}</td>
    <td class="right">${num(p.snf, 1)}</td>
    <td class="right">${num(p.water, 1)}</td>
    <td class="right">${num(p.ratePerLitre, 2)}</td>
    <td class="right">${inr(p.lineAmount)}</td>
  </tr>`;
}

/** Per-milk-type subtotal table. Empty when the farmer poured a single type —
 *  a one-row breakup would just repeat the totals card. */
function byTypeSection(rows: MilkTypeBreakdown[]): string {
  if (rows.length <= 1) return '';
  const body = rows.map((r) => `<tr>
    <td>${esc(milkLabel(r.milkType))}</td>
    <td class="right">${num(r.litres, 1)}</td>
    <td class="right">${num(r.avgFat, 1)}</td>
    <td class="right">${num(r.avgSnf, 1)}</td>
    <td class="right">${inr(r.amount)}</td>
  </tr>`).join('');
  return `<div class="section-title">Breakup by milk type</div>
    <table class="breakup">
      <thead><tr>
        <th>Type</th><th class="right">Qty (L)</th><th class="right">Avg FAT</th><th class="right">Avg SNF</th><th class="right">Amount</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

/** What was refused, and why. Sits above the settlement block so the farmer
 *  reads "this is what wasn't kept" before "this is what you're paid" — a
 *  silent reduction in a milk cheque is how a supplier is lost. */
export function rejectionsSection(rows: StatementRejection[]): string {
  if (!rows.length) return '';
  const total = rows.reduce((s, r) => s + r.qtyLitres, 0);
  return `<div class="section-title">Milk not accepted</div>
    <table class="breakup">
      <thead><tr><th>Date</th><th class="center">Shift</th><th class="center">Type</th>
        <th class="right">Litres</th><th>Reason</th></tr></thead>
      <tbody>
        ${rows.map((r) => `<tr>
          <td>${fmtDate(r.collectionDate)}</td>
          <td class="center">${esc((r.shift ?? '').toUpperCase())}</td>
          <td class="center">${esc(milkLabel(r.milkType ?? ''))}</td>
          <td class="right">${num(r.qtyLitres, 1)}</td>
          <td>${esc(rejectionReason(r.reason, r.notes))}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr><td colspan="3" class="tfoot-label">Total not accepted</td>
        <td class="right">${num(total, 1)}</td><td></td></tr></tfoot>
    </table>`;
}

export const REJECTION_LABEL: Record<string, string> = {
  sour: 'Sour', adulterated: 'Adulterated', temperature: 'Too warm',
  cob_positive: 'COB positive', antibiotic: 'Antibiotic residue',
  foreign_matter: 'Foreign matter', other: 'Other',
};

/** The typed note first: 'other' says nothing, and the note holds the real reason. */
export function rejectionReason(reason: string, notes?: string | null): string {
  return notes?.trim() || (REJECTION_LABEL[reason] ?? reason);
}

const DEDUCTION_LABEL: Record<string, string> = {
  quality_rejection: 'Less: milk rejected for quality',
  farmer_sale: 'Less: purchased from us',
  advance: 'Less: advance recovered',
  cattle_feed_loan: 'Less: cattle-feed loan recovered',
  other: 'Less: other deduction',
};

/**
 * Refusals listed and the amount recovered need not match: one raised after the
 * cycle locked is not yet recovered, and one from a past cycle is recovered
 * without appearing here. Naming the difference keeps the block adding up.
 */
function reconcileLine(lines: DeductionLine[], recovered: number): string[] {
  if (!lines.length) return [];
  const listed = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const gap = Math.round((listed - recovered) * 100) / 100;
  if (Math.abs(gap) < 1) return [];
  return [gap > 0
    ? `<em>${inr(gap)} carried to your next payment</em>`
    : `<em>${inr(-gap)} from refusals before this period</em>`];
}

/** "2 × 500g Ghee" counts packs; "80.0 L" measures bulk milk. */
function lineQty(l: DeductionLine): string {
  return l.unit === 'L' || l.milkType
    ? `${num(l.qty, 1)} ${esc(l.unit)}`
    : `${num(l.qty, 0)} × ${esc(l.unit)}`;
}

/** Purchases as a table: a fortnight of near-identical sales is unreadable as prose. */
function purchasesTable(lines: DeductionLine[]): string {
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return `<table class="ded-table">
    <thead><tr><th>Date</th><th>Item</th><th class="right">Qty</th>
      <th class="right">Rate</th><th class="right">Amount</th></tr></thead>
    <tbody>${lines.map((l) => `<tr>
      <td>${fmtDate(l.date)}</td>
      <td>${esc(l.itemName ?? milkLabel(l.milkType ?? ''))}</td>
      <td class="right">${lineQty(l)}</td>
      <td class="right">₹${num(l.ratePerUnit, 2)}/${esc(l.unit)}</td>
      <td class="right">${inr(l.amount)}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="4">Total purchased</td><td class="right">${inr(total)}</td></tr></tfoot>
  </table>`;
}

const settleRow = (label: string, sign: '−' | '+', amount: number): string =>
  `<tr><td>${esc(label)}</td><td class="right">${sign} ${inr(amount)}</td></tr>`;

/**
 * Purchases show what was bought, not what was recovered: recovery is capped at
 * the milk value, so for a trader it would just repeat that figure. Earlier
 * balance and carry-forward then bridge the two, and the block still adds up.
 */
function purchaseRows(d: StatementDeduction): string {
  const lines = d.lines ?? [];
  const opening = d.openingBalance ?? 0;
  const listed = lines.reduce((s, l) => s + l.amount, 0);
  const carried = Math.round((opening + listed - d.amount) * 100) / 100;
  return [
    lines.length ? settleRow(DEDUCTION_LABEL.farmer_sale!, '−', listed)
      + `<tr><td colspan="2" class="ded-cell">${purchasesTable(lines)}</td></tr>` : '',
    opening >= 1 ? settleRow('Less: balance from earlier cycles', '−', opening) : '',
    carried >= 1 ? settleRow('Carried to your next payment', '+', carried) : '',
  ].join('');
}

/** One deduction: its label and amount, then the lines that let the farmer check it. */
function deductionRow(d: StatementDeduction): string {
  if (d.type === 'farmer_sale') return purchaseRows(d);
  const lines = d.lines ?? [];
  const detail = [
    ...lines.map((l) => `${fmtDate(l.date)} · ${lineQty(l)} ${esc(l.itemName ?? milkLabel(l.milkType ?? ''))}`
      + ` @ ₹${num(l.ratePerUnit, 2)}/${esc(l.unit)} · ${inr(l.amount)}`
      + (l.note ? ` · ${esc(l.note)}` : '')),
    ...reconcileLine(lines, d.amount),
  ].join('<br/>');
  return `<tr>
    <td>${esc(DEDUCTION_LABEL[d.type] ?? DEDUCTION_LABEL.other!)}${detail ? `<div class="ded-detail">${detail}</div>` : ''}</td>
    <td class="right">− ${inr(d.amount)}</td>
  </tr>`;
}

/**
 * Gross → deductions → net. Shown only when something is actually deducted:
 * for the great majority of farmers the milk total IS the payout, and a block
 * of zeroes would just invite the question it exists to answer.
 */
function settlementSection(st: StatementSettlement | null): string {
  if (!st || st.totalDeductions <= 0) return '';
  const rows = st.deductions.filter((d) => d.amount > 0).map(deductionRow).join('');
  return `<div class="section-title">Settlement</div>
    <table class="settle">
      <tbody>
        <tr><td>Milk value this period</td><td class="right">${inr(st.gross)}</td></tr>
        ${rows}
        <tr class="settle-net">
          <td>Net payable</td><td class="right grand">${inr(st.net)}</td>
        </tr>
      </tbody>
    </table>
    ${st.provisional
      ? '<div class="note">Deductions shown are pending recovery — they will be settled in this cycle\'s payout.</div>'
      : ''}`;
}

function bankLine(f: PourStatementData['farmer']): string {
  const parts: string[] = [];
  if (f.bankName || f.bankAccountNumber) {
    parts.push(`${esc(f.bankName ?? 'Bank')} · A/C ${esc(f.bankAccountNumber ?? '–')}${f.bankIfsc ? ` · ${esc(f.bankIfsc)}` : ''}`);
  }
  if (f.upiId) parts.push(`UPI: ${esc(f.upiId)}`);
  return parts.length ? `<div class="pay">${parts.join(' &nbsp;|&nbsp; ')}</div>` : '';
}

export function renderPourStatementHTML(d: PourStatementData): string {
  const periodLabel = d.period.label
    ? `${esc(d.period.label)} (${fmtDate(d.period.from)} – ${fmtDate(d.period.to)})`
    : `${fmtDate(d.period.from)} – ${fmtDate(d.period.to)}`;
  const gen = new Date(d.generatedAt);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>${STYLE}</head><body><div class="page">
    <div class="header">
      <div>
        <div class="brand">${esc(d.tenantName)}</div>
        <div class="sub">Milk Collection Statement</div>
      </div>
      <div class="meta">
        ${metaRow('Farmer', d.farmer.name)}
        ${metaRow('Code', d.farmer.code)}
        ${d.farmer.nodeName ? metaRow('VMCC', d.farmer.nodeName) : ''}
        ${metaRow('Period', periodLabel)}
      </div>
    </div>
    ${bankLine(d.farmer)}
    <div class="cards">
      ${summaryCard('Total milk', `${num(d.totals.litres, 1)} L`)}
      ${summaryCard('Total amount', inr(d.totals.amount))}
      ${summaryCard('Pours', String(d.totals.count))}
      ${summaryCard('AM / PM', `${num(d.totals.amLitres, 1)} / ${num(d.totals.pmLitres, 1)} L`)}
      ${summaryCard('Avg FAT / SNF', `${num(d.totals.avgFat, 1)} / ${num(d.totals.avgSnf, 1)}`)}
      ${summaryCard('Avg Water %', num(d.totals.avgWater, 1))}
    </div>
    ${byTypeSection(d.byType)}
    ${rejectionsSection(d.rejections)}
    ${settlementSection(d.settlement)}
    ${d.byType.length > 1 || d.settlement ? '<div class="section-title">Daily detail</div>' : ''}
    <table>
      <thead><tr>
        <th>Date</th><th class="center">Shift</th><th class="center">Type</th>
        <th class="right">Qty (L)</th><th class="right">FAT</th><th class="right">SNF</th><th class="right">Water</th>
        <th class="right">Rate ₹/L</th><th class="right">Amount</th>
      </tr></thead>
      <tbody>
        ${d.pours.length ? d.pours.map(pourRow).join('') : '<tr><td colspan="9" class="empty">No pours in this period.</td></tr>'}
      </tbody>
      <tfoot><tr>
        <td colspan="3" class="tfoot-label">Total</td>
        <td class="right">${num(d.totals.litres, 1)}</td>
        <td colspan="3"></td>
        <td class="right tfoot-label">${d.settlement && d.settlement.totalDeductions > 0 ? 'Gross' : 'Net'}</td>
        <td class="right grand">${inr(d.totals.amount)}</td>
      </tr></tfoot>
    </table>
    <div class="footer">Generated ${fmtDate(gen.toISOString().slice(0, 10))} · Powered by runq</div>
  </div></body></html>`;
}

/** One ASCII-safe filename part. Farmer and centre names are often Kannada or
 * Devanagari, which sanitise away to nothing — hence the fallback. */
export function slug(value: string | null | undefined, fallback = ''): string {
  const out = (value ?? '')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return out || fallback;
}

/** Canonical download name: who, which cycle, which centre — derived here
 * because the server is the only place that knows all three (a farmer can't
 * read /nodes). Clients read it back off Content-Disposition rather than each
 * inventing their own, which is how three different schemes appeared. */
export function pourStatementFilename(d: PourStatementData): string {
  const period = d.period.label ?? `${d.period.from}_${d.period.to}`;
  const parts = [
    slug(d.farmer.name, d.farmer.code),
    slug(period, `${d.period.from}_${d.period.to}`),
    slug(d.farmer.nodeName),
  ].filter(Boolean);
  return `${parts.join('_')}.pdf`;
}

export const STYLE = `<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 12px; color: #14150F; }
  .page { width: 100%; max-width: 182mm; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px;
    padding-bottom: 14px; margin-bottom: 14px; border-bottom: 2px solid #0F7A5A; }
  .brand { font-size: 22px; font-weight: 700; color: #0F7A5A; letter-spacing: -0.2px; }
  .sub { font-size: 11px; color: #5B635C; letter-spacing: 2px; text-transform: uppercase; margin-top: 2px; }
  .meta { font-size: 11px; border: 1px solid #E9E7DF; border-radius: 6px; padding: 8px 12px; background: #FBFAF6; min-width: 220px; }
  .meta-row { display: flex; justify-content: space-between; gap: 16px; padding: 2px 0; }
  .meta-row + .meta-row { border-top: 1px dashed #E9E7DF; }
  .meta-k { color: #5B635C; }
  .meta-v { color: #14150F; font-weight: 600; }
  .pay { font-size: 11px; color: #5B635C; margin-bottom: 12px; padding: 6px 10px; background: #F1F7F4; border-radius: 6px; }
  .cards { display: flex; gap: 8px; margin-bottom: 14px; }
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #5B635C; margin: 2px 0 6px; font-weight: 600; }
  table.breakup { margin-bottom: 16px; }
  /* Settlement reads as a receipt, not a data table: no zebra, right column
     carries the money, and the net line is the one the farmer looks for. */
  table.settle { margin-bottom: 16px; }
  table.settle tbody td { background: #fff; padding: 6px 8px; }
  table.settle tbody tr:first-child td { border-top: 1px solid #E9E7DF; }
  .ded-detail { font-size: 10px; color: #5B635C; margin-top: 2px; }
  .settle-net td { border-top: 2px solid #0F7A5A; border-bottom: none; font-weight: 700; }
  .note { font-size: 10px; color: #8a6d1f; background: #FDF6E3; border-radius: 6px;
    padding: 6px 10px; margin: -8px 0 16px; }
  .card { flex: 1; border: 1px solid #E9E7DF; border-radius: 8px; padding: 8px 10px; }
  .card-v { font-size: 15px; font-weight: 700; color: #14150F; font-variant-numeric: tabular-nums; }
  .card-l { font-size: 10px; color: #5B635C; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead th { background: #0F7A5A; color: #fff; font-weight: 600; padding: 6px 8px; text-align: left; }
  /* Row height is what decides the page count: a fortnight of two-shift pours
     is 32 rows, and at 6px padding they ran one row past A4 — the statement
     then carried a second page holding a single pour and the totals, which
     reads as a mistake. 4px fits the whole cycle on one page with room spare. */
  tbody td { padding: 4px 8px; border-bottom: 1px solid #EFEDE6; font-variant-numeric: tabular-nums; }
  tbody tr:nth-child(even) td { background: #FBFAF6; }
  /* A refused pour stays on the daily detail at what it was poured and billed
     at — striking it out would not match the Gross line. It is flagged instead,
     and the settlement block below is where the money comes back off. */
  tbody tr.rej td { background: #FEF3F2; }
  .rej-note { font-size: 9px; font-weight: 600; color: #B42318; margin-top: 1px; }
  .right { text-align: right; } .center { text-align: center; }
  .empty { text-align: center; color: #5B635C; padding: 20px; }
  /* Print repeats a real <tfoot> at the foot of every page, so a multi-page
     statement showed the cycle total once per page as if each were a subtotal.
     table-row-group makes it an ordinary trailing row: printed once, after the
     last pour. Keep the tfoot element — it stays correct semantics. */
  tfoot { display: table-row-group; }
  tfoot td { padding: 8px; border-top: 2px solid #0F7A5A; font-weight: 700; }
  .tfoot-label { color: #5B635C; }
  .grand { color: #0F7A5A; font-size: 13px; }
  /* Sits inside table.settle, so it has to undo that table's cell rules. */
  table.settle tbody td.ded-cell { padding: 0 8px 8px; }
  table.settle table.ded-table { font-size: 10px; }
  table.ded-table thead th { background: #F1F7F4; color: #5B635C; padding: 3px 6px; }
  table.settle table.ded-table tbody td { background: #fff; padding: 2px 6px; border-top: none; }
  table.ded-table tfoot td { padding: 3px 6px; border-top: 1px solid #E9E7DF; color: #5B635C; }
  .footer { margin-top: 16px; font-size: 10px; color: #9aa29a; text-align: center; }
</style>`;
