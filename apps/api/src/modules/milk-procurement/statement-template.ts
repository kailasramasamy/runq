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
  }[];
}

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

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}
function inr(n: number): string {
  return `₹ ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function num(n: number | null, dp = 1): string {
  return n == null ? '–' : n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
const milkLabel = (m: string): string =>
  ({ cow: 'Cow', buffalo: 'Buffalo', mixed: 'Mixed', cow_a1: 'Cow A1', cow_a2: 'Cow A2' }[m] ?? m);

function metaRow(k: string, v: string): string {
  return `<div class="meta-row"><span class="meta-k">${esc(k)}</span><span class="meta-v">${esc(v)}</span></div>`;
}

function summaryCard(label: string, value: string): string {
  return `<div class="card"><div class="card-v">${value}</div><div class="card-l">${esc(label)}</div></div>`;
}

function pourRow(p: StatementPour): string {
  return `<tr>
    <td>${fmtDate(p.collectionDate)}</td>
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

const DEDUCTION_LABEL: Record<string, string> = {
  farmer_sale: 'Less: purchased from us',
  advance: 'Less: advance recovered',
  cattle_feed_loan: 'Less: cattle-feed loan recovered',
  other: 'Less: other deduction',
};

/**
 * The listed purchases and the amount recovered need not match: one bought
 * after the cycle locked is listed but not yet recovered, and one carried over
 * from a past cycle is recovered without appearing here. Naming the difference
 * keeps the block adding up instead of quietly not.
 */
function reconcileLine(
  lines: NonNullable<StatementDeduction['lines']>, recovered: number,
): string[] {
  if (!lines.length) return [];
  const listed = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const gap = Math.round((listed - recovered) * 100) / 100;
  if (Math.abs(gap) < 1) return [];
  return [gap > 0
    ? `<em>${inr(gap)} carried to your next payment</em>`
    : `<em>${inr(-gap)} from purchases before this period</em>`];
}

/**
 * Gross → deductions → net. Shown only when something is actually deducted:
 * for the great majority of farmers the milk total IS the payout, and a block
 * of zeroes would just invite the question it exists to answer.
 */
function settlementSection(st: StatementSettlement | null): string {
  if (!st || st.totalDeductions <= 0) return '';
  const rows = st.deductions.filter((d) => d.amount > 0).map((d) => {
    const lines = d.lines ?? [];
    const detail = [
      ...lines.map((l) => {
        const what = l.itemName ?? milkLabel(l.milkType ?? '');
        // "2 × 500g Ghee" for a packed product; "80.0 L Cow A1" for bulk milk.
        const qty = l.milkType
          ? `${num(l.qty, 1)} ${esc(l.unit)}`
          : `${num(l.qty, 0)} × ${esc(l.unit)}`;
        return `${fmtDate(l.date)} · ${qty} ${esc(what)}`
          + ` @ ₹${num(l.ratePerUnit, 2)}/${esc(l.unit)} · ${inr(l.amount)}`;
      }),
      ...reconcileLine(lines, d.amount),
    ].join('<br/>');
    return `<tr>
      <td>${esc(DEDUCTION_LABEL[d.type] ?? DEDUCTION_LABEL.other!)}
        ${detail ? `<div class="ded-detail">${detail}</div>` : ''}</td>
      <td class="right">− ${inr(d.amount)}</td>
    </tr>`;
  }).join('');
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

// ── VMCC bill statement ──────────────────────────────────────────────────────
// A bulk VMCC's cycle bill: the same document shape as the farmer statement, so
// the two read identically, but the rows are the CC's receipts from that VMCC
// (priced on quality) rather than a farmer's pours.

export interface VmccBillLine {
  collectionDate: string;
  shift: 'am' | 'pm';
  milkType: string;
  qtyLitres: number;
  fat: number | null;
  snf: number | null;
  water: number | null;
  /** Null = no chart matched, so this shift added ₹0. */
  ratePerLitre: number | null;
  amount: number;
}

export interface VmccBillStatementData {
  tenantName: string;
  vmcc: { name: string; code: string; ccName?: string | null };
  period: { from: string; to: string; label?: string | null };
  lines: VmccBillLine[];
  totals: { litres: number; amount: number; unpricedLines: number };
  /** VMCC operator commission folded into the bill; omitted when zero. */
  commission?: number;
  generatedAt: string;
}

function vmccLineRow(l: VmccBillLine): string {
  const rate = l.ratePerLitre == null
    ? '<span style="color:#B45309">—</span>'
    : num(l.ratePerLitre, 2);
  return `<tr>
    <td>${fmtDate(l.collectionDate)}</td>
    <td class="center">${l.shift === 'am' ? 'AM' : 'PM'}</td>
    <td class="center">${esc(milkLabel(l.milkType))}</td>
    <td class="right">${num(l.qtyLitres, 1)}</td>
    <td class="right">${num(l.fat, 1)}</td>
    <td class="right">${num(l.snf, 1)}</td>
    <td class="right">${num(l.water, 1)}</td>
    <td class="right">${rate}</td>
    <td class="right">${inr(l.amount)}</td>
  </tr>`;
}

export function renderVmccBillHTML(d: VmccBillStatementData): string {
  const periodLabel = d.period.label
    ? `${esc(d.period.label)} (${fmtDate(d.period.from)} – ${fmtDate(d.period.to)})`
    : `${fmtDate(d.period.from)} – ${fmtDate(d.period.to)}`;
  const commission = d.commission ?? 0;
  const grand = Math.round((d.totals.amount + commission) * 100) / 100;
  const gen = new Date(d.generatedAt);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>${STYLE}</head><body><div class="page">
    <div class="header">
      <div>
        <div class="brand">${esc(d.tenantName)}</div>
        <div class="sub">VMCC Milk Bill</div>
      </div>
      <div class="meta">
        ${metaRow('VMCC', d.vmcc.name)}
        ${metaRow('Code', d.vmcc.code)}
        ${d.vmcc.ccName ? metaRow('Chilling centre', d.vmcc.ccName) : ''}
        ${metaRow('Period', periodLabel)}
      </div>
    </div>
    <div class="cards">
      ${summaryCard('Total milk', `${num(d.totals.litres, 1)} L`)}
      ${summaryCard('Milk cost', inr(d.totals.amount))}
      ${commission > 0 ? summaryCard('Commission', inr(commission)) : ''}
      ${summaryCard('Net payable', inr(grand))}
    </div>
    ${d.totals.unpricedLines > 0
      ? `<div class="pay">${d.totals.unpricedLines} shift(s) could not be priced — no rate chart matched that quality or date — and add ₹0.00 to the milk cost.</div>`
      : ''}
    <table>
      <thead><tr>
        <th>Date</th><th class="center">Shift</th><th class="center">Type</th>
        <th class="right">Qty (L)</th><th class="right">FAT</th><th class="right">SNF</th><th class="right">Water</th>
        <th class="right">Rate ₹/L</th><th class="right">Amount</th>
      </tr></thead>
      <tbody>
        ${d.lines.length ? d.lines.map(vmccLineRow).join('') : '<tr><td colspan="9" class="empty">No milk received in this period.</td></tr>'}
      </tbody>
      <tfoot><tr>
        <td colspan="3" class="tfoot-label">Milk total</td>
        <td class="right">${num(d.totals.litres, 1)}</td>
        <td colspan="3"></td>
        <td class="right tfoot-label">${commission > 0 ? 'Net' : 'Total'}</td>
        <td class="right grand">${inr(grand)}</td>
      </tr></tfoot>
    </table>
    <div class="footer">Generated ${fmtDate(gen.toISOString().slice(0, 10))} · Powered by runq</div>
  </div></body></html>`;
}

export function vmccBillFilename(d: VmccBillStatementData): string {
  const period = d.period.label ?? `${d.period.from}_${d.period.to}`;
  const parts = [
    slug(d.vmcc.name, d.vmcc.code),
    slug(period, `${d.period.from}_${d.period.to}`),
    slug(d.vmcc.ccName),
  ].filter(Boolean);
  return `${parts.join('_')}.pdf`;
}

/** One ASCII-safe filename part. Farmer and centre names are often Kannada or
 * Devanagari, which sanitise away to nothing — hence the fallback. */
function slug(value: string | null | undefined, fallback = ''): string {
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

const STYLE = `<style>
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
  .footer { margin-top: 16px; font-size: 10px; color: #9aa29a; text-align: center; }
</style>`;
