import { eq, and, gte, lte, lt, inArray, notInArray, isNotNull, sql } from 'drizzle-orm';
import {
  salesInvoices, salesInvoiceItems, customers,
  creditNotes, creditNoteItems,
  customerDebitNotes, customerDebitNoteItems,
  hsnSacCodes, items as itemsTable,
  gstReturns, gstReturnInvoices,
  tenants,
} from '@runq/db';
import { toCanonical } from './uqc-conversion';
import type { Db } from '@runq/db';
import type {
  Gstr1Data, Gstr1B2BInvoice, Gstr1B2CSEntry, Gstr1CDNEntry,
  Gstr1HSNEntry, Gstr1DocSummary,
} from '@runq/db';

// ── Types ──────────────────────────────────────────────────────────────

type InvoiceRow = typeof salesInvoices.$inferSelect;
type InvoiceItemRow = typeof salesInvoiceItems.$inferSelect;
type CustomerRow = typeof customers.$inferSelect;

interface InvoiceWithItems {
  invoice: InvoiceRow;
  items: InvoiceItemRow[];
  customer: Pick<CustomerRow, 'id' | 'gstin' | 'state' | 'name'>;
}

export type ClassifiedInvoice = {
  invoiceId: string;
  section: 'b2b' | 'b2cs' | 'b2cl' | 'exp' | 'nil';
};

export type ClassifiedCreditNote = {
  creditNoteId: string;
  section: 'cdn';
};

interface TenantGstProfile {
  gstin: string;
  stateCode: string;
}

const B2CL_THRESHOLD = 250000; // Rs 2.5 lakh

// ── Classification ─────────────────────────────────────────────────────

/**
 * Classifies a sales invoice into the correct GSTR-1 section.
 *
 * - Has buyer GSTIN          → B2B (Table 4A)
 * - No GSTIN + inter-state + value > 2.5L → B2CL (Table 5A)
 * - No GSTIN + otherwise     → B2CS (Table 7)
 * - Nil/exempt/zero-rated only items      → NIL (Table 8)
 */
export function classifyInvoice(
  invoice: InvoiceRow,
  customer: Pick<CustomerRow, 'gstin'>,
  items: InvoiceItemRow[],
): 'b2b' | 'b2cs' | 'b2cl' | 'nil' {
  const allNilExempt = items.length > 0 && items.every(
    (it) => it.taxCategory === 'exempt' || it.taxCategory === 'nil_rated' || it.taxCategory === 'zero_rated',
  );
  if (allNilExempt) return 'nil';

  if (customer.gstin) return 'b2b';

  const totalValue = Number(invoice.totalAmount ?? 0);
  if (invoice.isInterState && totalValue > B2CL_THRESHOLD) return 'b2cl';

  return 'b2cs';
}

// ── GSTR-1 Generator ───────────────────────────────────────────────────

