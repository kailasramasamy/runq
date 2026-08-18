// HTML for a labour contract statement — the whole life of one contract on
// paper: who worked, which days counted and which did not, what was advanced
// along the way, and what was finally settled and paid.
//
// Rendered to PDF through the shared Puppeteer helper (renderHtmlToPdf) so
// web and mobile hand over an identical document. Self-contained: inline
// CSS, no external assets.

export interface StatementMember {
  name: string;
  role: string | null;
  dailyRate: number;
  joinedOn: string | null;
  leftOn: string | null;
  /**
   * Calendar days the member was on the contract, BEFORE anything is taken
   * off. Gross on purpose: the row is meant to be read left to right —
   * days on job − paused − leave − half/2 = days worked — and a figure that
   * had already absorbed the pause made the arithmetic look wrong.
   */
  daysOnJob: number;
  pausedDays: number;
  leaveDays: number;
  halfDays: number;
  daysWorked: number;
  earned: number;
}

export interface StatementPause {
  fromDate: string;
  /** Null = never resumed. */
  toDate: string | null;
  reason: string | null;
  days: number;
}

export interface StatementLeave {
  logDate: string;
  memberName: string;
  /** 'leave' | 'half_day' */
  status: string;
  note: string | null;
}

export interface StatementAdvance {
  paidOn: string;
  toName: string;
  paymentMethod: string;
  reference: string | null;
  amount: number;
  status: string;
}

export interface StatementPayment {
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
  amount: number;
  voided: boolean;
}

