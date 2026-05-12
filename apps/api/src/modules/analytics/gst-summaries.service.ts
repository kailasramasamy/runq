import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type Redis from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import { getOrCompute } from './cache';
import { timed } from './timing';
import { Gstr2bReconciliationService } from '../gst/gstr2b-reconciliation';

const TTL_GST_SUMMARY_SEC = 1800; // 30 min — heavier than P1C since GSP-driven

const TOLERANCE = 2; // ₹2 rounding tolerance for tax compares

export interface PeriodInfo {
  period: string; // MMYYYY
  label: string;  // "Apr 2026"
  monthStart: string; // YYYY-MM-DD
  monthEnd: string;
}

export interface GstrOneVsThreeBSummary {
  period: PeriodInfo;
  gstr1Available: boolean;
  gstr3bAvailable: boolean;
  outwardTaxableValueDelta: number; // 1 - 3B
  totalTaxDelta: number;
  hasMismatch: boolean;
  details: Array<{ label: string; gstr1: number; gstr3b: number; delta: number }>;
}

export interface GstrTwoBReconSummary {
  period: PeriodInfo;
  has2b: boolean;
  reconRun: boolean; // matches table populated for this period
  matched: { count: number; taxableValue: number };
  mismatched: { count: number; taxableValue: number };
  notInBooks: { count: number; taxableValue: number };
  notIn2b: { count: number; taxableValue: number };
  totalItcAvailable: number;
  totalItcClaimable: number; // matched only
  itcAtRisk: number; // available - claimable
}

export interface GstLiabilityCurrent {
  period: PeriodInfo;
  has3b: boolean;
  igst: number; cgst: number; sgst: number; cess: number;
  totalPayable: number;
  totalItcUsed: number;
  totalCashPayable: number;
}

export interface ItcBlockerVendor {
  vendorId: string;
  vendorName: string;
  vendorGstin: string | null;
  billCount: number;
  itcAtRisk: number;
  reason: 'missing_in_2b' | 'no_gstin';
}
export interface VendorsNotFiledSummary {
  period: PeriodInfo;
  has2b: boolean;
  vendors: ItcBlockerVendor[];
  totalItcAtRisk: number;
}

type Logger = Pick<FastifyBaseLogger, 'warn'>;

/** Default GST period = previous calendar month in IST. Returns MMYYYY. */
export function previousMonthPeriod(now = new Date()): PeriodInfo {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  const prev = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1));
  const monthStart = prev.toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const period = `${String(prev.getUTCMonth() + 1).padStart(2, '0')}${prev.getUTCFullYear()}`;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const label = `${months[prev.getUTCMonth()]} ${prev.getUTCFullYear()}`;
  return { period, label, monthStart, monthEnd };
}

interface Gstr1Totals { taxableValue: number; igst: number; cgst: number; sgst: number; cess: number }
interface Gstr3bTotals { taxableValue: number; igst: number; cgst: number; sgst: number; cess: number }

export class GstSummariesService {
  private recon2b: Gstr2bReconciliationService;

  constructor(
    private db: Db,
    private redis: Redis,
    private tenantId: string,
    private logger: Logger,
  ) {
    this.recon2b = new Gstr2bReconciliationService(db, tenantId);
  }