export class Gstr1Generator {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /**
   * Generates the full GSTR-1 data for a given period.
   * Returns the classified invoices (for linking) and the aggregated payload.
   */
  async generate(periodStart: string, periodEnd: string, _tenantProfile: TenantGstProfile): Promise<{
    data: Gstr1Data;
    classifiedInvoices: ClassifiedInvoice[];
    classifiedCreditNotes: ClassifiedCreditNote[];
  }> {
    const invoicesWithItems = await this.fetchInvoices(periodStart, periodEnd);
    const missedInvoicesWithItems = await this.fetchMissedInvoices(periodStart);
    const creditNoteRows = await this.fetchCreditNotes(periodStart, periodEnd);
    const customerDnRows = await this.fetchCustomerDebitNotes(periodStart, periodEnd);

    const classifiedInvoices: ClassifiedInvoice[] = [];
    const classifiedCreditNotes: ClassifiedCreditNote[] = [];

    const b2bInvoices: Gstr1B2BInvoice[] = [];
    const b2csEntries: Map<string, Gstr1B2CSEntry> = new Map(); // key: POS|supplyType|rate
    const b2clInvoices: Gstr1Data['b2cl'] = [];
    const cdnEntries: Gstr1CDNEntry[] = [];
    const hsnMap: Map<string, Gstr1HSNEntry> = new Map();       // key: HSN|rate

    // ── Classify and bucket each invoice ──

    for (const { invoice, items, customer } of invoicesWithItems) {
      const section = classifyInvoice(invoice, customer, items);
      classifiedInvoices.push({ invoiceId: invoice.id, section });

      // Accumulate HSN from every invoice regardless of section
      await this.accumulateHSN(hsnMap, items);

      switch (section) {
        case 'b2b':
          b2bInvoices.push(this.toB2B(invoice, customer, items));
          break;
        case 'b2cs':
          this.accumulateB2CS(b2csEntries, invoice, items);
          break;
        case 'b2cl':
          b2clInvoices.push(this.toB2CL(invoice, items));
          break;
        case 'nil':
          // aggregated later
          break;
      }
    }

    // ── Missed invoices — entered after a prior period was filed, so they
    //    were never furnished in any return. These are reported in the
    //    CURRENT period's Table 4A (B2B) with their original invoice date.
    //    NOT Table 9A: GSTN 9A amends an invoice already filed, and there is
    //    no original record to amend for a never-furnished invoice. Missed
    //    B2CS / B2CL are out of scope v1 (rarer, separate GSTN tables).

    for (const { invoice, items, customer } of missedInvoicesWithItems) {
      const section = classifyInvoice(invoice, customer, items);
      classifiedInvoices.push({ invoiceId: invoice.id, section });
      await this.accumulateHSN(hsnMap, items);

      if (section === 'b2b') {
        b2bInvoices.push(this.toB2B(invoice, customer, items));
      }
    }

    // ── Credit notes (CDN — only for registered buyers) ──

    for (const cn of creditNoteRows) {
      if (cn.customerGstin) {
        classifiedCreditNotes.push({ creditNoteId: cn.id, section: 'cdn' });
        cdnEntries.push(this.toCDN(cn));
      }
    }

    // ── Customer debit notes (CDN with noteType='D') ──

    for (const dn of customerDnRows) {
      if (dn.customerGstin) {
        // Tracked under same classifiedCreditNotes channel for return-invoice
        // links; the underlying gst_return_invoices.credit_note_id is nullable
        // and we'll add a dedicated customer_debit_note_id link in a follow-up.
        cdnEntries.push(this.toCustomerDN(dn));
      }
    }

    // ── Nil/exempt aggregation ──
    // Aggregate nil/exempt portions from ALL B2C invoices (b2cs/b2cl/nil).
    // Mixed B2C invoices (some taxable + some nil lines) need their nil
    // portion reported in Table 8, since rate=0 is invalid in B2CS.
    const nilAgg = this.aggregateNil(invoicesWithItems.filter(
      (iw) => {
        const section = classifyInvoice(iw.invoice, iw.customer, iw.items);
        return section === 'nil' || section === 'b2cs' || section === 'b2cl';
      },
    ));

    // ── Document summary ──

    const docSummary = this.buildDocSummary(invoicesWithItems, creditNoteRows);

    const data: Gstr1Data = {
      b2b: b2bInvoices,
      b2cs: Array.from(b2csEntries.values()),
      b2cl: b2clInvoices,
      cdn: cdnEntries,
      exp: [], // TODO: export invoices when needed
      nil: nilAgg,
      hsn: Array.from(hsnMap.values()),
      docs: docSummary,
    };

    return { data, classifiedInvoices, classifiedCreditNotes };
  }

  // ── Data fetching ────────────────────────────────────────────────────

