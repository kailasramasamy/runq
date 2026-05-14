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
 * ESIC Monthly Contribution (MC) return — CSV mirroring the ESIC upload
 * template's column order, one row per insured person (IP).
 *
 * The portal computes the contribution itself from wages, so there's no
 * contribution column. Columns:
 *   IP Number | IP Name | No. of Days | Total Monthly Wages | Reason Code |
 *   Last Working Day
 *
 * Reason Code (ESIC): 0 = normal, 1 = on leave (zero paid days). Codes 2–9
 * (Left Service, Retired, Death, …) need the employee's exit date — out of
 * scope here, since payroll runs only process active employees. Last Working
 * Day is left blank as it's only meaningful for those exit codes.
 *
 * Inclusion: an IP appears if they contributed this month, or if they're a
 * covered IP (has an ESI number) with zero paid days. An employee with paid
 * days but no ESI is above the ₹21,000 ceiling and not a covered IP — skipped.
 */
export function buildEsiReturn(employees: ExportEmployee[], payslipsByEmp: Map<string, ExportPayslip>): string {
  const rows: string[] = [
    'IP Number,IP Name,No. of Days,Total Monthly Wages,Reason Code,Last Working Day',
  ];
  for (const e of employees) {
    if (!e.esiNumber) continue;
    const p = payslipsByEmp.get(e.employeeCode);
    if (!p) continue;

    const contributing = n(p.esiEmployee) > 0 || n(p.esiEmployer) > 0;
    const zeroDays = n(p.paidDays) === 0;
    // Paid days but no ESI → above the ceiling, not a covered IP this month.
    if (!contributing && !zeroDays) continue;

    const name = `${e.firstName}${e.lastName ? ' ' + e.lastName : ''}`;
    rows.push([
      e.esiNumber,
      csvEsc(name),
      n(p.paidDays),
      n(p.gross),
      contributing ? 0 : 1,   // reason code: 0 = normal, 1 = on leave (zero days)
      '',                     // last working day — only for exit reason codes
    ].join(','));
  }
  return rows.join('\n');
}

/**
 * Professional Tax return — generic per-state CSV summary. Each state's PT
 * portal has its own template, but all want the same core fields, so this
 * emits a neutral summary the customer maps onto their state's form. One row
 * per employee with a non-zero PT deduction.
 * Columns: Employee Code | Name | Gross Wages | Professional Tax
 */
export function buildPtReturn(
  employees: ExportEmployee[],
  payslipsByEmp: Map<string, ExportPayslip>,
): string {
  const rows: string[] = ['Employee Code,Name,Gross Wages,Professional Tax'];
  for (const e of employees) {
    const p = payslipsByEmp.get(e.employeeCode);
    if (!p) continue;
    if (n(p.pt) === 0) continue;

    const name = `${e.firstName}${e.lastName ? ' ' + e.lastName : ''}`;
    rows.push([e.employeeCode, csvEsc(name), n(p.gross), n(p.pt)].join(','));
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

function csvEsc(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