  // ── 1. GSTR-1 vs GSTR-3B mismatch ────────────────────────────────────
  gstr1Vs3bSummary(): Promise<GstrOneVsThreeBSummary> {
    const period = previousMonthPeriod();
    return getOrCompute(this.redis, {
      tenantId: this.tenantId,
      metricKey: 'gstr1_vs_3b_summary',
      variant: period.period,
      ttlSec: TTL_GST_SUMMARY_SEC,
    }, () => timed(this.logger, 'gstr1_vs_3b_summary', async () => {
      const [g1Row, g3bRow] = await Promise.all([
        this.fetchReturnData(period.period, 'gstr1'),
        this.fetchReturnData(period.period, 'gstr3b'),
      ]);
      const g1 = g1Row ? this.gstr1Totals(g1Row) : null;
      const g3b = g3bRow ? this.gstr3bTotals(g3bRow) : null;

      const details = [
        { label: 'Taxable value',  gstr1: g1?.taxableValue ?? 0, gstr3b: g3b?.taxableValue ?? 0 },
        { label: 'IGST',           gstr1: g1?.igst ?? 0,         gstr3b: g3b?.igst ?? 0 },
        { label: 'CGST',           gstr1: g1?.cgst ?? 0,         gstr3b: g3b?.cgst ?? 0 },
        { label: 'SGST',           gstr1: g1?.sgst ?? 0,         gstr3b: g3b?.sgst ?? 0 },
        { label: 'Cess',           gstr1: g1?.cess ?? 0,         gstr3b: g3b?.cess ?? 0 },
      ].map((r) => ({ ...r, delta: round2(r.gstr1 - r.gstr3b) }));

      const totalTax1  = (g1?.igst ?? 0)  + (g1?.cgst ?? 0)  + (g1?.sgst ?? 0)  + (g1?.cess ?? 0);
      const totalTax3b = (g3b?.igst ?? 0) + (g3b?.cgst ?? 0) + (g3b?.sgst ?? 0) + (g3b?.cess ?? 0);

      return {
        period,
        gstr1Available: !!g1,
        gstr3bAvailable: !!g3b,
        outwardTaxableValueDelta: round2((g1?.taxableValue ?? 0) - (g3b?.taxableValue ?? 0)),
        totalTaxDelta: round2(totalTax1 - totalTax3b),
        hasMismatch: !!g1 && !!g3b && details.some((r) => Math.abs(r.delta) > TOLERANCE),
        details,
      };
    }));
  }

  // ── 2. GSTR-2B vs purchase register ──────────────────────────────────
  gstr2bReconSummary(): Promise<GstrTwoBReconSummary> {
    const period = previousMonthPeriod();
    return getOrCompute(this.redis, {
      tenantId: this.tenantId,
      metricKey: 'gstr2b_recon_summary',
      variant: period.period,
      ttlSec: TTL_GST_SUMMARY_SEC,
    }, () => timed(this.logger, 'gstr2b_recon_summary', async () => {
      const has2bRes = await this.db.execute(sql`
        SELECT 1 FROM gstr2b_data WHERE tenant_id = ${this.tenantId} AND period = ${period.period} LIMIT 1
      `);
      const has2b = (((has2bRes as unknown as { rows: unknown[] }).rows) ?? []).length > 0;
      const matchRes = await this.db.execute(sql`
        SELECT 1 FROM gstr2b_matches WHERE tenant_id = ${this.tenantId} AND period = ${period.period} LIMIT 1
      `);
      const reconRun = (((matchRes as unknown as { rows: unknown[] }).rows) ?? []).length > 0;

      const empty = {
        period, has2b, reconRun,
        matched: { count: 0, taxableValue: 0 },
        mismatched: { count: 0, taxableValue: 0 },
        notInBooks: { count: 0, taxableValue: 0 },
        notIn2b: { count: 0, taxableValue: 0 },
        totalItcAvailable: 0,
        totalItcClaimable: 0,
        itcAtRisk: 0,
      };
      if (!has2b || !reconRun) return empty;

      try {
        const summary = await this.recon2b.getSummary(period.period);
        return {
          period, has2b, reconRun,
          ...summary,
          itcAtRisk: round2(summary.totalItcAvailable - summary.totalItcClaimable),
        };
      } catch {
        return empty;
      }
    }));
  }

