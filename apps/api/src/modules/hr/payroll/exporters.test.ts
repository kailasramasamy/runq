import { describe, it, expect } from 'vitest';
import {
  buildPfEcr, buildEsiReturn, buildPtReturn, buildNeftCsv,
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

describe('ESI exporter — ESIC Monthly Contribution template', () => {
  it('emits the 6-column MC header and a contributing IP row (reason code 0)', () => {
    const out = buildEsiReturn([emp()], new Map([['E001', slip()]]));
    const lines = out.split('\n');
    expect(lines[0]).toBe(
      'IP Number,IP Name,No. of Days,Total Monthly Wages,Reason Code,Last Working Day',
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('1234567890,Test User,26,30000,0,');
  });

  it('includes a covered IP with zero paid days as reason code 1', () => {
    const map = new Map([['E001', slip({ gross: 0, esiEmployee: 0, esiEmployer: 0, paidDays: 0 })]]);
    expect(buildEsiReturn([emp()], map).split('\n')[1]).toBe('1234567890,Test User,0,0,1,');
  });

  it('excludes an above-ceiling employee (paid days but no ESI)', () => {
    const map = new Map([['E001', slip({ esiEmployee: 0, esiEmployer: 0 })]]);
    expect(buildEsiReturn([emp()], map).split('\n')).toHaveLength(1); // header only
  });

  it('excludes an employee with no ESI number', () => {
    const map = new Map([['E001', slip()]]);
    expect(buildEsiReturn([emp({ esiNumber: null })], map).split('\n')).toHaveLength(1);
  });

  it('includes a continued-coverage IP earning above ₹21,000 on full wages', () => {
    // calcEsi(23000, true) → EE 172.5, ER 747.5 — covered, full gross reported.
    const map = new Map([['E001', slip({ gross: 23000, esiEmployee: 172.5, esiEmployer: 747.5 })]]);
    expect(buildEsiReturn([emp()], map).split('\n')[1]).toBe('1234567890,Test User,26,23000,0,');
  });
});

describe('PT return exporter', () => {
  it('emits a header and one row per employee with PT', () => {
    const out = buildPtReturn([emp()], new Map([['E001', slip()]]));
    const lines = out.split('\n');
    expect(lines[0]).toBe('Employee Code,Name,Gross Wages,Professional Tax');
    expect(lines[1]).toBe('E001,Test User,30000,200');
  });

  it('skips employees with zero PT', () => {
    const map = new Map([['E001', slip({ pt: 0 })]]);
    expect(buildPtReturn([emp()], map).split('\n')).toHaveLength(1); // header only
  });

  it('escapes commas in names', () => {
    const map = new Map([['E001', slip()]]);
    const out = buildPtReturn([emp({ firstName: 'Test', lastName: 'User, Jr.' })], map);
    expect(out).toContain('"Test User, Jr."');
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
