// HTML template for a rate chart — the FAT/SNF matrix, flat rate or CLR
// breakpoints plus bonus/slab rules. Rendered to PDF via the shared Puppeteer
// helper (renderHtmlToPdf). Self-contained: inline CSS, no external assets.

export interface RateChartCell {
  fat: string | null;
  snf: string | null;
  clr: string | null;
  ratePerLitre: string;
}

export interface RateChartRule {
  ruleType: 'quality_bonus' | 'volume_slab';
  grade: string | null;
  minQty: string | null;
  maxQty: string | null;
  bonusPerLitre: string;
}

export interface RateChartPrintData {
  tenantName: string;
  chart: {
    name: string;
    milkType: string;
    pricingMode: 'flat' | 'clr' | 'matrix';
    flatRatePerLitre: string | null;
    season: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    isActive: boolean;
  };
  scopeName: string;
  cells: RateChartCell[];
  rules: RateChartRule[];
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
const milkLabel = (m: string): string => ({ cow: 'Cow', buffalo: 'Buffalo', mixed: 'Mixed' }[m] ?? m);
const modeLabel = (m: string): string =>
  ({ flat: 'Flat per-litre', clr: 'CLR (lactometer)', matrix: 'FAT × SNF matrix' }[m] ?? m);

function metaRow(k: string, v: string): string {
  return `<div class="meta-row"><span class="meta-k">${esc(k)}</span><span class="meta-v">${esc(v)}</span></div>`;
}

function bodySection(d: RateChartPrintData): string {
  if (d.chart.pricingMode === 'flat') {
    return `<div class="flat">Flat rate &nbsp;
      <span class="flat-v">₹ ${esc(d.chart.flatRatePerLitre ?? '–')}</span> &nbsp;/ litre</div>`;
  }
  if (d.chart.pricingMode === 'clr') return clrTable(d.cells);
  return matrixTable(d.cells);
}

function clrTable(cells: RateChartCell[]): string {
  const rows = cells.filter((c) => c.clr != null).sort((a, b) => Number(a.clr) - Number(b.clr));
  if (!rows.length) return '<p class="muted">No CLR breakpoints.</p>';
  return `<div class="section-label">CLR breakpoints (₹/L) — highest matching row wins</div>
    <table class="grid"><thead><tr>
      <th>CLR (min)</th><th class="right">₹ / litre</th>
    </tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.clr!)}</td><td class="right">${esc(r.ratePerLitre)}</td></tr>`).join('')}
    </tbody></table>`;
}

function matrixTable(cells: RateChartCell[]): string {
  const mx = cells.filter((c) => c.fat != null && c.snf != null);
  if (!mx.length) return '<p class="muted">No matrix cells.</p>';
  const fats = [...new Set(mx.map((c) => c.fat!))].sort((a, b) => Number(a) - Number(b));
  const snfs = [...new Set(mx.map((c) => c.snf!))].sort((a, b) => Number(a) - Number(b));
  const rateAt = (fat: string, snf: string) => mx.find((c) => c.fat === fat && c.snf === snf)?.ratePerLitre;
  return `<div class="section-label">Rate matrix (₹/L) · FAT down, SNF across</div>
    <table class="grid"><thead><tr>
      <th>FAT \\ SNF</th>${snfs.map((s) => `<th class="right">${esc(s)}</th>`).join('')}
    </tr></thead><tbody>
      ${fats.map((fat) => `<tr><td class="rowhead">${esc(fat)}</td>${snfs
        .map((s) => `<td class="right">${esc(rateAt(fat, s) ?? '—')}</td>`).join('')}</tr>`).join('')}
    </tbody></table>`;
}

function calcTip(d: RateChartPrintData): string {
  const base = d.chart.pricingMode === 'flat'
    ? 'Every litre is paid at the flat rate above, regardless of FAT/SNF or CLR.'
    : d.chart.pricingMode === 'clr'
      ? 'Your rate is the highest CLR breakpoint at or below your measured CLR. A reading above the top breakpoint is paid at the top rate.'
      : 'Your rate is the cell at the highest FAT row and SNF column at or below your measured values (nearest-lower match — readings between rows/columns round down).';
  const bonus = d.rules.length
    ? ' Any applicable quality-grade and volume-slab bonuses listed above are then added per litre.'
    : '';
  return `<div class="tip"><span class="tip-k">How your rate is calculated</span>${esc(base + bonus)}</div>`;
}

function ruleLine(r: RateChartRule): string {
  const text = r.ruleType === 'quality_bonus'
    ? `Grade ${esc((r.grade ?? '').toUpperCase())} quality bonus: +₹${esc(r.bonusPerLitre)}/L`
    : `Volume slab ${esc(r.minQty ?? '0')}–${esc(r.maxQty ?? '∞')} L: +₹${esc(r.bonusPerLitre)}/L`;
  return `<li>${text}</li>`;
}

export function renderRateChartHTML(d: RateChartPrintData): string {
  const period = `${fmtDate(d.chart.effectiveFrom)}${d.chart.effectiveTo ? ` → ${fmtDate(d.chart.effectiveTo)}` : ' onwards'}`;
  const gen = new Date(d.generatedAt);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>${STYLE}</head><body><div class="page">
    <div class="header">
      <div>
        <div class="brand">${esc(d.tenantName)}</div>
        <div class="sub">Rate Chart</div>
      </div>
      <div class="meta">
        ${metaRow('Chart', d.chart.name)}
        ${metaRow('Milk', milkLabel(d.chart.milkType))}
        ${metaRow('Scope', d.scopeName)}
        ${metaRow('Mode', modeLabel(d.chart.pricingMode))}
        ${metaRow('Effective', period)}
        ${metaRow('Status', d.chart.isActive ? 'Active' : 'Inactive')}
      </div>
    </div>
    ${bodySection(d)}
    ${d.rules.length ? `<div class="section-label">Bonuses &amp; slabs</div>
      <ul class="rules">${d.rules.map(ruleLine).join('')}</ul>` : ''}
    ${calcTip(d)}
    <div class="footer">Generated ${fmtDate(gen.toISOString().slice(0, 10))} · Powered by runq</div>
  </div></body></html>`;
}