  // ── 3. GST liability this period ─────────────────────────────────────
  gstLiabilityCurrent(): Promise<GstLiabilityCurrent> {
    const period = previousMonthPeriod();
    return getOrCompute(this.redis, {
      tenantId: this.tenantId,
      metricKey: 'gst_liability_current',
      variant: period.period,
      ttlSec: TTL_GST_SUMMARY_SEC,
    }, () => timed(this.logger, 'gst_liability_current', async () => {
      const g3bRow = await this.fetchReturnData(period.period, 'gstr3b');
      if (!g3bRow) {
        return {
          period, has3b: false,
          igst: 0, cgst: 0, sgst: 0, cess: 0,
          totalPayable: 0, totalItcUsed: 0, totalCashPayable: 0,
        };
      }
      const t = (g3bRow as { table61?: { igst: { payable: number; itcUsed: number; cashPaid: number }; cgst: { payable: number; itcUsed: number; cashPaid: number }; sgst: { payable: number; itcUsed: number; cashPaid: number }; cess: { payable: number; itcUsed: number; cashPaid: number } } }).table61;
      if (!t) {
        return { period, has3b: true, igst: 0, cgst: 0, sgst: 0, cess: 0, totalPayable: 0, totalItcUsed: 0, totalCashPayable: 0 };
      }
      return {
        period, has3b: true,
        igst: t.igst.payable, cgst: t.cgst.payable, sgst: t.sgst.payable, cess: t.cess.payable,
        totalPayable: round2(t.igst.payable + t.cgst.payable + t.sgst.payable + t.cess.payable),
        totalItcUsed: round2(t.igst.itcUsed + t.cgst.itcUsed + t.sgst.itcUsed + t.cess.itcUsed),
        totalCashPayable: round2(t.igst.cashPaid + t.cgst.cashPaid + t.sgst.cashPaid + t.cess.cashPaid),
      };
    }));
  }

  // ── 4. Vendors not filed GSTR-1 (ITC blockers) ───────────────────────
  vendorsNotFiledSummary(): Promise<VendorsNotFiledSummary> {
    const period = previousMonthPeriod();
    return getOrCompute(this.redis, {
      tenantId: this.tenantId,
      metricKey: 'vendors_not_filed_summary',
      variant: period.period,
      ttlSec: TTL_GST_SUMMARY_SEC,
    }, () => timed(this.logger, 'vendors_not_filed_summary', async () => {
      const has2bRes = await this.db.execute(sql`
        SELECT 1 FROM gstr2b_data
        WHERE tenant_id = ${this.tenantId} AND period = ${period.period} LIMIT 1
      `);
      const has2b = (((has2bRes as unknown as { rows: unknown[] }).rows) ?? []).length > 0;

      // Vendors with bills in period
      const billsRes = await this.db.execute(sql`
        SELECT v.id AS vendor_id, v.name AS vendor_name, v.gstin AS vendor_gstin,
               COUNT(pi.*)::int AS bill_count,
               COALESCE(SUM(pi.cgst_amount + pi.sgst_amount + pi.igst_amount + pi.cess_amount), 0) AS itc
        FROM purchase_invoices pi
        JOIN vendors v ON v.id = pi.vendor_id
        WHERE pi.tenant_id = ${this.tenantId}
          AND pi.invoice_date BETWEEN ${period.monthStart} AND ${period.monthEnd}
          AND pi.status IN ('approved','partially_paid','paid')
        GROUP BY v.id, v.name, v.gstin
      `);
      const vendorRows = ((billsRes as unknown as { rows: Array<{ vendor_id: string; vendor_name: string; vendor_gstin: string | null; bill_count: number; itc: unknown }> }).rows) ?? [];

      let in2bSet = new Set<string>();
      if (has2b) {
        const matchesRes = await this.db.execute(sql`
          SELECT DISTINCT supplier_gstin FROM gstr2b_matches
          WHERE tenant_id = ${this.tenantId} AND period = ${period.period}
        `);
        in2bSet = new Set(
          (((matchesRes as unknown as { rows: Array<{ supplier_gstin: string }> }).rows) ?? []).map((r) => r.supplier_gstin)
        );
      }

      const blockers: ItcBlockerVendor[] = [];
      for (const v of vendorRows) {
        const itc = round2(Number(v.itc) || 0);
        const base = { vendorId: v.vendor_id, vendorName: v.vendor_name, billCount: v.bill_count, itcAtRisk: itc };
        if (!v.vendor_gstin) {
          blockers.push({ ...base, vendorGstin: null, reason: 'no_gstin' });
        } else if (has2b && !in2bSet.has(v.vendor_gstin)) {
          blockers.push({ ...base, vendorGstin: v.vendor_gstin, reason: 'missing_in_2b' });
        }
      }
      const vendors = blockers
        .filter((v) => v.itcAtRisk > 0)
        .sort((a, b) => b.itcAtRisk - a.itcAtRisk)
        .slice(0, 10);

      return {
        period, has2b,
        vendors,
        totalItcAtRisk: round2(vendors.reduce((s, v) => s + v.itcAtRisk, 0)),
      };
    }));
  }

