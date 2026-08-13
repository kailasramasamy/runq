import { describe, it, expect } from 'vitest';
import { LeaveAccrualService } from '../src/modules/hr/leave-accrual.service';
import { countedLeaveDates } from '../src/modules/hr/leave-days';
import { countWorkingDays } from '../src/modules/hr/work-calendar';

// The policy knobs behind an org that works all seven days, accrues a few
// days of CL a month, and caps how much can be banked. Every default here is
// the pre-existing behaviour, so a tenant that sets nothing is unaffected —
// that's the property most of these assertions are really protecting.

describe('leave policy: week-offs', () => {
  const holidayDates = new Set<string>();

  it('drops Sundays when the shift takes Sunday off', () => {
    // Mon 2026-08-10 .. Sun 2026-08-16 — one Sunday in the range.
    const dates = countedLeaveDates('2026-08-10', '2026-08-16', {
      holidayDates,
      weeklyOffDays: [0],
    });
    expect(dates).toHaveLength(6);
    expect(dates).not.toContain('2026-08-16');
  });

  it('counts every day for an org that works all seven', () => {
    const dates = countedLeaveDates('2026-08-10', '2026-08-16', {
      holidayDates,
      weeklyOffDays: [],
    });
    expect(dates).toHaveLength(7);
    expect(dates).toContain('2026-08-16');
  });

  it('still drops holidays regardless of week-offs', () => {
    const dates = countedLeaveDates('2026-08-10', '2026-08-16', {
      holidayDates: new Set(['2026-08-15']),
      weeklyOffDays: [],
    });
    expect(dates).toHaveLength(6);
    expect(dates).not.toContain('2026-08-15');
  });
});

describe('leave policy: accrual cap arithmetic', () => {
  // Mirrors the SQL in LeaveAccrualService.accrueUpThrough: the delta is
  // capped by the room left under max_balance, never below zero.
  const delta = (dpy: number, months: number, cap: number | null, available: number) => {
    const raw = (dpy / 12) * months;
    return cap == null ? raw : Math.min(raw, Math.max(cap - available, 0));
  };

  it('accrues the full monthly slice while under the cap', () => {
    // 48/yr = 4/month, cap 10, currently holding 2 → room for 8.
    expect(delta(48, 1, 10, 2)).toBe(4);
  });

  it('accrues only the remaining room as it approaches the cap', () => {
    // Holding 7 of 10 → only 3 days of room left, not the full 4.
    expect(delta(48, 1, 10, 7)).toBe(3);
  });

  it('accrues nothing at the cap', () => {
    expect(delta(48, 1, 10, 10)).toBe(0);
  });

  it('never accrues negative days when already over the cap', () => {
    // A manual adjustment can push a balance past the ceiling.
    expect(delta(48, 1, 10, 14)).toBe(0);
  });

  it('resumes accruing once leave is taken', () => {
    // At the cap, then 4 days used → 6 available, room for 4 again.
    expect(delta(48, 1, 10, 6)).toBe(4);
  });

  it('leaves uncapped types alone', () => {
    // NULL max_balance is every existing row in every existing tenant.
    expect(delta(12, 3, null, 99)).toBe(3);
  });

  it('is exposed as a service', () => {
    expect(typeof LeaveAccrualService.prototype.accrueUpThrough).toBe('function');
  });
});

describe('leave policy: paid/unpaid split arithmetic', () => {
  // Mirrors LeaveRequestService.splitPaidUnpaid.
  const split = (days: number, available: number, overflowUnpaid: boolean) => {
    if (!overflowUnpaid) return { paid: days, unpaid: 0 };
    const paid = Math.max(0, Math.min(days, available));
    return { paid, unpaid: Math.round((days - paid) * 100) / 100 };
  };

  it('pays in full when the balance covers it', () => {
    expect(split(4, 10, true)).toEqual({ paid: 4, unpaid: 0 });
  });

  it('splits at the balance', () => {
    // 6 days applied, only 4 left → 4 paid, 2 unpaid.
    expect(split(6, 4, true)).toEqual({ paid: 4, unpaid: 2 });
  });

  it('makes the whole request unpaid on an exhausted balance', () => {
    expect(split(3, 0, true)).toEqual({ paid: 0, unpaid: 3 });
  });

  it('never pays out of a negative balance', () => {
    expect(split(3, -2, true)).toEqual({ paid: 0, unpaid: 3 });
  });

  it('leaves types without the flag on the old behaviour', () => {
    // Balance goes negative, exactly as before — no tenant is opted in by
    // default, so this is the path every other org stays on.
    expect(split(6, 4, false)).toEqual({ paid: 6, unpaid: 0 });
  });

  it('handles a half-day against a half-day balance', () => {
    expect(split(0.5, 0.5, true)).toEqual({ paid: 0.5, unpaid: 0 });
    expect(split(0.5, 0, true)).toEqual({ paid: 0, unpaid: 0.5 });
  });
});

