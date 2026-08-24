import { describe, it, expect } from 'vitest';
import { computeCurrentPeriod, computeDuePeriod } from './cycle-window';

describe('computeCurrentPeriod', () => {
  it('returns the half-month window containing the day', () => {
    expect(computeCurrentPeriod(15, '2026-08-24')).toEqual({ start: '2026-08-16', end: '2026-08-31' });
    expect(computeCurrentPeriod(15, '2026-08-15')).toEqual({ start: '2026-08-01', end: '2026-08-15' });
    expect(computeCurrentPeriod(15, '2026-08-16')).toEqual({ start: '2026-08-16', end: '2026-08-31' });
  });

  it('includes both boundary days of a window', () => {
    expect(computeCurrentPeriod(15, '2026-08-01')).toEqual({ start: '2026-08-01', end: '2026-08-15' });
    expect(computeCurrentPeriod(15, '2026-08-31')).toEqual({ start: '2026-08-16', end: '2026-08-31' });
  });

  it('absorbs the 31st into the last window rather than opening a stub', () => {
    expect(computeCurrentPeriod(10, '2026-08-31')).toEqual({ start: '2026-08-21', end: '2026-08-31' });
    expect(computeCurrentPeriod(10, '2026-08-21')).toEqual({ start: '2026-08-21', end: '2026-08-31' });
  });

  it('handles February and a leap day', () => {
    expect(computeCurrentPeriod(15, '2026-02-20')).toEqual({ start: '2026-02-16', end: '2026-02-28' });
    expect(computeCurrentPeriod(15, '2028-02-29')).toEqual({ start: '2028-02-16', end: '2028-02-29' });
  });

  it('is the window computeDuePeriod deliberately skips', () => {
    const today = '2026-08-24';
    const current = computeCurrentPeriod(15, today)!;
    const due = computeDuePeriod(15, today)!;
    expect(due.end < current.start).toBe(true);
    expect(current.start <= today && today <= current.end).toBe(true);
  });

  it('rejects a nonsense cadence instead of looping', () => {
    expect(computeCurrentPeriod(0, '2026-08-24')).toBeNull();
    expect(computeCurrentPeriod(15, 'not-a-date')).toBeNull();
  });
});
