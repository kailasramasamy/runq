// HTML for the receipt-variance statement: one receiving centre's dispatch vs
// measured litres over a cycle, valued at purchase cost. Rendered to PDF by the
// shared Puppeteer helper and shared from the app, so it has to stand on its
// own — whoever opens it on WhatsApp has none of the screen's context. Reuses
// the pour statement's look (STYLE + helpers) so every Dhenu document matches.

import {
  esc, fmtDate, inr, num, milkLabel, metaRow, summaryCard, slug, STYLE,
} from './statement-template';
import {
  TOLERANCE_PCT, FLAG_PCT, type ReceiptVarianceReport, type ReceiptVarianceLine, type VarianceTally,
} from './receipt-variance-summary';

export interface VarianceStatementData {
  tenantName: string;
  nodeName: string;
  stage: 'cc' | 'pp';
  period: { from: string; to: string; label?: string };
  report: ReceiptVarianceReport;
  generatedAt: string;
}

const STAGE_LABEL = { cc: 'VMCC → Chilling centre', pp: 'Chilling centre → Plant' } as const;

function signed(n: number, fmt: (v: number) => string): string {
  if (n === 0) return fmt(0);
  return `${n < 0 ? '−' : '+'}${fmt(Math.abs(n))}`;
}
const litres = (n: number) => signed(n, (v) => num(v, 1));
const pct = (n: number) => signed(n, (v) => `${num(v, 1)}%`);
const money = (n: number) => signed(n, inr);

/** Colour class for a signed figure; muted inside tolerance so only real
 *  movement stands out on the page. */
function tone(qty: number, pctValue: number): string {
  if (qty === 0 || Math.abs(pctValue) <= TOLERANCE_PCT) return 'muted';
  return qty < 0 ? 'loss' : 'gain';
}

function netCells(t: VarianceTally): string {
  const c = tone(t.netQty, t.netPct);
  return `<td class="right ${c}">${litres(t.netQty)}</td>
    <td class="right ${c}">${pct(t.netPct)}</td>
    <td class="right ${c}">${t.netValue === 0 && t.netQty !== 0 ? '–' : money(t.netValue)}</td>`;
}

