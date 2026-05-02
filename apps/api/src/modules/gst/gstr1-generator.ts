import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import {
  salesInvoices, salesInvoiceItems, customers,
  creditNotes, tenants, invoiceSequences,
} from '@runq/db';
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
  async generate(periodStart: string, periodEnd: string, tenantProfile: TenantGstProfile): Promise<{
    data: Gstr1Data;
    classifiedInvoices: ClassifiedInvoice[];
    classifiedCreditNotes: ClassifiedCreditNote[];
  }> {
    const invoicesWithItems = await this.fetchInvoices(periodStart, periodEnd);
    const creditNoteRows = await this.fetchCreditNotes(periodStart, periodEnd);

    const classifiedInvoices: ClassifiedInvoice[] = [];
    const classifiedCreditNotes: ClassifiedCreditNote[] = [];

    const b2bInvoices: Gstr1B2BInvoice[] = [];
    const b2csEntries: Map<string, Gstr1B2CSEntry> = new Map(); // key: POS|supplyType|rate
    const b2clInvoices: Gstr1Data['b2cl'] = [];
    const nilEntries: Gstr1Data['nil'] = [];
    const cdnEntries: Gstr1CDNEntry[] = [];
    const hsnMap: Map<string, Gstr1HSNEntry> = new Map();       // key: HSN|rate

    // ── Classify and bucket each invoice ──

    for (const { invoice, items, customer } of invoicesWithItems) {
      const section = classifyInvoice(invoice, customer, items);
      classifiedInvoices.push({ invoiceId: invoice.id, section });

      // Accumulate HSN from every invoice regardless of section
      this.accumulateHSN(hsnMap, items);

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

    // ── Credit/debit notes (CDN — only for registered buyers) ──

    for (const cn of creditNoteRows) {
      if (cn.customerGstin) {
        classifiedCreditNotes.push({ creditNoteId: cn.id, section: 'cdn' });
        cdnEntries.push(this.toCDN(cn));
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

    return rows;
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
    originalInvoiceNumber: string | null;
    originalInvoiceDate: string | null;
  }): Gstr1CDNEntry {
    const amount = Number(cn.amount);
    return {
      creditNoteId: cn.id,
      buyerGstin: cn.customerGstin!,
      noteNumber: cn.creditNoteNumber,
      noteDate: this.formatDate(cn.issueDate),
      noteType: 'C',
      originalInvoiceNumber: cn.originalInvoiceNumber ?? '',
      originalInvoiceDate: cn.originalInvoiceDate ? this.formatDate(cn.originalInvoiceDate) : '',
      noteValue: amount,
      items: [{
        taxableValue: amount,
        igstAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        cessAmount: 0,
        gstRate: 0,
      }],
    };
  }

  // ── HSN aggregation ──────────────────────────────────────────────────

  private accumulateHSN(map: Map<string, Gstr1HSNEntry>, items: InvoiceItemRow[]): void {
    for (const item of items) {
      const hsn = item.hsnSacCode ?? '';
      if (!hsn) continue;

      const rate = Number(item.taxRate ?? 0);
      const key = `${hsn}|${rate}`;

      const existing = map.get(key);
      if (existing) {
        existing.totalQuantity += Number(item.quantity);
        existing.taxableValue += Number(item.amount);
        existing.igstAmount += Number(item.igstAmount);
        existing.cgstAmount += Number(item.cgstAmount);
        existing.sgstAmount += Number(item.sgstAmount);
        existing.cessAmount += Number(item.cessAmount);
      } else {
        map.set(key, {
          hsnCode: hsn,
          description: item.description,
          uqc: item.uom ?? 'NOS',
          totalQuantity: Number(item.quantity),
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
