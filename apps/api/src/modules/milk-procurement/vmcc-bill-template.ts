// HTML template for a bulk VMCC's cycle bill, rendered through the same Puppeteer
// helper and stylesheet as the farmer statement.
import { STYLE, esc, fmtDate, inr, metaRow, milkLabel, num, slug, summaryCard } from './statement-template';

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
      ${commission > 0 ? summaryCard('Operator salary', inr(commission)) : ''}
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
        <td class="right tfoot-label">Milk cost</td>
        <td class="right grand">${inr(d.totals.amount)}</td>
      </tr></tfoot>
    </table>
    ${commission > 0 ? `<table class="settle">
      <tbody>
        <tr><td>Milk cost</td><td class="right">${inr(d.totals.amount)}</td></tr>
        <tr><td>Operator salary</td><td class="right">${inr(commission)}</td></tr>
        <tr class="settle-net">
          <td>Net payable</td><td class="right grand">${inr(grand)}</td>
        </tr>
      </tbody>
    </table>` : ''}
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
