import { describe, it, expect } from 'vitest';
import { bonusPeriodFor } from './procurement-window';

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
