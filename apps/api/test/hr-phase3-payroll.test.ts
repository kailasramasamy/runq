import { describe, it, expect } from 'vitest';
import { get, post, put, del, testSuffix } from './helpers';

const code = (s: string) => `${s}${testSuffix}`.slice(0, 30);

describe('HR Phase 3: Salary Components', () => {
  let compId: string;
  const cCode = `C${Math.floor(Math.random() * 999)}`;

  it('creates a component', async () => {
    const { status, body } = await post('/hr/salary-components', {
      name: `Custom${testSuffix}`,
      code: cCode,
      type: 'earning',
      calcType: 'fixed',
      defaultValue: 1500,
    });
    expect(status).toBe(201);
    compId = body.data.id;
  });

  it('rejects duplicate code', async () => {
    const { status } = await post('/hr/salary-components', {
      name: 'Dup', code: cCode, type: 'earning', calcType: 'fixed', defaultValue: 0,
    });
    expect(status).toBe(409);
  });

  it('lists components', async () => {
    const { status, body } = await get('/hr/salary-components');
    expect(status).toBe(200);
    expect(body.data.find((c: any) => c.id === compId)).toBeTruthy();
  });

  it('updates a component', async () => {
    const { status, body } = await put(`/hr/salary-components/${compId}`, { defaultValue: 2000 });
    expect(status).toBe(200);
    expect(Number(body.data.defaultValue)).toBe(2000);
  });
});

describe('HR Phase 3: Salary Structures + Payroll Run', () => {
  let employeeId: string;
  let structureId: string;
  let runId: string;
  let basicId: string;
  let hraId: string;
  const empCode = code('PR');

  it('creates BASIC + HRA components', async () => {
    const suffix = Math.floor(Math.random() * 99999);
    const b = await post('/hr/salary-components', {
      name: 'Basic', code: `BASIC${suffix}`, type: 'earning',
      calcType: 'percent_of_ctc', defaultValue: 40, isPfApplicable: true,
    });
    expect(b.status).toBe(201);
    basicId = b.body.data.id;

    const h = await post('/hr/salary-components', {
      name: 'HRA', code: `HRA${suffix}`, type: 'earning',
      calcType: 'percent_of_basic', defaultValue: 40,
    });
    expect(h.status).toBe(201);
    hraId = h.body.data.id;
  });

  it('seeds employee', async () => {
    const e = await post('/hr/employees', {
      employeeCode: empCode,
      firstName: 'Payroll',
      lastName: 'Test',
      joiningDate: '2024-01-01',
      employmentType: 'permanent',
      ctcAnnual: 600000,
    });
    expect(e.status).toBe(201);
    employeeId = e.body.data.id;
  });

  it('creates a salary structure with components', async () => {
    const { status, body } = await post('/hr/salary-structures', {
      name: `Test Structure${testSuffix}`,
      description: 'Test',
      components: [
        { salaryComponentId: basicId, value: 40, calcType: 'percent_of_ctc' },
        { salaryComponentId: hraId, value: 40, calcType: 'percent_of_basic' },
      ],
    });
    expect(status).toBe(201);
    structureId = body.data.id;
  });

  it('fetches structure with components', async () => {
    const { status, body } = await get(`/hr/salary-structures/${structureId}`);
    expect(status).toBe(200);
    expect(body.data.components.length).toBe(2);
  });

  it('assigns salary to employee', async () => {
    const { status, body } = await post('/hr/employee-salaries', {
      employeeId,
      salaryStructureId: structureId,
      ctcAnnual: 600000,
      effectiveFrom: '2026-01-01',
    });
    expect(status).toBe(201);
    expect(body.data.componentsSnapshot.length).toBe(2);
  });

  it('creates a payroll run', async () => {
    // Use future month to avoid collision with seeded data
    const futureMonth = Math.floor(Math.random() * 12) + 1;
    const { status, body } = await post('/hr/payroll-runs', {
      month: futureMonth,
      year: 2099,
      notes: 'Test run',
    });
    expect(status).toBe(201);
    expect(body.data.status).toBe('draft');
    runId = body.data.id;
  });

  it('rejects duplicate run for same month', async () => {
    const run = await get(`/hr/payroll-runs/${runId}`);
    const { month, year } = run.body.data;
    const { status } = await post('/hr/payroll-runs', { month, year });
    expect(status).toBe(409);
  });

  it('processes the payroll run', async () => {
    const { status, body } = await post(`/hr/payroll-runs/${runId}/process`, {});
    expect(status).toBe(200);
    expect(body.data.status).toBe('processed');
    expect(body.data.totalEmployees).toBeGreaterThan(0);
  });

  it('payslip for our test employee has gross + statutory deductions', async () => {
    const { status, body } = await get(`/hr/payroll-runs/${runId}/payslips`);
    expect(status).toBe(200);
    const ours = body.data.find((p: any) => p.employeeId === employeeId);
    expect(ours).toBeTruthy();
    expect(Number(ours.gross)).toBeGreaterThan(0);
    // Basic 40% of 50K = 20K → PF 12% capped at 15K = 1800
    expect(Number(ours.pfEmployee)).toBe(1800);
    expect(Number(ours.netPay)).toBe(Number(ours.gross) - Number(ours.totalDeductions));
  });

  it('approves the run', async () => {
    const { status, body } = await post(`/hr/payroll-runs/${runId}/approve`, {});
    expect(status).toBe(200);
    expect(body.data.status).toBe('approved');
  });

  it('rejects re-process after approval', async () => {
    const { status } = await post(`/hr/payroll-runs/${runId}/process`, {});
    expect(status).toBe(409);
  });

  it('closes the run', async () => {
    const { status, body } = await post(`/hr/payroll-runs/${runId}/close`, {});
    expect(status).toBe(200);
    expect(body.data.status).toBe('closed');
  });
});
