import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import {
  salesInvoices, salesInvoiceItems, customers,
  purchaseInvoices, creditNotes,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { Gstr3bData, Gstr1Data } from '@runq/db';

interface TaxTotals { igst: number; cgst: number; sgst: number; cess: number }

function zeroTax(): TaxTotals { return { igst: 0, cgst: 0, sgst: 0, cess: 0 }; }
function addTax(a: TaxTotals, b: TaxTotals): TaxTotals {
  return { igst: a.igst + b.igst, cgst: a.cgst + b.cgst, sgst: a.sgst + b.sgst, cess: a.cess + b.cess };
}
function round2(v: number): number { return Math.round(v * 100) / 100; }

export class Gstr3bGenerator {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /**
   * Generates GSTR-3B from GSTR-1 data (outward) + purchase invoices (ITC).
   * If gstr1Data is provided, uses it directly. Otherwise queries sales invoices.
   */
  async generate(periodStart: string, periodEnd: string, gstr1Data?: Gstr1Data, itcFrom2b?: Gstr3bData['table4'] | null): Promise<Gstr3bData> {
    const outward = gstr1Data
      ? this.computeOutwardFromGstr1(gstr1Data)
      : await this.computeOutwardFromInvoices(periodStart, periodEnd);

    const itc = itcFrom2b ?? await this.computeItc(periodStart, periodEnd);
    const exempt = await this.computeExemptInward(periodStart, periodEnd);
    const liability = this.computeLiability(outward, itc);

    return {
      table31: outward.table31,
      table32: outward.table32,
      table4: itc,
      table5: exempt,
      table51: { interestAmount: 0, lateFee: 0 },
      table61: liability,
    };
  }

  // ── Table 3.1 & 3.2: Outward supplies ───────────────────────────────

  private computeOutwardFromGstr1(data: Gstr1Data): {
    table31: Gstr3bData['table31'];
    table32: Gstr3bData['table32'];
  } {
    let interTaxable = 0, interIgst = 0, interCess = 0;
    let intraTaxable = 0, intraCgst = 0, intraSgst = 0, intraCess = 0;
    let zeroTaxable = 0, zeroIgst = 0, zeroCess = 0;
    let nilExemptTaxable = 0;

    // B2B invoices
    for (const inv of data.b2b) {
      for (const item of inv.items) {
        if (item.igstAmount > 0) {
          interTaxable += item.taxableValue;
          interIgst += item.igstAmount;
          interCess += item.cessAmount;
        } else {
          intraTaxable += item.taxableValue;
          intraCgst += item.cgstAmount;
          intraSgst += item.sgstAmount;
          intraCess += item.cessAmount;
        }
      }
    }

    // B2CS
    for (const e of data.b2cs) {
      if (e.supplyType === 'INTER') {
        interTaxable += e.taxableValue;
        interIgst += e.igstAmount;
        interCess += e.cessAmount;
      } else {
        intraTaxable += e.taxableValue;
        intraCgst += e.cgstAmount;
        intraSgst += e.sgstAmount;
        intraCess += e.cessAmount;
      }
    }

    // B2CL (always inter-state)
    for (const inv of data.b2cl) {
      interTaxable += inv.taxableValue;
      interIgst += inv.igstAmount;
    }

    // Nil/exempt
    for (const n of data.nil) {
      nilExemptTaxable += n.nilRatedAmount + n.exemptAmount;
    }

    // Table 3.2: inter-state supplies to unregistered, by POS
    const table32: Gstr3bData['table32'] = [];
    const posBuckets = new Map<string, { taxableValue: number; igst: number }>();
    for (const e of data.b2cs) {
      if (e.supplyType !== 'INTER') continue;
      const existing = posBuckets.get(e.placeOfSupply) ?? { taxableValue: 0, igst: 0 };
      existing.taxableValue += e.taxableValue;
      existing.igst += e.igstAmount;
      posBuckets.set(e.placeOfSupply, existing);
    }
    for (const inv of data.b2cl) {
      const existing = posBuckets.get(inv.placeOfSupply) ?? { taxableValue: 0, igst: 0 };
      existing.taxableValue += inv.taxableValue;
      existing.igst += inv.igstAmount;
      posBuckets.set(inv.placeOfSupply, existing);
    }
    for (const [pos, amounts] of posBuckets) {
      table32.push({ placeOfSupply: pos, ...amounts });
    }

    return {
      table31: {
        outwardTaxableInterState: { taxableValue: round2(interTaxable), igst: round2(interIgst), cess: round2(interCess) },
        outwardTaxableIntraState: { taxableValue: round2(intraTaxable), cgst: round2(intraCgst), sgst: round2(intraSgst), cess: round2(intraCess) },
        zeroRatedSupplies: { taxableValue: round2(zeroTaxable), igst: round2(zeroIgst), cess: round2(zeroCess) },
        nilRatedExempt: { taxableValue: round2(nilExemptTaxable) },
        nonGstOutward: { taxableValue: 0 },
      },
      table32,
    };
  }

  private async computeOutwardFromInvoices(periodStart: string, periodEnd: string) {
    const rows = await this.db
      .select({
        isInterState: salesInvoices.isInterState,
        cgstAmount: salesInvoices.cgstAmount,
        sgstAmount: salesInvoices.sgstAmount,
        igstAmount: salesInvoices.igstAmount,
        cessAmount: salesInvoices.cessAmount,
        subtotal: salesInvoices.subtotal,
      })
      .from(salesInvoices)
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        gte(salesInvoices.invoiceDate, periodStart),
        lte(salesInvoices.invoiceDate, periodEnd),
        inArray(salesInvoices.status, ['sent', 'partially_paid', 'paid', 'overdue']),
      ));

    let interTaxable = 0, interIgst = 0, interCess = 0;
    let intraTaxable = 0, intraCgst = 0, intraSgst = 0, intraCess = 0;

    for (const r of rows) {
      if (r.isInterState) {
        interTaxable += Number(r.subtotal);
        interIgst += Number(r.igstAmount);
        interCess += Number(r.cessAmount);
      } else {
        intraTaxable += Number(r.subtotal);
        intraCgst += Number(r.cgstAmount);
        intraSgst += Number(r.sgstAmount);
        intraCess += Number(r.cessAmount);
      }
    }

    return {
      table31: {
        outwardTaxableInterState: { taxableValue: round2(interTaxable), igst: round2(interIgst), cess: round2(interCess) },
        outwardTaxableIntraState: { taxableValue: round2(intraTaxable), cgst: round2(intraCgst), sgst: round2(intraSgst), cess: round2(intraCess) },
        zeroRatedSupplies: { taxableValue: 0, igst: 0, cess: 0 },
        nilRatedExempt: { taxableValue: 0 },
        nonGstOutward: { taxableValue: 0 },
      },
      table32: [] as Gstr3bData['table32'],
    };
  }

  // ── Table 4: Input Tax Credit ────────────────────────────────────────

  private async computeItc(periodStart: string, periodEnd: string): Promise<Gstr3bData['table4']> {
    const bills = await this.db
      .select({
        reverseCharge: purchaseInvoices.reverseCharge,
        igstAmount: purchaseInvoices.igstAmount,
        cgstAmount: purchaseInvoices.cgstAmount,
        sgstAmount: purchaseInvoices.sgstAmount,
        cessAmount: purchaseInvoices.cessAmount,
      })
      .from(purchaseInvoices)
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        gte(purchaseInvoices.invoiceDate, periodStart),
        lte(purchaseInvoices.invoiceDate, periodEnd),
        inArray(purchaseInvoices.status, ['approved', 'partially_paid', 'paid']),
      ));

    const rcm = zeroTax();
    const allOther = zeroTax();

    for (const b of bills) {
      const tax: TaxTotals = {
        igst: Number(b.igstAmount),
        cgst: Number(b.cgstAmount),
        sgst: Number(b.sgstAmount),
        cess: Number(b.cessAmount),
      };
      if (b.reverseCharge) {
        Object.assign(rcm, addTax(rcm, tax));
      } else {
        Object.assign(allOther, addTax(allOther, tax));
      }
    }

    const totalAvailable = addTax(rcm, allOther);

    return {
      itcAvailable: {
        importGoods: zeroTax(),
        importServices: zeroTax(),
        inwardReverseCharge: rcm,
        isd: zeroTax(),
        allOtherItc: allOther,
      },
      itcReversed: {
        rule4243: zeroTax(),
        others: zeroTax(),
      },
      netItc: totalAvailable,
    };
  }

  // ── Table 5: Exempt inward supplies ──────────────────────────────────

  private async computeExemptInward(periodStart: string, periodEnd: string): Promise<Gstr3bData['table5']> {
    const bills = await this.db
      .select({
        isInterState: purchaseInvoices.isInterState,
        subtotal: purchaseInvoices.subtotal,
        taxAmount: purchaseInvoices.taxAmount,
      })
      .from(purchaseInvoices)
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        gte(purchaseInvoices.invoiceDate, periodStart),
        lte(purchaseInvoices.invoiceDate, periodEnd),
        inArray(purchaseInvoices.status, ['approved', 'partially_paid', 'paid']),
        eq(purchaseInvoices.taxAmount, '0'), // zero-tax = exempt/nil
      ));

    const result: Gstr3bData['table5'] = {
      interState: { nilRated: 0, exempt: 0, nonGst: 0 },
      intraState: { nilRated: 0, exempt: 0, nonGst: 0 },
    };

    for (const b of bills) {
      const bucket = b.isInterState ? result.interState : result.intraState;
      bucket.exempt += Number(b.subtotal);
    }

    return result;
  }

  // ── Table 6.1: Tax liability & ITC utilization ───────────────────────

  private computeLiability(
    outward: { table31: Gstr3bData['table31'] },
    itc: Gstr3bData['table4'],
  ): Gstr3bData['table61'] {
    const t = outward.table31;
    const payable = {
      igst: round2(t.outwardTaxableInterState.igst + t.zeroRatedSupplies.igst),
      cgst: round2(t.outwardTaxableIntraState.cgst),
      sgst: round2(t.outwardTaxableIntraState.sgst),
      cess: round2(t.outwardTaxableInterState.cess + t.outwardTaxableIntraState.cess + t.zeroRatedSupplies.cess),
    };

    // ITC utilization per Rule 88A:
    // IGST credit → IGST → CGST → SGST
    // CGST credit → CGST → IGST
    // SGST credit → SGST → IGST
    let igstCredit = itc.netItc.igst;
    let cgstCredit = itc.netItc.cgst;
    let sgstCredit = itc.netItc.sgst;
    let cessCredit = itc.netItc.cess;

    // Step 1: IGST credit against IGST liability
    const igstUsedForIgst = Math.min(igstCredit, payable.igst);
    igstCredit -= igstUsedForIgst;

    // Step 2: IGST credit against CGST liability
    const igstUsedForCgst = Math.min(igstCredit, payable.cgst);
    igstCredit -= igstUsedForCgst;

    // Step 3: IGST credit against SGST liability
    const igstUsedForSgst = Math.min(igstCredit, payable.sgst);
    igstCredit -= igstUsedForSgst;

    // Step 4: CGST credit against CGST
    const cgstRemaining = payable.cgst - igstUsedForCgst;
    const cgstUsedForCgst = Math.min(cgstCredit, cgstRemaining);
    cgstCredit -= cgstUsedForCgst;

    // Step 5: CGST credit against IGST (if any IGST payable remains)
    const igstRemaining = payable.igst - igstUsedForIgst;
    const cgstUsedForIgst = Math.min(cgstCredit, igstRemaining);
    cgstCredit -= cgstUsedForIgst;

    // Step 6: SGST credit against SGST
    const sgstRemaining = payable.sgst - igstUsedForSgst;
    const sgstUsedForSgst = Math.min(sgstCredit, sgstRemaining);
    sgstCredit -= sgstUsedForSgst;

    // Step 7: SGST credit against IGST
    const igstStillRemaining = igstRemaining - cgstUsedForIgst;
    const sgstUsedForIgst = Math.min(sgstCredit, igstStillRemaining);
    sgstCredit -= sgstUsedForIgst;

    // Cess credit against cess
    const cessUsed = Math.min(cessCredit, payable.cess);

    const totalIgstItc = round2(igstUsedForIgst + igstUsedForCgst + igstUsedForSgst + cgstUsedForIgst + sgstUsedForIgst);
    const totalCgstItc = round2(igstUsedForCgst + cgstUsedForCgst);
    const totalSgstItc = round2(igstUsedForSgst + sgstUsedForSgst);

    return {
      igst: {
        payable: payable.igst,
        itcUsed: round2(igstUsedForIgst + cgstUsedForIgst + sgstUsedForIgst),
        cashPaid: round2(Math.max(0, payable.igst - igstUsedForIgst - cgstUsedForIgst - sgstUsedForIgst)),
      },
      cgst: {
        payable: payable.cgst,
        itcUsed: round2(igstUsedForCgst + cgstUsedForCgst),
        cashPaid: round2(Math.max(0, payable.cgst - igstUsedForCgst - cgstUsedForCgst)),
      },
      sgst: {
        payable: payable.sgst,
        itcUsed: round2(igstUsedForSgst + sgstUsedForSgst),
        cashPaid: round2(Math.max(0, payable.sgst - igstUsedForSgst - sgstUsedForSgst)),
      },
      cess: {
        payable: payable.cess,
        itcUsed: round2(cessUsed),
        cashPaid: round2(Math.max(0, payable.cess - cessUsed)),
      },
    };
  }
}
