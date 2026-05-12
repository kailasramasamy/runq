import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type Redis from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import { getOrCompute } from './cache';
import { timed } from './timing';
import { ReportsService } from '../reports/reports.service';
import { CAPortalService } from '../ca-portal/ca-portal.service';

const TTL_REPORT_SUMMARY_SEC = 3600;
const TTL_UNRECONCILED_SEC   = 300;

export type PnlPeriod = 'fy' | 'qtr' | 'month';

export interface PnLSummary {
  periodKind: PnlPeriod;
  period: { from: string; to: string };
  totalRevenue: number;
  totalExpense: number;
  grossProfit: number;
  netProfit: number;
  prior: {
    period: { from: string; to: string };
    totalRevenue: number;
    totalExpense: number;
    netProfit: number;
  };
  /** netProfit delta vs prior, in percentage points. null when prior was 0. */
  netProfitDeltaPct: number | null;
}
export interface BsSummary {
  asOfDate: string;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanced: boolean;
}
export interface TbSummary {
  asOfDate: string;
  accountCount: number;
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}
export interface UnreconciledBankTxns {
  total: number;
  count: number;
  byAccount: Array<{ accountId: string; accountName: string; count: number; amount: number }>;
}
export interface CashRunway {
  cashOnHand: number;
  netBurn30d: number;       // positive = burning
  monthlyBurn: number;      // 30d burn projected to a month (same as netBurn30d but exposed for clarity)
  runwayMonths: number | null;  // null when not burning (cash positive)
  asOf: string;
}
export interface GrossMargin {
  period: { from: string; to: string };
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number | null;  // null when revenue=0
}
export interface CashFlowSummary {
  period: { from: string; to: string };
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
  openingBalance: number;
  closingBalance: number;
}
export interface SuspenseAccount {
  accountId: string;
  accountCode: string;
  accountName: string;
  balance: number;        // signed: + means stuck debit, − stuck credit
  lineCount: number;
}
export interface SuspenseSummary {
  asOf: string;
  accounts: SuspenseAccount[];
  totalAbsBalance: number;     // Σ |balance| — UI's headline number
  totalStuck: number;          // count of accounts with non-zero balance
  clean: boolean;
}
export interface PendingApprovalsBreakdown {
  entityType: string;
  count: number;
  oldestRequestedAt: string | null;
}
export interface PendingApprovalsSummary {
  total: number;
  byEntityType: PendingApprovalsBreakdown[];
}

type Logger = Pick<FastifyBaseLogger, 'warn'>;

export class ReportSummariesService {
  private reports: ReportsService;
  private caPortal: CAPortalService;

  constructor(
    private db: Db,
    private redis: Redis,
    private tenantId: string,
    private logger: Logger,
  ) {
    this.reports = new ReportsService(db, tenantId);
    this.caPortal = new CAPortalService(db, tenantId);
  }

  /** Current FY (Apr 1 → today). */
  private fyRange(): { from: string; to: string } {
    const now = new Date(Date.now() + 5.5 * 3_600_000);
    const y = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    return { from: `${y}-04-01`, to: now.toISOString().slice(0, 10) };
  }

  /**
   * Period range pair (current + prior comparable window) for the P&L card.
   *  - fy:    Apr 1 of current FY → today; prior = same calendar days in prior FY
   *  - qtr:   start of current calendar quarter → today; prior = full prior quarter
   *  - month: start of current month → today; prior = full prior month
   */
  private pnlRanges(kind: PnlPeriod): { current: { from: string; to: string }; prior: { from: string; to: string } } {
    const istToday = new Date(Date.now() + 5.5 * 3_600_000);
    const todayIso = istToday.toISOString().slice(0, 10);
    const y = istToday.getUTCFullYear();
    const m = istToday.getUTCMonth();
    const d = istToday.getUTCDate();
    const iso = (yr: number, mo: number, da: number) => new Date(Date.UTC(yr, mo, da)).toISOString().slice(0, 10);

    if (kind === 'month') {
      const cFrom = iso(y, m, 1);
      const pFrom = iso(y, m - 1, 1);
      const pTo   = iso(y, m, 0); // last day of prior month
      return { current: { from: cFrom, to: todayIso }, prior: { from: pFrom, to: pTo } };
    }
    if (kind === 'qtr') {
      const q = Math.floor(m / 3);
      const cFrom = iso(y, q * 3, 1);
      const pFrom = iso(y, (q - 1) * 3, 1);
      const pTo   = iso(y, q * 3, 0);
      return { current: { from: cFrom, to: todayIso }, prior: { from: pFrom, to: pTo } };
    }
    // fy — Apr→Mar
    const fyStartY = m >= 3 ? y : y - 1;
    const cFrom = `${fyStartY}-04-01`;
    const pFromY = fyStartY - 1;
    const pFrom = `${pFromY}-04-01`;
    // Prior FY at same calendar offset as today (so "FYTD vs prior FYTD" is fair)
    const pTo = iso(pFromY, m, d);
    return { current: { from: cFrom, to: todayIso }, prior: { from: pFrom, to: pTo } };
  }

