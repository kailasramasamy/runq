import { describe, it, expect } from 'vitest';
import { get, post, put, del, testSuffix } from './helpers';

const code = (s: string) => `${s}${testSuffix}`.slice(0, 30);

describe('HR Phase 1: Departments', () => {
  let deptId: string;

  it('creates a department', async () => {
    const { status, body } = await post('/hr/departments', {
      name: `Production${testSuffix}`,
      code: 'PROD',
    });
    expect(status).toBe(201);
    expect(body.data).toHaveProperty('id');
    expect(body.data.name).toContain('Production');
    deptId = body.data.id;
  });

  it('lists departments', async () => {
    const { status, body } = await get('/hr/departments');
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.find((d: any) => d.id === deptId)).toBeTruthy();
  });

  it('rejects duplicate department name', async () => {
    const { status } = await post('/hr/departments', {
      name: `Production${testSuffix}`,
    });
    expect(status).toBe(409);
  });

  it('updates a department', async () => {
    const { status, body } = await put(`/hr/departments/${deptId}`, {
      name: `Production Updated${testSuffix}`,
    });
    expect(status).toBe(200);
    expect(body.data.name).toContain('Updated');
  });
});

describe('HR Phase 1: Designations', () => {
  let desigId: string;

  it('creates a designation', async () => {
    const { status, body } = await post('/hr/designations', {
      name: `Operator${testSuffix}`,
      level: 1,
    });
    expect(status).toBe(201);
    desigId = body.data.id;
  });

  it('lists designations', async () => {
    const { status, body } = await get('/hr/designations');
    expect(status).toBe(200);
    expect(body.data.find((d: any) => d.id === desigId)).toBeTruthy();
  });
});

describe('HR Phase 1: Employees', () => {
  let employeeId: string;
  let deptId: string;
  let desigId: string;
  const empCode = code('E');

  it('seeds dept + desig for employee', async () => {
    const d = await post('/hr/departments', { name: `Assembly${testSuffix}` });
    expect(d.status).toBe(201);
    deptId = d.body.data.id;

    const g = await post('/hr/designations', { name: `Worker${testSuffix}`, level: 1 });
    expect(g.status).toBe(201);
    desigId = g.body.data.id;
  });

  it('creates an employee', async () => {
    const { status, body } = await post('/hr/employees', {
      employeeCode: empCode,
      firstName: 'Ravi',
      lastName: 'Kumar',
      email: `ravi${testSuffix}@test.com`,
      phone: '9876543210',
      joiningDate: '2025-01-15',
      employmentType: 'permanent',
      departmentId: deptId,
      designationId: desigId,
      pan: 'ABCDE1234F',
      ctcAnnual: 480000,
    });
    expect(status).toBe(201);
    expect(body.data.employeeCode).toBe(empCode);
    employeeId = body.data.id;
  });

  it('rejects duplicate employee code', async () => {
    const { status } = await post('/hr/employees', {
      employeeCode: empCode,
      firstName: 'Other',
      joiningDate: '2025-01-15',
    });
    expect(status).toBe(409);
  });

  it('rejects invalid PAN', async () => {
    const { status } = await post('/hr/employees', {
      employeeCode: code('B'),
      firstName: 'Bad',
      joiningDate: '2025-01-15',
      pan: 'INVALID',
    });
    expect(status).toBe(400);
  });

  it('gets an employee by id', async () => {
    const { status, body } = await get(`/hr/employees/${employeeId}`);
    expect(status).toBe(200);
    expect(body.data.firstName).toBe('Ravi');
    expect(body.data.departmentName).toContain('Assembly');
  });

  it('lists employees with pagination', async () => {
    const { status, body } = await get('/hr/employees?limit=10');
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toHaveProperty('total');
    expect(body.meta).toHaveProperty('totalPages');
  });

  it('searches employees', async () => {
    const { status, body } = await get(`/hr/employees?search=${empCode}`);
    expect(status).toBe(200);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by department', async () => {
    const { status, body } = await get(`/hr/employees?departmentId=${deptId}`);
    expect(status).toBe(200);
    expect(body.data.find((e: any) => e.id === employeeId)).toBeTruthy();
  });

  it('updates an employee', async () => {
    const { status, body } = await put(`/hr/employees/${employeeId}`, {
      phone: '9999999999',
      ctcAnnual: 500000,
    });
    expect(status).toBe(200);
    expect(body.data.phone).toBe('9999999999');
  });

  it('soft-deletes an employee', async () => {
    const { status } = await del(`/hr/employees/${employeeId}`);
    expect(status).toBe(200);

    const after = await get(`/hr/employees?search=${empCode}`);
    expect(after.body.data.find((e: any) => e.id === employeeId)).toBeFalsy();
  });
});

