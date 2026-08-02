import { describe, it, expect } from 'vitest';
import {
  bonusPeriodFor, ccReceiveWindow, poolSlots, statusSlots, isPooled, prevDay,
} from './procurement-window';

describe('prevDay', () => {
  it('steps back across a month and a year boundary', () => {
    expect(prevDay('2026-08-02')).toBe('2026-08-01');
    expect(prevDay('2026-08-01')).toBe('2026-07-31');
    expect(prevDay('2027-01-01')).toBe('2026-12-31');
  });

  it('steps back across a leap day', () => {
    expect(prevDay('2028-03-01')).toBe('2028-02-29');
  });
});

describe('ccReceiveWindow', () => {
  it('same-day pools both of today\'s shifts', () => {
    expect(ccReceiveWindow(false, '2026-08-02')).toEqual([
      { date: '2026-08-02', shift: 'am' },
      { date: '2026-08-02', shift: 'pm' },
    ]);
  });

  // The whole point of the overnight mode: yesterday's evening milk rides out
  // with this morning's. Today's PM belongs to tomorrow's pool, not this one.
  it('overnight pools yesterday PM with today AM, and excludes today PM', () => {
    expect(ccReceiveWindow(true, '2026-08-02')).toEqual([
      { date: '2026-08-01', shift: 'pm' },
      { date: '2026-08-02', shift: 'am' },
    ]);
  });
});

describe('isPooled', () => {
  it('is true for the two pooling modes only', () => {
    expect(isPooled('per_shift')).toBe(false);
    expect(isPooled('day')).toBe(true);
    expect(isPooled('overnight')).toBe(true);
  });
});

describe('poolSlots', () => {
  it('per_shift covers only the named shift', () => {
    expect(poolSlots('per_shift', '2026-08-02', 'pm')).toEqual([
      { date: '2026-08-02', shift: 'pm' },
    ]);
  });

  // Defaulting a missing shift would close or dispatch milk the operator never
  // selected, so this is deliberately fatal rather than forgiving.
  it('per_shift refuses to guess a shift', () => {
    expect(() => poolSlots('per_shift', '2026-08-02')).toThrow(/requires a shift/);
  });

  it('day covers both of today\'s shifts', () => {
    expect(poolSlots('day', '2026-08-02')).toEqual([
      { date: '2026-08-02', shift: 'am' },
      { date: '2026-08-02', shift: 'pm' },
    ]);
  });

  it('overnight covers the two-day window', () => {
    expect(poolSlots('overnight', '2026-08-02')).toEqual([
      { date: '2026-08-01', shift: 'pm' },
      { date: '2026-08-02', shift: 'am' },
    ]);
  });

  // A pooled node's membership is fixed by its mode. Honouring a stray shift
  // would let a dispatch gate on one slot while the pool draws from two.
  it('pooled modes ignore a shift the caller passes', () => {
    expect(poolSlots('day', '2026-08-02', 'am')).toEqual(poolSlots('day', '2026-08-02'));
    expect(poolSlots('overnight', '2026-08-02', 'pm')).toEqual(poolSlots('overnight', '2026-08-02'));
  });
});

describe('statusSlots', () => {
  // Status always reports the whole window regardless of what the caller is
  // looking at, so the UI can show both halves of a pool at once.
  it('reports today\'s pair for per_shift and day', () => {
    const today = [{ date: '2026-08-02', shift: 'am' }, { date: '2026-08-02', shift: 'pm' }];
    expect(statusSlots('per_shift', '2026-08-02')).toEqual(today);
    expect(statusSlots('day', '2026-08-02')).toEqual(today);
  });

  it('reports the two-day window for overnight', () => {
    expect(statusSlots('overnight', '2026-08-02')).toEqual([
      { date: '2026-08-01', shift: 'pm' },
      { date: '2026-08-02', shift: 'am' },
    ]);
  });

  // Close writes poolSlots and dispatch gates on it; status must cover every
  // slot either of them can produce, or a closed pool can read as open.
  it('covers every slot poolSlots can produce, for each mode', () => {
    const date = '2026-08-02';
    for (const mode of ['per_shift', 'day', 'overnight'] as const) {
      const covered = statusSlots(mode, date);
      const shifts = mode === 'per_shift' ? (['am', 'pm'] as const) : ([undefined] as const);
      for (const s of shifts) {
        for (const slot of poolSlots(mode, date, s)) {
          expect(covered).toContainEqual(slot);
        }
      }
    }
  });
});

describe('bonusPeriodFor', () => {
  const anchor = '2026-08-01';

  it('gives the first period from the anchor', () => {
    expect(bonusPeriodFor(anchor, 3, '2026-08-01')).toEqual({ start: '2026-08-01', end: '2026-10-31' });
    expect(bonusPeriodFor(anchor, 3, '2026-10-31')).toEqual({ start: '2026-08-01', end: '2026-10-31' });
  });

  it('rolls on the boundary, and keeps rolling across a year end', () => {
    expect(bonusPeriodFor(anchor, 3, '2026-11-01')).toEqual({ start: '2026-11-01', end: '2027-01-31' });
    expect(bonusPeriodFor(anchor, 3, '2027-01-31')).toEqual({ start: '2026-11-01', end: '2027-01-31' });
    expect(bonusPeriodFor(anchor, 3, '2027-02-01')).toEqual({ start: '2027-02-01', end: '2027-04-30' });
  });

  // Nothing accrues before the scheme starts, so July quotes no running total.
  it('returns null before the anchor', () => {
    expect(bonusPeriodFor(anchor, 3, '2026-07-31')).toBeNull();
  });

  it('handles a mid-month anchor without rolling early', () => {
    expect(bonusPeriodFor('2026-08-15', 3, '2026-11-14')).toEqual({ start: '2026-08-15', end: '2026-11-14' });
    expect(bonusPeriodFor('2026-08-15', 3, '2026-11-15')).toEqual({ start: '2026-11-15', end: '2027-02-14' });
  });

  it('supports a monthly period too', () => {
    expect(bonusPeriodFor(anchor, 1, '2026-09-09')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('guards a nonsense period length', () => {
    expect(bonusPeriodFor(anchor, 0, '2026-09-01')).toBeNull();
  });
});
