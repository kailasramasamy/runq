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
  // When true, this period was filed externally (before gstFilingStartPeriod)
  filedExternally?: boolean;
  filingStartLabel?: string;   // e.g. "Apr 2026"
}

export interface GstReadinessSignal {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface AffectedItem {
  id: string;
  label: string;          // invoice number, customer name, etc.
  sublabel?: string;      // date, amount, etc.
  link?: string;          // frontend route to fix
}

export interface SignalDetail {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
  howToFix?: string;      // step-by-step instructions
  affectedItems: AffectedItem[];
}

export class GstReadinessService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async compute(): Promise<GstReadinessResult> {
    // Fetch tenant config first — we need gstFilingStartPeriod to decide the period
    const tenantCfg = await this.getTenantGstConfig();

    const prevPeriod = this.previousMonthPeriod();

    // If tenant has a filing start period and the previous month is before it,
    // the period hasn't started yet — return an all-clear result.
    if (tenantCfg.gstFilingStartPeriod && this.periodIsBefore(prevPeriod, tenantCfg.gstFilingStartPeriod)) {
      const startLabel = this.periodLabel(tenantCfg.gstFilingStartPeriod);
      return {
        period: prevPeriod,
        periodLabel: this.periodLabel(prevPeriod),
        score: 100,
        signals: [],
        returns: {
          gstr1: { exists: false, status: 'filed_externally' },
          gstr3b: { exists: false, status: 'filed_externally' },
        },
        dueDates: {
          gstr1: this.dueDate(prevPeriod, 11),
          gstr3b: this.dueDate(prevPeriod, 20),
        },
        filedExternally: true,
        filingStartLabel: startLabel,
      };
    }

    const period = prevPeriod;
    const { periodStart, periodEnd } = this.periodToDateRange(period);
    const periodLabel = this.periodLabel(period);

    const [invoices, bills, returns] = await Promise.all([
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

  /** Returns enriched signals with affected items for the detail screen. */
  async computeDetails(): Promise<SignalDetail[]> {
    const base = await this.compute();
    const period = base.period;
    const { periodStart, periodEnd } = this.periodToDateRange(period);
    const details: SignalDetail[] = [];

    for (const signal of base.signals) {
      const d: SignalDetail = {
        key: signal.key,
        label: signal.label,
        ok: signal.ok,
        detail: signal.detail,
        howToFix: '',
        affectedItems: [],
      };

      if (!signal.ok) {
        switch (signal.key) {
          case 'gstin_configured':
            d.howToFix = 'Go to Settings → Company and enter your 15-digit GSTIN number.';
            d.affectedItems = [{ id: 'settings', label: 'Company Settings', link: '/settings/company' }];
            break;

          case 'gst_username':
            d.howToFix = 'Go to Settings → Company and enter your GST portal username (e.g. MH_NT2.1642). This auto-fills the OTP authentication modal.';
            d.affectedItems = [{ id: 'settings', label: 'Company Settings', link: '/settings/company' }];
            break;

          case 'invoices_with_hsn':
            d.howToFix = 'Edit each invoice below and add the correct HSN/SAC code to the line items. HSN codes are required by GSTN for GSTR-1 filing.';
            d.affectedItems = await this.getInvoicesMissingHsn(periodStart, periodEnd);
            break;

          case 'invoices_with_pos':
            d.howToFix = 'Place of Supply is derived from the buyer\'s GSTIN state code. Ensure the customer has a valid GSTIN set, or edit the invoice to set POS manually.';
            d.affectedItems = await this.getInvoicesMissingPos(periodStart, periodEnd);
            break;

          case 'customers_with_gstin':
            d.howToFix = 'Edit each B2B customer below and add their GSTIN. Without it, their invoices go into B2CS (aggregated) instead of B2B (invoice-level), which means your buyers can\'t claim ITC on these purchases.';
            d.affectedItems = await this.getCustomersMissingGstin();
            break;

          case 'bills_approved':
            d.howToFix = 'Review and approve each purchase bill below. Only approved bills contribute to your ITC claim in GSTR-3B. Unapproved bills reduce your claimable credit.';
            d.affectedItems = await this.getPendingBills(periodStart, periodEnd);
            break;

          case 'bank_recon':
            d.howToFix = 'Go to Banking → Reconciliation and match unreconciled transactions. This ensures all payments are accounted for before filing.';
            d.affectedItems = [{ id: 'recon', label: 'Bank Reconciliation', link: '/banking/reconciliation' }];
            break;

          case 'gstr1_draft':
            d.howToFix = 'Go to GST → Returns and click "Generate GSTR-1" for this period. The draft is auto-generated on the 1st of each month, but you can also generate it manually.';
            d.affectedItems = [{ id: 'returns', label: 'GST Returns', link: '/gst/returns' }];
            break;

          case 'gstr3b_draft':
            d.howToFix = 'Generate GSTR-1 first (it feeds into 3B). Then click "Generate GSTR-3B" on the returns page.';
            d.affectedItems = [{ id: 'returns', label: 'GST Returns', link: '/gst/returns' }];
            break;
        }
      }

      details.push(d);
    }

    return details;
  }

  // ── Detail queries (affected items) ──────────────────────────────────

  private async getInvoicesMissingHsn(periodStart: string, periodEnd: string): Promise<AffectedItem[]> {
    const rows = await this.db
      .select({
        id: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
        invoiceDate: salesInvoices.invoiceDate,
        totalAmount: salesInvoices.totalAmount,
      })
      .from(salesInvoices)
      .innerJoin(salesInvoiceItems, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        gte(salesInvoices.invoiceDate, periodStart),
        lte(salesInvoices.invoiceDate, periodEnd),
        notInArray(salesInvoices.status, ['draft', 'cancelled']),
        or(isNull(salesInvoiceItems.hsnSacCode), eq(salesInvoiceItems.hsnSacCode, '')),
      ))
      .groupBy(salesInvoices.id, salesInvoices.invoiceNumber, salesInvoices.invoiceDate, salesInvoices.totalAmount);

    return rows.map((r) => ({
      id: r.id,
      label: r.invoiceNumber,
      sublabel: `${r.invoiceDate} — Rs ${Number(r.totalAmount).toLocaleString('en-IN')}`,
      link: `/ar/invoices/${r.id}/edit`,
    }));
  }

  private async getInvoicesMissingPos(periodStart: string, periodEnd: string): Promise<AffectedItem[]> {
    const rows = await this.db
      .select({
        id: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
        invoiceDate: salesInvoices.invoiceDate,
      })
      .from(salesInvoices)
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        gte(salesInvoices.invoiceDate, periodStart),
        lte(salesInvoices.invoiceDate, periodEnd),
        notInArray(salesInvoices.status, ['draft', 'cancelled']),
        or(isNull(salesInvoices.placeOfSupplyCode), eq(salesInvoices.placeOfSupplyCode, '')),
      ));