const STYLE = `<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 12px; color: #14150F; }
  .page { width: 100%; max-width: 182mm; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px;
    padding-bottom: 14px; margin-bottom: 16px; border-bottom: 2px solid #0F7A5A; }
  .brand { font-size: 22px; font-weight: 700; color: #0F7A5A; letter-spacing: -0.2px; }
  .sub { font-size: 11px; color: #5B635C; letter-spacing: 2px; text-transform: uppercase; margin-top: 2px; }
  .meta { font-size: 11px; border: 1px solid #E9E7DF; border-radius: 6px; padding: 8px 12px; background: #FBFAF6; min-width: 240px; }
  .meta-row { display: flex; justify-content: space-between; gap: 16px; padding: 2px 0; }
  .meta-row + .meta-row { border-top: 1px dashed #E9E7DF; }
  .meta-k { color: #5B635C; }
  .meta-v { color: #14150F; font-weight: 600; }
  .section-label { font-size: 11px; color: #5B635C; margin: 4px 0 6px; font-weight: 600; }
  .flat { font-size: 14px; padding: 12px 14px; background: #F1F7F4; border-radius: 8px; }
  .flat-v { font-size: 18px; font-weight: 700; color: #0F7A5A; }
  table.grid { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
  .grid thead th { background: #0F7A5A; color: #fff; font-weight: 600; padding: 7px 8px; text-align: left; }
  .grid thead th.right { text-align: right; }
  .grid tbody td { padding: 6px 8px; border-bottom: 1px solid #EFEDE6; font-variant-numeric: tabular-nums; }
  .grid tbody tr:nth-child(even) td { background: #FBFAF6; }
  .grid .rowhead { font-weight: 600; }
  .right { text-align: right; }
  .rules { list-style: none; font-size: 12px; }
  .rules li { padding: 4px 0; border-bottom: 1px dashed #EFEDE6; color: #14150F; }
  .muted { color: #5B635C; font-size: 12px; }
  .tip { margin-top: 16px; padding: 10px 12px; background: #F1F7F4; border-left: 3px solid #0F7A5A;
    border-radius: 4px; font-size: 11px; color: #14150F; line-height: 1.5; }
  .tip-k { display: block; font-weight: 600; color: #0F7A5A; margin-bottom: 2px; }
  .footer { margin-top: 16px; font-size: 10px; color: #9aa29a; text-align: center; }
</style>`;
