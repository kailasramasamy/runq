import { describe, it, expect } from 'vitest';
import { get } from './helpers';

describe('HR Dashboard summary', () => {
  it('returns the dashboard summary shape', async () => {
    const { status, body } = await get('/hr/dashboard');
    expect(status).toBe(200);
    const d = body.data;
    expect(d).toHaveProperty('payroll');
    expect(d.payroll).toHaveProperty('month');
    expect(d.payroll).toHaveProperty('year');
    expect(d.payroll).toHaveProperty('status'); // null or a run status
    expect(typeof d.employeesWithoutSalary).toBe('number');
    expect(typeof d.attendanceNotMarkedToday).toBe('number');
    expect(typeof d.confirmationsDue).toBe('number');
    expect(Array.isArray(d.attendanceTrend)).toBe(true);
    expect(d.attendanceTrend).toHaveLength(6);
    expect(d.attendanceTrend[0]).toHaveProperty('month');
    expect(d.attendanceTrend[0]).toHaveProperty('present');
    expect(d.attendanceTrend[0]).toHaveProperty('totalMarked');
    expect(d.attendanceTrend[0]).toHaveProperty('ratePct');
  });

  it('attendance trend rates are between 0 and 100', async () => {
    const { body } = await get('/hr/dashboard');
    for (const m of body.data.attendanceTrend) {
      expect(m.ratePct).toBeGreaterThanOrEqual(0);
      expect(m.ratePct).toBeLessThanOrEqual(100);
      expect(m.present).toBeLessThanOrEqual(m.totalMarked);
    }
  });

  it('counts are non-negative', async () => {
    const { body } = await get('/hr/dashboard');
    const d = body.data;
    expect(d.employeesWithoutSalary).toBeGreaterThanOrEqual(0);
    expect(d.attendanceNotMarkedToday).toBeGreaterThanOrEqual(0);
    expect(d.confirmationsDue).toBeGreaterThanOrEqual(0);
  });
});
