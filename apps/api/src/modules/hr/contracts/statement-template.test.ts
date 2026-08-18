import { describe, it, expect } from 'vitest';
import { groupLeaveRuns } from './statement-template';

const leave = (logDate: string, memberName = 'Ramesh', note: string | null = null) =>
  ({ logDate, memberName, status: 'leave', note });
const half = (logDate: string, memberName = 'Ramesh', note: string | null = null) =>
  ({ logDate, memberName, status: 'half_day', note });

describe('groupLeaveRuns', () => {
  it('leaves a single day as a one-day run', () => {
    expect(groupLeaveRuns([leave('2026-07-17')]))
      .toEqual([{ from: '2026-07-17', to: '2026-07-17', count: 1, memberName: 'Ramesh', status: 'leave', note: null }]);
  });

  it('collapses a consecutive run into one row', () => {
    const runs = groupLeaveRuns([leave('2026-07-12'), leave('2026-07-13'), leave('2026-07-14')]);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ from: '2026-07-12', to: '2026-07-14', count: 3 });
  });

  it('splits on a gap', () => {
    const runs = groupLeaveRuns([
      leave('2026-07-12'), leave('2026-07-13'),
      leave('2026-07-17'),
    ]);
    expect(runs.map((r) => [r.from, r.to, r.count]))
      .toEqual([['2026-07-12', '2026-07-13', 2], ['2026-07-17', '2026-07-17', 1]]);
  });

  it('runs across a month boundary', () => {
    const runs = groupLeaveRuns([leave('2026-07-31'), leave('2026-08-01'), leave('2026-08-02')]);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ from: '2026-07-31', to: '2026-08-02', count: 3 });
  });

  /// Two people off on the same days are two separate absences, not one.
  it('never merges across people', () => {
    const runs = groupLeaveRuns([
      leave('2026-07-12', 'Ramesh'), leave('2026-07-13', 'Ramesh'),
      leave('2026-07-12', 'Suresh'), leave('2026-07-13', 'Suresh'),
    ]);
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.count === 2)).toBe(true);
  });

  it('never merges a half day into a leave run', () => {
    const runs = groupLeaveRuns([leave('2026-07-12'), half('2026-07-13'), leave('2026-07-14')]);
    expect(runs).toHaveLength(3);
  });

  /// A differing note is a differing reason; merging would drop one of them.
  it('never merges days whose notes differ', () => {
    const runs = groupLeaveRuns([
      leave('2026-07-12', 'Ramesh', 'Unwell'),
      leave('2026-07-13', 'Ramesh', 'Village function'),
    ]);
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.note)).toEqual(['Unwell', 'Village function']);
  });

  it('merges consecutive days sharing a note', () => {
    const runs = groupLeaveRuns([
      leave('2026-07-13', 'Ramesh', 'Unwell'),
      leave('2026-07-12', 'Ramesh', 'Unwell'),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ from: '2026-07-12', count: 2, note: 'Unwell' });
  });

  it('orders runs by start date', () => {
    const runs = groupLeaveRuns([
      leave('2026-08-05', 'Suresh'), leave('2026-07-12', 'Ramesh'),
    ]);
    expect(runs.map((r) => r.from)).toEqual(['2026-07-12', '2026-08-05']);
  });

  it('returns nothing for an empty log', () => {
    expect(groupLeaveRuns([])).toEqual([]);
  });
});
