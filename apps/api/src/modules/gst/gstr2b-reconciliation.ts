import { eq, and, gte, lte, inArray, sql, desc } from 'drizzle-orm';
import {
  gstr2bData, gstr2bMatches, gstItcDecisions, purchaseInvoices, vendors, tenants, gspAuthTokens,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { Gstr2bEntry, Gstr3bData } from '@runq/db';
import { createGspClient } from './gsp-client';
import type { GspAuthToken } from './gsp-client';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { INDIAN_STATES } from '../../utils/indian-states';
import { PurchaseInvoiceService } from '../ap/purchase-invoice.service';

type Gstr2bDataRow = typeof gstr2bData.$inferSelect;
type MatchRow = typeof gstr2bMatches.$inferSelect;
export type ItcIneligReason = 'sec_17_5' | 'personal' | 'not_our_supply' | 'other';
type EnrichedMatchRow = MatchRow & {
  itcEligibility: 'eligible' | 'ineligible';
  ineligibleReason: ItcIneligReason | null;
};

interface ReconciliationSummary {
  matched: { count: number; taxableValue: number };
  mismatched: { count: number; taxableValue: number };
  notInBooks: { count: number; taxableValue: number };
  notIn2b: { count: number; taxableValue: number };
  totalItcAvailable: number;
  totalItcClaimable: number;  // only matched
  ineligibleItc: number;      // tenant-flagged ineligible, reversed in 3B Table 4(B)
}

const VALUE_TOLERANCE = 2; // Rs 2 tolerance for rounding differences

type TaxTotals = { igst: number; cgst: number; sgst: number; cess: number };
const zeroTax = (): TaxTotals => ({ igst: 0, cgst: 0, sgst: 0, cess: 0 });
const addTax = (a: TaxTotals, b: TaxTotals): TaxTotals => ({
  igst: a.igst + b.igst, cgst: a.cgst + b.cgst, sgst: a.sgst + b.sgst, cess: a.cess + b.cess,
});
const subTax = (a: TaxTotals, b: TaxTotals): TaxTotals => ({
  igst: a.igst - b.igst, cgst: a.cgst - b.cgst, sgst: a.sgst - b.sgst, cess: a.cess - b.cess,
});

export type Itc2bEntry = {
  supplierGstin: string;
  invoiceNumber: string;
  reverseCharge: boolean;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  cessAmount: number;
};

// A 2B credit/debit note. Amounts are the ITC REDUCTION (positive for a credit
// note, negative for a debit note), so they always subtract from ITC available
// — mirroring how GSTN nets `cdnr` against `b2b` in its 2B `itcsumm`.
export type Itc2bCreditNote = {
  supplierGstin: string;
  reverseCharge: boolean;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  cessAmount: number;
};

/**
 * Build GSTR-3B Table 4 from parsed 2B entries. The full 2B B2B ITC is claimed
 * into 4(A), then **credit notes (cdnr) are netted off** — exactly as GSTN does
 * in its 2B `itcsumm` (nonrevsup.b2b − othersup.cdnr) — so 4(A) matches GSTN's
 * auto-population. Lines the tenant flagged ineligible (looked up via the
 * caller's normalized key) are reversed in 4(B): sec_17_5/personal → 4(B)(1)
 * (rules 38/42/43 & §17(5)), not_our_supply/other → 4(B)(2). A credit note from
 * a supplier whose supplies are flagged ineligible also reduces that reversal,
 * so a fully-ineligible supplier still nets to zero. Net ITC (4C) = available −
 * reversed. Pure & deterministic — no DB, no rounding.
 */
export function buildItcTable4(
  entries: Itc2bEntry[],
  creditNotes: Itc2bCreditNote[],
  ineligibleReasonByKey: Map<string, ItcIneligReason>,
  keyOf: (gstin: string, invoiceNumber: string) => string,
): Gstr3bData['table4'] {
  const rcm = zeroTax();
  const allOther = zeroTax();
  const rule4243 = zeroTax();   // 4(B)(1)
  const others = zeroTax();     // 4(B)(2)

  // Supplier-level ineligibility, so a credit note (which has its own doc no)
  // can be matched to a flagged supplier. A supplier is ineligible if any of
  // its invoices is flagged; its CN inherits the same reason/bucket.
  const reasonByGstin = new Map<string, ItcIneligReason>();
  for (const [k, r] of ineligibleReasonByKey) reasonByGstin.set(k.split('|')[0], r);
  const bucketFor = (reason: ItcIneligReason) =>
    reason === 'sec_17_5' || reason === 'personal' ? rule4243 : others;

  for (const e of entries) {
    const tax: TaxTotals = { igst: e.igstAmount, cgst: e.cgstAmount, sgst: e.sgstAmount, cess: e.cessAmount };
    if (e.reverseCharge) Object.assign(rcm, addTax(rcm, tax));
    else Object.assign(allOther, addTax(allOther, tax));
    const reason = ineligibleReasonByKey.get(keyOf(e.supplierGstin, e.invoiceNumber));
    if (reason) Object.assign(bucketFor(reason), addTax(bucketFor(reason), tax));
  }

  for (const c of creditNotes) {
    const tax: TaxTotals = { igst: c.igstAmount, cgst: c.cgstAmount, sgst: c.sgstAmount, cess: c.cessAmount };
    if (c.reverseCharge) Object.assign(rcm, subTax(rcm, tax));
    else Object.assign(allOther, subTax(allOther, tax));
    const reason = reasonByGstin.get(c.supplierGstin);
    if (reason) Object.assign(bucketFor(reason), subTax(bucketFor(reason), tax));
  }

  const available = addTax(rcm, allOther);
  const reversed = addTax(rule4243, others);
  return {
    itcAvailable: {
      importGoods: zeroTax(),
      importServices: zeroTax(),
      inwardReverseCharge: rcm,
      isd: zeroTax(),
      allOtherItc: allOther,
    },
    itcReversed: { rule4243, others },
    netItc: {
      igst: available.igst - reversed.igst,
      cgst: available.cgst - reversed.cgst,
      sgst: available.sgst - reversed.sgst,
      cess: available.cess - reversed.cess,
    },
  };
}

export class Gstr2bReconciliationService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  // ── Pull 2B from GSTN ────────────────────────────────────────────────

  async pull2b(period: string, token?: GspAuthToken): Promise<Gstr2bDataRow> {
    const gsp = createGspClient();
    const { gstin, gstUsername } = await this.getProfile();
    const authToken = token ?? await this.getValidToken(gstin);
    const rawData = await gsp.getGstr2b(authToken, gstin, gstUsername, period);

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

  // ── Compute ITC from stored 2B data for GSTR-3B Table 4 ─────────────

  async computeItcFrom2b(period: string): Promise<Gstr3bData['table4'] | null> {
    const stored = await this.get2b(period);
    if (!stored) return null;

    const entries = this.parse2bEntries(stored.data);
    const creditNotes = this.parseCreditNotes2b(stored.data);
    if (entries.length === 0 && creditNotes.length === 0) return null;

    // Tenant-flagged ineligible lines → reversed in Table 4(B). Keyed by the
    // same normalized (gstin|invoice) key reconciliation uses, so the lookup
    // is robust to invoice-number formatting differences.
    const decisions = await this.getDecisions(period);
    const ineligibleReasonByKey = new Map<string, ItcIneligReason>(
      decisions.map((d) => [this.matchKey(d.supplierGstin, d.docNo), d.reason as ItcIneligReason]),
    );
    return buildItcTable4(entries, creditNotes, ineligibleReasonByKey, (g, i) => this.matchKey(g, i));
  }

  // ── ITC eligibility decisions ────────────────────────────────────────

  /** All ineligible-ITC decisions the tenant has recorded for a period. */
  async getDecisions(period: string): Promise<Array<typeof gstItcDecisions.$inferSelect>> {
    return this.db
      .select()
      .from(gstItcDecisions)
      .where(and(
        eq(gstItcDecisions.tenantId, this.tenantId),
        eq(gstItcDecisions.period, period),
      ));
  }

  /**
   * Classify a 2B line's ITC as eligible or ineligible. Resolves the match to
   * its stable 2B identity (period + supplier GSTIN + doc no) and persists the
   * decision there — so it survives the next pull/reconcile, which rebuilds
   * match rows. `eligible` deletes any prior decision; ineligible upserts the
   * reason. The 3B generator reverses ineligible lines in Table 4(B).
   */
  async setEligibility(
    matchId: string,
    input: { eligible: boolean; reason?: ItcIneligReason; note?: string | null },
  ): Promise<{ eligible: boolean; reason?: ItcIneligReason }> {
    const [match] = await this.db
      .select()
      .from(gstr2bMatches)
      .where(and(eq(gstr2bMatches.id, matchId), eq(gstr2bMatches.tenantId, this.tenantId)))
      .limit(1);
    if (!match) throw new NotFoundError('GSTR-2B match');
    if (!match.invoiceNumber2b) {
      // not_in_2b rows aren't in GSTN's 2B, so there's no ITC to claim/reverse.
      throw new ConflictError('Only supplies present in GSTR-2B can be classified for ITC');
    }

    const key = {
      tenantId: this.tenantId,
      period: match.period,
      supplierGstin: match.supplierGstin,
      docNo: match.invoiceNumber2b,
    };

    if (input.eligible) {
      await this.db.delete(gstItcDecisions).where(and(
        eq(gstItcDecisions.tenantId, key.tenantId),
        eq(gstItcDecisions.period, key.period),
        eq(gstItcDecisions.supplierGstin, key.supplierGstin),
        eq(gstItcDecisions.docNo, key.docNo),
      ));
      return { eligible: true };
    }

    if (!input.reason) throw new ConflictError('A reason is required to mark ITC ineligible');
    await this.db
      .insert(gstItcDecisions)
      .values({ ...key, reason: input.reason, note: input.note ?? null })
      .onConflictDoUpdate({
        target: [gstItcDecisions.tenantId, gstItcDecisions.period, gstItcDecisions.supplierGstin, gstItcDecisions.docNo],
        set: { reason: input.reason, note: input.note ?? null, updatedAt: new Date() },
      });
    return { eligible: false, reason: input.reason };
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

  async getMatches(period: string, status?: string): Promise<EnrichedMatchRow[]> {
    const conditions = [
      eq(gstr2bMatches.tenantId, this.tenantId),
      eq(gstr2bMatches.period, period),
    ];
    if (status) {
      conditions.push(eq(gstr2bMatches.matchStatus, status as any));
    }

    const rows = await this.db
      .select()
      .from(gstr2bMatches)
      .where(and(...conditions));

    const reasonByKey = new Map(
      (await this.getDecisions(period)).map((d) => [this.matchKey(d.supplierGstin, d.docNo), d.reason]),
    );
    return rows.map((r) => {
      const reason = r.invoiceNumber2b
        ? reasonByKey.get(this.matchKey(r.supplierGstin, r.invoiceNumber2b)) ?? null
        : null;
      return { ...r, itcEligibility: reason ? 'ineligible' : 'eligible', ineligibleReason: reason };
    });
  }

  // ── Get reconciliation summary ───────────────────────────────────────

  async getSummary(period: string): Promise<ReconciliationSummary> {
    const matches = await this.getMatches(period);
    const base = this.computeSummary(matches as any);
    const ineligibleItc = matches
      .filter((m) => m.itcEligibility === 'ineligible')
      .reduce((s, m) => s + Number(m.igst2b) + Number(m.cgst2b) + Number(m.sgst2b), 0);
    return { ...base, ineligibleItc };
  }

  /**
   * List every 2B period the tenant has pulled, with a per-period rollup
   * so the reconciliation screen can show an at-a-glance history without
   * the user having to step through periods one by one.
   */
  async listReconciledPeriods(): Promise<Array<{
    period: string;
    pulledAt: Date | null;
    summary: ReconciliationSummary;
  }>> {
    // One round-trip: fetch all matches for the tenant + their parent
    // gstr2bData rows (for pulledAt), then group in memory. Tenants
    // rarely have >24 months of 2B history, so the bounded scan is fine.
    const rows = await this.db
      .select({
        period: gstr2bMatches.period,
        matchStatus: gstr2bMatches.matchStatus,
        taxableValue2b: gstr2bMatches.taxableValue2b,
        igst2b: gstr2bMatches.igst2b,
        cgst2b: gstr2bMatches.cgst2b,
        sgst2b: gstr2bMatches.sgst2b,
      })
      .from(gstr2bMatches)
      .where(eq(gstr2bMatches.tenantId, this.tenantId));

    const pulled = await this.db
      .select({ period: gstr2bData.period, pulledAt: gstr2bData.pulledAt })
      .from(gstr2bData)
      .where(eq(gstr2bData.tenantId, this.tenantId));
    const pulledByPeriod = new Map(pulled.map((p) => [p.period, p.pulledAt]));

    const byPeriod = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = byPeriod.get(r.period) ?? [];
      list.push(r);
      byPeriod.set(r.period, list);
    }

    const out = Array.from(byPeriod.entries()).map(([period, matches]) => ({
      period,
      pulledAt: pulledByPeriod.get(period) ?? null,
      summary: this.computeSummary(matches as any),
    }));
    // Newest period first.
    out.sort((a, b) => b.period.slice(2).concat(b.period.slice(0, 2))
      .localeCompare(a.period.slice(2).concat(a.period.slice(0, 2))));
    return out;
  }

  // ── Book a 2B entry into the ledger as a draft purchase invoice ──────

  /**
   * Convert a `not_in_books` 2B match into a draft purchase invoice so
   * the owner can claim the ITC. Resolves the vendor (auto if uncontested,
   * else returns candidate duplicates for the caller to pick from), then
   * creates a draft bill with rate derived from the 2B tax/taxable ratio.
   * The bill is in `draft` status — the owner approves it before posting.
   */
  async bookFromMatch(
    matchId: string,
    options?: BookFromMatchOptions,
    userId?: string,
  ): Promise<BookFromMatchResult> {
    const [match] = await this.db
      .select()
      .from(gstr2bMatches)
      .where(and(eq(gstr2bMatches.id, matchId), eq(gstr2bMatches.tenantId, this.tenantId)))
      .limit(1);
    if (!match) throw new NotFoundError('GSTR-2B match');
    if (match.matchStatus !== 'not_in_books') {
      throw new ConflictError('Only "not in books" entries can be booked');
    }

    const resolution = await this.resolveVendor(match.supplierGstin, match.supplierName, options);
    if (resolution.kind === 'needs_decision') {
      return { status: 'needs_vendor_decision', candidates: resolution.candidates };
    }
    const vendorId = resolution.vendorId;

    const invoiceDate = parseDdMmYyyy(match.invoiceDate2b)
      ?? new Date().toISOString().slice(0, 10);

    const taxable = Number(match.taxableValue2b);
    const tax = Number(match.igst2b) + Number(match.cgst2b) + Number(match.sgst2b);
    // Rate snapped to 2dp — the create-bill service recomputes cgst/sgst/igst
    // from this rate against the buyer/seller state so the per-line tax
    // columns are consistent. Owner can adjust before approving.
    const taxRate = taxable > 0 ? Math.round((tax / taxable) * 10000) / 100 : 0;
    const totalAmount = Math.round((taxable + tax) * 100) / 100;

    const billSvc = new PurchaseInvoiceService(this.db, this.tenantId);
    const bill = await billSvc.create({
      vendorId,
      invoiceNumber: match.invoiceNumber2b,
      invoiceDate,
      dueDate: invoiceDate,
      items: [{
        itemName: `From GSTR-2B: ${match.invoiceNumber2b}`,
        quantity: 1,
        unitPrice: taxable,
        amount: taxable,
        taxCategory: tax > 0 ? 'taxable' : 'exempt',
        taxRate,
      }],
      subtotal: taxable,
      taxAmount: tax,
      totalAmount,
      reverseCharge: false,
    } as Parameters<PurchaseInvoiceService['create']>[0], userId);

    const taxableDiff = Math.abs(taxable - Number(bill.subtotal));
    const newStatus: 'matched' | 'mismatched' = taxableDiff <= VALUE_TOLERANCE ? 'matched' : 'mismatched';
    await this.db
      .update(gstr2bMatches)
      .set({
        purchaseInvoiceId: bill.id,
        invoiceNumberBooks: bill.invoiceNumber,
        taxableValueBooks: String(bill.subtotal),
        igstBooks: String(bill.igstAmount),
        cgstBooks: String(bill.cgstAmount),
        sgstBooks: String(bill.sgstAmount),
        matchStatus: newStatus,
        valueDiff: String(taxableDiff),
      })
      .where(eq(gstr2bMatches.id, matchId));

    return { status: 'booked', billId: bill.id, vendorId, matchStatus: newStatus };
  }

  /**
   * Decide which vendor the new bill should attach to. Three paths:
   *  1. Caller forced `use_existing` → patch that vendor's GSTIN to the 2B
   *     value (covers the typo-fix case) and use it.
   *  2. Caller forced `create_new` → skip duplicate detection.
   *  3. Auto → exact GSTIN match wins; otherwise scan for near-duplicates
   *     and bounce the decision back to the caller if any are found.
   */
  private async resolveVendor(
    gstin: string,
    supplierName: string | null,
    options?: BookFromMatchOptions,
  ): Promise<{ kind: 'resolved'; vendorId: string } | { kind: 'needs_decision'; candidates: VendorCandidate[] }> {
    if (options?.vendorAction === 'use_existing' && options.existingVendorId) {
      await this.db.update(vendors)
        .set({ gstin, updatedAt: new Date() })
        .where(and(eq(vendors.id, options.existingVendorId), eq(vendors.tenantId, this.tenantId)));
      return { kind: 'resolved', vendorId: options.existingVendorId };
    }
    if (options?.vendorAction === 'create_new') {
      return { kind: 'resolved', vendorId: await this.createVendor(gstin, supplierName) };
    }

    const [exact] = await this.db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.tenantId, this.tenantId), eq(vendors.gstin, gstin)))
      .limit(1);
    if (exact) return { kind: 'resolved', vendorId: exact.id };

    const candidates = await this.findDuplicateCandidates(gstin, supplierName);
    if (candidates.length > 0) return { kind: 'needs_decision', candidates };

    return { kind: 'resolved', vendorId: await this.createVendor(gstin, supplierName) };
  }

  /**
   * Three signals that flag an existing vendor as "probably the same entity":
   *  - GSTIN positions 3-12 match (same PAN — same legal entity, maybe a
   *    different state branch, but also catches typos in state-code/checksum).
   *  - Levenshtein distance 1 on GSTIN (single-char typo — Padma Q↔O case).
   *  - Normalized name match when GSTIN is absent or unrelated (Electrotech
   *    case where the books vendor had the tenant's own GSTIN by mistake).
   * Returns the candidate vendors so the caller can decide merge vs new.
   */
  private async findDuplicateCandidates(
    gstin: string,
    supplierName: string | null,
  ): Promise<VendorCandidate[]> {
    const panPortion = gstin.length === 15 ? gstin.slice(2, 12) : '';
    const normName = normalizeName(supplierName ?? '');

    const all = await this.db
      .select({ id: vendors.id, name: vendors.name, gstin: vendors.gstin })
      .from(vendors)
      .where(eq(vendors.tenantId, this.tenantId));

    const out: VendorCandidate[] = [];
    for (const v of all) {
      if (v.gstin === gstin) continue;
      if (v.gstin && v.gstin.length === 15 && panPortion && v.gstin.slice(2, 12) === panPortion) {
        out.push({ id: v.id, name: v.name, gstin: v.gstin, reason: 'same_pan' });
        continue;
      }
      if (v.gstin && v.gstin.length === 15 && levenshtein1(v.gstin, gstin)) {
        out.push({ id: v.id, name: v.name, gstin: v.gstin, reason: 'gstin_typo' });
        continue;
      }
      if (normName && normName.length >= 4 && normalizeName(v.name) === normName) {
        out.push({ id: v.id, name: v.name, gstin: v.gstin, reason: 'same_name' });
      }
    }
    return out;
  }

  private async createVendor(gstin: string, supplierName: string | null): Promise<string> {
    const stateCode = gstin.slice(0, 2);
    const stateName = INDIAN_STATES[stateCode] ?? null;
    const cleanName = (supplierName ?? '').replace(/,\s*$/, '').trim() || `Supplier ${gstin}`;
    const [created] = await this.db.insert(vendors).values({
      tenantId: this.tenantId,
      name: cleanName,
      gstin,
      state: stateName,
    }).returning({ id: vendors.id });
    return created!.id;
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
      ineligibleItc: 0,
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

  private async getValidToken(gstin: string): Promise<GspAuthToken> {
    const [cached] = await this.db
      .select()
      .from(gspAuthTokens)
      .where(and(
        eq(gspAuthTokens.tenantId, this.tenantId),
        eq(gspAuthTokens.gstin, gstin),
      ))
      .orderBy(desc(gspAuthTokens.createdAt))
      .limit(1);

    if (cached && new Date(cached.expiresAt) > new Date()) {
      return { accessToken: cached.accessToken, txn: cached.txn || '', expiresAt: new Date(cached.expiresAt) };
    }

    throw new ConflictError('GST portal session expired. Please authenticate again with OTP.');
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
    // GSTN 2B response can be nested in multiple ways depending on the GSP wrapper:
    //   result.data.docdata.b2b[]  (White Books wraps in data)
    //   result.docdata.b2b[]       (direct GSTN structure)
    //   result.b2b[]               (flattened)
    // White Books response: { data: { chksum, data: { docdata: { b2b: [...] } } }, status_cd, ... }
    // Navigate through the nested data layers to find b2b entries.
    const root = rawData as any;
    const entries: Gstr2bEntry[] = [];

    // Drill through: root.data.data.docdata.b2b or any subset
    const l1 = root?.data ?? root;
    const l2 = l1?.data ?? l1;
    const docdata = l2?.docdata ?? l2;
    const b2bDocs = docdata?.b2b ?? [];

    let loggedSample = false;
    for (const supplier of b2bDocs) {
      const gstin = supplier.ctin || supplier.supplierGstin || '';
      const name = supplier.trdnm || supplier.supplierName || '';
      const invoices = supplier.inv || supplier.invoices || [];
      for (const inv of invoices) {
        // GSTN 2B can have tax values either as nested itms[] or flat on the invoice
        const items = inv.itms || inv.items || [];
        let taxableValue = 0, igst = 0, cgst = 0, sgst = 0, cess = 0, rate = 0;
        if (items.length > 0) {
          for (const item of items) {
            const det = item.itm_det || item;
            taxableValue += det.txval || det.taxableValue || 0;
            igst += det.iamt || det.igstAmount || 0;
            cgst += det.camt || det.cgstAmount || 0;
            sgst += det.samt || det.sgstAmount || 0;
            cess += det.csamt || det.cessAmount || 0;
            rate = det.rt || det.gstRate || rate;
          }
        } else {
          // Flat structure — values directly on invoice
          taxableValue = inv.txval || 0;
          igst = inv.igst || 0;
          cgst = inv.cgst || 0;
          sgst = inv.sgst || 0;
          cess = inv.cess || 0;
        }
        entries.push({
          supplierGstin: gstin,
          supplierName: name,
          invoiceNumber: inv.inum || inv.invoiceNumber || '',
          invoiceDate: inv.dt || inv.idt || inv.invoiceDate || '',
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

  /**
   * Parse 2B credit/debit notes (`docdata.cdnr`). Amounts are returned as the
   * ITC REDUCTION: a credit note (typ 'C') reduces ITC (positive), a debit note
   * (typ 'D') increases it (negative), so buildItcTable4 can subtract them
   * uniformly — matching GSTN's `itcsumm` which nets cdnr against b2b.
   */
  private parseCreditNotes2b(rawData: unknown): Itc2bCreditNote[] {
    const root = rawData as any;
    const l1 = root?.data ?? root;
    const l2 = l1?.data ?? l1;
    const docdata = l2?.docdata ?? l2;
    const cdnrDocs = docdata?.cdnr ?? [];
    const notes: Itc2bCreditNote[] = [];

    for (const supplier of cdnrDocs) {
      const gstin = supplier.ctin || supplier.supplierGstin || '';
      for (const nt of (supplier.nt || supplier.notes || [])) {
        // Debit notes add ITC; credit notes reduce it. Sign so the result is
        // always a reduction that buildItcTable4 subtracts.
        const sign = (nt.typ === 'D' || nt.ntty === 'D') ? -1 : 1;
        const items = nt.itms || nt.items || [];
        let igst = 0, cgst = 0, sgst = 0, cess = 0;
        if (items.length > 0) {
          for (const item of items) {
            const det = item.itm_det || item;
            igst += det.iamt || det.igstAmount || 0;
            cgst += det.camt || det.cgstAmount || 0;
            sgst += det.samt || det.sgstAmount || 0;
            cess += det.csamt || det.cessAmount || 0;
          }
        } else {
          igst = nt.igst || 0; cgst = nt.cgst || 0; sgst = nt.sgst || 0; cess = nt.cess || 0;
        }
        notes.push({
          supplierGstin: gstin,
          reverseCharge: (nt.rchrg === 'Y' || nt.reverseCharge === true),
          igstAmount: sign * igst,
          cgstAmount: sign * cgst,
          sgstAmount: sign * sgst,
          cessAmount: sign * cess,
        });
      }
    }

    return notes;
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

/** GSTN returns invoice_date as DD-MM-YYYY; bills store YYYY-MM-DD. */
function parseDdMmYyyy(s: string | null): string | null {
  if (!s) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Strip punctuation/whitespace and lowercase — for "same supplier name?" check. */
function normalizeName(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/**
 * True iff strings differ by exactly one substitution. Cheaper than
 * full Levenshtein and sufficient for catching GSTIN single-char typos
 * (length 15, equal length, one differing position).
 */
function levenshtein1(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diffs = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i] && ++diffs > 1) return false;
  }
  return diffs === 1;
}

export interface VendorCandidate {
  id: string;
  name: string;
  gstin: string | null;
  reason: 'same_pan' | 'gstin_typo' | 'same_name';
}

export interface BookFromMatchOptions {
  vendorAction?: 'use_existing' | 'create_new';
  existingVendorId?: string;
}

export type BookFromMatchResult =
  | { status: 'booked'; billId: string; vendorId: string; matchStatus: 'matched' | 'mismatched' }
  | { status: 'needs_vendor_decision'; candidates: VendorCandidate[] };
