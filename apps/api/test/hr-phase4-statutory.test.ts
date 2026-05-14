import { describe, it, expect } from 'vitest';
import { get, post, put, testSuffix } from './helpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3003/api/v1';

async function rawGet(path: string): Promise<{ status: number; text: string }> {
  // get auth token via the helper-friendly login first
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.TEST_EMAIL || 'appreview@runq.in',
      password: process.env.TEST_PASSWORD || 'AppleReview2026!',
      tenant: process.env.TEST_TENANT || 'runq-demo',
    }),
  });
  const token = (await loginRes.json()).data?.token;
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, text: await res.text() };
}

describe('HR Phase 4: Statutory exports', () => {
  let runId: string;
  let employeeId: string;

  it('sets up employee + run + process', async () => {
    // Component
    const suffix = Math.floor(Math.random() * 99999);
    const b = await post('/hr/salary-components', {
      name: 'Basic', code: `BSC${suffix}`, type: 'earning', calcType: 'percent_of_ctc',
      defaultValue: 60, isPfApplicable: true,
    });
    const basicId = b.body.data.id;

    // Structure
    const s = await post('/hr/salary-structures', {
      name: `S${testSuffix}`,
      components: [{ salaryComponentId: basicId, value: 60, calcType: 'percent_of_ctc' }],
    });
    const structureId = s.body.data.id;

    // Employee — with UAN + PAN + ESI + Bank
    const e = await post('/hr/employees', {
      employeeCode: `S${suffix}`,
      firstName: 'Stat',
      lastName: 'Tester',
      joiningDate: '2024-01-01',
      employmentType: 'permanent',
      ctcAnnual: 240000,
      pan: 'ABCDE1234F',
      uan: '100123456789',
      esiNumber: '1234567890',
      bankAccountNumber: '50100123',
      bankIfsc: 'HDFC0001234',
      bankName: 'HDFC',
    });
    employeeId = e.body.data.id;

    await post('/hr/employee-salaries', {
      employeeId,
      salaryStructureId: structureId,
      ctcAnnual: 240000,
      effectiveFrom: '2026-01-01',
    });

    // Run + process
    const r = await post('/hr/payroll-runs', { month: Math.floor(Math.random() * 12) + 1, year: 2098 });
    runId = r.body.data.id;
    const proc = await post(`/hr/payroll-runs/${runId}/process`, {});
    expect(proc.status).toBe(200);
    expect(proc.body.data.totalEmployees).toBeGreaterThan(0);
  });

  it('downloads PF ECR (text/plain with UAN)', async () => {
    const r = await rawGet(`/hr/payroll-runs/${runId}/exports/pf-ecr`);
    expect(r.status).toBe(200);
    expect(r.text).toContain('100123456789');
    expect(r.text).toContain('#~#');
  });

  it('downloads ESI CSV with header', async () => {
    const r = await rawGet(`/hr/payroll-runs/${runId}/exports/esi`);
    expect(r.status).toBe(200);
    // ESI exempt if gross > 21K. CTC 20K/mo, gross ≈ 20K → ESI applies.
    expect(r.text).toContain('IP Number,Name,No. of days,Gross,ESI Contribution');
  });

  it('downloads NEFT CSV with bank details', async () => {
    const r = await rawGet(`/hr/payroll-runs/${runId}/exports/neft`);
    expect(r.status).toBe(200);
    expect(r.text).toContain('Account Number,IFSC,Beneficiary Name,Amount');
    expect(r.text).toContain('50100123,HDFC0001234');
  });

  it('approves run and posts a JE', async () => {
    const a = await post(`/hr/payroll-runs/${runId}/approve`, {});
    expect(a.status).toBe(200);

    // Check journal entries
    const je = await get('/gl/journal-entries?sourceType=payroll_run');
    expect(je.status).toBe(200);
    const ours = je.body.data?.find((j: any) => j.sourceId === runId);
    expect(ours).toBeTruthy();
    expect(Number(ours.totalDebit)).toBeGreaterThan(0);
    expect(Number(ours.totalDebit)).toBe(Number(ours.totalCredit));
  });
});

describe('HR Phase 4: Form 24Q', () => {
  it('returns aggregated TDS rows per quarter', async () => {
    const { status, body } = await get('/hr/payroll/form-24q?year=2098&quarter=1');
    expect(status).toBe(200);
    expect(Array.isArray(body.data.rows)).toBe(true);
  });
});