describe('work calendar: working days follow the shift', () => {
  const holidays = new Set(['2026-08-15']); // Independence Day, a Saturday

  it('counts a Sunday-off month the conventional way', () => {
    // Aug 2026: 31 days − 5 Sundays − 1 holiday = 25.
    expect(countWorkingDays(2026, 8, [0], holidays)).toBe(25);
  });

  it('counts every day for a seven-day operation', () => {
    // The same month for an org with no week-offs: 31 − 1 holiday = 30.
    // Pricing these employees against 25 measured LOP on a short month.
    expect(countWorkingDays(2026, 8, [], holidays)).toBe(30);
  });

  it('handles a two-day weekend', () => {
    // 31 − 5 Sundays − 5 Saturdays + the holiday already falling on a
    // Saturday (so not double-counted) = 21.
    expect(countWorkingDays(2026, 8, [0, 6], holidays)).toBe(21);
  });

  it('ignores holidays outside the month', () => {
    expect(countWorkingDays(2026, 8, [], new Set(['2026-09-15']))).toBe(31);
  });
});

describe('payroll: assume-present attendance mode', () => {
  // Mirrors the assume_present branch in PayrollRunService.process().
  const lopFor = (opts: {
    workingDays: number; employedDays: number; absent: number; half?: number;
  }) => {
    const notEmployed = Math.max(0, opts.workingDays - opts.employedDays);
    return Math.min(
      opts.workingDays,
      notEmployed + opts.absent + (opts.half ?? 0) * 0.5,
    );
  };

  it('pays a full month when nothing is marked', () => {
    // The whole point: no muster, no deduction.
    expect(lopFor({ workingDays: 31, employedDays: 31, absent: 0 })).toBe(0);
  });

  it('ignores paid leave', () => {
    // Approved paid leave never appears as `absent`, so it can't deduct.
    expect(lopFor({ workingDays: 31, employedDays: 31, absent: 0 })).toBe(0);
  });

  it('deducts only the unpaid leave days', () => {
    // 5 days off, 4 covered by balance → 1 marked absent by the split.
    expect(lopFor({ workingDays: 31, employedDays: 31, absent: 1 })).toBe(1);
  });

  it('prorates a mid-month joiner', () => {
    // Joined on the 20th of a 31-day month → 12 days employed, 19 unpaid.
    expect(lopFor({ workingDays: 31, employedDays: 12, absent: 0 })).toBe(19);
  });

  it('combines an employment gap with unpaid leave', () => {
    expect(lopFor({ workingDays: 31, employedDays: 12, absent: 2 })).toBe(21);
  });

  it('never deducts more than the month', () => {
    // Defensive: a bad exit date shouldn't produce a negative payslip.
    expect(lopFor({ workingDays: 31, employedDays: 0, absent: 5 })).toBe(31);
  });

  it('counts half days as half a day of LOP', () => {
    expect(lopFor({ workingDays: 31, employedDays: 31, absent: 0, half: 3 })).toBe(1.5);
  });
});

