import { describe, it, expect } from 'vitest';
import { planRevision } from './employee-salary.service';

const span = (id: string, effectiveFrom: string, effectiveTo: string | null = null) =>
  ({ id, effectiveFrom, effectiveTo });

describe('planRevision', () => {
  it('forward revision closes the running salary the day before', () => {
    const plan = planRevision([span('a', '2026-04-01')], '2026-10-01');
    expect(plan).toEqual({ remove: [], close: [{ id: 'a', effectiveTo: '2026-09-30' }] });
  });

  it('backdating past a mistaken revision replaces it and re-closes the one before', () => {
    // Anusuya: ₹11k from Mar 31 closed Oct 1, ₹13k wrongly from Oct 2 → ₹13k from Sep 1.
    const plan = planRevision(
      [span('old', '2026-03-31', '2026-10-01'), span('wrong', '2026-10-02')],
      '2026-09-01',
    );
    expect(plan).toEqual({ remove: ['wrong'], close: [{ id: 'old', effectiveTo: '2026-08-31' }] });
  });

  it('same start date replaces rather than overlaps', () => {
    const plan = planRevision([span('a', '2026-09-01')], '2026-09-01');
    expect(plan).toEqual({ remove: ['a'], close: [] });
  });

  it('leaves salaries that ended before the start untouched', () => {
    const plan = planRevision(
      [span('h', '2025-04-01', '2026-03-30'), span('cur', '2026-03-31')],
      '2026-09-01',
    );
    expect(plan).toEqual({ remove: [], close: [{ id: 'cur', effectiveTo: '2026-08-31' }] });
  });

  it('first assignment has nothing to make room for', () => {
    expect(planRevision([], '2026-01-01')).toEqual({ remove: [], close: [] });
  });
});