export interface ContractStatementData {
  tenantName: string;
  contract: {
    number: string;
    name: string;
    leadPersonName: string;
    leadPersonPhone: string | null;
    contractType: 'solo_daily' | 'task_lumpsum' | 'crew_daily';
    status: string;
    startDate: string;
    endDate: string | null;
    fixedAmount: number | null;
    notes: string | null;
  };
  /** The date earnings were counted to. */
  throughDate: string;
  members: StatementMember[];
  pauses: StatementPause[];
  leaves: StatementLeave[];
  advances: StatementAdvance[];
  totals: {
    daysWorked: number;
    leaveDays: number;
    halfDays: number;
    pausedDays: number;
    earned: number;
    /** Advanced over the contract's life, excluding reversed ones. Survives
     *  settlement, when every advance flips to `recovered`. */
    advancesTotal: number;
    /** Still to be recovered — zero once a settlement has netted them off. */
    advancesPaid: number;
    outstanding: number;
  };
  settlement: {
    number: string;
    toDate: string;
    earned: number;
    advancesRecovered: number;
    otherDeductions: number;
    netPayable: number;
    amountPaid: number;
    amountDue: number;
    status: string;
    payments: StatementPayment[];
  } | null;
  generatedAt: string;
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
/** "18" or "18.5" — never "18.0", which reads like a precision nobody has. */
function days(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
const methodLabel = (m: string): string =>
  ({ cash: 'Cash', bank_transfer: 'Bank transfer', upi: 'UPI', cheque: 'Cheque' }[m] ?? m);
const typeLabel = (t: string): string =>
  ({ solo_daily: 'Daily wage', task_lumpsum: 'Task — fixed amount', crew_daily: 'Crew — daily rates' }[t] ?? t);

function metaRow(k: string, v: string): string {
  return `<div class="meta-row"><span class="meta-k">${esc(k)}</span><span class="meta-v">${esc(v)}</span></div>`;
}
function summaryCard(label: string, value: string): string {
  return `<div class="card"><div class="card-v">${value}</div><div class="card-l">${esc(label)}</div></div>`;
}
function section(title: string, body: string): string {
  return `<div class="section-title">${esc(title)}</div>${body}`;
}

/**
 * Who worked, and the arithmetic behind their pay. The columns walk from the
 * days they were on the contract to the days they were actually paid for,
 * which is the question a crew lead asks first.
 */
function crewSection(d: ContractStatementData): string {
  if (d.contract.contractType === 'task_lumpsum') return '';
  const rows = d.members.map((m) => `<tr>
    <td>
      <div class="strong">${esc(m.name)}</div>
      ${m.role || m.joinedOn || m.leftOn ? `<div class="who-sub">${esc([
        m.role ?? '',
        m.joinedOn ? `joined ${fmtDate(m.joinedOn)}` : '',
        m.leftOn ? `left ${fmtDate(m.leftOn)}` : '',
      ].filter(Boolean).join(' · '))}</div>` : ''}
    </td>
    <td class="right">${inr(m.dailyRate)}</td>
    <td class="right">${days(m.daysOnJob)}</td>
    <td class="right">${m.pausedDays || '–'}</td>
    <td class="right">${m.leaveDays || '–'}</td>
    <td class="right">${m.halfDays || '–'}</td>
    <td class="right strong">${days(m.daysWorked)}</td>
    <td class="right">${inr(m.earned)}</td>
  </tr>`).join('');
  return section(d.members.length > 1 ? 'Crew and days worked' : 'Worker and days worked', `
    <table>
      <thead><tr>
        <th>Who</th><th class="right">Rate/day</th><th class="right">Days on job</th>
        <th class="right">Paused</th><th class="right">Leave</th><th class="right">Half</th>
        <th class="right">Days worked</th><th class="right">Earned</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="empty">Nobody on this contract.</td></tr>'}</tbody>
      <tfoot><tr>
        <td colspan="2" class="tfoot-label">Total</td>
        <td class="right">${days(d.members.reduce((s, m) => s + m.daysOnJob, 0))}</td>
        <td class="right">${d.members.reduce((s, m) => s + m.pausedDays, 0) || '–'}</td>
        <td class="right">${d.totals.leaveDays || '–'}</td>
        <td class="right">${d.totals.halfDays || '–'}</td>
        <td class="right">${days(d.totals.daysWorked)}</td>
        <td class="right grand">${inr(d.totals.earned)}</td>
      </tr></tfoot>
    </table>`);
}

/** Only worth printing when the work actually stopped at some point. */
function pausesSection(d: ContractStatementData): string {
  if (d.pauses.length === 0) return '';
  const rows = d.pauses.map((p) => `<tr>
    <td>${fmtDate(p.fromDate)}</td>
    <td>${p.toDate ? fmtDate(p.toDate) : '<span class="warn">not resumed</span>'}</td>
    <td class="right">${p.days}</td>
    <td>${esc(p.reason ?? '–')}</td>
  </tr>`).join('');
  return section('Work paused', `
    <table>
      <thead><tr><th>From</th><th>To</th><th class="right">Days</th><th>Reason</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="note">Nothing accrues on a paused day, for anybody on the contract.</div>`);
}

const MS_PER_DAY = 86_400_000;
const nextDay = (iso: string) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + MS_PER_DAY).toISOString().slice(0, 10);

interface LeaveRun {
  from: string;
  to: string;
  count: number;
  memberName: string;
  status: string;
  note: string | null;
}

/**
 * Collapse consecutive days off into one row.
 *
 * A week's absence is one fact, not seven, and listing it day by day buries
 * the rest of the document. Runs only merge when the person, the marking and
 * the note all match — a differing note is a differing reason, and merging
 * would silently drop one of them.
 */
export function groupLeaveRuns(leaves: StatementLeave[]): LeaveRun[] {
  const byKey = new Map<string, StatementLeave[]>();
  for (const l of leaves) {
    const key = `${l.memberName}|${l.status}|${l.note ?? ''}`;
    const group = byKey.get(key);
    if (group) group.push(l);
    else byKey.set(key, [l]);
  }

  const runs: LeaveRun[] = [];
  for (const group of byKey.values()) {
    const dates = group.map((g) => g.logDate).sort();
    let start = dates[0];
    let prev = dates[0];
    let count = 1;
    const flush = () => runs.push({
      from: start, to: prev, count,
      memberName: group[0].memberName, status: group[0].status, note: group[0].note,
    });
    for (const date of dates.slice(1)) {
      if (date === nextDay(prev)) {
        prev = date;
        count++;
      } else {
        flush();
        start = date;
        prev = date;
        count = 1;
      }
    }
    flush();
  }
  return runs.sort((a, b) => a.from.localeCompare(b.from)
    || a.memberName.localeCompare(b.memberName));
}

/** "12 – 14 Jul 2026" inside one month, spelled out in full across two. */
function fmtRange(from: string, to: string): string {
  if (from === to) return fmtDate(from);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  if (!sameMonth) return `${fmtDate(from)} – ${fmtDate(to)}`;
  const [, , d1] = from.split('-');
  return `${d1} – ${fmtDate(to)}`;
}

/** Every day somebody was marked off, with consecutive runs collapsed into
 *  a single row. Absent days are the exception, so this is the full record
 *  of them rather than a per-day calendar dump. */
function leavesSection(d: ContractStatementData): string {
  if (d.leaves.length === 0) return '';
  const rows = groupLeaveRuns(d.leaves).map((r) => `<tr>
    <td>${fmtRange(r.from, r.to)}${r.count > 1
      ? ` <span class="who-sub">(${r.count} days)</span>` : ''}</td>
    <td>${esc(r.memberName)}</td>
    <td>${r.status === 'half_day' ? 'Half day' : 'Leave'}</td>
    <td>${esc(r.note ?? '–')}</td>
  </tr>`).join('');
  return section('Leave and half days', `
    <table>
      <thead><tr><th>Date</th><th>Who</th><th>Marked</th><th>Note</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
}

function advancesSection(d: ContractStatementData): string {
  if (d.advances.length === 0) return '';
  const rows = d.advances.map((a) => `<tr class="${a.status === 'cancelled' ? 'void' : ''}">
    <td>${fmtDate(a.paidOn)}</td>
    <td>${esc(a.toName)}</td>
    <td>${esc(methodLabel(a.paymentMethod))}</td>
    <td>${esc(a.reference ?? '–')}</td>
    <td class="right">${inr(a.amount)}</td>
    <td>${esc(a.status)}</td>
  </tr>`).join('');
  return section('Advances paid', `
    <table>
      <thead><tr>
        <th>Date</th><th>To</th><th>Paid by</th><th>Reference</th>
        <th class="right">Amount</th><th>Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="4" class="tfoot-label">Total advanced</td>
        <td class="right grand">${inr(d.totals.advancesTotal)}</td><td></td>
      </tr></tfoot>
    </table>
    <div class="note">An advance is money owed back, not a wage. It is netted off at settlement.</div>`);
}

function settlementSection(d: ContractStatementData): string {
  const s = d.settlement;
  if (!s) {
    return section('Settlement', `<div class="note">
      Not settled yet. ${esc(inr(d.totals.outstanding))} outstanding as at ${esc(fmtDate(d.throughDate))}.
    </div>`);
  }
  // The ledger's "Less paid" is one number; the instalments behind it are
  // what the crew argues about, so they get their own labelled table with a
  // total that has to agree with it. Reversed payments are shown but not counted.
  const paidTotal = s.payments.filter((p) => !p.voided)
    .reduce((t, p) => t + p.amount, 0);
  const payRows = s.payments.map((p) => `<tr class="${p.voided ? 'void' : ''}">
    <td>${fmtDate(p.paymentDate)}</td>
    <td>${esc(methodLabel(p.paymentMethod))}</td>
    <td>${esc(p.reference ?? '–')}</td>
    <td class="right">${inr(p.amount)}${p.voided ? ' <span class="warn">(reversed)</span>' : ''}</td>
  </tr>`).join('');
  return section('Settlement', `
    <table class="ledger">
      <tbody>
        <tr><td>Earned</td><td class="right">${inr(s.earned)}</td></tr>
        ${s.advancesRecovered > 0 ? `<tr><td>Less advances recovered</td><td class="right">− ${inr(s.advancesRecovered)}</td></tr>` : ''}
        ${s.otherDeductions > 0 ? `<tr><td>Less other deductions</td><td class="right">− ${inr(s.otherDeductions)}</td></tr>` : ''}
        <tr class="rule"><td class="strong">Net payable</td><td class="right strong">${inr(s.netPayable)}</td></tr>
        ${s.amountPaid > 0 ? `<tr><td>Less paid</td><td class="right">− ${inr(s.amountPaid)}</td></tr>` : ''}
        <tr class="rule"><td class="strong">${s.amountDue > 0 ? 'Still to pay' : 'Fully disbursed'}</td>
            <td class="right grand">${inr(s.amountDue)}</td></tr>
      </tbody>
    </table>
    <div class="note">${esc(s.number)} · settled to ${esc(fmtDate(s.toDate))} · ${esc(s.status)}</div>
    ${s.payments.length ? `<div class="sub-title">${
      s.payments.length === 1 ? 'Payment made' : `Payments made · ${s.payments.length} instalments`
    }</div>
    <table class="pay-table">
      <thead><tr><th>Paid on</th><th>Paid by</th><th>Reference</th><th class="right">Amount</th></tr></thead>
      <tbody>${payRows}</tbody>
      <tfoot><tr>
        <td colspan="3" class="tfoot-label">Total paid</td>
        <td class="right grand">${inr(paidTotal)}</td>
      </tr></tfoot>
    </table>` : ''}`);
}

export function renderContractStatementHTML(d: ContractStatementData): string {
  const c = d.contract;
  const isTask = c.contractType === 'task_lumpsum';
  const term = `${fmtDate(c.startDate)} – ${c.endDate ? fmtDate(c.endDate) : 'ongoing'}`;
  const gen = new Date(d.generatedAt);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>${STYLE}</head><body><div class="page">
    <div class="header">
      <div>
        <div class="brand">${esc(d.tenantName)}</div>
        <div class="sub">Labour Contract Statement</div>
      </div>
      <div class="meta">
        ${metaRow('Contract', c.number)}
        ${metaRow('Lead person', c.leadPersonPhone ? `${c.leadPersonName} · ${c.leadPersonPhone}` : c.leadPersonName)}
        ${metaRow('Type', typeLabel(c.contractType))}
        ${metaRow('Status', c.status)}
      </div>
    </div>
    <div class="job">
      <div class="job-name">${esc(c.name)}</div>
      <div class="job-term">${esc(term)} &nbsp;·&nbsp; counted to ${esc(fmtDate(d.throughDate))}</div>
    </div>
    <div class="cards">
      ${isTask
        ? summaryCard('Agreed amount', inr(c.fixedAmount ?? 0))
        : summaryCard(d.members.length > 1 ? 'Crew-days worked' : 'Days worked', days(d.totals.daysWorked))}
      ${summaryCard('Earned', inr(d.totals.earned))}
      ${summaryCard('Advances', inr(d.totals.advancesTotal))}
      ${summaryCard(d.settlement ? 'Still to pay' : 'Outstanding',
        inr(d.settlement ? d.settlement.amountDue : d.totals.outstanding))}
    </div>
    ${crewSection(d)}
    ${pausesSection(d)}
    ${leavesSection(d)}
    ${advancesSection(d)}
    ${settlementSection(d)}
    ${c.notes?.trim() ? section('Notes', `<div class="note">${esc(c.notes.trim())}</div>`) : ''}
    <div class="footer">Generated ${fmtDate(gen.toISOString().slice(0, 10))} · Powered by runq</div>
  </div></body></html>`;
}

/** One ASCII-safe filename part; job names are often not Latin script. */
function slug(value: string | null | undefined, fallback = ''): string {
  const out = (value ?? '')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return out || fallback;
}

/** Canonical download name, derived server-side so both clients agree. */
export function contractStatementFilename(d: ContractStatementData): string {
  return `${[slug(d.contract.number), slug(d.contract.name, 'contract')].join('_')}.pdf`;
}

const STYLE = `<style>
  @page { size: A4; margin: 14mm; }
  /* This is a printed document, not a themed UI. Without pinning the scheme
     and painting an explicit background, a viewer whose OS is in dark mode
     gets the ?format=html preview as near-black text on a near-black page. */
  :root { color-scheme: only light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 12px; color: #14150F; background: #FFFFFF; }
  .page { width: 100%; max-width: 182mm; margin: 0 auto; background: #FFFFFF; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px;
    padding-bottom: 14px; margin-bottom: 12px; border-bottom: 2px solid #0F6E6E; }
  .brand { font-size: 22px; font-weight: 700; color: #0F6E6E; letter-spacing: -0.2px; }
  .sub { font-size: 11px; color: #5B635C; letter-spacing: 2px; text-transform: uppercase; margin-top: 2px; }
  .meta { font-size: 11px; border: 1px solid #E9E7DF; border-radius: 6px; padding: 8px 12px; background: #FBFAF6; min-width: 240px; }
  .meta-row { display: flex; justify-content: space-between; gap: 16px; padding: 2px 0; }
  .meta-row + .meta-row { border-top: 1px dashed #E9E7DF; }
  .meta-k { color: #5B635C; }
  .meta-v { color: #14150F; font-weight: 600; }
  .job { margin-bottom: 12px; }
  .job-name { font-size: 15px; font-weight: 700; }
  .job-term { font-size: 11px; color: #5B635C; margin-top: 2px; }
  .cards { display: flex; gap: 8px; margin-bottom: 16px; }
  .card { flex: 1; border: 1px solid #E9E7DF; border-radius: 8px; padding: 8px 10px; background: #FFFFFF; }
  .card-v { font-size: 15px; font-weight: 700; color: #14150F; font-variant-numeric: tabular-nums; }
  .card-l { font-size: 10px; color: #5B635C; margin-top: 2px; }
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #5B635C;
    margin: 16px 0 6px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead th { background: #0F6E6E; color: #fff; font-weight: 600; padding: 7px 8px; text-align: left; }
  thead th.right { text-align: right; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #EFEDE6; color: #14150F;
    font-variant-numeric: tabular-nums; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #FBFAF6; }
  .right { text-align: right; }
  .strong { font-weight: 700; }
  /* Not ".sub" — that is the header's uppercase, letter-spaced document
     subtitle, and reusing the name put crew roles in the same shouty style. */
  .who-sub { font-size: 10px; color: #5B635C; }
  .warn { color: #B45309; }
  .void td { color: #9aa29a; text-decoration: line-through; }
  .empty { text-align: center; color: #5B635C; padding: 20px; }
  .note { font-size: 10px; color: #5B635C; margin-top: 6px; }
  /* Print repeats a real <tfoot> on every page, which would read as a
     per-page subtotal. table-row-group makes it an ordinary trailing row. */
  tfoot { display: table-row-group; }
  tfoot td { padding: 8px; border-top: 2px solid #0F6E6E; font-weight: 700; }
  .tfoot-label { color: #5B635C; }
  .grand { color: #0F6E6E; font-size: 13px; }
  table.ledger { max-width: 320px; margin-left: auto; }
  table.ledger td { border-bottom: none; padding: 4px 8px; }
  table.ledger tr:nth-child(even) td { background: transparent; }
  table.ledger tr.rule td { border-top: 1px solid #E9E7DF; padding-top: 6px; }
  /* Splitting the instalments over a page break repeats the header and
     strands the total, which is exactly the reading it must not invite. */
  table.pay-table { margin-top: 4px; break-inside: avoid; }
  .sub-title { margin-top: 12px; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.8px; color: #5B635C; }
  .footer { margin-top: 20px; font-size: 10px; color: #9aa29a; text-align: center; }
</style>`;
