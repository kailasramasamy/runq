import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type { MonthlyPnl, MonthlyPnlRow, MonthlyPnlSection } from '@runq/types';

type SectionKey = MonthlyPnlSection['key'];

export interface LineDef {
  key: string;
  label: string;
  section: SectionKey;
  type: 'revenue' | 'expense';
  match: (code: string) => boolean;
}

const oneOf = (...codes: string[]) => (c: string) => codes.includes(c);

/**
 * First match wins, so the catch-alls go last. Lines follow how the owner
 * reads the business (milk, transport, payroll…) rather than the CoA.
 */
export const LINES: LineDef[] = [
  { key: 'sales', label: 'Sales', section: 'revenue', type: 'revenue',
    match: (c) => (c.startsWith('40') || c.startsWith('41')) && c !== '4006' && c !== '4010' },
  { key: 'farmerSales', label: 'Sales to farmers', section: 'revenue', type: 'revenue', match: oneOf('4006') },
  { key: 'otherIncome', label: 'Other income & capital gains', section: 'nonOperating', type: 'revenue', match: () => true },
  { key: 'milk', label: 'Milk purchases', section: 'milk', type: 'expense', match: oneOf('5050', '5070') },
  { key: 'vmccCommission', label: 'VMCC commission & handling', section: 'milk', type: 'expense', match: oneOf('5060') },
  { key: 'rawMaterials', label: 'Raw materials & packing', section: 'expenses', type: 'expense',
    match: (c) => /^500[1-6]$/.test(c) || c.startsWith('51') },
  { key: 'transport', label: 'Transport', section: 'expenses', type: 'expense', match: (c) => c.startsWith('57') },
  { key: 'payroll', label: 'Payroll & labour', section: 'expenses', type: 'expense', match: (c) => c.startsWith('52') },
  { key: 'rentUtilities', label: 'Rent, electricity & internet', section: 'expenses', type: 'expense',
    match: oneOf('5301', '5302', '5303') },
  { key: 'vehicle', label: 'Vehicle running & fuel', section: 'expenses', type: 'expense', match: oneOf('5308', '5313') },
  { key: 'repairs', label: 'Repairs & maintenance', section: 'expenses', type: 'expense', match: oneOf('5305') },
  { key: 'professional', label: 'Software & professional fees', section: 'expenses', type: 'expense',
    match: (c) => c.startsWith('54') },
  { key: 'otherExpenses', label: 'Other expenses', section: 'expenses', type: 'expense', match: () => true },
];

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'milk', label: 'Milk' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'nonOperating', label: 'Non-operating' },
];

/** Expense entries the owner marked as profit taken out (pnl_profit_marks).
 * They leave their expense line and are shown under net profit instead. */
export const PROFIT_BOOKED = { key: 'profitBookedAsExpense', label: 'Booked as expense' };

/** Stock relief / adjustments. Purchases are already expensed when bought, so
 * counting these too would charge the same goods twice. */
export const STOCK_CODES = new Set(['5100', '5104', '5105', '4207']);

interface GlRow { month: string; code: string; type: 'revenue' | 'expense'; marked: boolean; dr: string; cr: string }
interface MilkRow { month: string; milk: string | null; commission: string | null }

export class MonthlyPnlService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async get(dateFrom: string, dateTo: string): Promise<MonthlyPnl> {
    const months = monthsBetween(dateFrom, dateTo);
    const [gl, pours, bills, billedThrough] = await Promise.all([
      this.glByMonth(dateFrom, dateTo),
      this.poursByMonth(dateFrom, dateTo),
      this.billsByMonth(dateFrom, dateTo),
      this.billedThrough(),
    ]);