  pnlSummary(kind: PnlPeriod = 'fy'): Promise<PnLSummary> {
    const { current, prior } = this.pnlRanges(kind);
    return getOrCompute(this.redis, {
      tenantId: this.tenantId,
      metricKey: 'pnl_summary',
      variant: `${kind}_${current.from}_${current.to}`,
      ttlSec: TTL_REPORT_SUMMARY_SEC,
    }, () => timed(this.logger, 'pnl_summary', async () => {
      const sumExpense = (p: { totalCogs: number; totalOperatingExpenses: number; totalDepreciation: number; totalFinancialCosts: number; totalTaxes: number }) =>
        p.totalCogs + p.totalOperatingExpenses + p.totalDepreciation + p.totalFinancialCosts + p.totalTaxes;

      const [pnlCur, pnlPrior] = await Promise.all([
        this.reports.getProfitAndLoss(current.from, current.to),
        this.reports.getProfitAndLoss(prior.from, prior.to),
      ]);

      const priorNet = pnlPrior.netProfit;
      const netProfitDeltaPct = priorNet !== 0
        ? Math.round(((pnlCur.netProfit - priorNet) / Math.abs(priorNet)) * 1000) / 10
        : null;

      return {
        periodKind: kind,
        period: pnlCur.period,
        totalRevenue: pnlCur.totalRevenue,
        totalExpense: sumExpense(pnlCur),
        grossProfit: pnlCur.grossProfit,
        netProfit: pnlCur.netProfit,
        prior: {
          period: pnlPrior.period,
          totalRevenue: pnlPrior.totalRevenue,
          totalExpense: sumExpense(pnlPrior),
          netProfit: pnlPrior.netProfit,
        },
        netProfitDeltaPct,
      };
    }));
  }

  bsSummary(): Promise<BsSummary> {
    const asOf = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
    return getOrCompute(this.redis, {
      tenantId: this.tenantId,
      metricKey: 'bs_summary',
      variant: asOf,
      ttlSec: TTL_REPORT_SUMMARY_SEC,
    }, () => timed(this.logger, 'bs_summary', async () => {
      const bs = await this.reports.getBalanceSheet(asOf);
      const liabPlusEquity = bs.totalLiabilities + bs.totalEquity;
      return {
        asOfDate: bs.asOfDate,
        totalAssets: bs.totalAssets,
        totalLiabilities: bs.totalLiabilities,
        totalEquity: bs.totalEquity,
        balanced: Math.abs(bs.totalAssets - liabPlusEquity) < 0.01,
      };
    }));
  }

  trialBalanceSummary(): Promise<TbSummary> {
    const asOf = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
    return getOrCompute(this.redis, {
      tenantId: this.tenantId,
      metricKey: 'tb_summary',
      variant: asOf,
      ttlSec: TTL_REPORT_SUMMARY_SEC,
    }, () => timed(this.logger, 'tb_summary', async () => {
      const tb = await this.caPortal.getTrialBalance(asOf);
      return {
        asOfDate: tb.asOfDate,
        accountCount: tb.accounts.length,
        totalDebit: tb.totalDebit,
        totalCredit: tb.totalCredit,
        balanced: Math.abs(tb.totalDebit - tb.totalCredit) < 0.01,
      };
    }));
  }

