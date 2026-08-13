import { describe, it, expect } from 'vitest';
import {
  planInstalmentPayments, deductionTake, period, mergeRecoveryLines,
} from '../src/modules/hr/payroll/recovery';

// The arithmetic that decides how much of an employee's pay is taken back for
// advances, loans and ad-hoc deductions. The invariant every case below is
// really protecting: a recovery may take a payslip to zero, never past it.

describe('loan recovery: instalment allocation', () => {
  const inst = (id: string, amount: number, paidAmount = 0) => ({ id, amount, paidAmount });

  it('pays a single due instalment in full when pay allows', () => {
    const plan = planInstalmentPayments([inst('a', 5000)], 20000);
    expect(plan).toEqual([{ id: 'a', pay: 5000 }]);
  });

  it('clears arrears oldest-first when several months are due', () => {
    // Two months were skipped; this payslip can carry both.
    const plan = planInstalmentPayments([inst('a', 5000), inst('b', 5000)], 12000);
    expect(plan).toEqual([{ id: 'a', pay: 5000 }, { id: 'b', pay: 5000 }]);
  });

  it('part-pays and stops once the budget runs out', () => {
    const plan = planInstalmentPayments([inst('a', 5000), inst('b', 5000)], 7000);
    expect(plan).toEqual([{ id: 'a', pay: 5000 }, { id: 'b', pay: 2000 }]);
  });

  it('takes nothing when there is no net pay left', () => {
    // A month wiped out by LOP — the EMI carries to the next run untouched.
    expect(planInstalmentPayments([inst('a', 5000)], 0)).toEqual([]);
  });

  it('resumes from what a previous run already part-paid', () => {
    const plan = planInstalmentPayments([inst('a', 5000, 2000)], 10000);
    expect(plan).toEqual([{ id: 'a', pay: 3000 }]);
  });

  it('skips an instalment a previous run already settled', () => {
    const plan = planInstalmentPayments([inst('a', 5000, 5000), inst('b', 5000)], 10000);
    expect(plan).toEqual([{ id: 'b', pay: 5000 }]);
  });

  it('never allocates more than the budget', () => {
    const plan = planInstalmentPayments(
      [inst('a', 5000), inst('b', 5000), inst('c', 5000)], 6000,
    );
    const total = plan.reduce((s, p) => s + p.pay, 0);
    expect(total).toBe(6000);
  });

  it('keeps paise exact rather than drifting on repeated splits', () => {
    // 10000 / 3 doesn't divide cleanly; the plan must still foot to the budget.
    const plan = planInstalmentPayments(
      [inst('a', 3333.33), inst('b', 3333.33), inst('c', 3333.34)], 10000,
    );
    expect(plan.reduce((s, p) => s + p.pay, 0)).toBe(10000);
  });
});

describe('ad-hoc deduction recovery', () => {
  it('takes the per-run instalment when everything allows it', () => {
    expect(deductionTake(1000, 5000, 20000)).toBe(1000);
  });

  it('is capped by what is still outstanding on the final instalment', () => {
    expect(deductionTake(1000, 400, 20000)).toBe(400);
  });

  it('is capped by remaining net pay', () => {
    // Goods worth 1000 owed, but only 250 of pay left after statutory.
    expect(deductionTake(1000, 5000, 250)).toBe(250);
  });

  it('takes nothing when net pay is exhausted', () => {
    expect(deductionTake(1000, 5000, 0)).toBe(0);
  });

  it('never returns a negative take', () => {
    expect(deductionTake(1000, 0, 20000)).toBe(0);
    expect(deductionTake(1000, 5000, -500)).toBe(0);
  });
});

describe('due-period comparison', () => {
  it('orders months across a year boundary', () => {
    expect(period(2026, 1)).toBeGreaterThan(period(2025, 12));
  });

  it('treats an instalment due this month as payable', () => {
    expect(period(2026, 8) <= period(2026, 8)).toBe(true);
  });

  it('leaves a future instalment alone', () => {
    expect(period(2026, 9) <= period(2026, 8)).toBe(false);
  });
});

describe('manual payslip edits cannot rewrite recoveries', () => {
  const emi = { code: 'LOAN_abc12345', name: 'Salary Advance EMI', amount: 2000 };
  const pt = { code: 'PT', name: 'Professional Tax', amount: 200 };

  it('keeps an ordinary edit intact', () => {
    const merged = mergeRecoveryLines([pt, emi], [{ ...pt, amount: 150 }]);
    expect(merged).toEqual([{ ...pt, amount: 150 }, emi]);
  });

  it('restores a recovery line the edit deleted', () => {
    // HR removes the EMI row; the instalment is already marked paid, so the
    // line has to come back or the payslip stops footing to the ledger.
    const merged = mergeRecoveryLines([pt, emi], [pt]);
    expect(merged).toContainEqual(emi);
  });

  it('ignores an attempt to reprice a recovery line', () => {
    const merged = mergeRecoveryLines([pt, emi], [pt, { ...emi, amount: 1 }]);
    expect(merged.find((d) => d.code === emi.code)?.amount).toBe(2000);
  });

  it('leaves a payslip with no recoveries exactly as edited', () => {
    const edited = [pt, { code: 'TDS', name: 'TDS', amount: 500 }];
    expect(mergeRecoveryLines([pt], edited)).toEqual(edited);
  });

  it('protects ad-hoc deduction lines too', () => {
    const goods = { code: 'DED_ff00aa11', name: 'Goods Purchase', amount: 700 };
    expect(mergeRecoveryLines([goods], [])).toEqual([goods]);
  });
});

describe('recovery never produces a negative payslip', () => {
  // Property check across the whole recovery step: statutory net is the hard
  // ceiling, so loans take first and deductions only get what survives.
  const recover = (statutoryNet: number, emis: number[], deductions: number[]) => {
    let available = statutoryNet;
    const loanPlan = planInstalmentPayments(
      emis.map((a, i) => ({ id: String(i), amount: a, paidAmount: 0 })),
      available,
    );
    available -= loanPlan.reduce((s, p) => s + p.pay, 0);
    let dedTaken = 0;
    for (const d of deductions) {
      const take = deductionTake(d, d, available);
      dedTaken += take;
      available -= take;
    }
    return statutoryNet - loanPlan.reduce((s, p) => s + p.pay, 0) - dedTaken;
  };

  it('bottoms out at zero when debts exceed pay', () => {
    expect(recover(5000, [4000, 4000], [3000])).toBe(0);
  });

  it('leaves the untouched remainder when pay is ample', () => {
    expect(recover(50000, [4000], [3000])).toBe(43000);
  });

  it('gives loans priority over ad-hoc deductions', () => {
    // Only 4000 of room: the EMI takes it all, the canteen bill waits.
    let available = 4000;
    const loanPlan = planInstalmentPayments([{ id: 'a', amount: 4000, paidAmount: 0 }], available);
    available -= loanPlan.reduce((s, p) => s + p.pay, 0);
    expect(loanPlan[0].pay).toBe(4000);
    expect(deductionTake(1000, 1000, available)).toBe(0);
  });
});