    const grid = new Grid(months);
    for (const r of gl) {
      const amount = r.type === 'revenue' ? num(r.cr) - num(r.dr) : num(r.dr) - num(r.cr);
      if (r.marked) {
        grid.add(PROFIT_BOOKED.key, r.month, amount);
        continue;
      }
      if (STOCK_CODES.has(r.code)) {
        grid.add('excludedStock', r.month, r.type === 'revenue' ? -amount : amount);
        continue;
      }
      const def = LINES.find((l) => l.type === r.type && l.match(r.code))!;
      grid.add(def.key, r.month, amount);
    }
    for (const r of [...pours, ...bills]) {
      grid.add('milk', r.month, num(r.milk));
      grid.add('vmccCommission', r.month, num(r.commission));
    }
    return assemble(dateFrom, dateTo, grid, provisional(months, billedThrough));
  }

  /** GL by month and account. MP's own milk postings are dropped — milk is
   * costed by pour date from the MP tables instead. */
  private async glByMonth(from: string, to: string): Promise<GlRow[]> {
    return rowsOf<GlRow>(await this.db.execute(sql`
      SELECT to_char(j.date, 'YYYY-MM') AS month, a.code, a.type,
             EXISTS (SELECT 1 FROM pnl_profit_marks m
                     WHERE m.journal_entry_id = j.id AND m.account_id = a.id) AS marked,
             SUM(l.debit) AS dr, SUM(l.credit) AS cr
      FROM journal_lines l
      JOIN journal_entries j ON j.id = l.journal_entry_id
      JOIN accounts a ON a.id = l.account_id
      WHERE j.tenant_id = ${this.tenantId} AND j.status = 'posted'
        AND j.date BETWEEN ${from} AND ${to}
        AND a.type IN ('revenue', 'expense')
        AND NOT (left(j.source_type, 3) = 'mp_' AND a.code IN ('5050', '5060', '5070'))
      GROUP BY 1, 2, 3, 4
    `));
  }

  /** Farmer milk at its pour value, on the day it was poured. */
  private async poursByMonth(from: string, to: string): Promise<MilkRow[]> {
    return rowsOf<MilkRow>(await this.db.execute(sql`
      SELECT to_char(collection_date, 'YYYY-MM') AS month, SUM(line_amount) AS milk, 0 AS commission
      FROM mp_pours
      WHERE tenant_id = ${this.tenantId} AND status = 'recorded'
        AND collection_date BETWEEN ${from} AND ${to}
      GROUP BY 1
    `));
  }

  /**
   * Bulk VMCC milk and VMCC comp, in the month of the billing cycle (cycles
   * are half-months, so they never straddle a month). A VMCC whose farmers
   * pour with us is already counted in pours, so only its comp is taken.
   */
  private async billsByMonth(from: string, to: string): Promise<MilkRow[]> {
    return rowsOf<MilkRow>(await this.db.execute(sql`
      SELECT to_char(c.period_start, 'YYYY-MM') AS month,
             SUM(b.milk_cost) FILTER (WHERE NOT EXISTS (
               SELECT 1 FROM mp_pours p WHERE p.node_id = b.vmcc_node_id AND p.status = 'recorded'
                 AND p.collection_date BETWEEN c.period_start AND c.period_end)) AS milk,
             SUM(b.commission + b.salary + b.rent) AS commission
      FROM mp_vmcc_bills b JOIN mp_payout_cycles c ON c.id = b.payout_cycle_id
      WHERE b.tenant_id = ${this.tenantId} AND b.status <> 'reversed'
        AND c.period_start BETWEEN ${from} AND ${to}
      GROUP BY 1
    `));
  }

  /** Last day covered by a VMCC bill; null when the tenant has none. */
  private async billedThrough(): Promise<string | null> {
    const [row] = rowsOf<{ through: string | null }>(await this.db.execute(sql`
      SELECT MAX(c.period_end)::text AS through
      FROM mp_vmcc_bills b JOIN mp_payout_cycles c ON c.id = b.payout_cycle_id
      WHERE b.tenant_id = ${this.tenantId} AND b.status <> 'reversed'
    `));
    return row?.through ?? null;
  }
}

class Grid {
  private readonly cells = new Map<string, number[]>();
  constructor(readonly months: string[]) {}

  add(key: string, month: string, amount: number): void {
    const i = this.months.indexOf(month);
    if (i < 0 || amount === 0) return;
    const row = this.cells.get(key) ?? this.months.map(() => 0);
    row[i]! += amount;
    this.cells.set(key, row);
  }

  row(key: string, label: string): MonthlyPnlRow {
    return toRow(key, label, this.cells.get(key) ?? this.months.map(() => 0));
  }
}

function assemble(from: string, to: string, grid: Grid, provisionalMonths: string[]): MonthlyPnl {
  const sections = SECTIONS.map(({ key, label }) => {
    const lines = LINES.filter((l) => l.section === key)
      .map((l) => grid.row(l.key, l.label))
      .filter((r) => r.values.some((v) => v !== 0));
    return { key, label, lines, totals: toRow(key, `Total ${label.toLowerCase()}`, sumRows(grid.months, lines)) };
  });
  const total = (k: SectionKey) => sections.find((s) => s.key === k)!.totals.values;
  const operating = grid.months.map((_, i) =>
    total('revenue')[i]! - total('milk')[i]! - total('expenses')[i]!);
  const net = operating.map((v, i) => v + total('nonOperating')[i]!);
  const booked = grid.row(PROFIT_BOOKED.key, PROFIT_BOOKED.label);
  return {
    period: { from, to },
    months: grid.months,
    sections,
    operatingProfit: toRow('operatingProfit', 'Operating profit', operating),
    netProfit: toRow('netProfit', 'Net profit', net),
    profitBookedAsExpense: booked,
    profitRetained: toRow('profitRetained', 'Retained (as in official books)', net.map((v, i) => v - booked.values[i]!)),
    excludedStock: grid.row('excludedStock', 'Stock movements (not counted)'),
    provisionalMonths,
  };
}

/** Months ending after the last billed VMCC cycle are missing bulk milk. */
function provisional(months: string[], billedThrough: string | null): string[] {
  if (!billedThrough) return [];
  return months.filter((m) => lastDayOf(m) > billedThrough);
}

function sumRows(months: string[], rows: MonthlyPnlRow[]): number[] {
  return months.map((_, i) => rows.reduce((s, r) => s + r.values[i]!, 0));
}

function toRow(key: string, label: string, values: number[]): MonthlyPnlRow {
  const rounded = values.map(round2);
  return { key, label, values: rounded, total: round2(values.reduce((s, v) => s + v, 0)) };
}

export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number) as [number, number];
  const end = to.slice(0, 7);
  for (let key = fmtMonth(y, m); key <= end; key = fmtMonth(y, m)) {
    months.push(key);
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
  }
  return months;
}

function fmtMonth(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`;
}

function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

function num(v: string | null | undefined): number {
  return v ? parseFloat(v) : 0;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** `db.execute` hands back the driver's result object, not a bare array. */
export function rowsOf<T>(res: unknown): T[] {
  return (res as { rows?: T[] }).rows ?? [];
}
