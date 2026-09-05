import { describe, expect, it } from 'vitest';
import { foldOutstanding, ledgerBalance, waterfall, zeroOutstanding } from './farmer-ledger';

const row = (entryType: string, amount: number, refType: string | null = null) =>
  ({ entryType, refType, amount: String(amount) });

describe('foldOutstanding', () => {
  it('splits debt by what it is owed against', () => {
    expect(foldOutstanding([
      row('advance_given', 1000),
      row('feed_loan_given', 500),
      row('farmer_sale', 200),
    ])).toEqual({ qualityRejection: 0, farmerSale: 200, advance: 1000, feedLoan: 500 });
  });

  it('pays each bucket down by the repayment that names it', () => {
    expect(foldOutstanding([
      row('farmer_sale', 200), row('advance_given', 1000),
      row('repayment', 200, 'farmer_sale'), row('repayment', 400, 'advance'),
    ])).toEqual({ qualityRejection: 0, farmerSale: 0, advance: 600, feedLoan: 0 });
  });

  it('sends an unlabelled repayment to advances, as it did before milk sales', () => {
    expect(foldOutstanding([row('advance_given', 300), row('repayment', 100)]))
      .toEqual({ qualityRejection: 0, farmerSale: 0, advance: 200, feedLoan: 0 });
  });

  it('contras a reversed sale but leaves other adjustments on the balance alone', () => {
    expect(foldOutstanding([
      row('farmer_sale', 200), row('adjustment', 200, 'farmer_sale'),
    ]).farmerSale).toBe(0);
    expect(foldOutstanding([
      row('advance_given', 500), row('adjustment', 100),
    ]).advance).toBe(500);
  });

  // Rejected milk is a debt like any other until the next cycle recovers it,
  // and an operator who takes the rejection back must not leave it standing.
  it('grows on a rejection and contras when the rejection is reversed', () => {
    expect(foldOutstanding([row('quality_rejection', 6350.5)]).qualityRejection).toBe(6350.5);
    expect(foldOutstanding([
      row('quality_rejection', 6350.5), row('adjustment', 6350.5, 'quality_rejection'),
    ]).qualityRejection).toBe(0);
    expect(foldOutstanding([
      row('quality_rejection', 6350.5), row('repayment', 6350.5, 'quality_rejection'),
    ]).qualityRejection).toBe(0);
  });

  it('never reports a negative bucket', () => {
    expect(foldOutstanding([row('repayment', 100, 'advance')]).advance).toBe(0);
  });
});

describe('ledgerBalance', () => {
  it('sums what is owed, whatever order the rows arrive in', () => {
    const rows = [row('farmer_sale', 3600), row('advance_given', 5000), row('repayment', 1000, 'advance')];
    expect(ledgerBalance(rows)).toBe(7600);
    expect(ledgerBalance([...rows].reverse())).toBe(7600);
  });

  it('is unmoved by a backdated entry — the bug balance_after had', () => {
    // A sale recorded today, then one backdated to yesterday. Reading the
    // newest row *by date* would report 3600; the truth is both.
    expect(ledgerBalance([row('farmer_sale', 3600), row('farmer_sale', 2250)])).toBe(5850);
  });
});

describe('waterfall', () => {
  it('recovers rejected milk first, then sales, then advances, then feed loans', () => {
    const out = { qualityRejection: 300, farmerSale: 200, advance: 1000, feedLoan: 500 };
    expect(waterfall(out, 5000))
      .toEqual({ qualityRejection: 300, farmerSale: 200, advance: 1000, feedLoan: 500, total: 2000 });
  });

  it('stops at the gross, leaving the rest to carry forward', () => {
    // 900 covers the sale in full and part of the advance; the feed loan waits.
    expect(waterfall({ qualityRejection: 0, farmerSale: 200, advance: 1000, feedLoan: 500 }, 900))
      .toEqual({ qualityRejection: 0, farmerSale: 200, advance: 700, feedLoan: 0, total: 900 });
  });

  it('takes nothing from a cycle with no milk', () => {
    expect(waterfall({ qualityRejection: 0, farmerSale: 200, advance: 100, feedLoan: 0 }, 0))
      .toEqual({ ...zeroOutstanding(), total: 0 });
  });

  // Rejected milk comes off the top: it is not a debt the farmer took on, it is
  // milk we never got. A short cycle recovers it before anything else.
  it('recovers a rejection ahead of an advance when gross is short', () => {
    expect(waterfall({ qualityRejection: 300, farmerSale: 0, advance: 1000, feedLoan: 0 }, 400))
      .toEqual({ qualityRejection: 300, farmerSale: 0, advance: 100, feedLoan: 0, total: 400 });
  });
});
