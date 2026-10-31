import { describe, it, expect } from 'vitest';
import { monthsBetween } from './monthly-pnl.service';

describe('monthsBetween', () => {
  it('covers partial months at both ends', () => {
    expect(monthsBetween('2026-04-15', '2026-06-03')).toEqual(['2026-04', '2026-05', '2026-06']);
  });

  it('rolls over the year', () => {
    expect(monthsBetween('2026-11-01', '2027-02-28')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('returns a single month for a same-month range', () => {
    expect(monthsBetween('2026-10-01', '2026-10-31')).toEqual(['2026-10']);
  });
});
