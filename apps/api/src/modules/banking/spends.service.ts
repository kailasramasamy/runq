/**
 * "Where did the money go" — one ledger of every rupee that left, across
 * every bank account.
 *
 * Two sources, deliberately only two:
 *  - every bank debit, reconciled or not, because the statement is the
 *    ground truth for money that has actually moved;
 *  - pending payments still awaiting a bank match, because a UPI transfer
 *    made this morning is real spend even though the statement lands
 *    tomorrow.
 *
 * AP vendor payments are NOT a third source. They are created *by*
 * reconciliation (see AutoBillPayService), so every one of them already has
 * its bank debit in the first source — adding them would double count, and
 * `payments` carries no bank_transaction_id to dedupe against.
 */

import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';

export interface SpendRow {
  id: string;
  /** 'bank' = on the statement; 'pending' = captured, not yet matched. */
  source: 'bank' | 'pending';
  date: string;
  amount: number;
  /** Who it went to — vendor, payee, or the bank's own narration. */
  title: string;
  /** GL category when known, else the memo/note. */
  category: string | null;
  accountName: string;
  reference: string | null;
  reconciled: boolean;
}

export interface SpendsResult {
  data: SpendRow[];
  meta: PaginationMeta;
  totals: { settled: number; awaiting: number; total: number };
}

export interface SpendsFilter {
  page: number;
  limit: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

interface RawRow {
  id: string;
  source: 'bank' | 'pending';
  date: string;
  amount: string;
  title: string;
  category: string | null;
  account_name: string;
  reference: string | null;
  reconciled: boolean;
}

export class SpendsService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list(filters: SpendsFilter): Promise<SpendsResult> {
    const { offset } = applyPagination(filters.page, filters.limit);
    const base = this.unionSql(filters);

    const [rows, agg] = await Promise.all([
      this.db.execute(sql`
        ${base}
        SELECT * FROM spends
        ORDER BY date DESC, seq DESC NULLS LAST, created_at DESC
        LIMIT ${filters.limit} OFFSET ${offset}
      `),
      this.db.execute(sql`
        ${base}
        SELECT
          COUNT(*)::int AS cnt,
          COALESCE(SUM(amount) FILTER (WHERE source = 'bank'), 0) AS settled,
          COALESCE(SUM(amount) FILTER (WHERE source = 'pending'), 0) AS awaiting
        FROM spends
      `),
    ]);

    const a = rowsOf<{ cnt: number; settled: string; awaiting: string }>(agg)[0];
    const total = a?.cnt ?? 0;
    const settled = parseFloat(a?.settled ?? '0');
    const awaiting = parseFloat(a?.awaiting ?? '0');

    return {
      data: rowsOf<RawRow>(rows).map(toSpend),
      meta: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: calcTotalPages(total, filters.limit),
      },
      totals: { settled, awaiting, total: settled + awaiting },
    };
  }

  /**
   * The union both queries run over. `seq`/`created_at` ride along so
   * same-day rows keep the statement order the rest of the app sorts by,
   * with captures (no seq) falling to the end of their day.
   */
  private unionSql(f: SpendsFilter) {
    const from = f.dateFrom ? sql`AND bt.transaction_date >= ${f.dateFrom}` : sql``;
    const to = f.dateTo ? sql`AND bt.transaction_date <= ${f.dateTo}` : sql``;
    const pFrom = f.dateFrom ? sql`AND pp.payment_date >= ${f.dateFrom}` : sql``;
    const pTo = f.dateTo ? sql`AND pp.payment_date <= ${f.dateTo}` : sql``;
    const term = f.search?.trim() ? `%${f.search.trim()}%` : null;
    const bankSearch = term
      ? sql`AND (bt.narration ILIKE ${term} OR bt.memo ILIKE ${term}
             OR bt.reference ILIKE ${term} OR v.name ILIKE ${term} OR ga.name ILIKE ${term})`
      : sql``;
    const pendSearch = term
      ? sql`AND (pp.payee_name ILIKE ${term} OR pp.note ILIKE ${term}
             OR pp.upi_ref ILIKE ${term} OR pa.name ILIKE ${term})`
      : sql``;

    return sql`
      WITH spends AS (
        SELECT
          bt.id::text AS id,
          'bank' AS source,
          bt.transaction_date AS date,
          bt.amount::numeric AS amount,
          COALESCE(NULLIF(v.name, ''), NULLIF(bt.memo, ''), NULLIF(bt.narration, ''), 'Bank debit') AS title,
          COALESCE(ga.name, NULLIF(bt.narration, '')) AS category,
          ba.name AS account_name,
          bt.reference AS reference,
          bt.recon_status <> 'unreconciled' AS reconciled,
          bt.statement_seq AS seq,
          bt.created_at AS created_at
        FROM bank_transactions bt
        JOIN bank_accounts ba ON ba.id = bt.bank_account_id
        LEFT JOIN vendors v ON v.id = bt.vendor_id
        LEFT JOIN accounts ga ON ga.id = bt.gl_account_id
        WHERE bt.tenant_id = ${this.tenantId} AND bt.type = 'debit'
        ${from} ${to} ${bankSearch}

        UNION ALL

        SELECT
          pp.id::text AS id,
          'pending' AS source,
          pp.payment_date AS date,
          pp.amount::numeric AS amount,
          COALESCE(NULLIF(pp.payee_name, ''), 'Payment') AS title,
          COALESCE(pa.name, NULLIF(pp.note, '')) AS category,
          ba.name AS account_name,
          pp.upi_ref AS reference,
          false AS reconciled,
          NULL::int AS seq,
          pp.created_at AS created_at
        FROM pending_payments pp
        JOIN bank_accounts ba ON ba.id = pp.bank_account_id
        LEFT JOIN accounts pa ON pa.id = pp.gl_account_id
        WHERE pp.tenant_id = ${this.tenantId} AND pp.status = 'pending'
        ${pFrom} ${pTo} ${pendSearch}
      )
    `;
  }
}

/** `db.execute` hands back the driver's result object, not a bare array. */
function rowsOf<T>(res: unknown): T[] {
  return (res as { rows?: T[] }).rows ?? [];
}

function toSpend(r: RawRow): SpendRow {
  return {
    id: r.id,
    source: r.source,
    date: r.date,
    amount: parseFloat(r.amount),
    title: r.title,
    category: r.category,
    accountName: r.account_name,
    reference: r.reference,
    reconciled: r.reconciled,
  };
}
