import { describe, it, expect } from 'vitest';
import { get, post, put, testSuffix } from './helpers';

const code = (s: string) => `${s}${testSuffix}`.slice(0, 30);

describe('HR Phase 5: Wage register', () => {
  let employeeId: string;
  const empCode = code('W');

  it('creates a wage employee with daily rate + agency', async () => {
    const { status, body } = await post('/hr/employees', {
      employeeCode: empCode,
      firstName: 'Wage',
      lastName: 'Worker',
      joiningDate: '2024-01-01',
      employmentType: 'wage',
      dailyWageRate: 500,
      agency: `Test Agency${testSuffix}`,
    });
    expect(status).toBe(201);
    expect(body.data.employmentType).toBe('wage');
    employeeId = body.data.id;
  });

  it('records 3 days of attendance', async () => {
    const dates = ['2099-04-01', '2099-04-02', '2099-04-03'];
    for (const date of dates) {
      const r = await post('/hr/attendance', {
        employeeId, date,
        checkIn: '09:00', checkOut: '18:00',
        status: 'present', source: 'manual',
      });
      expect(r.status).toBe(201);
    }
  });

  it('wage register lists the employee with computed gross', async () => {
    const { status, body } = await get('/hr/wage-register?year=2099&month=4');
    expect(status).toBe(200);
    const ours = body.data.find((r: any) => r.employeeCode === empCode);
    expect(ours).toBeTruthy();
    expect(ours.daysWorked).toBeGreaterThanOrEqual(3);
    expect(Number(ours.dailyWageRate)).toBe(500);
    expect(Number(ours.grossWages)).toBeGreaterThanOrEqual(1500);
    expect(ours.agency).toContain('Test Agency');
  });
});

describe('HR Phase 5: Reimbursement → AP bill', () => {
  let employeeId: string;
  let claimId: string;
  const empCode = code('R');

  it('seeds employee for reimbursement', async () => {
    const e = await post('/hr/employees', {
      employeeCode: empCode,
      firstName: 'Reimb',
      lastName: 'Test',
      joiningDate: '2024-01-01',
      employmentType: 'permanent',
      email: `reimb${Math.floor(Math.random() * 9999)}@test.com`,
    });
    expect(e.status).toBe(201);
    employeeId = e.body.data.id;
  });

  it('creates + approves an expense claim', async () => {
    const c = await post('/hr/expense-claims', {
      claimDate: '2026-05-10',
      description: 'Test reimbursement',
      items: [
        { expenseDate: '2026-05-10', category: 'Travel', description: 'Cab to client', amount: 1200 },
        { expenseDate: '2026-05-10', category: 'Meals', description: 'Working lunch', amount: 350 },
      ],
    });
    expect(c.status).toBe(201);
    claimId = c.body.data.id;

    const sub = await put(`/hr/expense-claims/${claimId}/submit`, {});
    expect(sub.status).toBe(200);

    const apr = await put(`/hr/expense-claims/${claimId}/approve`, { approved: true });
    expect(apr.status).toBe(200);
    expect(apr.body.data.status).toBe('approved');
  });

  it('posts claim to AP — creates vendor + draft bill', async () => {
    const { status, body } = await post(`/hr/expense-claims/${claimId}/post-to-ap`, { employeeId });
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('billId');
    expect(body.data).toHaveProperty('vendorId');
  });

  it('rejects re-posting', async () => {
    const { status } = await post(`/hr/expense-claims/${claimId}/post-to-ap`, { employeeId });
    expect(status).toBe(409);
  });

  it('employee now has vendorId linked', async () => {
    const { body } = await get(`/hr/employees/${employeeId}`);
    expect(body.data.vendorId).toBeTruthy();
  });
});
