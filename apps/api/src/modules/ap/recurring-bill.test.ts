import { describe, it, expect } from 'vitest';
import { duePeriods, billAmount, billDateFor, periodLabel } from './recurring-bill-generator';
import { splitPayment, pickBills } from './recurring-bill-payment';

describe('duePeriods — billed in arrears', () => {
  const a = { startMonth: '2026-10-01', endMonth: null, billDay: 1 };

  it('raises a month only after it is over, on the next month\'s bill day', () => {
    expect(duePeriods(a, '2026-10-31')).toEqual([]);
    expect(duePeriods(a, '2026-11-01')).toEqual(['2026-10-01']);
    expect(duePeriods({ ...a, billDay: 5 }, '2026-11-04')).toEqual([]);
    expect(billDateFor({ ...a, billDay: 5 }, '2026-10-01')).toBe('2026-11-05');
  });

  it('catches up every missed month, across the year end', () => {
    expect(duePeriods(a, '2027-02-10')).toEqual(['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01']);
  });

  it('stops at the end month', () => {
    expect(duePeriods({ ...a, endMonth: '2026-11-01' }, '2027-03-30')).toEqual(['2026-10-01', '2026-11-01']);
  });
});

describe('twice-monthly agreements', () => {
  const a = { startMonth: '2026-09-01', endMonth: null, billDay: 1, frequency: 'semi_monthly' as const };

  it('bills the 1st half on the 16th and the 2nd half on the 1st of next month', () => {
    expect(billDateFor(a, '2026-10-01')).toBe('2026-10-16');
    expect(billDateFor(a, '2026-10-16')).toBe('2026-11-01');
    expect(billDateFor(a, '2026-12-16')).toBe('2027-01-01');
  });

  it('on 3 Oct, only September is billed', () => {
    expect(duePeriods(a, '2026-10-03')).toEqual(['2026-09-01', '2026-09-16']);
    expect(duePeriods(a, '2026-10-16')).toEqual(['2026-09-01', '2026-09-16', '2026-10-01']);
  });

  it('splits the monthly amount, the 2nd half taking the odd paisa', () => {
    expect(billAmount({ amount: '95000.00', frequency: 'semi_monthly' }, '2026-09-01')).toBe(47500);
    expect(billAmount({ amount: '1000.01', frequency: 'semi_monthly' }, '2026-09-01')).toBe(500.01);
    expect(billAmount({ amount: '1000.01', frequency: 'semi_monthly' }, '2026-09-16')).toBe(500);
    expect(billAmount({ amount: '95000.00', frequency: 'monthly' }, '2026-09-01')).toBe(95000);
  });

  it('labels each half', () => {
    expect(periodLabel('2026-09-01', 'semi_monthly')).toBe('Sep 2026 — 1st half');
    expect(periodLabel('2026-09-16', 'semi_monthly')).toBe('Sep 2026 — 2nd half');
    expect(periodLabel('2026-09-01')).toBe('Sep 2026');
  });
});

describe('splitPayment', () => {
  const open = [{ id: 'oct', balanceDue: 3500 }, { id: 'nov', balanceDue: 3500 }];

  it('part payment leaves the oldest month partly paid', () => {
    expect(splitPayment(2000, open)).toEqual({ allocations: [{ invoiceId: 'oct', amount: 2000 }], advance: 0 });
  });

  it('settles oldest first and spills into the next month', () => {
    expect(splitPayment(5000, open)).toEqual({
      allocations: [{ invoiceId: 'oct', amount: 3500 }, { invoiceId: 'nov', amount: 1500 }], advance: 0,
    });
  });

  it('holds whatever is beyond the dues as an advance', () => {
    expect(splitPayment(10000, open).advance).toBe(3000);
    expect(splitPayment(4000, []).advance).toBe(4000);
  });
});

describe('pickBills', () => {
  const open = [{ id: 'sep2', balanceDue: '47500' }, { id: 'oct1', balanceDue: '47500' }];

  it('defaults to every open bill, oldest first', () => {
    expect(pickBills(open).map((b) => b.id)).toEqual(['sep2', 'oct1']);
  });

  it('settles only the chosen periods, in the chosen order', () => {
    expect(pickBills(open, ['oct1']).map((b) => b.id)).toEqual(['oct1']);
    // ₹50,000 for Oct 1st half alone: the rest is an advance, not spilled onto Sep.
    expect(splitPayment(50000, pickBills(open, ['oct1']))).toEqual({
      allocations: [{ invoiceId: 'oct1', amount: 47500 }], advance: 2500,
    });
  });

  it('rejects a period that is already paid or not on this agreement', () => {
    expect(() => pickBills(open, ['nov1'])).toThrow(/already paid/);
  });
});
