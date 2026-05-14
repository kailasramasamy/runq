import { describe, it, expect } from 'vitest';
import {
  buildPfEcr, buildEsiReturn, buildNeftCsv, buildForm24QSummary,
  type ExportEmployee, type ExportPayslip,
} from './exporters';

const emp = (overrides: Partial<ExportEmployee> = {}): ExportEmployee => ({
  employeeCode: 'E001',
  firstName: 'Test',
  lastName: 'User',
  uan: '100123456789',
  pan: 'ABCDE1234F',
  esiNumber: '1234567890',
  bankAccountNumber: '50100123',
  bankIfsc: 'HDFC0001234',
  bankName: 'HDFC',
  ...overrides,
});

const slip = (overrides: Partial<ExportPayslip> = {}): ExportPayslip => ({
  employeeId: 'x',
  gross: 30000, netPay: 27000,
  pfEmployee: 1800, pfEmployer: 1800,
  esiEmployee: 225, esiEmployer: 975,
  pt: 200, tds: 0,
  workingDays: 26, presentDays: 26, lopDays: 0, paidDays: 26,
  earnings: [{ code: 'BASIC', name: 'Basic', amount: 15000 }, { code: 'HRA', name: 'HRA', amount: 6000 }],
  ...overrides,
});

describe('PF ECR exporter', () => {
  it('emits one line per UAN holder with PF', () => {
    const map = new Map([['E001', slip()]]);
    const out = buildPfEcr([emp()], map);
    expect(out.split('\n').length).toBe(1);
    expect(out).toContain('100123456789');
    expect(out).toContain('#~#');
  });

  it('skips employees without UAN', () => {
    const map = new Map([['E001', slip()]]);
    expect(buildPfEcr([emp({ uan: null })], map)).toBe('');
  });

  it('caps PF wages at 15K', () => {
    const map = new Map([['E001', slip({
      earnings: [{ code: 'BASIC', name: 'Basic', amount: 20000 }, { code: 'DA', name: 'DA', amount: 5000 }],
    })]]);
    const out = buildPfEcr([emp()], map);
    expect(out).toContain('#~#15000#~#15000#~#15000');
  });
});

describe('ESI exporter', () => {
  it('produces CSV with header + one row per IP', () => {
    const map = new Map([['E001', slip()]]);
    const out = buildEsiReturn([emp()], map);
    const lines = out.split('\n');
    expect(lines[0]).toBe('IP Number,Name,No. of days,Gross,ESI Contribution');
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('1234567890');
  });

  it('skips employees with no ESI contribution', () => {
    const map = new Map([['E001', slip({ esiEmployee: 0 })]]);
    const out = buildEsiReturn([emp()], map);
    expect(out.split('\n').length).toBe(1); // only header
  });
});

describe('NEFT exporter', () => {
  it('emits CSV with bank details + net amount', () => {
    const map = new Map([['E001', slip()]]);
    const out = buildNeftCsv([emp()], map, 'PAYROLL-2026-04');
    expect(out).toContain('Account Number,IFSC,Beneficiary Name,Amount,Reference,Email');
    expect(out).toContain('50100123,HDFC0001234,Test User,27000,PAYROLL-2026-04/E001,');
  });

  it('skips employees without bank info', () => {
    const map = new Map([['E001', slip()]]);
    const out = buildNeftCsv([emp({ bankAccountNumber: null })], map, 'X');
    expect(out.split('\n').length).toBe(1);
  });

  it('escapes commas in names', () => {
    const map = new Map([['E001', slip()]]);
    const out = buildNeftCsv([emp({ firstName: 'Test', lastName: 'User, Jr.' })], map, 'X');
    expect(out).toContain('"Test User, Jr."');
  });
});

describe('Form 24Q summary', () => {
  it('produces CSV with aggregated rows', () => {
    const out = buildForm24QSummary([
      { employeeCode: 'E001', employeeName: 'Test User', pan: 'ABCDE1234F', monthsPaid: 3, totalGross: 90000, totalTds: 2500 },
    ]);
    expect(out).toContain('Employee Code,Name,PAN,Months Paid,Total Gross,Total TDS');
    expect(out).toContain('E001,Test User,ABCDE1234F,3,90000,2500');
  });
});
