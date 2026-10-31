import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type { MonthlyPnlEntry, MonthlyPnlLineDetail } from '@runq/types';
import { LINES, STOCK_CODES, PROFIT_BOOKED, rowsOf, type LineDef } from './monthly-pnl.service';

const STOCK_LINE = { key: 'excludedStock', label: 'Stock movements (not counted)' };

const SOURCE_LABELS: Record<string, string> = {
  bank_debit: 'Bank payment',
  bank_credit: 'Bank receipt',
  purchase_invoice: 'Bill',
  sales_invoice: 'Sales invoice',
  payroll_run: 'Payroll run',
  delivery_note: 'Delivery note',
};

function sourceLabel(sourceType: string): string {
  return SOURCE_LABELS[sourceType] ?? sourceType.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

interface GlEntryRow {
  journal_entry_id: string; account_id: string; marked: boolean;
  date: string; description: string | null; source_type: string; reference: string | null;
  party: string | null; narration: string | null;
  account: string; type: 'revenue' | 'expense'; dr: string; cr: string;
}

/** Field holding the beneficiary in each bank narration shape we see. */
const NARRATION_PAYEE: { prefix: string; index: number; sep?: string }[] = [
  { prefix: 'UPI/', index: 3 },       // UPI/<ref>/UPI Pay/<vpa>/…
  { prefix: 'MMT/IMPS/', index: 3 },  // MMT/IMPS/<ref>/<name>/<ifsc>
  { prefix: 'INF/NEFT/', index: 4 },  // INF/NEFT/<ref>/<bank>/<name>
  { prefix: 'INB/NEFT/', index: 3 },  // INB/NEFT/<ref>/<name>/<bank>
  { prefix: 'POS/', index: 1 },       // POS/<merchant>/<city>/…
  { prefix: 'NEFT-', index: 2, sep: '-' }, // NEFT-<ref>-<remitter> -<…>  (incoming)
];

/**
 * Best-effort payee for a bank line with no vendor attached — the UPI ID,
 * IMPS/NEFT beneficiary or card merchant the bank printed. A hint, not a record.
 */
export function payeeFromNarration(narration: string | null): string | null {
  if (!narration) return null;
  const shape = NARRATION_PAYEE.find((s) => narration.startsWith(s.prefix));
  const value = shape && narration.split(shape.sep ?? '/')[shape.index]?.trim();
  return value ? value : null;
}

/**
 * The entries behind one figure of the monthly P&L — the same selection
 * MonthlyPnlService sums, listed instead of totalled, so every cell can be
 * checked against its source documents.
 */
export class MonthlyPnlDetailService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  static isKnownLine(key: string): boolean {
    return key === STOCK_LINE.key || key === PROFIT_BOOKED.key || LINES.some((l) => l.key === key);
  }

  async get(key: string, dateFrom: string, dateTo: string): Promise<MonthlyPnlLineDetail> {
    const booked = key === PROFIT_BOOKED.key;
    const def = LINES.find((l) => l.key === key);
    const codes = booked ? await this.expenseCodes() : await this.codesFor(def);
    const entries = [
      ...(codes.length ? await this.glEntries(codes, dateFrom, dateTo, booked) : []),
      ...(key === 'milk' ? [...await this.pourEntries(dateFrom, dateTo), ...await this.billEntries('milk', dateFrom, dateTo)] : []),
      ...(key === 'vmccCommission' ? await this.billEntries('commission', dateFrom, dateTo) : []),
    ].filter((e) => e.amount !== 0)
      .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
    const total = Math.round(entries.reduce((s, e) => s + e.amount, 0) * 100) / 100;
    return {
      key, label: def?.label ?? (booked ? PROFIT_BOOKED.label : STOCK_LINE.label),
      partyLabel: def?.type === 'revenue' ? 'Received from' : 'Paid to',
      period: { from: dateFrom, to: dateTo }, total, entries,
    };
  }

  private async expenseCodes(): Promise<string[]> {
    return rowsOf<{ code: string }>(await this.db.execute(sql`
      SELECT code FROM accounts WHERE tenant_id = ${this.tenantId} AND type = 'expense'
    `)).map((a) => a.code);
  }

  /** Account codes that resolve to this line under the summary's first-match rule. */
  private async codesFor(def: LineDef | undefined): Promise<string[]> {
    const accounts = rowsOf<{ code: string; type: 'revenue' | 'expense' }>(await this.db.execute(sql`
      SELECT code, type FROM accounts
      WHERE tenant_id = ${this.tenantId} AND type IN ('revenue', 'expense')
    `));
    if (!def) return accounts.filter((a) => STOCK_CODES.has(a.code)).map((a) => a.code);
    return accounts
      .filter((a) => !STOCK_CODES.has(a.code))
      .filter((a) => LINES.find((l) => l.type === a.type && l.match(a.code))?.key === def.key)
      .map((a) => a.code);
  }

  /** Ledger entries on [codes]; [marked] picks the profit-marked ones, else the rest. */
  private async glEntries(codes: string[], from: string, to: string, marked: boolean): Promise<MonthlyPnlEntry[]> {
    const rows = rowsOf<GlEntryRow>(await this.db.execute(sql`
      SELECT j.id AS journal_entry_id, a.id AS account_id, pm.id IS NOT NULL AS marked,
             j.date::text AS date, j.description, j.source_type, a.code || ' ' || a.name AS account, a.type,
             MAX(COALESCE(si.invoice_number, pi.invoice_number)) AS reference,
             MAX(COALESCE(bv.name, bc.name, pv.name, sc.name, ff.name, cc.name, dc.name,
                          CASE WHEN j.source_type = 'payroll_run' THEN 'Employees (payroll run)' END)) AS party,
             MAX(bt.narration) AS narration,
             SUM(l.debit) AS dr, SUM(l.credit) AS cr
      FROM journal_lines l
      JOIN journal_entries j ON j.id = l.journal_entry_id
      JOIN accounts a ON a.id = l.account_id
      LEFT JOIN sales_invoices si ON j.source_type = 'sales_invoice' AND si.id = j.source_id
      LEFT JOIN customers sc ON sc.id = si.customer_id
      LEFT JOIN purchase_invoices pi ON j.source_type = 'purchase_invoice' AND pi.id = j.source_id
      LEFT JOIN vendors pv ON pv.id = pi.vendor_id
      LEFT JOIN bank_transactions bt ON j.source_type IN ('bank_debit', 'bank_credit') AND bt.id = j.source_id
      LEFT JOIN vendors bv ON bv.id = bt.vendor_id
      LEFT JOIN customers bc ON bc.id = bt.customer_id
      LEFT JOIN mp_farmer_sales fs ON left(j.source_type, 14) = 'mp_farmer_sale' AND fs.id = j.source_id
      LEFT JOIN mp_farmers ff ON ff.id = fs.farmer_id
      LEFT JOIN credit_notes cn ON j.source_type = 'credit_note' AND cn.id = j.source_id
      LEFT JOIN customers cc ON cc.id = cn.customer_id
      LEFT JOIN customer_debit_notes dn ON j.source_type = 'customer_debit_note' AND dn.id = j.source_id
      LEFT JOIN customers dc ON dc.id = dn.customer_id
      LEFT JOIN pnl_profit_marks pm ON pm.journal_entry_id = j.id AND pm.account_id = a.id
      WHERE j.tenant_id = ${this.tenantId} AND j.status = 'posted'
        AND j.date BETWEEN ${from} AND ${to}
        AND a.tenant_id = ${this.tenantId} AND a.code IN ${codes}
        AND NOT (left(j.source_type, 3) = 'mp_' AND a.code IN ('5050', '5060', '5070'))
        AND (pm.id IS NOT NULL) = ${marked}
      GROUP BY j.id, j.date, j.description, j.source_type, a.id, a.code, a.name, a.type, pm.id
    `));
    return rows.map((r) => {
      const dr = parseFloat(r.dr), cr = parseFloat(r.cr);
      const amount = r.type === 'revenue' ? cr - dr : dr - cr;
      const bankHint = r.party ? null : payeeFromNarration(r.narration);
      return {
        ref: { journalEntryId: r.journal_entry_id, accountId: r.account_id },
        markable: r.type === 'expense' && !STOCK_CODES.has(r.account.slice(0, 4)),
        date: r.date,
        description: [r.reference, r.description].filter(Boolean).join(' · ') || '—',
        party: r.party ?? bankHint,
        partyFromBank: !!bankHint,
        source: sourceLabel(r.source_type),
        account: r.account,
        amount: STOCK_CODES.has(r.account.slice(0, 4)) && r.type === 'revenue' ? -amount : amount,
      };
    });
  }

  /** Farmer pours, one row per farmer — the MP pour register has the per-day detail. */
  private async pourEntries(from: string, to: string): Promise<MonthlyPnlEntry[]> {
    const rows = rowsOf<{ date: string; farmer: string; node: string; litres: string; pours: string; amount: string }>(
      await this.db.execute(sql`
        SELECT MAX(p.collection_date)::text AS date, f.name AS farmer, n.name AS node,
               SUM(p.qty_litres) AS litres, COUNT(*) AS pours, SUM(p.line_amount) AS amount
        FROM mp_pours p JOIN mp_farmers f ON f.id = p.farmer_id JOIN mp_nodes n ON n.id = p.node_id
        WHERE p.tenant_id = ${this.tenantId} AND p.status = 'recorded'
          AND p.collection_date BETWEEN ${from} AND ${to}
        GROUP BY f.name, n.name
      `));
    return rows.map((r) => ({
      ref: null,
      markable: false,
      date: r.date,
      description: `${Math.round(parseFloat(r.litres))} L in ${r.pours} pours`,
      party: r.farmer,
      partyFromBank: false,
      source: `Pours · ${r.node}`,
      account: '5050 Milk Purchases',
      amount: parseFloat(r.amount),
    }));
  }

  /** VMCC bills by cycle; milk leg skipped where the VMCC's farmers pour with us (counted in pours). */
  private async billEntries(leg: 'milk' | 'commission', from: string, to: string): Promise<MonthlyPnlEntry[]> {
    const rows = rowsOf<{ date: string; bill_no: string; vmcc: string; payee: string | null; start: string; end: string; litres: string; amount: string | null }>(
      await this.db.execute(sql`
        SELECT c.period_end::text AS date, b.bill_no, n.name AS vmcc, v.name AS payee, c.period_start::text AS start,
               c.period_end::text AS "end", b.qty_litres AS litres,
               CASE WHEN ${leg}::text = 'commission' THEN b.commission + b.salary + b.rent
                    WHEN EXISTS (SELECT 1 FROM mp_pours p WHERE p.node_id = b.vmcc_node_id AND p.status = 'recorded'
                                   AND p.collection_date BETWEEN c.period_start AND c.period_end) THEN 0
                    ELSE b.milk_cost END AS amount
        FROM mp_vmcc_bills b
        JOIN mp_payout_cycles c ON c.id = b.payout_cycle_id
        JOIN mp_nodes n ON n.id = b.vmcc_node_id
        LEFT JOIN vendors v ON v.id = b.payee_vendor_id
        WHERE b.tenant_id = ${this.tenantId} AND b.status <> 'reversed'
          AND c.period_start BETWEEN ${from} AND ${to}
      `));
    return rows.map((r) => ({
      ref: null,
      markable: false,
      date: r.date,
      description: `${r.bill_no} · ${r.vmcc} · ${r.start.slice(5)} to ${r.end.slice(5)}`
        + (leg === 'milk' ? ` · ${Math.round(parseFloat(r.litres))} L` : ''),
      party: r.payee ?? r.vmcc,
      partyFromBank: false,
      source: 'VMCC bill',
      account: leg === 'milk' ? '5050 Milk Purchases' : '5060 VMCC Commission & Handling',
      amount: parseFloat(r.amount ?? '0'),
    }));
  }
}
