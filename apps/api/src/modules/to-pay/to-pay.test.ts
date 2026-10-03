import { describe, it, expect } from 'vitest';
import { salaryDueDate, pfEsiDueDate, tdsDueDate } from './due-dates';
import { summarize } from './to-pay.service';
import { money, rangeLabel, monthEnd, type ToPayItem } from './types';

describe('due dates', () => {
  it('salaries: pay day of the next month, else the payroll month end', () => {
    expect(salaryDueDate(2026, 9)).toBe('2026-09-30');
    expect(salaryDueDate(2026, 9, 7)).toBe('2026-10-07');
    expect(salaryDueDate(2026, 12, 7)).toBe('2027-01-07');
    // a 31st pay day lands on the last day of a short month
    expect(salaryDueDate(2027, 1, 31)).toBe('2027-02-28');
  });

  it('PF/ESI by the 15th, TDS by the 7th (March by 30 April)', () => {
    expect(pfEsiDueDate(2026, 9)).toBe('2026-10-15');
    expect(tdsDueDate(2026, 9)).toBe('2026-10-07');
    expect(tdsDueDate(2027, 3)).toBe('2027-04-30');
  });
});

describe('summarize', () => {
  const item = (category: ToPayItem['category'], amount: number, dueDate: string, paid = 0): ToPayItem => ({
    id: `${category}-${dueDate}`, category, title: '', subtitle: '', period: `${dueDate.slice(0, 7)}-01`,
    subPeriod: null, subPeriodStart: null, detail: null,
    ...money(amount, paid), dueDate, webLink: '', mobileLink: null,
  });
  const items = [
    item('salaries', 95500, '2026-09-30'),
    item('bills', 1000, '2026-10-03'),
    item('bills', 2000, '2026-10-09'),
    item('rent_transport', 47500, '2026-10-16'),
    item('rent_transport', 47500, '2026-10-01', 47500),
  ];

  it('buckets overdue / next 7 days / later relative to today', () => {
    const s = summarize(items, '2026-10-03');
    expect([s.total, s.paid, s.balance]).toEqual([193500, 47500, 146000]);
    expect([s.overdue, s.overdueCount]).toEqual([95500, 1]);
    expect([s.thisWeek, s.thisWeekCount]).toEqual([3000, 2]);
    expect(s.later).toBe(47500);
  });

  it('orders categories by priority, dropping empty ones', () => {
    const s = summarize(items, '2026-10-03');
    expect(s.categories.map((c) => c.key)).toEqual(['salaries', 'rent_transport', 'bills']);
    expect(s.categories.find((c) => c.key === 'salaries')?.overdue).toBe(95500);
    const rent = s.categories.find((c) => c.key === 'rent_transport');
    expect([rent?.count, rent?.paidCount, rent?.paid, rent?.balance]).toEqual([2, 1, 47500, 47500]);
  });

  it('a paid item is never overdue', () => {
    const s = summarize([item('bills', 500, '2026-09-01', 500)], '2026-10-03');
    expect([s.overdue, s.balance, s.paid]).toEqual([0, 0, 500]);
  });
});

describe('money', () => {
  it('derives balance and status', () => {
    expect(money(1000, 0)).toMatchObject({ balance: 1000, status: 'due' });
    expect(money(1000, 400)).toMatchObject({ balance: 600, status: 'partial' });
    expect(money(1000, 1000)).toMatchObject({ balance: 0, status: 'paid' });
  });
});

describe('sub-period labels', () => {
  it('labels a span within a month, or across a month boundary', () => {
    expect(rangeLabel('2026-09-01', '2026-09-15')).toBe('1–15 Sep');
    expect(rangeLabel('2026-09-28', '2026-10-04')).toBe('28 Sep – 4 Oct');
    expect(monthEnd('2026-09-16')).toBe('2026-09-30');
    expect(monthEnd('2028-02-16')).toBe('2028-02-29');
  });
});