  private async fetchInvoices(periodStart: string, periodEnd: string): Promise<InvoiceWithItems[]> {
    const rows = await this.db
      .select({
        invoice: salesInvoices,
        customer: {
          id: customers.id,
          gstin: customers.gstin,
          state: customers.state,
          name: customers.name,
        },
      })
      .from(salesInvoices)
      .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        gte(salesInvoices.invoiceDate, periodStart),
        lte(salesInvoices.invoiceDate, periodEnd),
        // Only include non-draft, non-cancelled invoices
        inArray(salesInvoices.status, ['sent', 'partially_paid', 'paid', 'overdue']),
      ));

    if (rows.length === 0) return [];

    const invoiceIds = rows.map((r) => r.invoice.id);
    const allItems = await this.db
      .select()
      .from(salesInvoiceItems)
      .where(and(
        eq(salesInvoiceItems.tenantId, this.tenantId),
        inArray(salesInvoiceItems.invoiceId, invoiceIds),
      ));

    const itemsByInvoice = new Map<string, InvoiceItemRow[]>();
    for (const item of allItems) {
      const list = itemsByInvoice.get(item.invoiceId) ?? [];
      list.push(item);
      itemsByInvoice.set(item.invoiceId, list);
    }

    return rows.map((r) => ({
      invoice: r.invoice,
      items: itemsByInvoice.get(r.invoice.id) ?? [],
      customer: r.customer,
    }));
  }

  private async fetchCreditNotes(periodStart: string, periodEnd: string) {
    const rows = await this.db
      .select({
        id: creditNotes.id,
        creditNoteNumber: creditNotes.creditNoteNumber,
        issueDate: creditNotes.issueDate,
        amount: creditNotes.amount,
        invoiceId: creditNotes.invoiceId,
        customerId: creditNotes.customerId,
        status: creditNotes.status,
        customerGstin: customers.gstin,
        // amends_invoice_number is the source of truth — survives renumber /
        // void of the original invoice. Falls back to the joined invoice's
        // number/date for older CNs without amends_* populated.
        amendsInvoiceNumber: creditNotes.amendsInvoiceNumber,
        amendsInvoiceDate: creditNotes.amendsInvoiceDate,
        originalInvoiceNumber: salesInvoices.invoiceNumber,
        originalInvoiceDate: salesInvoices.invoiceDate,
      })
      .from(creditNotes)
      .innerJoin(customers, eq(customers.id, creditNotes.customerId))
      .leftJoin(salesInvoices, eq(salesInvoices.id, creditNotes.invoiceId))
      .where(and(
        eq(creditNotes.tenantId, this.tenantId),
        gte(creditNotes.issueDate, periodStart),
        lte(creditNotes.issueDate, periodEnd),
        inArray(creditNotes.status, ['issued', 'adjusted']),
      ));

    if (rows.length === 0) return [];

    // Pull line items once and bucket per CN.
    const ids = rows.map((r) => r.id);
    const itemRows = await this.db
      .select()
      .from(creditNoteItems)
      .where(inArray(creditNoteItems.creditNoteId, ids));
    const itemsByCn = new Map<string, typeof itemRows>();
    for (const it of itemRows) {
      const list = itemsByCn.get(it.creditNoteId) ?? [];
      list.push(it);
      itemsByCn.set(it.creditNoteId, list);
    }

    return rows.map((r) => ({ ...r, items: itemsByCn.get(r.id) ?? [] }));
  }

  private async fetchCustomerDebitNotes(periodStart: string, periodEnd: string) {
    const rows = await this.db
      .select({
        id: customerDebitNotes.id,
        debitNoteNumber: customerDebitNotes.debitNoteNumber,
        issueDate: customerDebitNotes.issueDate,
        amount: customerDebitNotes.amount,
        invoiceId: customerDebitNotes.invoiceId,
        customerId: customerDebitNotes.customerId,
        status: customerDebitNotes.status,
        customerGstin: customers.gstin,
        amendsInvoiceNumber: customerDebitNotes.amendsInvoiceNumber,
        amendsInvoiceDate: customerDebitNotes.amendsInvoiceDate,
        originalInvoiceNumber: salesInvoices.invoiceNumber,
        originalInvoiceDate: salesInvoices.invoiceDate,
      })
      .from(customerDebitNotes)
      .innerJoin(customers, eq(customers.id, customerDebitNotes.customerId))
      .leftJoin(salesInvoices, eq(salesInvoices.id, customerDebitNotes.invoiceId))
      .where(and(
        eq(customerDebitNotes.tenantId, this.tenantId),
        gte(customerDebitNotes.issueDate, periodStart),
        lte(customerDebitNotes.issueDate, periodEnd),
        inArray(customerDebitNotes.status, ['issued', 'adjusted']),
      ));

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const itemRows = await this.db
      .select()
      .from(customerDebitNoteItems)
      .where(inArray(customerDebitNoteItems.customerDebitNoteId, ids));
    const itemsByDn = new Map<string, typeof itemRows>();
    for (const it of itemRows) {
      const list = itemsByDn.get(it.customerDebitNoteId) ?? [];
      list.push(it);
      itemsByDn.set(it.customerDebitNoteId, list);
    }

    return rows.map((r) => ({ ...r, items: itemsByDn.get(r.id) ?? [] }));
  }

  /**
   * Returns invoices that should have been in a prior period's GSTR-1 but
   * weren't (created after that period was filed). Emitted in the current
   * return as Table 9A amendments with their original invoice_date.
   *
   * Detection: invoice_date BETWEEN tenant's gstFilingStartPeriod AND
   * (current periodStart - 1 day) AND the invoice has no row in
   * `gst_return_invoices` joined to any filed return.
   *
   * Honoring `gstFilingStartPeriod` skips pre-GST historical invoices and
   * opening-balance entries (e.g. "OB-*"), which were never expected in
   * any GSTR-1 return.
   *
   * Drafts and cancelled invoices are excluded.
   */
  private async fetchMissedInvoices(periodStart: string): Promise<InvoiceWithItems[]> {
    // Lower bound: tenant's GST filing start period. Falls back to a
    // permissive earliest date when not configured.
    const filingStart = await this.tenantFilingStartDate();

    // Sub-select: invoice IDs already in any filed return. Filter NULLs —
    // `gst_return_invoices.invoice_id` is nullable (CN-only rows have it
    // null), and `NOT IN (subquery with NULLs)` evaluates to NULL → excludes
    // every row from the outer query.
    const filedInvoiceIdsSub = this.db
      .select({ id: gstReturnInvoices.invoiceId })
      .from(gstReturnInvoices)
      .innerJoin(gstReturns, eq(gstReturns.id, gstReturnInvoices.returnId))
      .where(and(
        eq(gstReturnInvoices.tenantId, this.tenantId),
        eq(gstReturns.status, 'filed'),
        isNotNull(gstReturnInvoices.invoiceId),
      ));

    const rows = await this.db
      .select({
        invoice: salesInvoices,
        customer: {
          id: customers.id,
          gstin: customers.gstin,
          state: customers.state,
          name: customers.name,
        },
      })
      .from(salesInvoices)
      .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        gte(salesInvoices.invoiceDate, filingStart),
        lt(salesInvoices.invoiceDate, periodStart),
        inArray(salesInvoices.status, ['sent', 'partially_paid', 'paid', 'overdue']),
        notInArray(salesInvoices.id, filedInvoiceIdsSub),
      ));

    if (rows.length === 0) return [];

    const invoiceIds = rows.map((r) => r.invoice.id);
    const allItems = await this.db
      .select()
      .from(salesInvoiceItems)
      .where(and(
        eq(salesInvoiceItems.tenantId, this.tenantId),
        inArray(salesInvoiceItems.invoiceId, invoiceIds),
      ));

    const itemsByInvoice = new Map<string, InvoiceItemRow[]>();
    for (const item of allItems) {
      const list = itemsByInvoice.get(item.invoiceId) ?? [];
      list.push(item);
      itemsByInvoice.set(item.invoiceId, list);
    }

    return rows.map((r) => ({
      invoice: r.invoice,
      items: itemsByInvoice.get(r.invoice.id) ?? [],
      customer: r.customer,
    }));
  }

  // ── Section builders ─────────────────────────────────────────────────

  private toB2B(invoice: InvoiceRow, customer: Pick<CustomerRow, 'gstin'>, items: InvoiceItemRow[]): Gstr1B2BInvoice {
    return {
      invoiceId: invoice.id,
      buyerGstin: customer.gstin!,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: this.formatDate(invoice.invoiceDate),
      invoiceValue: Number(invoice.totalAmount),
      // POS falls back to buyer's GSTIN state code if not set on invoice
      placeOfSupply: invoice.placeOfSupplyCode || customer.gstin?.substring(0, 2) || '',
      reverseCharge: invoice.reverseCharge ? 'Y' : 'N',
      invoiceType: 'R',
      items: this.groupItemsByRate(items),
    };
  }

  private accumulateB2CS(
    map: Map<string, Gstr1B2CSEntry>,
    invoice: InvoiceRow,
    items: InvoiceItemRow[],
  ): void {
    const supplyType = invoice.isInterState ? 'INTER' : 'INTRA';
    const pos = invoice.placeOfSupplyCode ?? '';

    for (const item of items) {
      const rate = Number(item.taxRate ?? 0);
      // GSTN B2CS schema rejects rate=0 — nil-rated/exempt portions of mixed
      // B2C invoices belong in the nil-rated section (Table 8), not B2CS.
      if (rate === 0) continue;
      const key = `${pos}|${supplyType}|${rate}`;

      const existing = map.get(key);
      if (existing) {
        existing.taxableValue += Number(item.amount);
        existing.igstAmount += Number(item.igstAmount);
        existing.cgstAmount += Number(item.cgstAmount);
        existing.sgstAmount += Number(item.sgstAmount);
        existing.cessAmount += Number(item.cessAmount);
      } else {
        map.set(key, {
          placeOfSupply: pos,
          supplyType,
          gstRate: rate,
          taxableValue: Number(item.amount),
          igstAmount: Number(item.igstAmount),
          cgstAmount: Number(item.cgstAmount),
          sgstAmount: Number(item.sgstAmount),
          cessAmount: Number(item.cessAmount),
        });
      }
    }
  }

  private toB2CL(invoice: InvoiceRow, items: InvoiceItemRow[]): Gstr1Data['b2cl'][number] {
    const grouped = this.groupItemsByRate(items);
    const first = grouped[0] ?? { taxableValue: 0, igstAmount: 0, gstRate: 0 };
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: this.formatDate(invoice.invoiceDate),
      invoiceValue: Number(invoice.totalAmount),
      placeOfSupply: invoice.placeOfSupplyCode ?? '',
      gstRate: first.gstRate,
      taxableValue: grouped.reduce((sum, g) => sum + g.taxableValue, 0),
      igstAmount: grouped.reduce((sum, g) => sum + g.igstAmount, 0),
    };
  }

  private toCDN(cn: {
    id: string;
    creditNoteNumber: string;
    issueDate: string;
    amount: string;
    customerGstin: string | null;
    amendsInvoiceNumber: string | null;
    amendsInvoiceDate: string | null;
    originalInvoiceNumber: string | null;
    originalInvoiceDate: string | null;
    items: Array<typeof creditNoteItems.$inferSelect>;
  }): Gstr1CDNEntry {
    // Prefer amends_* (stable text snapshot) over the joined invoice
    // (which can be null if the original invoice was voided/deleted).
    const origNumber = cn.amendsInvoiceNumber ?? cn.originalInvoiceNumber ?? '';
    const origDate = cn.amendsInvoiceDate ?? cn.originalInvoiceDate ?? null;
    return {
      creditNoteId: cn.id,
      buyerGstin: cn.customerGstin!,
      noteNumber: cn.creditNoteNumber,
      noteDate: this.formatDate(cn.issueDate),
      noteType: 'C',
      originalInvoiceNumber: origNumber,
      originalInvoiceDate: origDate ? this.formatDate(origDate) : '',
      noteValue: Number(cn.amount),
      items: this.groupNoteItemsByRate(cn.items),
    };
  }

  private toCustomerDN(dn: {
    id: string;
    debitNoteNumber: string;
    issueDate: string;
    amount: string;
    customerGstin: string | null;
    amendsInvoiceNumber: string | null;
    amendsInvoiceDate: string | null;
    originalInvoiceNumber: string | null;
    originalInvoiceDate: string | null;
    items: Array<typeof customerDebitNoteItems.$inferSelect>;
  }): Gstr1CDNEntry {
    const origNumber = dn.amendsInvoiceNumber ?? dn.originalInvoiceNumber ?? '';
    const origDate = dn.amendsInvoiceDate ?? dn.originalInvoiceDate ?? null;
    return {
      buyerGstin: dn.customerGstin!,
      noteNumber: dn.debitNoteNumber,
      noteDate: this.formatDate(dn.issueDate),
      noteType: 'D',
      originalInvoiceNumber: origNumber,
      originalInvoiceDate: origDate ? this.formatDate(origDate) : '',
      noteValue: Number(dn.amount),
      items: this.groupNoteItemsByRate(dn.items),
    };
  }

  /** Group CN/DN items by GST rate — same shape as invoice item grouping. */
  private groupNoteItemsByRate(
    items: Array<{
      amount: string;
      taxRate: string | null;
      cgstAmount: string;
      sgstAmount: string;
      igstAmount: string;
      cessAmount: string;
    }>,
  ): Gstr1CDNEntry['items'] {
    const byRate = new Map<number, {
      taxableValue: number; cgstAmount: number; sgstAmount: number; igstAmount: number; cessAmount: number;
    }>();
    for (const it of items) {
      const rate = Number(it.taxRate ?? 0);
      const e = byRate.get(rate);
      if (e) {
        e.taxableValue += Number(it.amount);
        e.cgstAmount  += Number(it.cgstAmount);
        e.sgstAmount  += Number(it.sgstAmount);
        e.igstAmount  += Number(it.igstAmount);
        e.cessAmount  += Number(it.cessAmount);
      } else {
        byRate.set(rate, {
          taxableValue: Number(it.amount),
          cgstAmount: Number(it.cgstAmount),
          sgstAmount: Number(it.sgstAmount),
          igstAmount: Number(it.igstAmount),
          cessAmount: Number(it.cessAmount),
        });
      }
    }
    return Array.from(byRate.entries()).map(([rate, a]) => ({ gstRate: rate, ...a }));
  }

  /**
   * Tenant's GST filing start date (YYYY-MM-01). Reads from
   * tenants.settings.gstFilingStartPeriod (MMYYYY format). Returns a
   * permissive default of '1900-01-01' when not configured — old tenants
   * that never set this won't lose any missed-invoice detection.
   */
  private async tenantFilingStartDate(): Promise<string> {
    const [row] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);
    const period = (row?.settings as { gstFilingStartPeriod?: string } | null)?.gstFilingStartPeriod;
    if (!period || period.length !== 6) return '1900-01-01';
    const mm = period.substring(0, 2);
    const yyyy = period.substring(2);
    return `${yyyy}-${mm}-01`;
  }

  // ── HSN aggregation ──────────────────────────────────────────────────

  /** Cache HSN-master descriptions for the duration of one generate() call. */
  private hsnDescCache: Map<string, string> | null = null;

  /** Cache item pack-size + uqc for HSN canonical-UQC conversion. */
  private itemPackCache: Map<string, { packValue: number; packUqc: string }> | null = null;

  /** Look up the official HSN-master description for an 8/6/4-digit code.
   *  Tries exact match → 6-digit prefix → 4-digit prefix → fallback. The
   *  `hsn_sac_codes` master table is the source of truth (seed it with
   *  industry-wide HSN list; this generator stays industry-agnostic). */
  private async hsnDescriptionFor(hsn: string, fallback: string): Promise<string> {
    if (!this.hsnDescCache) await this.loadHsnDescCache();
    const cache = this.hsnDescCache!;
    if (cache.has(hsn)) return cache.get(hsn)!;
    if (hsn.length === 8 && cache.has(hsn.substring(0, 6))) return cache.get(hsn.substring(0, 6))!;
    if (hsn.length >= 4 && cache.has(hsn.substring(0, 4))) return cache.get(hsn.substring(0, 4))!;
    return fallback;
  }

  private async loadHsnDescCache(): Promise<void> {
    const rows = await this.db.select({ code: hsnSacCodes.code, description: hsnSacCodes.description })
      .from(hsnSacCodes);
    this.hsnDescCache = new Map(rows.map((r) => [r.code, r.description]));
  }

  private async loadItemPackCache(): Promise<void> {
    const rows = await this.db
      .select({ id: itemsTable.id, packValue: itemsTable.packSizeValue, packUqc: itemsTable.packSizeUqc })
      .from(itemsTable)
      .where(eq(itemsTable.tenantId, this.tenantId));
    this.itemPackCache = new Map(rows.map((r) => [r.id, { packValue: Number(r.packValue), packUqc: r.packUqc }]));
  }

  /**
   * Aggregate invoice line items into the GSTR-1 HSN summary, converting
   * each line's (qty, uom) to a canonical UQC via the item's pack_size
   * (e.g. 100ml × 4 packs → 0.4 LTR). Lines with item_id resolve via the
   * items master; lines without a linked item fall back to the line's
   * own uom × quantity (pack_size assumed 1).
   *
   * Buckets by HSN + rate + canonical UQC. GSTN Table 12 keys on the same
   * triple, so one HSN code legitimately sold in different units (e.g. a
   * balm in grams and a roll-on in ml, both under 30049011) yields one row
   * per UQC rather than an error.
   */
  private async accumulateHSN(map: Map<string, Gstr1HSNEntry>, items: InvoiceItemRow[]): Promise<void> {
    if (!this.itemPackCache) await this.loadItemPackCache();
    const packCache = this.itemPackCache!;

    for (const item of items) {
      const hsn = item.hsnSacCode ?? '';
      if (!hsn) continue;

      const rate = Number(item.taxRate ?? 0);

      // Resolution order: explicit line-level pack_size_uqc → items
      // master → line uom. Honoring an explicit per-line pack_size lets
      // one SKU sell variant pack sizes (e.g. 100ml + 1L of the same
      // cold-pressed oil) without forcing a separate items-master row.
      const lineUqc = item.packSizeUqc && item.packSizeUqc.trim() !== '' ? item.packSizeUqc : null;
      const masterPack = item.itemId ? packCache.get(item.itemId) : undefined;
      const packValue = lineUqc
        ? Number(item.packSizeValue ?? 1)
        : (masterPack ? masterPack.packValue : Number(item.packSizeValue ?? 1));
      const sourceUom = lineUqc ?? masterPack?.packUqc ?? item.uom ?? 'NOS';

      const totalSourceQty = Number(item.quantity) * packValue;
      const canonical = toCanonical(totalSourceQty, sourceUom);
      if (!canonical) {
        throw new Error(
          `[GSTR-1 HSN] Unrecognised UoM "${sourceUom}" on invoice item ${item.id} (HSN ${hsn}). ` +
          `Add it to UQC_RULES in uqc-conversion.ts or fix the item master.`,
        );
      }

      // Key includes the canonical UQC so the same HSN+rate sold in
      // different units lands in separate Table 12 rows (GSTN-valid).
      const key = `${hsn}|${rate}|${canonical.uqc}`;

      const existing = map.get(key);
      if (existing) {
        existing.totalQuantity += canonical.qty;
        existing.taxableValue += Number(item.amount);
        existing.igstAmount += Number(item.igstAmount);
        existing.cgstAmount += Number(item.cgstAmount);
        existing.sgstAmount += Number(item.sgstAmount);
        existing.cessAmount += Number(item.cessAmount);
      } else {
        map.set(key, {
          hsnCode: hsn,
          // Use generic HSN-master description (industry-agnostic).
          // Falls back to the first SKU's description if HSN isn't in master.
          description: await this.hsnDescriptionFor(hsn, item.description),
          uqc: canonical.uqc,
          totalQuantity: canonical.qty,
          taxableValue: Number(item.amount),
          igstAmount: Number(item.igstAmount),
          cgstAmount: Number(item.cgstAmount),
          sgstAmount: Number(item.sgstAmount),
          cessAmount: Number(item.cessAmount),
          gstRate: rate,
        });
      }
    }
  }

  // ── Nil/exempt aggregation ───────────────────────────────────────────

  private aggregateNil(invoices: InvoiceWithItems[]): Gstr1Data['nil'] {
    const agg = {
      intra: { nilRated: 0, exempt: 0, nonGst: 0 },
      inter: { nilRated: 0, exempt: 0, nonGst: 0 },
    };

    for (const { invoice, items } of invoices) {
      const bucket = invoice.isInterState ? agg.inter : agg.intra;
      for (const item of items) {
        const amount = Number(item.amount);
        if (item.taxCategory === 'nil_rated') bucket.nilRated += amount;
        else if (item.taxCategory === 'exempt') bucket.exempt += amount;
        else if (item.taxCategory === 'zero_rated') bucket.nonGst += amount;
      }
    }

    const entries: Gstr1Data['nil'] = [];
    if (agg.intra.nilRated || agg.intra.exempt || agg.intra.nonGst) {
      entries.push({
        supplyType: 'INTRA',
        nilRatedAmount: agg.intra.nilRated,
        exemptAmount: agg.intra.exempt,
        nonGstAmount: agg.intra.nonGst,
      });
    }
    if (agg.inter.nilRated || agg.inter.exempt || agg.inter.nonGst) {
      entries.push({
        supplyType: 'INTER',
        nilRatedAmount: agg.inter.nilRated,
        exemptAmount: agg.inter.exempt,
        nonGstAmount: agg.inter.nonGst,
      });
    }
    return entries;
  }

  // ── Document summary ─────────────────────────────────────────────────

  private buildDocSummary(
    invoices: InvoiceWithItems[],
    creditNoteRows: Array<{ creditNoteNumber: string }>,
  ): Gstr1DocSummary[] {
    const docs: Gstr1DocSummary[] = [];

    if (invoices.length > 0) {
      const sorted = invoices
        .map((iw) => iw.invoice.invoiceNumber)
        .sort();
      docs.push({
        docType: 'Invoices for outward supply',
        fromSerial: sorted[0],
        toSerial: sorted[sorted.length - 1],
        totalIssued: sorted.length,
        totalCancelled: 0,
        netIssued: sorted.length,
      });
    }

    if (creditNoteRows.length > 0) {
      const sorted = creditNoteRows
        .map((cn) => cn.creditNoteNumber)
        .sort();
      docs.push({
        docType: 'Credit Note',
        fromSerial: sorted[0],
        toSerial: sorted[sorted.length - 1],
        totalIssued: sorted.length,
        totalCancelled: 0,
        netIssued: sorted.length,
      });
    }

    return docs;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private groupItemsByRate(items: InvoiceItemRow[]): Gstr1B2BInvoice['items'] {
    const byRate = new Map<number, {
      taxableValue: number;
      igstAmount: number;
      cgstAmount: number;
      sgstAmount: number;
      cessAmount: number;
    }>();

    for (const item of items) {
      const rate = Number(item.taxRate ?? 0);
      const existing = byRate.get(rate);
      if (existing) {
        existing.taxableValue += Number(item.amount);
        existing.igstAmount += Number(item.igstAmount);
        existing.cgstAmount += Number(item.cgstAmount);
        existing.sgstAmount += Number(item.sgstAmount);
        existing.cessAmount += Number(item.cessAmount);
      } else {
        byRate.set(rate, {
          taxableValue: Number(item.amount),
          igstAmount: Number(item.igstAmount),
          cgstAmount: Number(item.cgstAmount),
          sgstAmount: Number(item.sgstAmount),
          cessAmount: Number(item.cessAmount),
        });
      }
    }

    return Array.from(byRate.entries()).map(([rate, amounts]) => ({
      gstRate: rate,
      ...amounts,
    }));
  }

  /** Convert YYYY-MM-DD to DD-MM-YYYY for GSTN format. */
  private formatDate(dateStr: string): string {
    const [y, m, d] = dateStr.split('-');
    return `${d}-${m}-${y}`;
  }
}