function sourceSection(d: VarianceStatementData): string {
  const rows = d.report.bySource.map((s) => `<tr>
    <td>${esc(s.fromNodeName)}</td>
    <td class="right">${s.loads}</td>
    <td class="right">${s.shortLoads}</td>
    <td class="right">${s.gainLoads}</td>
    <td class="right">${s.matchedLoads}</td>
    ${netCells(s)}
  </tr>`).join('');
  return `<div class="section-title">By source — worst first</div>
  <table class="breakup">
    <thead><tr>
      <th>Source</th><th class="right">Loads</th><th class="right">Short</th>
      <th class="right">Over</th><th class="right">Matched</th>
      <th class="right">Net L</th><th class="right">Net %</th><th class="right">Net ₹</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function daySection(d: VarianceStatementData): string {
  const t = d.report.totals;
  const rows = d.report.byDay.map((day) => `<tr>
    <td>${fmtDate(day.date)}</td>
    <td class="right">${day.loads}</td>
    <td class="right">${num(day.dispatchedQty, 1)}</td>
    <td class="right">${num(day.measuredQty, 1)}</td>
    ${netCells(day)}
  </tr>`).join('');
  return `<div class="section-title">By day</div>
  <table class="breakup">
    <thead><tr>
      <th>Date</th><th class="right">Loads</th><th class="right">Sent L</th>
      <th class="right">Measured L</th><th class="right">Net L</th>
      <th class="right">Net %</th><th class="right">Net ₹</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td class="tfoot-label">Total</td>
      <td class="right">${t.loads}</td>
      <td class="right">${num(t.dispatchedQty, 1)}</td>
      <td class="right">${num(t.measuredQty, 1)}</td>
      ${netCells(t)}
    </tr></tfoot>
  </table>`;
}

function loadRow(l: ReceiptVarianceLine): string {
  const c = tone(l.varianceQty, l.variancePct);
  return `<tr class="${l.flagged ? 'flag' : ''}">
    <td>${fmtDate(l.date)}</td>
    <td class="center">${l.shift ? l.shift.toUpperCase() : '–'}</td>
    <td>${esc(l.fromNodeName)}${l.flagged ? ' <span class="flag-mark">▲</span>' : ''}</td>
    <td>${l.milkType ? esc(milkLabel(l.milkType)) : '–'}</td>
    <td class="right">${num(l.dispatchedQty, 1)}</td>
    <td class="right">${num(l.measuredQty, 1)}</td>
    <td class="right ${c}">${litres(l.varianceQty)}</td>
    <td class="right ${c}">${pct(l.variancePct)}</td>
    <td class="right">${l.unitCost == null ? '–' : num(l.unitCost, 2)}</td>
    <td class="right ${c}">${l.varianceValue == null ? '–' : money(l.varianceValue)}</td>
  </tr>`;
}

/** Only loads that moved — a matched load has nothing to say, and listing
 *  them all would bury the ones that did. */
function loadSection(d: VarianceStatementData): string {
  const moved = d.report.lines.filter((l) => l.varianceQty !== 0);
  if (moved.length === 0) return '';
  return `<div class="section-title">Loads with a variance</div>
  <table>
    <thead><tr>
      <th>Date</th><th class="center">Shift</th><th>Source</th><th>Type</th>
      <th class="right">Sent L</th><th class="right">Measured L</th><th class="right">Var L</th>
      <th class="right">%</th><th class="right">₹/L</th><th class="right">₹</th>
    </tr></thead>
    <tbody>${moved.map(loadRow).join('')}</tbody>
  </table>`;
}

function cards(t: VarianceTally): string {
  const loss = t.netValue !== 0 ? t.netValue < 0 : t.netQty < 0;
  return `<div class="cards">
    ${summaryCard(loss ? 'Net loss' : 'Net gain', `<span class="${loss ? 'loss' : 'gain'}">${inr(Math.abs(t.netValue))}</span>`)}
    ${summaryCard(`Short · ${inr(t.shortValue)}`, `${num(t.shortQty, 1)} L`)}
    ${summaryCard(`Over · ${inr(t.gainValue)}`, `${num(t.gainQty, 1)} L`)}
    ${summaryCard(`Loads beyond ±${FLAG_PCT}%`, `${t.flaggedLoads} of ${t.loads}`)}
  </div>`;
}

export function renderReceiptVarianceHTML(d: VarianceStatementData): string {
  const t = d.report.totals;
  const period = d.period.label
    ? `${d.period.label} (${fmtDate(d.period.from)} – ${fmtDate(d.period.to)})`
    : `${fmtDate(d.period.from)} – ${fmtDate(d.period.to)}`;
  const empty = t.loads === 0
    ? '<div class="pay">No loads were received in this period.</div>'
    : `${sourceSection(d)}${daySection(d)}${loadSection(d)}`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>${STYLE}${EXTRA_STYLE}</head><body><div class="page">
    <div class="header">
      <div>
        <div class="brand">${esc(d.tenantName)}</div>
        <div class="sub">Receipt Variance</div>
      </div>
      <div class="meta">
        ${metaRow('Receiving centre', d.nodeName)}
        ${metaRow('Leg', STAGE_LABEL[d.stage])}
        ${metaRow('Period', period)}
      </div>
    </div>
    ${cards(t)}
    ${t.unpricedQty > 0
      ? `<div class="pay">${num(t.unpricedQty, 1)} L of variance could not be priced — no pour or bill rate was found for that day — and is left out of the ₹ figures.</div>`
      : ''}
    ${empty}
    <div class="note">Variance = measured at the receiving centre − dispatched. Loads within ±${TOLERANCE_PCT}% count as matched; ▲ marks loads beyond ±${FLAG_PCT}%. ₹ is the volume-weighted farmer pour cost for that day and milk type. Rejected milk is not counted as variance.</div>
    <div class="footer">Generated ${fmtDate(d.generatedAt.slice(0, 10))} · Powered by runq</div>
  </div></body></html>`;
}

export function receiptVarianceFilename(d: VarianceStatementData): string {
  const period = d.period.label ?? `${d.period.from}_${d.period.to}`;
  return `${['Variance', slug(d.nodeName, 'centre'), slug(period, `${d.period.from}_${d.period.to}`)].join('_')}.pdf`;
}

const EXTRA_STYLE = `<style>
  .loss { color: #B42318; } .gain { color: #0F7A5A; } .muted { color: #8A918A; }
  tbody tr.flag td { background: #FEF3F2; }
  .flag-mark { color: #B42318; font-size: 9px; }
  .note { margin: 4px 0 0; }
</style>`;
