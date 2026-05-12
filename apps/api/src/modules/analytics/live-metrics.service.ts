import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type Redis from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import { getOrCompute } from './cache';
import { timed } from './timing';

const TTL = {
  cash: 300,
  outstanding: 600,
  salesMtd: 900,
  billsDueWeek: 300,
  cashForecast: 600,
} as const;

const OPEN_AR_STATUSES = ['sent', 'partially_paid', 'overdue'] as const;
const OPEN_AP_STATUSES = ['pending_match', 'matched', 'approved', 'partially_paid'] as const;

type Logger = Pick<FastifyBaseLogger, 'warn'>;

interface Row { [key: string]: unknown }
function rowsOf<T = Row>(res: unknown): T[] {
  return ((res as { rows?: T[] }).rows) ?? [];
}
function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export interface CashPositionResult {
  total: number;
  byAccount: Array<{ accountId: string; accountName: string; balance: number; asOf: string | null }>;
  asOf: string;
}

export interface OutstandingResult {
  total: number;
  invoiceCount: number;
}

export interface SalesMtdResult {
  amount: number;
  count: number;
  prevAmount: number;
  prevCount: number;
  monthStart: string;
}

export interface BillsDueWeekItem {
  id: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  dueDate: string;
  balanceDue: number;
}
export interface BillsDueWeekResult {
  items: BillsDueWeekItem[];
  totalAmount: number;
}

export interface CashForecastWindow {
  inflow: number;    // expected AR receipts in window
  outflow: number;   // expected AP payments in window
  net: number;       // inflow − outflow (signed)
  receivableCount: number;
  payableCount: number;
}
export interface CashForecastResult {
  asOf: string;
  cashOnHand: number;
  next7d: CashForecastWindow;
  next30d: CashForecastWindow;
  projectedAt7d: number;     // cashOnHand + net7d
  projectedAt30d: number;    // cashOnHand + net30d
}

export class LiveMetricsService {
  constructor(
    private db: Db,
    private redis: Redis,
    private tenantId: string,
    private logger: Logger,
  ) {}

  cashPosition(): Promise<CashPositionResult> {
    return getOrCompute(this.redis, { tenantId: this.tenantId, metricKey: 'cash_position', ttlSec: TTL.cash }, () =>
      timed(this.logger, 'cash_position', async () => {
        const res = await this.db.execute(sql`
          SELECT ba.id AS account_id, ba.name AS account_name, ba.current_balance, latest.transaction_date
          FROM bank_accounts ba
          LEFT JOIN LATERAL (
            SELECT bt.transaction_date
            FROM bank_transactions bt
            WHERE bt.tenant_id = ${this.tenantId} AND bt.bank_account_id = ba.id
            ORDER BY bt.transaction_date DESC, bt.created_at DESC NULLS LAST
            LIMIT 1
          ) latest ON TRUE
          WHERE ba.tenant_id = ${this.tenantId} AND ba.is_active = TRUE
          ORDER BY ba.name
        `);
        const rows = rowsOf<{ account_id: string; account_name: string; current_balance: unknown; transaction_date: string | null }>(res);
        const byAccount = rows.map((r) => ({
          accountId: r.account_id,
          accountName: r.account_name,
          balance: num(r.current_balance),
          asOf: r.transaction_date,
        }));
        const total = byAccount.reduce((s, a) => s + a.balance, 0);
        return { total, byAccount, asOf: new Date().toISOString() };
      }),
    );
  }

  arOutstanding(): Promise<OutstandingResult> {
    return getOrCompute(this.redis, { tenantId: this.tenantId, metricKey: 'ar_outstanding_total', ttlSec: TTL.outstanding }, () =>
      timed(this.logger, 'ar_outstanding_total', async () => {
        const res = await this.db.execute(sql`
          SELECT COALESCE(SUM(balance_due), 0) AS total, COUNT(*)::int AS cnt
          FROM sales_invoices
          WHERE tenant_id = ${this.tenantId}
            AND balance_due > 0
            AND status IN ${sql.raw(`('${OPEN_AR_STATUSES.join("','")}')`)}
        `);
        const r = rowsOf<{ total: unknown; cnt: number }>(res)[0];
        return { total: num(r?.total), invoiceCount: r?.cnt ?? 0 };
      }),
    );
  }