    return rows.map((r) => ({
      id: r.id,
      label: r.invoiceNumber,
      sublabel: r.invoiceDate,
      link: `/ar/invoices/${r.id}/edit`,
    }));
  }

  private async getCustomersMissingGstin(): Promise<AffectedItem[]> {
    const rows = await this.db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(
        eq(customers.tenantId, this.tenantId),
        eq(customers.isActive, true),
        eq(customers.type, 'b2b'),
        or(isNull(customers.gstin), eq(customers.gstin, '')),
      ))
      .limit(20);

    return rows.map((r) => ({
      id: r.id,
      label: r.name,
      link: `/ar/customers/${r.id}`,
    }));
  }

  private async getPendingBills(periodStart: string, periodEnd: string): Promise<AffectedItem[]> {
    const rows = await this.db
      .select({
        id: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        invoiceDate: purchaseInvoices.invoiceDate,
        totalAmount: purchaseInvoices.totalAmount,
        status: purchaseInvoices.status,
      })
      .from(purchaseInvoices)
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        gte(purchaseInvoices.invoiceDate, periodStart),
        lte(purchaseInvoices.invoiceDate, periodEnd),
        inArray(purchaseInvoices.status, ['pending_match', 'matched']),
      ))
      .limit(20);

    return rows.map((r) => ({
      id: r.id,
      label: r.invoiceNumber,
      sublabel: `${r.invoiceDate} — Rs ${Number(r.totalAmount).toLocaleString('en-IN')} — ${r.status}`,
      link: `/ap/bills/${r.id}`,
    }));
  }

  // ── Internal checks ──────────────────────────────────────────────────

  private async getTenantGstConfig(): Promise<{
    gstinConfigured: boolean;
    usernameConfigured: boolean;
    gstFilingStartPeriod: string | null;
  }> {
    const [row] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId));
    const s = (row?.settings ?? {}) as TenantSettings;
    return {
      gstinConfigured: !!s.gstin,
      usernameConfigured: !!s.gstUsername,
      gstFilingStartPeriod: s.gstFilingStartPeriod ?? null,
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

  /** Returns true if periodA (MMYYYY) is strictly before periodB (MMYYYY). */
  private periodIsBefore(a: string, b: string): boolean {
    const aMonth = parseInt(a.substring(0, 2), 10);
    const aYear = parseInt(a.substring(2), 10);
    const bMonth = parseInt(b.substring(0, 2), 10);
    const bYear = parseInt(b.substring(2), 10);
    return aYear < bYear || (aYear === bYear && aMonth < bMonth);
  }
}
