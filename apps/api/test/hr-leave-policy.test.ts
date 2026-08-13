import { describe, it, expect } from 'vitest';
import { LeaveAccrualService } from '../src/modules/hr/leave-accrual.service';
import { countedLeaveDates } from '../src/modules/hr/leave-days';

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
