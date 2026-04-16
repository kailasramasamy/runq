/**
 * GST Readiness service — computes a real-time readiness score for the
 * current filing period so the dashboard widget can show gaps before
 * they become month-end surprises.
 */

import { and, eq, gte, lte, inArray, sql, isNull, or, notInArray } from 'drizzle-orm';
import {
  salesInvoices, salesInvoiceItems, customers,
  purchaseInvoices, bankTransactions, tenants,
  gstReturns,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { TenantSettings } from '@runq/types';

export interface GstReadinessResult {
  period: string;         // MMYYYY (previous month — the one to be filed)
  periodLabel: string;    // "Mar 2026"
  score: number;          // 0-100
  signals: GstReadinessSignal[];
  returns: {
    gstr1: { exists: boolean; status: string | null };
    gstr3b: { exists: boolean; status: string | null };
  };
  dueDates: {
    gstr1: string;        // YYYY-MM-DD
    gstr3b: string;
  };
}

export interface GstReadinessSignal {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export class GstReadinessService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async compute(): Promise<GstReadinessResult> {
    const period = this.previousMonthPeriod();
    const { periodStart, periodEnd } = this.periodToDateRange(period);
    const periodLabel = this.periodLabel(period);

    const [tenantCfg, invoices, bills, returns] = await Promise.all([
      this.getTenantGstConfig(),
      this.checkInvoices(periodStart, periodEnd),
      this.checkPurchaseInvoices(periodStart, periodEnd),
      this.getExistingReturns(period),
    ]);

    const bankRecon = await this.checkBankRecon(periodEnd);
    const customersMissingGstin = await this.checkCustomersMissingGstin();

    const signals: GstReadinessSignal[] = [
      {
        key: 'gstin_configured',
        label: 'Company GSTIN configured',
        ok: tenantCfg.gstinConfigured,
        detail: tenantCfg.gstinConfigured ? undefined : 'Set GSTIN in Settings → Company',
      },
      {
        key: 'gst_username',
        label: 'GST portal username saved',
        ok: tenantCfg.usernameConfigured,
        detail: tenantCfg.usernameConfigured ? undefined : 'Saves one step during OTP auth',
      },
      {
        key: 'invoices_with_hsn',
        label: `All ${invoices.total} invoice items have HSN codes`,
        ok: invoices.itemsMissingHsn === 0,
        detail: invoices.itemsMissingHsn > 0 ? `${invoices.itemsMissingHsn} items missing HSN` : undefined,
      },
      {
        key: 'invoices_with_pos',
        label: 'All invoices have place of supply',
        ok: invoices.missingPos === 0,
        detail: invoices.missingPos > 0 ? `${invoices.missingPos} invoices missing POS` : undefined,
      },
      {
        key: 'customers_with_gstin',
        label: 'B2B customers have GSTINs',
        ok: customersMissingGstin === 0,
        detail: customersMissingGstin > 0 ? `${customersMissingGstin} active customers without GSTIN — affects buyer ITC` : undefined,
      },
      {
        key: 'bills_approved',
        label: `${bills.approved} of ${bills.total} purchase bills approved`,
        ok: bills.pending === 0,
        detail: bills.pending > 0 ? `${bills.pending} bills pending approval — affects ITC claim` : undefined,
      },
      {
        key: 'bank_recon',
        label: 'Bank transactions reconciled',
        ok: bankRecon.unreconciled === 0,
        detail: bankRecon.unreconciled > 0 ? `${bankRecon.unreconciled} transactions unreconciled` : undefined,
      },
      {
        key: 'gstr1_draft',
        label: 'GSTR-1 draft generated',
        ok: returns.gstr1.exists,
        detail: returns.gstr1.exists
          ? `Status: ${returns.gstr1.status}`
          : 'Auto-generates on 1st, or click Generate',
      },
      {
        key: 'gstr3b_draft',
        label: 'GSTR-3B draft generated',
        ok: returns.gstr3b.exists,
        detail: returns.gstr3b.exists
          ? `Status: ${returns.gstr3b.status}`
          : 'Depends on GSTR-1',
      },
    ];

    // Score = % of signals ok, weighted (blocking ones count double)
    const blockingKeys = new Set(['gstin_configured', 'invoices_with_hsn', 'customers_with_gstin']);
    let weightedTotal = 0, weightedOk = 0;
    for (const s of signals) {
      const w = blockingKeys.has(s.key) ? 2 : 1;
      weightedTotal += w;
      if (s.ok) weightedOk += w;
    }
    const score = Math.round((weightedOk / Math.max(weightedTotal, 1)) * 100);

    return {
      period,
      periodLabel,
      score,
      signals,
      returns,
      dueDates: {
        gstr1: this.dueDate(period, 11),
        gstr3b: this.dueDate(period, 20),
      },
    };
  }

  // ── Internal checks ──────────────────────────────────────────────────

  private async getTenantGstConfig(): Promise<{ gstinConfigured: boolean; usernameConfigured: boolean }> {
    const [row] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId));
    const s = (row?.settings ?? {}) as TenantSettings;
    return {
      gstinConfigured: !!s.gstin,
      usernameConfigured: !!s.gstUsername,
    };
  }

  private async checkInvoices(periodStart: string, periodEnd: string) {
    const [counts] = await this.db
      .select({
        total: sql<number>`COUNT(DISTINCT ${salesInvoices.id})::int`,
        missingPos: sql<number>`COUNT(DISTINCT CASE WHEN ${salesInvoices.placeOfSupplyCode} IS NULL OR ${salesInvoices.placeOfSupplyCode} = '' THEN ${salesInvoices.id} END)::int`,
      })
      .from(salesInvoices)
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        gte(salesInvoices.invoiceDate, periodStart),
        lte(salesInvoices.invoiceDate, periodEnd),
        notInArray(salesInvoices.status, ['draft', 'cancelled']),
      ));

    const [itemsCheck] = await this.db
      .select({
        itemsMissingHsn: sql<number>`COUNT(CASE WHEN ${salesInvoiceItems.hsnSacCode} IS NULL OR ${salesInvoiceItems.hsnSacCode} = '' THEN 1 END)::int`,
      })
      .from(salesInvoiceItems)
      .innerJoin(salesInvoices, eq(salesInvoices.id, salesInvoiceItems.invoiceId))
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        gte(salesInvoices.invoiceDate, periodStart),
        lte(salesInvoices.invoiceDate, periodEnd),
        notInArray(salesInvoices.status, ['draft', 'cancelled']),
      ));

    return {
      total: counts?.total ?? 0,
      missingPos: counts?.missingPos ?? 0,
      itemsMissingHsn: itemsCheck?.itemsMissingHsn ?? 0,
    };
  }

  private async checkPurchaseInvoices(periodStart: string, periodEnd: string) {
    const [row] = await this.db
      .select({
        total: sql<number>`COUNT(*)::int`,
        approved: sql<number>`COUNT(CASE WHEN status IN ('approved','partially_paid','paid') THEN 1 END)::int`,
        pending: sql<number>`COUNT(CASE WHEN status IN ('pending_match','matched') THEN 1 END)::int`,
      })
      .from(purchaseInvoices)
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        gte(purchaseInvoices.invoiceDate, periodStart),
        lte(purchaseInvoices.invoiceDate, periodEnd),
        notInArray(purchaseInvoices.status, ['draft', 'cancelled']),
      ));
    return { total: row?.total ?? 0, approved: row?.approved ?? 0, pending: row?.pending ?? 0 };
  }

  private async checkBankRecon(periodEnd: string) {
    const [row] = await this.db
      .select({
        unreconciled: sql<number>`COUNT(CASE WHEN ${bankTransactions.reconStatus} = 'unreconciled' THEN 1 END)::int`,
      })
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.tenantId, this.tenantId),
        lte(bankTransactions.transactionDate, periodEnd),
      ));
    return { unreconciled: row?.unreconciled ?? 0 };
  }

  private async checkCustomersMissingGstin(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(customers)
      .where(and(
        eq(customers.tenantId, this.tenantId),
        eq(customers.isActive, true),
        eq(customers.type, 'b2b'),
        or(isNull(customers.gstin), eq(customers.gstin, '')),
      ));
    return row?.count ?? 0;
  }

  private async getExistingReturns(period: string) {
    const rows = await this.db
      .select({ returnType: gstReturns.returnType, status: gstReturns.status })
      .from(gstReturns)
      .where(and(
        eq(gstReturns.tenantId, this.tenantId),
        eq(gstReturns.period, period),
      ));

    const g1 = rows.find((r) => r.returnType === 'gstr1');
    const g3b = rows.find((r) => r.returnType === 'gstr3b');

    return {
      gstr1: { exists: !!g1, status: g1?.status ?? null },
      gstr3b: { exists: !!g3b, status: g3b?.status ?? null },
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private previousMonthPeriod(): string {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const mm = String(prev.getMonth() + 1).padStart(2, '0');
    return `${mm}${prev.getFullYear()}`;
  }

  private periodToDateRange(period: string) {
    const month = parseInt(period.substring(0, 2), 10);
    const year = parseInt(period.substring(2), 10);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    return { periodStart: fmt(start), periodEnd: fmt(end) };
  }

  private periodLabel(period: string): string {
    const month = parseInt(period.substring(0, 2), 10);
    const year = parseInt(period.substring(2), 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[month - 1]} ${year}`;
  }

  private dueDate(period: string, day: number): string {
    const month = parseInt(period.substring(0, 2), 10);
    const year = parseInt(period.substring(2), 10);
    // Due is in the month after the return period
    const due = new Date(year, month, day);
    return due.toISOString().split('T')[0];
  }
}