  apOutstanding(): Promise<OutstandingResult> {
    return getOrCompute(this.redis, { tenantId: this.tenantId, metricKey: 'ap_outstanding_total', ttlSec: TTL.outstanding }, () =>
      timed(this.logger, 'ap_outstanding_total', async () => {
        const res = await this.db.execute(sql`
          SELECT COALESCE(SUM(balance_due), 0) AS total, COUNT(*)::int AS cnt
          FROM purchase_invoices
          WHERE tenant_id = ${this.tenantId}
            AND balance_due > 0
            AND status IN ${sql.raw(`('${OPEN_AP_STATUSES.join("','")}')`)}
        `);
        const r = rowsOf<{ total: unknown; cnt: number }>(res)[0];
        return { total: num(r?.total), invoiceCount: r?.cnt ?? 0 };
      }),
    );
  }

  salesMtd(): Promise<SalesMtdResult> {
    return getOrCompute(this.redis, { tenantId: this.tenantId, metricKey: 'sales_mtd', ttlSec: TTL.salesMtd }, () =>
      timed(this.logger, 'sales_mtd', async () => {
        const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        const monthIso = monthStart.toISOString().slice(0, 10);
        const prevMonthIso = prevMonthStart.toISOString().slice(0, 10);
        const res = await this.db.execute(sql`
          SELECT
            COALESCE(SUM(CASE WHEN invoice_date >= ${monthIso} THEN total_amount END), 0) AS cur_amt,
            COUNT(*)  FILTER (WHERE invoice_date >= ${monthIso}) AS cur_cnt,
            COALESCE(SUM(CASE WHEN invoice_date >= ${prevMonthIso} AND invoice_date < ${monthIso} THEN total_amount END), 0) AS prev_amt,
            COUNT(*)  FILTER (WHERE invoice_date >= ${prevMonthIso} AND invoice_date < ${monthIso}) AS prev_cnt
          FROM sales_invoices
          WHERE tenant_id = ${this.tenantId}
            AND invoice_date >= ${prevMonthIso}
            AND status NOT IN ('draft', 'cancelled')
        `);
        const r = rowsOf<{ cur_amt: unknown; cur_cnt: number | string; prev_amt: unknown; prev_cnt: number | string }>(res)[0];
        return {
          amount: num(r?.cur_amt),
          count: num(r?.cur_cnt),
          prevAmount: num(r?.prev_amt),
          prevCount: num(r?.prev_cnt),
          monthStart: monthIso,
        };
      }),
    );
  }

