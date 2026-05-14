/**
 * Statutory + bank export builders for a processed payroll run.
 *
 * Each function takes already-computed payslips + employee meta and returns
 * a string in the target file format. No DB I/O — pure functions, easy to
 * unit-test.
 */

export interface ExportEmployee {
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  uan: string | null;
  pan: string | null;
  esiNumber: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
}

export interface ExportPayslip {
  employeeId: string;
  gross: string | number;
  netPay: string | number;
  pfEmployee: string | number;
  pfEmployer: string | number;
  esiEmployee: string | number;
  esiEmployer: string | number;
  pt: string | number;
  tds: string | number;
  workingDays: string | number;
  presentDays: string | number;
  lopDays: string | number;
  paidDays: string | number;
  earnings: Array<{ code: string; name: string; amount: number }>;
}

const n = (v: string | number) => Math.round(Number(v));

/**
 * EPFO ECR 2.0 — pipe-delimited, one line per UAN.
 * Columns: UAN | Name | Gross | EPF wages | EPS wages | EDLI wages |
 *          EPF contribution (EE 12%) | EPS contribution (ER 8.33%) |
 *          EPF-EPS diff (ER 3.67%) | Refund of advances | NCP days
 *
 * Col 9 is the *employer's* share remitted into EPF (12% − 8.33%), NOT EDLI —
 * EDLI/admin are charged separately on the challan, not in the ECR line.
 * NCP days = non-contributory paid days (LOP).
 */
export function buildPfEcr(employees: ExportEmployee[], payslipsByEmp: Map<string, ExportPayslip>): string {
  const lines: string[] = [];
  for (const e of employees) {
    if (!e.uan) continue;
    const p = payslipsByEmp.get(e.employeeCode);
    if (!p) continue;
    if (n(p.pfEmployee) === 0 && n(p.pfEmployer) === 0) continue;

    const name = `${e.firstName}${e.lastName ? ' ' + e.lastName : ''}`.toUpperCase();
    const gross = n(p.gross);
    // Find Basic + DA total — these are PF wages
    const pfWages = Math.min(
      15000,
      p.earnings
        .filter((c) => c.code === 'BASIC' || c.code === 'DA')
        .reduce((s, c) => s + c.amount, 0),
    );
    const epsWages = Math.min(15000, pfWages);
    const edliWages = pfWages;

    const epfContrib = n(p.pfEmployee);                       // employee 12%
    const epsContrib = n(epsWages * 0.0833);                  // employer 8.33% → pension
    const epfEpsDiff = Math.max(0, n(p.pfEmployer) - epsContrib); // employer 3.67% → EPF
    const refund = 0;
    const ncpDays = n(p.lopDays);

    lines.push(
      [
        e.uan,
        name,
        gross,
        n(pfWages),
        n(epsWages),
        n(edliWages),
        epfContrib,
        epsContrib,
        epfEpsDiff,
        refund,
        ncpDays,
      ].join('#~#'),
    );
  }
  return lines.join('\n');
}

/**
 * ESIC return — CSV, one row per IP (insured person).
 * Columns: IP Number | Name | No. of days | Gross | ESI contribution (employee)
 */
export function buildEsiReturn(employees: ExportEmployee[], payslipsByEmp: Map<string, ExportPayslip>): string {
  const rows: string[] = ['IP Number,Name,No. of days,Gross,ESI Contribution'];
  for (const e of employees) {
    if (!e.esiNumber) continue;
    const p = payslipsByEmp.get(e.employeeCode);
    if (!p) continue;
    if (n(p.esiEmployee) === 0) continue;

    const name = `${e.firstName}${e.lastName ? ' ' + e.lastName : ''}`;
    rows.push([
      e.esiNumber,
      csvEsc(name),
      n(p.paidDays),
      n(p.gross),
      n(p.esiEmployee),
    ].join(','));
  }
  return rows.join('\n');
}

/**
 * Bank NEFT bulk transfer CSV — generic format that most Indian banks accept.
 * Columns: A/C Number | IFSC | Beneficiary Name | Amount | Reference | Email
 */
export function buildNeftCsv(
  employees: ExportEmployee[],
  payslipsByEmp: Map<string, ExportPayslip>,
  reference: string,
): string {
  const rows: string[] = ['Account Number,IFSC,Beneficiary Name,Amount,Reference,Email'];
  for (const e of employees) {
    if (!e.bankAccountNumber || !e.bankIfsc) continue;
    const p = payslipsByEmp.get(e.employeeCode);
    if (!p) continue;
    const net = n(p.netPay);
    if (net <= 0) continue;

    const name = `${e.firstName}${e.lastName ? ' ' + e.lastName : ''}`;
    rows.push([
      e.bankAccountNumber,
      e.bankIfsc,
      csvEsc(name),
      net,
      `${reference}/${e.employeeCode}`,
      '',
    ].join(','));
  }
  return rows.join('\n');
}

/** Form 24Q rolling aggregation per employee for a quarter. */
export interface Form24QRow {
  employeeCode: string;
  employeeName: string;
  pan: string | null;
  monthsPaid: number;
  totalGross: number;
  totalTds: number;
}

export function buildForm24QSummary(rows: Form24QRow[]): string {
  const lines: string[] = ['Employee Code,Name,PAN,Months Paid,Total Gross,Total TDS'];
  for (const r of rows) {
    lines.push([
      r.employeeCode,
      csvEsc(r.employeeName),
      r.pan ?? '',
      r.monthsPaid,
      r.totalGross,
      r.totalTds,
    ].join(','));
  }
  return lines.join('\n');
}

function csvEsc(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