describe('leave policy: monthly paid-day cap', () => {
  // Mirrors LeaveRequestService.payableDays: paid days are limited by the
  // balance AND by how much of the monthly cap is still unspent.
  const payable = (opts: {
    days: number; available: number; cap: number | null; alreadyPaidThisMonth: number;
  }) => {
    const byBalance = Math.max(0, Math.min(opts.days, opts.available));
    if (opts.cap == null) return byBalance;
    return Math.max(0, Math.min(byBalance, opts.cap - opts.alreadyPaidThisMonth));
  };

  it('caps a single request at the monthly limit', () => {
    // 5 days applied with 6 banked, but only 4 payable per month → 4 paid.
    // The balance alone would have paid all 5.
    expect(payable({ days: 5, available: 6, cap: 4, alreadyPaidThisMonth: 0 })).toBe(4);
  });

  it('counts leave already taken earlier in the month', () => {
    // 3 already paid this month, 4/month cap → only 1 more can be paid.
    expect(payable({ days: 2, available: 6, cap: 4, alreadyPaidThisMonth: 3 })).toBe(1);
  });

  it('pays nothing once the month is exhausted', () => {
    expect(payable({ days: 2, available: 6, cap: 4, alreadyPaidThisMonth: 4 })).toBe(0);
  });

  it('still respects the balance when it is the tighter limit', () => {
    // 1 day banked, 4/month cap → the balance binds, not the cap.
    expect(payable({ days: 3, available: 1, cap: 4, alreadyPaidThisMonth: 0 })).toBe(1);
  });

  it('leaves types without a cap on balance-only behaviour', () => {
    // NULL cap is every existing leave type in every existing tenant.
    expect(payable({ days: 9, available: 10, cap: null, alreadyPaidThisMonth: 8 })).toBe(9);
  });
});

describe('payroll: unpaid days are deducted once', () => {
  // Earnings are pro-rated by (workingDays − lop) / workingDays. A separate
  // LOP deduction line on top of that docked the same day twice — this pins
  // the arithmetic that regression produced.
  // Earning lines keep their contracted value; the unpaid days come off once,
  // as a Loss of Pay deduction. Statutory bases follow paidWages.
  const payslip = (monthly: number, workingDays: number, lop: number) => {
    const factor = (workingDays - lop) / workingDays;
    const paidWages = Math.round(monthly * factor * 100) / 100;
    const lopAmount = Math.round((monthly - paidWages) * 100) / 100;
    return { gross: monthly, paidWages, lopAmount, net: monthly - lopAmount };
  };

  it('leads with the contracted gross and deducts the day once', () => {
    // 22,000 over 31 working days, 1 day LOP. An earlier version pro-rated
    // the earnings *and* deducted LOP, landing on 20,580.64.
    const p = payslip(22000, 31, 1);
    expect(p.gross).toBe(22000);
    expect(p.lopAmount).toBe(709.68);
    expect(p.net).toBe(21290.32);
  });

  it('bases statutory contributions on wages actually earned', () => {
    // PF/ESI/PT/TDS are due on what was paid, not the contracted figure.
    const p = payslip(22000, 31, 1);
    expect(p.paidWages).toBe(21290.32);
    expect(p.paidWages).toBeLessThan(p.gross);
  });

  it('pays the full salary when nothing is unpaid', () => {
    const p = payslip(22000, 31, 0);
    expect(p.gross).toBe(22000);
    expect(p.lopAmount).toBe(0);
    expect(p.net).toBe(22000);
  });

  it('scales with the number of unpaid days', () => {
    // 5 unpaid of 31 → 26/31 earned, 5/31 deducted.
    const p = payslip(31000, 31, 5);
    expect(p.paidWages).toBe(26000);
    expect(p.lopAmount).toBe(5000);
    expect(p.net).toBe(26000);
  });
});

describe('payroll: the LOP line names the days', () => {
  // Mirrors lopLabel() in PayrollRunService.
  const label = (dates: string[], lopDays: number) => {
    if (dates.length === 0 || dates.length > 3) {
      const d = Math.round(lopDays * 100) / 100;
      return ` (${d} day${d === 1 ? '' : 's'})`;
    }
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return ` (${dates.map((iso) => {
      const d = new Date(iso + 'T00:00:00Z');
      return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
    }).join(', ')})`;
  };

  it('names a single unpaid day', () => {
    expect(label(['2026-08-17'], 1)).toBe(' (17 Aug)');
  });

  it('lists a few days', () => {
    expect(label(['2026-08-15', '2026-08-17'], 2)).toBe(' (15 Aug, 17 Aug)');
  });

  it('falls back to a count when the list would run long', () => {
    const many = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'];
    expect(label(many, 4)).toBe(' (4 days)');
  });

  it('falls back to a count when there are no dated rows', () => {
    // Assume-present: days outside the employment window are unpaid but
    // have no attendance row to name.
    expect(label([], 11)).toBe(' (11 days)');
  });

  it('handles a half day', () => {
    expect(label([], 0.5)).toBe(' (0.5 days)');
  });
});
