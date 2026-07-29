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
  ruleType: 'quality_bonus' | 'volume_slab' | 'quarterly_fat_bonus';
  grade: string | null;
  minQty: string | null;
  maxQty: string | null;
  /** Tier floor for `quarterly_fat_bonus`; null for the per-pour rule types. */
  fatMin?: string | null;
  bonusPerLitre: string;
}

export interface RateChartPrintData {
  tenantName: string;
  chart: {
    name: string;
    milkType: string;
    pricingMode: 'flat' | 'clr' | 'matrix';
    flatRatePerLitre: string | null;
    /** SNF printed on every row of a FAT-only chart. Display only. */
    referenceSnf?: string | null;
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
  if (isFatOnly(d.cells)) return fatOnlyTable(d);
  return matrixTable(d.cells);
}

/** A FAT-only chart: every cell sits at SNF 0, so SNF never moves the rate. */
function isFatOnly(cells: RateChartCell[]): boolean {
  return cells.length > 0 && cells.every((c) => Number(c.snf) === 0);
}

/** The quarterly bonus a given FAT earns — mirrors the server's tier lookup. */
function bonusForFat(rules: RateChartRule[], fat: number): number {
  const t = rules
    .filter((r) => r.ruleType === 'quarterly_fat_bonus' && r.fatMin != null)
    .sort((a, b) => Number(b.fatMin) - Number(a.fatMin))
    .find((r) => fat >= Number(r.fatMin));
  return Number(t?.bonusPerLitre ?? 0);
}

/**
 * FAT-only chart printed as the row-per-FAT table a farmer reads: daily rate,
 * the quarterly bonus that FAT earns, and the all-in total.
 *
 * The SNF column repeats the chart's reference standard. Display only — cells
 * sit at SNF 0 and nothing here is priced on, which the caption says out loud so
 * nobody reads it as a cut-off.
 */
function fatOnlyTable(d: RateChartPrintData): string {
  const rows = d.cells.filter((c) => Number(c.fat) > 0)
    .sort((a, b) => Number(a.fat) - Number(b.fat));
  const floor = d.cells.find((c) => Number(c.fat) === 0);
  const hasTiers = d.rules.some((r) => r.ruleType === 'quarterly_fat_bonus');
  const snf = d.chart.referenceSnf != null ? Number(d.chart.referenceSnf).toFixed(1) : null;
  const head = ['FAT %', ...(snf ? ['Min SNF'] : []), 'Rate ₹/L',
    ...(hasTiers ? ['Quarterly bonus ₹/L', 'All-in ₹/L'] : [])];
  const body = rows.map((c, i) => {
    const fat = Number(c.fat), base = Number(c.ratePerLitre), b = bonusForFat(d.rules, fat);
    // Nearest-floor leaves the top row unbounded: any richer reading matches it,
    // so it is the cap and should read as one.
    const label = i === rows.length - 1 ? `${fat.toFixed(1)} and above` : fat.toFixed(1);
    const cells = [
      `<td class="rowhead">${esc(label)}</td>`,
      ...(snf ? [`<td class="right dim">${esc(snf)}</td>`] : []),
      `<td class="right">${esc(base.toFixed(2))}</td>`,
      ...(hasTiers ? [
        `<td class="right dim">${b ? esc(b.toFixed(2)) : '—'}</td>`,
        `<td class="right allin">${esc((base + b).toFixed(2))}</td>`,
      ] : []),
    ];
    return `<tr>${cells.join('')}</tr>`;
  }).join('');
  const note = [
    'Your rate is set by FAT alone.',
    snf ? 'The SNF column is the standard we expect — shown for reference, it does not change the rate.' : '',
    rows.length ? `The rate is capped at ${Number(rows[rows.length - 1]!.fat).toFixed(1)} FAT.` : '',
    floor && rows[0] ? `Below ${Number(rows[0].fat).toFixed(1)} FAT the rate drops to ₹${Number(floor.ratePerLitre).toFixed(2)}/L.` : '',
  ].filter(Boolean).join(' ');
  return `<div class="section-label">Rate per litre · priced on FAT</div>
    <table class="grid"><thead><tr>${head.map((h, i) =>
      `<th${i ? ' class="right"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${body}</tbody></table>
    <div class="tip"><span class="tip-k">How your rate is calculated</span>${esc(note)}</div>`;
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
  const bonus = perPourRules(d).length
    ? ' Any applicable quality-grade and volume-slab bonuses listed above are then added per litre.'
    : '';
  return `<div class="tip"><span class="tip-k">How your rate is calculated</span>${esc(base + bonus)}</div>`;
}

/** Rules that price a pour. The quarterly bonus is settled separately, so it is
 *  listed in its own section rather than alongside the per-litre add-ons. */
function perPourRules(d: RateChartPrintData): RateChartRule[] {
  return d.rules.filter((r) => r.ruleType !== 'quarterly_fat_bonus');
}

function ruleLine(r: RateChartRule): string {
  const text = r.ruleType === 'quality_bonus'
    ? `Grade ${esc((r.grade ?? '').toUpperCase())} quality bonus: +₹${esc(r.bonusPerLitre)}/L`
    : `Volume slab ${esc(r.minQty ?? '0')}–${esc(r.maxQty ?? '∞')} L: +₹${esc(r.bonusPerLitre)}/L`;
  return `<li>${text}</li>`;
}

/**
 * Quarterly FAT bonus tiers, printed as RANGES rather than single values. A row
 * reading "3.80 → ₹6.00" invites an argument from every farmer who measures
 * 3.79; "3.70 – 3.84" cannot be misread. Upper bound of each tier is the next
 * tier's floor less 0.01.
 */
function quarterlyTiers(rules: RateChartRule[]): string {
  const tiers = rules
    .filter((r) => r.ruleType === 'quarterly_fat_bonus' && r.fatMin != null)
    .sort((a, b) => Number(b.fatMin) - Number(a.fatMin));
  if (!tiers.length) return '';
  const rows = tiers.map((t, i) => {
    const lo = Number(t.fatMin).toFixed(2);
    const band = i === 0 ? `${lo} and above` : `${lo} – ${(Number(tiers[i - 1]!.fatMin) - 0.01).toFixed(2)}`;
    return `<tr><td class="rowhead">${esc(band)}</td><td class="right">₹${esc(t.bonusPerLitre)}</td></tr>`;
  }).join('');
  const floor = Number(tiers[tiers.length - 1]!.fatMin).toFixed(2);
  return `<div class="section-label">Quarterly bonus — paid as one lump sum after each quarter</div>
    <table><thead><tr><th>Quarterly average FAT</th><th class="right">Bonus / L</th></tr></thead>
    <tbody>${rows}<tr><td class="rowhead">below ${esc(floor)}</td><td class="right">—</td></tr></tbody></table>
    <div class="tip"><span class="tip-k">How the bonus is decided</span>${esc(
      'Your tier is set by the average of your best two months in the quarter, not by any single day. '
      + 'The bonus is then paid on every litre you supplied that quarter. '
      + 'Supplying under 85% of collections, or any rejected pour, forfeits the bonus for that quarter.',
    )}</div>`;
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
    ${perPourRules(d).length ? `<div class="section-label">Bonuses &amp; slabs</div>
      <ul class="rules">${perPourRules(d).map(ruleLine).join('')}</ul>` : ''}
    ${isFatOnly(d.cells) ? '' : calcTip(d)}
    ${quarterlyTiers(d.rules)}
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
  .grid .dim { color: #5B635C; }
  .grid .allin { font-weight: 700; color: #0F7A5A; }
  .rules { list-style: none; font-size: 12px; }
  .rules li { padding: 4px 0; border-bottom: 1px dashed #EFEDE6; color: #14150F; }
  .muted { color: #5B635C; font-size: 12px; }
  .tip { margin-top: 16px; padding: 10px 12px; background: #F1F7F4; border-left: 3px solid #0F7A5A;
    border-radius: 4px; font-size: 11px; color: #14150F; line-height: 1.5; }
  .tip-k { display: block; font-weight: 600; color: #0F7A5A; margin-bottom: 2px; }
  .footer { margin-top: 16px; font-size: 10px; color: #9aa29a; text-align: center; }
</style>`;
