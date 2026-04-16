import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import {
  gstr2bData, gstr2bMatches, purchaseInvoices, vendors, tenants,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { Gstr2bEntry } from '@runq/db';
import { createGspClient } from './gsp-client';
import type { GspAuthToken } from './gsp-client';
import { NotFoundError, ConflictError } from '../../utils/errors';

type Gstr2bDataRow = typeof gstr2bData.$inferSelect;
type MatchRow = typeof gstr2bMatches.$inferSelect;

interface ReconciliationSummary {
  matched: { count: number; taxableValue: number };
  mismatched: { count: number; taxableValue: number };
  notInBooks: { count: number; taxableValue: number };
  notIn2b: { count: number; taxableValue: number };
  totalItcAvailable: number;
  totalItcClaimable: number;  // only matched
}

const VALUE_TOLERANCE = 2; // Rs 2 tolerance for rounding differences

export class Gstr2bReconciliationService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  // ── Pull 2B from GSTN ────────────────────────────────────────────────

  async pull2b(period: string, token: GspAuthToken): Promise<Gstr2bDataRow> {
    const gsp = createGspClient();
    const { gstin, gstUsername } = await this.getProfile();
    const rawData = await gsp.getGstr2b(token, gstin, gstUsername, period);

    // Upsert — replace if already pulled for this period
    const [existing] = await this.db
      .select()
      .from(gstr2bData)
      .where(and(
        eq(gstr2bData.tenantId, this.tenantId),
        eq(gstr2bData.period, period),
      ));

    if (existing) {
      // Clear old matches
      await this.db.delete(gstr2bMatches).where(eq(gstr2bMatches.gstr2bId, existing.id));
      const [updated] = await this.db
        .update(gstr2bData)
        .set({ data: rawData, pulledAt: new Date() })
        .where(eq(gstr2bData.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await this.db
      .insert(gstr2bData)
      .values({
        tenantId: this.tenantId,
        gstin,
        period,
        data: rawData,
      })
      .returning();

    return created;
  }

  // ── Get stored 2B data ───────────────────────────────────────────────

  async get2b(period: string): Promise<Gstr2bDataRow | null> {
    const [row] = await this.db
      .select()
      .from(gstr2bData)
      .where(and(
        eq(gstr2bData.tenantId, this.tenantId),
        eq(gstr2bData.period, period),
      ));
    return row ?? null;
  }

  // ── Run reconciliation ───────────────────────────────────────────────

  async reconcile(period: string): Promise<ReconciliationSummary> {
    const stored = await this.get2b(period);
    if (!stored) throw new ConflictError('Pull GSTR-2B first before reconciling');

    // Parse 2B entries from raw data
    const entries2b = this.parse2bEntries(stored.data);

    // Get purchase invoices for this period
    const { periodStart, periodEnd } = this.periodToDateRange(period);
    const bills = await this.db
      .select({
        id: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        invoiceDate: purchaseInvoices.invoiceDate,
        subtotal: purchaseInvoices.subtotal,
        igstAmount: purchaseInvoices.igstAmount,
        cgstAmount: purchaseInvoices.cgstAmount,
        sgstAmount: purchaseInvoices.sgstAmount,
        vendorGstin: vendors.gstin,
        vendorName: vendors.name,
      })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId))
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        gte(purchaseInvoices.invoiceDate, periodStart),
        lte(purchaseInvoices.invoiceDate, periodEnd),
        inArray(purchaseInvoices.status, ['approved', 'partially_paid', 'paid']),
      ));

    // Clear previous matches for this 2B
    await this.db.delete(gstr2bMatches).where(eq(gstr2bMatches.gstr2bId, stored.id));

    // Build lookup: normalize(gstin + invoiceNumber) → bill
    const billMap = new Map<string, typeof bills[number]>();
    for (const bill of bills) {
      if (bill.vendorGstin) {
        const key = this.matchKey(bill.vendorGstin, bill.invoiceNumber);
        billMap.set(key, bill);
      }
    }

    const matchRows: Array<typeof gstr2bMatches.$inferInsert> = [];
    const matched2bKeys = new Set<string>();

    // Match 2B entries against books
    for (const entry of entries2b) {
      const key = this.matchKey(entry.supplierGstin, entry.invoiceNumber);
      const bill = billMap.get(key) ?? this.fuzzyMatch(entry, billMap);

      if (bill) {
        matched2bKeys.add(this.matchKey(bill.vendorGstin!, bill.invoiceNumber));
        const taxableDiff = Math.abs(entry.taxableValue - Number(bill.subtotal));
        const isMatch = taxableDiff <= VALUE_TOLERANCE;

        matchRows.push({
          tenantId: this.tenantId,
          gstr2bId: stored.id,
          period,
          supplierGstin: entry.supplierGstin,
          supplierName: entry.supplierName,
          invoiceNumber2b: entry.invoiceNumber,
          invoiceDate2b: entry.invoiceDate,
          taxableValue2b: String(entry.taxableValue),
          igst2b: String(entry.igstAmount),
          cgst2b: String(entry.cgstAmount),
          sgst2b: String(entry.sgstAmount),
          purchaseInvoiceId: bill.id,
          invoiceNumberBooks: bill.invoiceNumber,
          taxableValueBooks: bill.subtotal,
          igstBooks: bill.igstAmount,
          cgstBooks: bill.cgstAmount,
          sgstBooks: bill.sgstAmount,
          matchStatus: isMatch ? 'matched' : 'mismatched',
          valueDiff: String(taxableDiff),
        });
      } else {
        matchRows.push({
          tenantId: this.tenantId,
          gstr2bId: stored.id,
          period,
          supplierGstin: entry.supplierGstin,
          supplierName: entry.supplierName,
          invoiceNumber2b: entry.invoiceNumber,
          invoiceDate2b: entry.invoiceDate,
          taxableValue2b: String(entry.taxableValue),
          igst2b: String(entry.igstAmount),
          cgst2b: String(entry.cgstAmount),
          sgst2b: String(entry.sgstAmount),
          matchStatus: 'not_in_books',
        });
      }
    }

    // Bills not in 2B
    for (const bill of bills) {
      if (!bill.vendorGstin) continue;
      const key = this.matchKey(bill.vendorGstin, bill.invoiceNumber);
      if (!matched2bKeys.has(key)) {
        matchRows.push({
          tenantId: this.tenantId,
          gstr2bId: stored.id,
          period,
          supplierGstin: bill.vendorGstin,
          supplierName: bill.vendorName,
          invoiceNumber2b: '',
          invoiceDate2b: '',
          taxableValue2b: '0',
          igst2b: '0',
          cgst2b: '0',
          sgst2b: '0',
          purchaseInvoiceId: bill.id,
          invoiceNumberBooks: bill.invoiceNumber,
          taxableValueBooks: bill.subtotal,
          igstBooks: bill.igstAmount,
          cgstBooks: bill.cgstAmount,
          sgstBooks: bill.sgstAmount,
          matchStatus: 'not_in_2b',
          valueDiff: bill.subtotal,
        });
      }
    }

    // Insert all matches
    if (matchRows.length > 0) {
      await this.db.insert(gstr2bMatches).values(matchRows);
    }

    return this.computeSummary(matchRows as Array<{ matchStatus: string; taxableValue2b: string; igst2b: string; cgst2b: string; sgst2b: string }>);
  }

  // ── Get match results ────────────────────────────────────────────────

  async getMatches(period: string, status?: string): Promise<MatchRow[]> {
    const conditions = [
      eq(gstr2bMatches.tenantId, this.tenantId),
      eq(gstr2bMatches.period, period),
    ];
    if (status) {
      conditions.push(eq(gstr2bMatches.matchStatus, status as any));
    }

    return this.db
      .select()
      .from(gstr2bMatches)
      .where(and(...conditions));
  }

  // ── Get reconciliation summary ───────────────────────────────────────

  async getSummary(period: string): Promise<ReconciliationSummary> {
    const matches = await this.getMatches(period);
    return this.computeSummary(matches as any);
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private matchKey(gstin: string, invoiceNumber: string): string {
    return `${gstin}|${this.normalizeInvNum(invoiceNumber)}`;
  }

  /** Normalize invoice number: strip spaces, dashes, slashes, lowercase */
  private normalizeInvNum(num: string): string {
    return num.replace(/[\s\-\/\\]/g, '').toLowerCase();
  }

  /** Fuzzy match: try matching with normalized invoice numbers across all bills */
  private fuzzyMatch(
    entry: Gstr2bEntry,
    billMap: Map<string, { id: string; invoiceNumber: string; subtotal: string; igstAmount: string; cgstAmount: string; sgstAmount: string; vendorGstin: string | null; vendorName: string }>,
  ) {
    const normalized2b = this.normalizeInvNum(entry.invoiceNumber);
    for (const [key, bill] of billMap) {
      const [gstin] = key.split('|');
      if (gstin !== entry.supplierGstin) continue;
      // Try: does the normalized book invoice end/start with the 2B number?
      const normalizedBook = this.normalizeInvNum(bill.invoiceNumber);
      if (normalizedBook.endsWith(normalized2b) || normalized2b.endsWith(normalizedBook)) {
        return bill;
      }
    }
    return null;
  }

  private computeSummary(matches: Array<{ matchStatus: string; taxableValue2b: string; igst2b: string; cgst2b: string; sgst2b: string }>): ReconciliationSummary {
    const summary: ReconciliationSummary = {
      matched: { count: 0, taxableValue: 0 },
      mismatched: { count: 0, taxableValue: 0 },
      notInBooks: { count: 0, taxableValue: 0 },
      notIn2b: { count: 0, taxableValue: 0 },
      totalItcAvailable: 0,
      totalItcClaimable: 0,
    };

    for (const m of matches) {
      const tv = Number(m.taxableValue2b);
      const itc = Number(m.igst2b) + Number(m.cgst2b) + Number(m.sgst2b);
      switch (m.matchStatus) {
        case 'matched':
          summary.matched.count++;
          summary.matched.taxableValue += tv;
          summary.totalItcClaimable += itc;
          break;
        case 'mismatched':
          summary.mismatched.count++;
          summary.mismatched.taxableValue += tv;
          break;
        case 'not_in_books':
          summary.notInBooks.count++;
          summary.notInBooks.taxableValue += tv;
          break;
        case 'not_in_2b':
          summary.notIn2b.count++;
          summary.notIn2b.taxableValue += tv;
          break;
      }
      summary.totalItcAvailable += itc;
    }

    return summary;
  }

  private async getProfile(): Promise<{ gstin: string; gstUsername: string }> {
    const [tenant] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId));
    const s = tenant?.settings as Record<string, unknown> | undefined;
    const gstin = (s?.gstin as string) || '';
    const gstUsername = (s?.gstUsername as string) || '';
    if (!gstin) throw new ConflictError('Company GSTIN not configured');
    return { gstin, gstUsername };
  }

  private parse2bEntries(rawData: unknown): Gstr2bEntry[] {
    // GSTN 2B structure: data.docdata.b2b[] -> each has ctin (supplier GSTIN) and inv[]
    const data = rawData as any;
    const entries: Gstr2bEntry[] = [];

    const b2bDocs = data?.docdata?.b2b ?? data?.b2b ?? [];
    for (const supplier of b2bDocs) {
      const gstin = supplier.ctin || supplier.supplierGstin || '';
      const name = supplier.trdnm || supplier.supplierName || '';
      const invoices = supplier.inv || supplier.invoices || [];
      for (const inv of invoices) {
        const items = inv.itms || inv.items || [];
        let taxableValue = 0, igst = 0, cgst = 0, sgst = 0, cess = 0, rate = 0;
        for (const item of items) {
          const det = item.itm_det || item;
          taxableValue += det.txval || det.taxableValue || 0;
          igst += det.iamt || det.igstAmount || 0;
          cgst += det.camt || det.cgstAmount || 0;
          sgst += det.samt || det.sgstAmount || 0;
          cess += det.csamt || det.cessAmount || 0;
          rate = det.rt || det.gstRate || rate;
        }
        entries.push({
          supplierGstin: gstin,
          supplierName: name,
          invoiceNumber: inv.inum || inv.invoiceNumber || '',
          invoiceDate: inv.idt || inv.invoiceDate || '',
          invoiceValue: inv.val || inv.invoiceValue || 0,
          taxableValue,
          igstAmount: igst,
          cgstAmount: cgst,
          sgstAmount: sgst,
          cessAmount: cess,
          gstRate: rate,
          placeOfSupply: inv.pos || '',
          reverseCharge: (inv.rchrg === 'Y' || inv.reverseCharge === true),
        });
      }
    }

    return entries;
  }

  private periodToDateRange(period: string): { periodStart: string; periodEnd: string } {
    const month = parseInt(period.substring(0, 2), 10);
    const year = parseInt(period.substring(2), 10);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    return { periodStart: fmt(start), periodEnd: fmt(end) };
  }
}
