import { describe, it, expect } from 'vitest';
import { get, post, put, del, testSuffix } from './helpers';

const code = (s: string) => `${s}${testSuffix}`.slice(0, 30);

describe('HR Phase 2: Leave Types', () => {
  let typeId: string;
  const typeCode = `L${Math.floor(Math.random() * 999)}`;

  it('creates a leave type', async () => {
    const { status, body } = await post('/hr/leave-types', {
      name: `Custom Leave${testSuffix}`,
      code: typeCode,
      daysPerYear: 10,
      carryForward: true,
      maxCarryForward: 5,
      isPaid: true,
    });
    expect(status).toBe(201);
    typeId = body.data.id;
  });

  it('rejects duplicate code', async () => {
    const { status } = await post('/hr/leave-types', {
      name: 'Dup', code: typeCode, daysPerYear: 5,
    });
    expect(status).toBe(409);
  });

  it('lists leave types', async () => {
    const { status, body } = await get('/hr/leave-types');
    expect(status).toBe(200);
    expect(body.data.find((t: any) => t.id === typeId)).toBeTruthy();
  });

  it('updates a leave type', async () => {
    const { status, body } = await put(`/hr/leave-types/${typeId}`, { daysPerYear: 15 });
    expect(status).toBe(200);
    expect(Number(body.data.daysPerYear)).toBe(15);
  });

  it('seed defaults is idempotent when types exist', async () => {
    const { status, body } = await post('/hr/leave-types/seed-defaults', {});
    expect(status).toBe(200);
    expect(body.data.skipped).toBe(true);
  });
});

describe('HR Phase 2: Leave Requests', () => {
  let employeeId: string;
  let leaveTypeId: string;
  let requestId: string;
  const empCode = code('LV');

  it('seeds employee + leave type', async () => {
    const e = await post('/hr/employees', {
      employeeCode: empCode,
      firstName: 'Leave',
      lastName: 'Tester',
      joiningDate: '2024-01-01',
      employmentType: 'permanent',
    });
    expect(e.status).toBe(201);
    employeeId = e.body.data.id;

    const t = await post('/hr/leave-types', {
      name: `Test CL${testSuffix}`,
      code: `T${Math.floor(Math.random() * 999)}`,
      daysPerYear: 12,
      carryForward: false,
      isPaid: true,
    });
    expect(t.status).toBe(201);
    leaveTypeId = t.body.data.id;
  });

  it('applies for leave', async () => {
    const { status, body } = await post('/hr/leave-requests', {
      employeeId,
      leaveTypeId,
      fromDate: '2026-06-01', // Monday
      toDate: '2026-06-03',   // Wednesday → 3 working days
      reason: 'Personal',
    });
    expect(status).toBe(201);
    expect(body.data.status).toBe('pending');
    expect(Number(body.data.days)).toBe(3);
    requestId = body.data.id;
  });

  it('half-day request counts 0.5', async () => {
    const { status, body } = await post('/hr/leave-requests', {
      employeeId,
      leaveTypeId,
      fromDate: '2026-07-06',
      toDate: '2026-07-06',
      halfDay: true,
    });
    expect(status).toBe(201);
    expect(Number(body.data.days)).toBe(0.5);
  });

  it('rejects overlapping request', async () => {
    const { status } = await post('/hr/leave-requests', {
      employeeId,
      leaveTypeId,
      fromDate: '2026-06-02',
      toDate: '2026-06-04',
    });
    expect(status).toBe(409);
  });

  it('rejects half-day across multiple dates', async () => {
    const { status } = await post('/hr/leave-requests', {
      employeeId,
      leaveTypeId,
      fromDate: '2026-08-10',
      toDate: '2026-08-11',
      halfDay: true,
    });
    expect(status).toBe(409);
  });

  it('lists pending requests', async () => {
    const { status, body } = await get(`/hr/leave-requests?employeeId=${employeeId}&status=pending`);
    expect(status).toBe(200);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('approves leave and increments used balance', async () => {
    const r = await put(`/hr/leave-requests/${requestId}/review`, { approved: true });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('approved');

    const bal = await get(`/hr/leave-balances?employeeId=${employeeId}&year=2026`);
    expect(bal.status).toBe(200);
    const row = bal.body.data.find((b: any) => b.leaveTypeId === leaveTypeId);
    expect(row).toBeTruthy();
    expect(Number(row.used)).toBeGreaterThanOrEqual(3);
  });

  it('rejects double-review', async () => {
    const { status } = await put(`/hr/leave-requests/${requestId}/review`, { approved: false });
    expect(status).toBe(409);
  });

  it('cancels an approved leave and restores balance', async () => {
    const before = await get(`/hr/leave-balances?employeeId=${employeeId}&year=2026`);
    const beforeUsed = Number(before.body.data.find((b: any) => b.leaveTypeId === leaveTypeId)?.used ?? 0);

    const c = await put(`/hr/leave-requests/${requestId}/cancel`, {});
    expect(c.status).toBe(200);
    expect(c.body.data.status).toBe('cancelled');

    const after = await get(`/hr/leave-balances?employeeId=${employeeId}&year=2026`);
    const afterUsed = Number(after.body.data.find((b: any) => b.leaveTypeId === leaveTypeId)?.used ?? 0);
    expect(afterUsed).toBeLessThan(beforeUsed);
  });

  it('day counting honors holiday', async () => {
    // Create a holiday on 2027-01-26
    await post('/hr/holidays', { name: `RD${testSuffix}`, date: '2027-01-26', type: 'national' });

    // 2027-01-25 (Mon) → 2027-01-27 (Wed): 3 days minus Republic Day = 2
    const { status, body } = await post('/hr/leave-requests', {
      employeeId,
      leaveTypeId,
      fromDate: '2027-01-25',
      toDate: '2027-01-27',
    });
    expect(status).toBe(201);
    expect(Number(body.data.days)).toBe(2);
  });
});

describe('HR Phase 2: Leave Balance Adjustments', () => {
  it('adjusts opening balance for an employee', async () => {
    const emps = await get('/hr/employees?limit=1');
    const empId = emps.body.data[0]?.id;
    const types = await get('/hr/leave-types');
    const typeId = types.body.data[0]?.id;
    if (!empId || !typeId) return;

    const { status, body } = await put('/hr/leave-balances', {
      employeeId: empId,
      leaveTypeId: typeId,
      year: 2026,
      opening: 5,
    });
    expect(status).toBe(200);
    expect(Number(body.data.opening)).toBe(5);
  });
});
