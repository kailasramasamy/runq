import { describe, it, expect } from 'vitest';
import { buildForm24QExport, type Form24QDeductor } from './form24q';
import { quarterMonths } from './tds-return.service';
import type { Form24QData } from '@runq/db';

const deductor: Form24QDeductor = {
  tan: 'BLRC12345D',
  pan: 'ABCDE1234F',
  name: 'Acme Industries',
  financialYear: '2026-27',
  quarter: 1,
};

const annexureIRow = {
  employeeId: 'e1',
  employeeCode: 'E001',
  employeeName: 'Ravi Kumar',
  pan: 'PANEM1234R',
  challanBsrCode: '0510308',
  challanSerialNo: '02458',
  challanDepositDate: '2026-05-05',
  paymentMonth: 4,
  amountPaid: 80000,
  tdsDeducted: 4550,
};

describe('quarterMonths', () => {
  it('maps Q1–Q3 to months within the FY start year', () => {
    expect(quarterMonths('2026-27', 1)).toEqual([
      { year: 2026, month: 4 }, { year: 2026, month: 5 }, { year: 2026, month: 6 },
    ]);
    expect(quarterMonths('2026-27', 2)).toEqual([
      { year: 2026, month: 7 }, { year: 2026, month: 8 }, { year: 2026, month: 9 },
    ]);
    expect(quarterMonths('2026-27', 3)).toEqual([
      { year: 2026, month: 10 }, { year: 2026, month: 11 }, { year: 2026, month: 12 },
    ]);
  });

  it('maps Q4 (Jan–Mar) into the next calendar year', () => {
    expect(quarterMonths('2026-27', 4)).toEqual([
      { year: 2027, month: 1 }, { year: 2027, month: 2 }, { year: 2027, month: 3 },
    ]);
  });
});

describe('buildForm24QExport', () => {
  it('emits the Annexure I header and a deductee row', () => {
    const data: Form24QData = { annexureI: [annexureIRow] };
    const out = buildForm24QExport(deductor, data);
    expect(out).toContain('# Form 24Q — TAN BLRC12345D');
    expect(out).toContain('# Annexure I — Deductee-wise deduction detail');
    expect(out).toContain('E001,Ravi Kumar,PANEM1234R,Apr,80000,4550,0510308,02458,2026-05-05');
  });

  it('omits Annexure II when not present (non-Q4)', () => {
    const out = buildForm24QExport(deductor, { annexureI: [annexureIRow] });
    expect(out).not.toContain('Annexure II');
  });

  it('includes Annexure II for Q4 returns', () => {
    const data: Form24QData = {
      annexureI: [annexureIRow],
      annexureII: [{
        employeeId: 'e1', employeeCode: 'E001', employeeName: 'Ravi Kumar',
        pan: 'PANEM1234R', grossSalary: 960000, standardDeduction: 75000,
        taxableIncome: 885000, taxOnIncome: 44200, tdsDeducted: 44200, monthsPaid: 12,
      }],
    };
    const out = buildForm24QExport({ ...deductor, quarter: 4 }, data);
    expect(out).toContain('# Annexure II — Annual salary detail & tax computation');
    expect(out).toContain('E001,Ravi Kumar,PANEM1234R,12,960000,75000,885000,44200,44200');
  });

  it('escapes commas in employee names', () => {
    const data: Form24QData = {
      annexureI: [{ ...annexureIRow, employeeName: 'Kumar, Ravi' }],
    };
    expect(buildForm24QExport(deductor, data)).toContain('"Kumar, Ravi"');
  });

  it('leaves challan columns blank when TDS is not yet deposited', () => {
    const data: Form24QData = {
      annexureI: [{
        ...annexureIRow, challanBsrCode: null, challanSerialNo: null, challanDepositDate: null,
      }],
    };
    expect(buildForm24QExport(deductor, data)).toContain('E001,Ravi Kumar,PANEM1234R,Apr,80000,4550,,,');
  });
});
