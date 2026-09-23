import { describe, it, expect } from 'vitest';
import { alertTierFor, daysUntilDue, dueDateFor, estimateLateFee, periodToLabel } from './gst-due-dates';

describe('dueDateFor', () => {
  it('puts the due date in the month after the period', () => {
    // Aug 2026 GSTR-1 is due 11 Sep 2026
    expect(dueDateFor('gstr1', '082026').toDateString()).toBe(new Date(2026, 8, 11).toDateString());
    expect(dueDateFor('gstr3b', '082026').toDateString()).toBe(new Date(2026, 8, 20).toDateString());
  });

  it('rolls a December period into the next year', () => {
    expect(dueDateFor('gstr1', '122026').toDateString()).toBe(new Date(2027, 0, 11).toDateString());
  });
});

describe('daysUntilDue', () => {
  it('counts down to the deadline and goes negative after it', () => {
    expect(daysUntilDue('gstr1', '082026', new Date(2026, 8, 6))).toBe(5);
    expect(daysUntilDue('gstr1', '082026', new Date(2026, 8, 11))).toBe(0);
    expect(daysUntilDue('gstr1', '082026', new Date(2026, 8, 14))).toBe(-3);
  });

  it('ignores the time of day', () => {
    expect(daysUntilDue('gstr3b', '082026', new Date(2026, 8, 19, 23, 59))).toBe(1);
  });
});

describe('alertTierFor', () => {
  it('stays silent until five days out', () => {
    expect(alertTierFor(30)).toBe('none');
    expect(alertTierFor(6)).toBe('none');
  });

  it('shows a strip from T-5 to T-3', () => {
    expect(alertTierFor(5)).toBe('strip');
    expect(alertTierFor(3)).toBe('strip');
  });

  it('adds the modal in the last two days', () => {
    expect(alertTierFor(2)).toBe('modal');
    expect(alertTierFor(1)).toBe('modal');
  });

  it('escalates on the due date and stays critical while overdue', () => {
    expect(alertTierFor(0)).toBe('critical');
    expect(alertTierFor(-1)).toBe('critical');
    expect(alertTierFor(-90)).toBe('critical');
  });
});

describe('estimateLateFee', () => {
  it('accrues Rs 50 a day and caps at Rs 5,000', () => {
    expect(estimateLateFee(1)).toBe(50);
    expect(estimateLateFee(10)).toBe(500);
    expect(estimateLateFee(365)).toBe(5000);
  });
});

describe('periodToLabel', () => {
  it('renders MMYYYY as a short month and year', () => {
    expect(periodToLabel('012026')).toBe('Jan 2026');
    expect(periodToLabel('122026')).toBe('Dec 2026');
  });
});