describe('HR Phase 1: Shifts', () => {
  let shiftId: string;

  it('creates a shift', async () => {
    const { status, body } = await post('/hr/shifts', {
      name: `Morning${testSuffix}`,
      startTime: '06:00',
      endTime: '14:00',
      breakMinutes: 30,
      weeklyOffDays: [0],
      isNightShift: false,
    });
    expect(status).toBe(201);
    shiftId = body.data.id;
  });

  it('rejects invalid time format', async () => {
    const { status } = await post('/hr/shifts', {
      name: `Bad${testSuffix}`,
      startTime: '6am',
      endTime: '14:00',
    });
    expect(status).toBe(400);
  });

  it('lists shifts', async () => {
    const { status, body } = await get('/hr/shifts');
    expect(status).toBe(200);
    expect(body.data.find((s: any) => s.id === shiftId)).toBeTruthy();
  });

  it('deletes a shift', async () => {
    const { status } = await del(`/hr/shifts/${shiftId}`);
    expect(status).toBe(200);
  });
});

describe('HR Phase 1: Holidays', () => {
  let holidayId: string;
  const date = `2030-08-15`; // future, unique-ish

  it('creates a holiday', async () => {
    const { status, body } = await post('/hr/holidays', {
      name: `Independence Day${testSuffix}`,
      date,
      type: 'national',
      isPaid: true,
    });
    expect(status).toBe(201);
    holidayId = body.data.id;
  });

  it('lists holidays by year', async () => {
    const { status, body } = await get('/hr/holidays?year=2030');
    expect(status).toBe(200);
    expect(body.data.find((h: any) => h.id === holidayId)).toBeTruthy();
  });

  it('deletes a holiday', async () => {
    const { status } = await del(`/hr/holidays/${holidayId}`);
    expect(status).toBe(200);
  });
});

describe('HR Phase 1: Attendance', () => {
  let employeeId: string;
  const empCode = code('AT');
  const date = '2026-05-01';

  it('seeds an employee for attendance', async () => {
    const { status, body } = await post('/hr/employees', {
      employeeCode: empCode,
      firstName: 'Suresh',
      joiningDate: '2025-01-01',
      employmentType: 'wage',
    });
    expect(status).toBe(201);
    employeeId = body.data.id;
  });

  it('upserts an attendance record', async () => {
    const { status, body } = await post('/hr/attendance', {
      employeeId,
      date,
      checkIn: '09:00',
      checkOut: '18:00',
      status: 'present',
      source: 'manual',
    });
    expect(status).toBe(201);
    expect(body.data.status).toBe('present');
    expect(Number(body.data.hoursWorked)).toBe(9);
  });

  it('idempotent upsert (no conflict on same employee+date)', async () => {
    const { status, body } = await post('/hr/attendance', {
      employeeId,
      date,
      checkIn: '10:00',
      checkOut: '19:00',
      status: 'half_day',
      source: 'manual',
    });
    expect(status).toBe(201);
    expect(body.data.status).toBe('half_day');
  });

  it('lists attendance with date filter', async () => {
    const { status, body } = await get(`/hr/attendance?dateFrom=${date}&dateTo=${date}`);
    expect(status).toBe(200);
    expect(body.data.find((r: any) => r.employeeId === employeeId)).toBeTruthy();
  });

  it('returns daily muster counts', async () => {
    const { status, body } = await get(`/hr/attendance/muster?date=${date}`);
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('present');
    expect(body.data).toHaveProperty('absent');
    expect(body.data).toHaveProperty('half_day');
  });

  it('imports biometric CSV records', async () => {
    const { status, body } = await post('/hr/attendance/biometric-import', {
      fileName: `test${testSuffix}.csv`,
      deviceType: 'eSSL',
      records: [
        { employeeCode: empCode, date: '2026-05-02', checkIn: '09:15', checkOut: '18:05' },
        { employeeCode: 'NONEXISTENT', date: '2026-05-02', checkIn: '09:00', checkOut: '18:00' },
      ],
    });
    expect(status).toBe(201);
    expect(body.data.totalRecords).toBe(2);
    expect(body.data.successCount).toBe(1);
    expect(body.data.errorCount).toBe(1);
    expect(body.data.errors[0].reason).toContain('Unknown employee');
  });

  it('biometric import shows up in import history', async () => {
    const { status, body } = await get('/hr/attendance/imports');
    expect(status).toBe(200);
    expect(body.data.find((i: any) => i.fileName.includes(testSuffix))).toBeTruthy();
  });
});