  cashRunway(): Promise<CashRunway> {
    const asOf = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
    return getOrCompute(this.redis, {
      tenantId: this.tenantId,
      metricKey: 'cash_runway',
      variant: asOf,
      ttlSec: TTL_REPORT_SUMMARY_SEC,
    }, () => timed(this.logger, 'cash_runway', async () => {
      // Net burn = bank-account debits - credits over last 30 days (operational
      // cash movement, regardless of source). Same convention dashboard uses.
      const burnRes = await this.db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'debit'  THEN amount END), 0) AS debits,
          COALESCE(SUM(CASE WHEN type = 'credit' THEN amount END), 0) AS credits
        FROM bank_transactions
        WHERE tenant_id = ${this.tenantId}
          AND transaction_date >= CURRENT_DATE - INTERVAL '30 days'
      `);
      const burnRow = (burnRes as unknown as { rows: Array<{ debits: unknown; credits: unknown }> }).rows[0];
      const debits = Number(burnRow?.debits) || 0;
      const credits = Number(burnRow?.credits) || 0;
      const netBurn30d = debits - credits;

      const cashRes = await this.db.execute(sql`
        SELECT COALESCE(SUM(current_balance), 0) AS cash
        FROM bank_accounts
        WHERE tenant_id = ${this.tenantId} AND is_active = TRUE
      `);
      const cashOnHand = Number(((cashRes as unknown as { rows: Array<{ cash: unknown }> }).rows[0]?.cash)) || 0;

      const runwayMonths = netBurn30d > 0 ? Math.round((cashOnHand / netBurn30d) * 10) / 10 : null;
      return { cashOnHand, netBurn30d, monthlyBurn: netBurn30d, runwayMonths, asOf };
    }));
  }

  grossMargin(): Promise<GrossMargin> {
    const { from, to } = this.fyRange();
    return getOrCompute(this.redis, {
      tenantId: this.tenantId,
      metricKey: 'gross_margin',
      variant: `${from}_${to}`,
      ttlSec: TTL_REPORT_SUMMARY_SEC,
    }, () => timed(this.logger, 'gross_margin', async () => {
      const pnl = await this.reports.getProfitAndLoss(from, to);
      const marginPct = pnl.totalRevenue > 0
        ? Math.round((pnl.grossProfit / pnl.totalRevenue) * 1000) / 10
        : null;
      return {
        period: pnl.period,
        revenue: pnl.totalRevenue,
        cogs: pnl.totalCogs,
        grossProfit: pnl.grossProfit,
        marginPct,
      };
    }));
  }

  cashFlowSummary(): Promise<CashFlowSummary> {
    const { from, to } = this.fyRange();
    return getOrCompute(this.redis, {
      tenantId: this.tenantId,
      metricKey: 'cash_flow_summary',
      variant: `${from}_${to}`,
      ttlSec: TTL_REPORT_SUMMARY_SEC,
    }, () => timed(this.logger, 'cash_flow_summary', async () => {
      const cf = await this.reports.getCashFlowStatement(from, to);
      return {
        period: cf.period,
        operating: cf.totalOperating,
        investing: cf.totalInvesting,
        financing: cf.totalFinancing,
        netChange: cf.netChange,
        openingBalance: cf.openingBalance,
        closingBalance: cf.closingBalance,
      };
    }));
  }

  /**
   * Suspense / clearing accounts that aren't zero are a books-health red flag:
   * something went into them and never came out. Detection is by name pattern
   * — anything containing 'suspense', 'clearing', or 'unalloc' counts. We only
   * look at posted JEs (drafts are noise) and report a non-zero net balance
   * per account.
   */
  suspenseSummary(): Promise<SuspenseSummary> {
    const asOf = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
    return getOrCompute(this.redis, {
      tenantId: this.tenantId,
      metricKey: 'suspense_summary',
      variant: asOf,
      ttlSec: TTL_UNRECONCILED_SEC,
    }, () => timed(this.logger, 'suspense_summary', async () => {
      const res = await this.db.execute(sql`
        SELECT a.id, a.code, a.name,
               COALESCE(SUM(jl.debit - jl.credit), 0) AS balance,
               COUNT(jl.*)::int AS line_count
        FROM accounts a
        LEFT JOIN journal_lines jl ON jl.account_id = a.id
        LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
        WHERE a.tenant_id = ${this.tenantId}
          AND a.is_active = TRUE
          AND (a.name ILIKE '%suspense%' OR a.name ILIKE '%clearing%' OR a.name ILIKE '%unalloc%')
        GROUP BY a.id, a.code, a.name
        ORDER BY a.code
      `);
      const rows = ((res as unknown as { rows: Array<{ id: string; code: string; name: string; balance: unknown; line_count: number }> }).rows) ?? [];
      const accounts: SuspenseAccount[] = rows.map((r) => ({
        accountId: r.id,
        accountCode: r.code,
        accountName: r.name,
        balance: Number(r.balance) || 0,
        lineCount: r.line_count,
      }));
      const stuck = accounts.filter((a) => Math.abs(a.balance) > 0.01);
      return {
        asOf,
        accounts,
        totalAbsBalance: stuck.reduce((s, a) => s + Math.abs(a.balance), 0),
        totalStuck: stuck.length,
        clean: stuck.length === 0,
      };
    }));
  }

  /**
   * Approval workflow queue health. Counts approval_instances that are still
   * pending, grouped by what's waiting (purchase_invoice, journal_entry, etc.).
   * Shows the oldest request per group so the UI can flag stale items.
   */
  pendingApprovals(): Promise<PendingApprovalsSummary> {
    return getOrCompute(this.redis, {
      tenantId: this.tenantId,
      metricKey: 'pending_approvals',
      ttlSec: 60, // approvals are time-sensitive — 1 min cache
    }, () => timed(this.logger, 'pending_approvals', async () => {
      const res = await this.db.execute(sql`
        SELECT entity_type,
               COUNT(*)::int AS cnt,
               MIN(requested_at)::text AS oldest
        FROM approval_instances
        WHERE tenant_id = ${this.tenantId} AND status = 'pending'
        GROUP BY entity_type
        ORDER BY cnt DESC
      `);
      const rows = ((res as unknown as { rows: Array<{ entity_type: string; cnt: number; oldest: string | null }> }).rows) ?? [];
      const byEntityType: PendingApprovalsBreakdown[] = rows.map((r) => ({
        entityType: r.entity_type,
        count: r.cnt,
        oldestRequestedAt: r.oldest,
      }));
      return {
        total: byEntityType.reduce((s, b) => s + b.count, 0),
        byEntityType,
      };
    }));
  }

  unreconciledBankTxns(): Promise<UnreconciledBankTxns> {
    return getOrCompute(this.redis, {
      tenantId: this.tenantId,
      metricKey: 'unreconciled_bank_txns',
      ttlSec: TTL_UNRECONCILED_SEC,
    }, () => timed(this.logger, 'unreconciled_bank_txns', async () => {
      const res = await this.db.execute(sql`
        SELECT ba.id AS account_id, ba.name AS account_name,
               COUNT(bt.*)::int AS cnt,
               COALESCE(SUM(ABS(bt.amount)), 0) AS amount
        FROM bank_accounts ba
        LEFT JOIN bank_transactions bt
          ON bt.bank_account_id = ba.id
         AND bt.tenant_id = ${this.tenantId}
         AND bt.recon_status = 'unreconciled'
        WHERE ba.tenant_id = ${this.tenantId} AND ba.is_active = TRUE
        GROUP BY ba.id, ba.name
        ORDER BY ba.name
      `);
      const rows = ((res as unknown as { rows: Array<{ account_id: string; account_name: string; cnt: number; amount: unknown }> }).rows) ?? [];
      const byAccount = rows.map((r) => ({
        accountId: r.account_id,
        accountName: r.account_name,
        count: r.cnt,
        amount: Number(r.amount) || 0,
      }));
      return {
        total: byAccount.reduce((s, a) => s + a.amount, 0),
        count: byAccount.reduce((s, a) => s + a.count, 0),
        byAccount,
      };
    }));
  }
}