  // ── helpers ──────────────────────────────────────────────────────────
  private async fetchReturnData(period: string, returnType: 'gstr1' | 'gstr3b'): Promise<Record<string, unknown> | null> {
    const res = await this.db.execute(sql`
      SELECT data FROM gst_returns
      WHERE tenant_id = ${this.tenantId} AND period = ${period} AND return_type = ${returnType}
      ORDER BY created_at DESC LIMIT 1
    `);
    const rows = ((res as unknown as { rows: Array<{ data: Record<string, unknown> | null }> }).rows) ?? [];
    return rows[0]?.data ?? null;
  }

  private gstr1Totals(g1: Record<string, unknown>): Gstr1Totals {
    // GSTR-1 has b2b/b2cl/b2cs/exp arrays; sum tax across them
    const sum = { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
    const sections = ['b2b', 'b2cl', 'b2cs', 'exp', 'cdnr', 'cdnur'];
    for (const s of sections) {
      const arr = (g1[s] as Array<{ items?: Array<{ taxableValue?: number; igst?: number; cgst?: number; sgst?: number; cess?: number }>; taxableValue?: number; igst?: number; cgst?: number; sgst?: number; cess?: number }> | undefined);
      if (!Array.isArray(arr)) continue;
      for (const row of arr) {
        if (Array.isArray(row.items)) {
          for (const it of row.items) {
            sum.taxableValue += Number(it.taxableValue) || 0;
            sum.igst += Number(it.igst) || 0;
            sum.cgst += Number(it.cgst) || 0;
            sum.sgst += Number(it.sgst) || 0;
            sum.cess += Number(it.cess) || 0;
          }
        } else {
          sum.taxableValue += Number(row.taxableValue) || 0;
          sum.igst += Number(row.igst) || 0;
          sum.cgst += Number(row.cgst) || 0;
          sum.sgst += Number(row.sgst) || 0;
          sum.cess += Number(row.cess) || 0;
        }
      }
    }
    return sum;
  }

  private gstr3bTotals(g3b: Record<string, unknown>): Gstr3bTotals {
    const t31 = g3b.table31 as { outwardTaxableInterState: { taxableValue: number; igst: number; cess: number }; outwardTaxableIntraState: { taxableValue: number; cgst: number; sgst: number; cess: number }; zeroRatedSupplies: { taxableValue: number; igst: number } } | undefined;
    if (!t31) return { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
    const taxableValue = (t31.outwardTaxableInterState?.taxableValue ?? 0)
      + (t31.outwardTaxableIntraState?.taxableValue ?? 0)
      + (t31.zeroRatedSupplies?.taxableValue ?? 0);
    return {
      taxableValue,
      igst: (t31.outwardTaxableInterState?.igst ?? 0) + (t31.zeroRatedSupplies?.igst ?? 0),
      cgst: t31.outwardTaxableIntraState?.cgst ?? 0,
      sgst: t31.outwardTaxableIntraState?.sgst ?? 0,
      cess: (t31.outwardTaxableInterState?.cess ?? 0) + (t31.outwardTaxableIntraState?.cess ?? 0),
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