  cashForecast(): Promise<CashForecastResult> {
    return getOrCompute(this.redis, { tenantId: this.tenantId, metricKey: 'cash_forecast', ttlSec: TTL.cashForecast }, () =>
      timed(this.logger, 'cash_forecast', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const win7 = new Date(Date.now() + 7  * 86400_000).toISOString().slice(0, 10);
        const win30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

        // One round-trip for everything we need: cash on hand + AR + AP windows
        const cashRes = await this.db.execute(sql`
          SELECT COALESCE(SUM(current_balance), 0) AS cash
          FROM bank_accounts
          WHERE tenant_id = ${this.tenantId} AND is_active = TRUE
        `);
        const cashOnHand = num((cashRes as unknown as { rows: Array<{ cash: unknown }> }).rows[0]?.cash);

        const arRes = await this.db.execute(sql`
          SELECT
            COALESCE(SUM(CASE WHEN due_date <= ${win7}  THEN balance_due END), 0) AS in_7,
            COALESCE(SUM(CASE WHEN due_date <= ${win30} THEN balance_due END), 0) AS in_30,
            COUNT(*) FILTER (WHERE due_date <= ${win7})::int AS n_7,
            COUNT(*) FILTER (WHERE due_date <= ${win30})::int AS n_30
          FROM sales_invoices
          WHERE tenant_id = ${this.tenantId}
            AND balance_due > 0
            AND status IN ${sql.raw(`('${OPEN_AR_STATUSES.join("','")}')`)}
            AND due_date <= ${win30}
        `);
        const ar = (arRes as unknown as { rows: Array<{ in_7: unknown; in_30: unknown; n_7: number; n_30: number }> }).rows[0];

        const apRes = await this.db.execute(sql`
          SELECT
            COALESCE(SUM(CASE WHEN due_date <= ${win7}  THEN balance_due END), 0) AS out_7,
            COALESCE(SUM(CASE WHEN due_date <= ${win30} THEN balance_due END), 0) AS out_30,
            COUNT(*) FILTER (WHERE due_date <= ${win7})::int AS n_7,
            COUNT(*) FILTER (WHERE due_date <= ${win30})::int AS n_30
          FROM purchase_invoices
          WHERE tenant_id = ${this.tenantId}
            AND balance_due > 0
            AND status IN ${sql.raw(`('${OPEN_AP_STATUSES.join("','")}')`)}
            AND due_date <= ${win30}
        `);
        const ap = (apRes as unknown as { rows: Array<{ out_7: unknown; out_30: unknown; n_7: number; n_30: number }> }).rows[0];

        const in7 = num(ar?.in_7),   in30 = num(ar?.in_30);
        const out7 = num(ap?.out_7), out30 = num(ap?.out_30);
        const net7  = Math.round((in7  - out7)  * 100) / 100;
        const net30 = Math.round((in30 - out30) * 100) / 100;

        return {
          asOf: today,
          cashOnHand,
          next7d:  { inflow: in7,  outflow: out7,  net: net7,  receivableCount: ar?.n_7 ?? 0,  payableCount: ap?.n_7 ?? 0  },
          next30d: { inflow: in30, outflow: out30, net: net30, receivableCount: ar?.n_30 ?? 0, payableCount: ap?.n_30 ?? 0 },
          projectedAt7d:  Math.round((cashOnHand + net7)  * 100) / 100,
          projectedAt30d: Math.round((cashOnHand + net30) * 100) / 100,
        };
      }),
    );
  }

  billsDueThisWeek(): Promise<BillsDueWeekResult> {
    return getOrCompute(this.redis, { tenantId: this.tenantId, metricKey: 'bills_due_this_week', ttlSec: TTL.billsDueWeek }, () =>
      timed(this.logger, 'bills_due_this_week', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const weekEnd = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
        const res = await this.db.execute(sql`
          SELECT pi.id, pi.invoice_number, pi.vendor_id, v.name AS vendor_name, pi.due_date, pi.balance_due
          FROM purchase_invoices pi
          JOIN vendors v ON v.id = pi.vendor_id
          WHERE pi.tenant_id = ${this.tenantId}
            AND pi.balance_due > 0
            AND pi.due_date BETWEEN ${today} AND ${weekEnd}
            AND pi.status IN ${sql.raw(`('${OPEN_AP_STATUSES.join("','")}')`)}
          ORDER BY pi.due_date ASC
          LIMIT 100
        `);
        const rows = rowsOf<{ id: string; invoice_number: string; vendor_id: string; vendor_name: string; due_date: string; balance_due: unknown }>(res);
        const items = rows.map((r) => ({
          id: r.id,
          invoiceNumber: r.invoice_number,
          vendorId: r.vendor_id,
          vendorName: r.vendor_name,
          dueDate: r.due_date,
          balanceDue: num(r.balance_due),
        }));
        const totalAmount = items.reduce((s, i) => s + i.balanceDue, 0);
        return { items, totalAmount };
      }),
    );
  }
}
