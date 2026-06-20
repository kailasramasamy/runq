import { describe, it, expect } from 'vitest';
import { buildItcTable4, type Itc2bEntry, type ItcIneligReason } from './gstr2b-reconciliation';

// Mirror the service's normalization closely enough for the test: strip
// separators + lowercase. buildItcTable4 only requires the SAME keyer be used
// for entries and the ineligible map, so a simple keyer is sufficient here.
const keyOf = (gstin: string, inv: string) => `${gstin}|${inv.replace(/[\s\-/]/g, '').toLowerCase()}`;

function entry(p: Partial<Itc2bEntry> & { supplierGstin: string; invoiceNumber: string }): Itc2bEntry {
  return {
    reverseCharge: false,
    igstAmount: 0, cgstAmount: 0, sgstAmount: 0, cessAmount: 0,
    ...p,
  };
}

// The actual Vrindavan May-2026 2B: 3 eligible (Razorpay/Sanathana/Torniek,
// all intra-state) + 6 ineligible partner buys on a shared GSTIN.
const ELIGIBLE: Itc2bEntry[] = [
  entry({ supplierGstin: '29AANCR6717K1ZN', invoiceNumber: 'RZP-1', cgstAmount: 1170.11, sgstAmount: 1170.11 }),
  entry({ supplierGstin: '29ABDCS3593F1Z1', invoiceNumber: 'SFPL/26-27/248', cgstAmount: 482.50, sgstAmount: 482.50 }),
  entry({ supplierGstin: '29AAECT5849F1ZY', invoiceNumber: '37', cgstAmount: 126, sgstAmount: 126 }),
];
const INELIGIBLE: Itc2bEntry[] = [
  entry({ supplierGstin: '29AAQCA1720Q1Z4', invoiceNumber: 'ALS-1', cgstAmount: 580.50, sgstAmount: 580.50 }),
  entry({ supplierGstin: '06AAVCA5575G1Z7', invoiceNumber: 'XNXW-10257', igstAmount: 167.03 }),
  entry({ supplierGstin: '24AMLPP2793G1ZQ', invoiceNumber: 'AMD2-498', igstAmount: 101.29 }),
  entry({ supplierGstin: '29AAECR0564M2ZY', invoiceNumber: 'RK-1', cgstAmount: 27.17, sgstAmount: 27.17 }),
  entry({ supplierGstin: '29AADCV4254H1Z4', invoiceNumber: 'ETR-1', cgstAmount: 23.78, sgstAmount: 23.78 }),
  entry({ supplierGstin: '29AAJCC9783E1Z3', invoiceNumber: 'SBLZ-64762', cgstAmount: 7.55, sgstAmount: 7.55 }),
];
const ALL = [...ELIGIBLE, ...INELIGIBLE];

describe('buildItcTable4', () => {
  it('claims the full 2B and reverses nothing when no line is flagged', () => {
    const t4 = buildItcTable4(ALL, new Map(), keyOf);
    // 4(A)(5) = full 2B
    expect(t4.itcAvailable.allOtherItc.cgst).toBeCloseTo(2417.61, 2);
    expect(t4.itcAvailable.allOtherItc.sgst).toBeCloseTo(2417.61, 2);
    expect(t4.itcAvailable.allOtherItc.igst).toBeCloseTo(268.32, 2);
    // nothing reversed → net == available
    expect(t4.itcReversed.rule4243).toEqual({ igst: 0, cgst: 0, sgst: 0, cess: 0 });
    expect(t4.itcReversed.others).toEqual({ igst: 0, cgst: 0, sgst: 0, cess: 0 });
    expect(t4.netItc.cgst).toBeCloseTo(2417.61, 2);
    expect(t4.netItc.igst).toBeCloseTo(268.32, 2);
  });

  it('reverses the 6 partner buys (not_our_supply → 4B2) leaving only eligible ITC', () => {
    const flagged = new Map<string, ItcIneligReason>(
      INELIGIBLE.map((e) => [keyOf(e.supplierGstin, e.invoiceNumber), 'not_our_supply']),
    );
    const t4 = buildItcTable4(ALL, flagged, keyOf);
    // 4(A)(5) still the full 2B (matches GSTN auto-population)
    expect(t4.itcAvailable.allOtherItc.cgst).toBeCloseTo(2417.61, 2);
    // not_our_supply routes to 4(B)(2) others, not 4(B)(1)
    expect(t4.itcReversed.rule4243).toEqual({ igst: 0, cgst: 0, sgst: 0, cess: 0 });
    expect(t4.itcReversed.others.cgst).toBeCloseTo(639.00, 2);
    expect(t4.itcReversed.others.sgst).toBeCloseTo(639.00, 2);
    expect(t4.itcReversed.others.igst).toBeCloseTo(268.32, 2);
    // net = eligible only: 1170.11+482.50+126 = 1778.61 each side, 0 igst
    expect(t4.netItc.cgst).toBeCloseTo(1778.61, 2);
    expect(t4.netItc.sgst).toBeCloseTo(1778.61, 2);
    expect(t4.netItc.igst).toBeCloseTo(0, 2);
  });

  it('routes Sec 17(5) / personal reversals to 4(B)(1) and others to 4(B)(2)', () => {
    const flagged = new Map<string, ItcIneligReason>([
      [keyOf('29AAQCA1720Q1Z4', 'ALS-1'), 'sec_17_5'],        // cgst/sgst 580.50
      [keyOf('29AAJCC9783E1Z3', 'SBLZ-64762'), 'personal'],   // cgst/sgst 7.55
      [keyOf('06AAVCA5575G1Z7', 'XNXW-10257'), 'other'],      // igst 167.03
    ]);
    const t4 = buildItcTable4(ALL, flagged, keyOf);
    // 4(B)(1) = sec_17_5 + personal
    expect(t4.itcReversed.rule4243.cgst).toBeCloseTo(588.05, 2);
    expect(t4.itcReversed.rule4243.sgst).toBeCloseTo(588.05, 2);
    expect(t4.itcReversed.rule4243.igst).toBeCloseTo(0, 2);
    // 4(B)(2) = other
    expect(t4.itcReversed.others.igst).toBeCloseTo(167.03, 2);
    expect(t4.itcReversed.others.cgst).toBeCloseTo(0, 2);
  });

  it('reverses reverse-charge ITC when flagged, keeping it in the RCM bucket of 4(A)', () => {
    const rcmEntry = entry({ supplierGstin: '29ZZZZZ0000Z1Z9', invoiceNumber: 'RCM-1', reverseCharge: true, igstAmount: 100 });
    const flagged = new Map<string, ItcIneligReason>([
      [keyOf(rcmEntry.supplierGstin, rcmEntry.invoiceNumber), 'sec_17_5'],
    ]);
    const t4 = buildItcTable4([rcmEntry], flagged, keyOf);
    expect(t4.itcAvailable.inwardReverseCharge.igst).toBeCloseTo(100, 2);
    expect(t4.itcAvailable.allOtherItc.igst).toBeCloseTo(0, 2);
    expect(t4.itcReversed.rule4243.igst).toBeCloseTo(100, 2);
    expect(t4.netItc.igst).toBeCloseTo(0, 2);
  });
});
