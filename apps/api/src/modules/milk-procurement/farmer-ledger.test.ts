import { describe, expect, it } from 'vitest';
import { dueBy, foldOutstanding, ledgerBalance, saleBalanceBefore, waterfall, zeroOutstanding } from './farmer-ledger';

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

describe('dueBy', () => {
  const dated = (entryType: string, amount: number, occurredOn: string, refType: string | null = null) =>
    ({ ...row(entryType, amount, refType), occurredOn });

  it('leaves debt dated after the period for the next cycle', () => {
    expect(foldOutstanding(dueBy([
      dated('farmer_sale', 5000, '2026-10-20'),
      dated('farmer_sale', 8800, '2026-11-01'),
      dated('advance_given', 1000, '2026-11-02'),
    ], '2026-10-31'))).toEqual({ qualityRejection: 0, farmerSale: 5000, advance: 0, feedLoan: 0 });
  });

  it('still recovers unpaid debt from earlier periods', () => {
    expect(foldOutstanding(dueBy([dated('farmer_sale', 300, '2026-09-10')], '2026-10-31')).farmerSale)
      .toBe(300);
  });

  it('keeps a later-dated repayment, which has already been taken', () => {
    expect(foldOutstanding(dueBy([
      dated('farmer_sale', 500, '2026-10-20'),
      dated('repayment', 200, '2026-11-15', 'farmer_sale'),
    ], '2026-10-31')).farmerSale).toBe(300);
  });

  it('drops a later sale together with its reversal', () => {
    expect(foldOutstanding(dueBy([
      dated('farmer_sale', 500, '2026-10-20'),
      dated('farmer_sale', 900, '2026-11-01'),
      dated('adjustment', 900, '2026-11-01', 'farmer_sale'),
    ], '2026-10-31')).farmerSale).toBe(500);
  });
});

describe('saleBalanceBefore', () => {
  const dated = (entryType: string, amount: number, occurredOn: string, refType: string | null = null) =>
    ({ ...row(entryType, amount, refType), occurredOn });

  it('stays at zero when an earlier cycle recovered ahead of its period', () => {
    expect(saleBalanceBefore([
      dated('farmer_sale', 110814, '2026-10-15'),
      dated('farmer_sale', 3520, '2026-10-17'),
      dated('repayment', 114334, '2026-10-15', 'farmer_sale'),
    ], '2026-10-16')).toBe(0);
  });

  it('ignores other buckets, and this cycle\'s own recovery', () => {
    expect(saleBalanceBefore([
      dated('farmer_sale', 500, '2026-10-10'),
      dated('adjustment', 100, '2026-10-10', 'farmer_sale'),
      dated('repayment', 900, '2026-10-15', 'advance'),
      dated('repayment', 400, '2026-10-31', 'farmer_sale'),
    ], '2026-10-16')).toBe(400);
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
