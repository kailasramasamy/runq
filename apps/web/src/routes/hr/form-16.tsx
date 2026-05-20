import { useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import {
  PageHeader, Button, Select,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { StatTile, EmptyState, ListToolbar } from '@/components/ar/primitives';
import { formatINR } from '@/lib/utils';
import {
  useForm16, type Form16Result, type Form16PartB,
} from '@/hooks/queries/use-hr-payroll';

/** Indian FY label for the current date — Apr-Mar. */
function currentFinancialYear(): string {
  const now = new Date();
  const startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function Form16Page() {
  const [financialYear, setFinancialYear] = useState(currentFinancialYear());
  const [search, setSearch] = useState('');
  const { data, isLoading } = useForm16(financialYear);

  const result = data?.data;
  const employees = result?.employees ?? [];
  const totalTds = employees.reduce((s, e) => s + e.tdsDeducted, 0);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? employees.filter((e) =>
        e.employeeName.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        (e.employeePan ?? '').toLowerCase().includes(q))
    : employees;

  const startYear = new Date().getFullYear();
  const fyOptions = [startYear - 2, startYear - 1, startYear, startYear + 1].map((y) => {
    const fy = `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
    return { value: fy, label: `FY ${fy}` };
  });

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Form 16' }]}
        title="Form 16 — Part B"
        description="Annual salary & tax computation per employee, derived from payslips. Print and issue to employees by 15 June. Part A (challan summary) is downloaded separately from TRACES."
        actions={
          <div className="w-40">
            <Select
              label=""
              value={financialYear}
              onChange={(e) => setFinancialYear(e.target.value)}
              options={fyOptions}
            />
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Assessment Year" value={result?.assessmentYear ?? '—'} />
        <StatTile label="Employees" value={employees.length} />
        <StatTile label="Total TDS" value={formatINR(totalTds)} />
      </div>

      {employees.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by name, code or PAN…"
          count={filtered.length}
          noun="employee"
        />
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Employee</Th>
            <Th>PAN</Th>
            <Th align="right">Gross Salary</Th>
            <Th align="right">Total Income</Th>
            <Th align="right">Tax Liability</Th>
            <Th align="right">TDS</Th>
            <Th align="right">Balance</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={8} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : employees.length === 0 ? (
            <tr><td colSpan={8}>
              <EmptyState
                icon={<FileText size={18} />}
                title="No payroll for this financial year"
                description="Process and approve payroll runs to generate Form 16 Part B."
              />
            </td></tr>
          ) : filtered.length === 0 ? (
            <tr><td colSpan={8}>
              <EmptyState icon={<FileText size={18} />} title="No employees match" description="Try a different search term." />
            </td></tr>
          ) : filtered.map((e) => (
            <TableRow key={e.employeeId}>
              <TableCell>
                <div className="min-w-0">
                  <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>{e.employeeName}</div>
                  <div className="num truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {e.employeeCode} · {e.monthsPaid} month(s)
                  </div>
                </div>
              </TableCell>
              <TableCell className="num" style={{ color: e.employeePan ? 'var(--text-2)' : '#dc2626' }}>
                {e.employeePan ?? 'missing'}
              </TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{formatINR(e.grossSalary)}</TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{formatINR(e.totalIncome)}</TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{formatINR(e.totalTaxLiability)}</TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{formatINR(e.tdsDeducted)}</TableCell>
              <TableCell align="right" className="num font-medium" style={{ color: e.balancePayable > 0 ? '#dc2626' : 'var(--text-1)' }}>
                {formatINR(e.balancePayable)}
              </TableCell>
              <TableCell align="right">
                {result && (
                  <Button size="sm" variant="outline" onClick={() => printForm16(result, e)}>
                    <Printer size={13} /> Form 16
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function printForm16(result: Form16Result, emp: Form16PartB) {
  const w = window.open('', '_blank', 'width=800,height=1000');
  if (!w) return;
  w.document.write(buildForm16Html(result, emp));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 200);
}

function buildForm16Html(result: Form16Result, e: Form16PartB): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
  const { employer, financialYear, assessmentYear } = result;
  const row = (label: string, amount: number, bold = false) =>
    `<tr${bold ? ' style="font-weight:600"' : ''}><td style="padding:6px 8px;border-bottom:1px solid #e5e5e5">${label}</td>` +
    `<td style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e5e5">${fmt(amount)}</td></tr>`;
  const qRows = e.quarterly
    .map((q) =>
      `<tr><td style="padding:5px 8px;border-bottom:1px solid #e5e5e5">Q${q.quarter}</td>` +
      `<td style="padding:5px 8px;text-align:right;border-bottom:1px solid #e5e5e5">${fmt(q.tds)}</td>` +
      `<td style="padding:5px 8px;border-bottom:1px solid #e5e5e5">${q.receiptNumber ?? '—'}</td></tr>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Form 16 Part B — ${e.employeeName} ${financialYear}</title>
  <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;padding:28px;max-width:720px;margin:0 auto}
  h1{font-size:17px;margin:0 0 2px}h2{font-size:12px;margin:18px 0 6px;letter-spacing:.05em;text-transform:uppercase;color:#666}
  table{width:100%;border-collapse:collapse;font-size:13px}.muted{color:#666;font-size:12px}
  .grid{display:flex;gap:32px;margin-top:8px}.grid>div{flex:1}
  .net{background:#eef2ff;padding:10px;margin-top:16px;display:flex;justify-content:space-between;border-radius:6px;font-weight:600}
  </style></head><body>
  <h1>Form 16 — Part B</h1>
  <div class="muted">Certificate under Section 203 — TDS on Salary · FY ${financialYear} · AY ${assessmentYear}</div>
  <div class="grid">
    <div><h2>Employer</h2><div class="muted">${employer.name || '—'}</div>
      <div class="muted">TAN: ${employer.tan ?? '—'} · PAN: ${employer.pan ?? '—'}</div></div>
    <div><h2>Employee</h2><div class="muted">${e.employeeName} (${e.employeeCode})</div>
      <div class="muted">PAN: ${e.employeePan ?? '—'}${e.designation ? ' · ' + e.designation : ''}</div></div>
  </div>

  <h2>Salary & Tax Computation</h2>
  <table><tbody>
  ${row('Gross salary', e.grossSalary)}
  ${row('Less: Standard deduction u/s 16(ia)', e.standardDeduction)}
  ${row('Income chargeable under the head “Salaries”', e.incomeChargeableSalaries, true)}
  ${row('Less: Deductions under Chapter VI-A', e.chapterVIADeductions)}
  ${row('Total income', e.totalIncome, true)}
  ${row('Tax on total income', e.taxBeforeRebate)}
  ${row('Less: Rebate u/s 87A', e.rebate87A)}
  ${row('Tax after rebate', e.taxAfterRebate)}
  ${row('Add: Health & education cess (4%)', e.cess)}
  ${row('Total tax liability', e.totalTaxLiability, true)}
  ${row('Less: TDS deducted', e.tdsDeducted)}
  </tbody></table>
  <div class="net"><span>${e.balancePayable >= 0 ? 'Balance tax payable' : 'Refund due'}</span><span>${fmt(Math.abs(e.balancePayable))}</span></div>

  <h2>Quarterly TDS & Form 24Q Receipts</h2>
  <table><thead><tr>
    <th style="padding:5px 8px;text-align:left;border-bottom:2px solid #ccc">Quarter</th>
    <th style="padding:5px 8px;text-align:right;border-bottom:2px solid #ccc">TDS</th>
    <th style="padding:5px 8px;text-align:left;border-bottom:2px solid #ccc">24Q Receipt No.</th>
  </tr></thead><tbody>${qRows}</tbody></table>

  <div class="muted" style="margin-top:18px">Computed under the new tax regime, no declarations. Part A (TRACES-signed
  challan summary) must be attached separately. Generated by runQ.</div>
  </body></html>`;
}
