import { useState } from 'react';
import { Badge } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import {
  useEmployee, useLeaveBalances, useLeaveRequests,
  type LeaveRequestStatus,
} from '@/hooks/queries/use-hr';
import {
  useEmployeeSalaries, useEmployeePayslips, type MyPayslip,
} from '@/hooks/queries/use-hr-payroll';

type EmployeeRecord = NonNullable<ReturnType<typeof useEmployee>['data']>['data'];

const LEAVE_STATUS_VARIANT: Record<LeaveRequestStatus, any> = {
  pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'outline',
};

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-2.5 border-b pb-1.5 text-[11px] font-bold uppercase tracking-wider"
      style={{ color: 'var(--text-3)', borderColor: 'var(--border-soft)' }}
    >
      {children}
    </div>
  );
}

export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {label}
      </div>
      <div className="mt-0.5 text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
        {value || <span style={{ color: 'var(--text-3)' }}>—</span>}
      </div>
    </div>
  );
}

// ─── Overview ───────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-xl border p-4"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <SectionLabel>{title}</SectionLabel>
      <div className="grid grid-cols-2 gap-3.5">{children}</div>
    </section>
  );
}

export function OverviewTab({ employee }: { employee: EmployeeRecord }) {
  const { data: salaryData } = useEmployeeSalaries(employee.id);
  const current = salaryData?.data?.[0];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SectionCard title="Personal">
        <Field label="Email" value={employee.email} />
        <Field label="Phone" value={employee.phone} />
        <Field label="Date of birth" value={employee.dateOfBirth} />
        <Field label="Gender" value={employee.gender} />
        <Field label="Blood group" value={employee.bloodGroup} />
        <Field label="Address" value={employee.address} />
      </SectionCard>

      <SectionCard title="Statutory">
        <Field label="PAN" value={employee.pan} />
        <Field label="Aadhaar" value={employee.aadhaar} />
        <Field label="UAN (PF)" value={employee.uan} />
        <Field label="PF number" value={employee.pfNumber} />
        <Field label="ESI number" value={employee.esiNumber} />
      </SectionCard>

      <SectionCard title="Payroll settings">
        <Field label="Salary structure" value={current?.salaryStructureId ? 'Assigned' : 'Not assigned'} />
        {/* Lead with monthly — that's the figure Indian SME employees and
            employers anchor on — and treat the annual CTC as supporting
            context on the same row. */}
        <Field
          label="Monthly salary"
          value={employee.ctcAnnual ? (
            <>
              <span>{formatINR(Math.round(Number(employee.ctcAnnual) / 12))}</span>
              <span className="ml-1 text-[11px] font-normal" style={{ color: 'var(--text-3)' }}>
                / month
              </span>
            </>
          ) : null}
        />
        <Field
          label="Annual CTC"
          value={employee.ctcAnnual ? formatINR(Number(employee.ctcAnnual)) : null}
        />
        <Field label="Employment type" value={employee.employmentType.replace('_', ' ')} />
        <Field label="Status" value={employee.status.replace('_', ' ')} />
        <Field label="Reporting manager" value={employee.reportingToName} />
      </SectionCard>

      <SectionCard title="Bank details">
        <Field label="Bank" value={employee.bankName} />
        <Field label="Account no." value={employee.bankAccountNumber} />
        <Field label="IFSC" value={employee.bankIfsc} />
      </SectionCard>

      {(employee.agency || employee.dailyWageRate) && (
        <SectionCard title="Contract labour">
          <Field label="Agency" value={employee.agency} />
          <Field label="Daily wage rate" value={employee.dailyWageRate ? formatINR(Number(employee.dailyWageRate)) : null} />
        </SectionCard>
      )}
    </div>
  );
}

// ─── Leave ──────────────────────────────────────────────────────────────────

export function LeaveTab({ employeeId }: { employeeId: string }) {
  const year = new Date().getFullYear();
  const { data: balData } = useLeaveBalances({ employeeId, year });
  const { data: reqData } = useLeaveRequests({ employeeId });
  const balances = balData?.data ?? [];
  const requests = (reqData?.data ?? []).slice(0, 8);

  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionLabel>Leave balances · {year}</SectionLabel>
        {balances.length === 0 ? (
          <div className="py-4 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>
            No balances recorded yet.
          </div>
        ) : (
          balances.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-3 border-b py-2.5 last:border-0"
              style={{ borderColor: 'var(--border-soft)' }}
            >
              <div
                className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
              >
                {b.typeCode}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>{b.typeName}</div>
                <div className="num mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                  Accrued {Number(b.accrued)} · Used {Number(b.used)}
                </div>
              </div>
              <div
                className="num text-[18px] font-bold"
                style={{ color: b.balance > 0 ? 'var(--text-1)' : 'var(--text-3)' }}
              >
                {b.balance}
              </div>
            </div>
          ))
        )}
      </section>

      <section>
        <SectionLabel>Recent requests</SectionLabel>
        {requests.length === 0 ? (
          <div className="py-4 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>
            No leave requests.
          </div>
        ) : (
          requests.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2.5 border-b py-2.5 last:border-0"
              style={{ borderColor: 'var(--border-soft)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
                  {r.typeCode} · {r.typeName}
                </div>
                <div className="num mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {r.fromDate} → {r.toDate} · {Number(r.days)} day{Number(r.days) !== 1 ? 's' : ''}
                </div>
              </div>
              <Badge variant={LEAVE_STATUS_VARIANT[r.status]}>{r.status}</Badge>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

// ─── Payroll ────────────────────────────────────────────────────────────────

export function PayrollTab({ employeeId }: { employeeId: string }) {
  const { data } = useEmployeePayslips(employeeId);
  const slips = data?.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Default to the newest processed month; a draft run is still provisional.
  const payslip = slips.find((p) => p.id === selectedId)
    ?? slips.find((p) => p.runStatus !== 'draft') ?? slips[0];

  if (!payslip) {
    return (
      <div className="py-8 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>
        No payslip data available. Process a payroll run first.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-[14px] font-bold" style={{ color: 'var(--text-1)' }}>
        {slipMonth(payslip)}
        {payslip.runStatus === 'draft' && <Badge variant="outline" className="ml-2">Draft</Badge>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Gross', value: formatINR(Number(payslip.gross)) },
          { label: 'Deductions', value: formatINR(Number(payslip.totalDeductions)) },
          { label: 'Net pay', value: formatINR(Number(payslip.netPay)) },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg border p-3 text-center"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          >
            <div className="num text-[15px] font-bold" style={{ color: 'var(--text-1)' }}>{s.value}</div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div>
        <SectionLabel>Earnings</SectionLabel>
        {payslip.earnings.map((e, i) => (
          <div
            key={i}
            className="flex justify-between border-b py-1.5 text-[13px] last:border-0"
            style={{ borderColor: 'var(--border-soft)' }}
          >
            <span style={{ color: 'var(--text-2)' }}>{e.name}</span>
            <span className="num font-medium" style={{ color: 'var(--text-1)' }}>{formatINR(e.amount)}</span>
          </div>
        ))}
      </div>

      <div>
        <SectionLabel>Deductions</SectionLabel>
        {payslip.deductions.map((d, i) => (
          <div
            key={i}
            className="flex justify-between border-b py-1.5 text-[13px] last:border-0"
            style={{ borderColor: 'var(--border-soft)' }}
          >
            <span style={{ color: 'var(--text-2)' }}>{d.name}</span>
            <span className="num font-medium text-red-600 dark:text-red-400">− {formatINR(d.amount)}</span>
          </div>
        ))}
      </div>

      <div
        className="flex items-center justify-between rounded-lg px-3.5 py-3"
        style={{ background: 'var(--accent-soft)' }}
      >
        <span className="text-[14px] font-bold" style={{ color: 'var(--accent-text)' }}>Net pay</span>
        <span className="num text-[18px] font-extrabold" style={{ color: 'var(--accent-text)' }}>
          {formatINR(Number(payslip.netPay))}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-green-300 bg-green-50 p-2.5 dark:border-green-800 dark:bg-green-950/40">
          <div className="text-[11px] font-semibold text-green-900 dark:text-green-300">Provident Fund</div>
          <div className="num mt-1 text-[12px] text-green-800 dark:text-green-400">
            EE {formatINR(Number(payslip.pfEmployee))} · ER {formatINR(Number(payslip.pfEmployer))}
          </div>
        </div>
        <div className="rounded-lg border border-blue-300 bg-blue-50 p-2.5 dark:border-blue-800 dark:bg-blue-950/40">
          <div className="text-[11px] font-semibold text-blue-900 dark:text-blue-300">ESI</div>
          <div className="num mt-1 text-[12px] text-blue-700 dark:text-blue-400">
            EE {formatINR(Number(payslip.esiEmployee))} · ER {formatINR(Number(payslip.esiEmployer))}
          </div>
        </div>
      </div>

      {slips.length > 1 && (
        <PayslipHistory slips={slips} selectedId={payslip.id} onSelect={setSelectedId} />
      )}
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const slipMonth = (p: MyPayslip) => `${MONTHS[p.month - 1]} ${p.year}`;

/** Every month's payslip, newest first; click a row to show it above. */
function PayslipHistory({ slips, selectedId, onSelect }: {
  slips: MyPayslip[]; selectedId: string; onSelect: (id: string) => void;
}) {
  return (
    <div>
      <SectionLabel>Payslip history</SectionLabel>
      <div className="grid grid-cols-4 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
        <span>Month</span><span className="text-right">Gross</span>
        <span className="text-right">Deductions</span><span className="text-right">Net pay</span>
      </div>
      {slips.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p.id)}
          className="grid w-full grid-cols-4 rounded px-1 py-1.5 text-left text-[13px]"
          style={{ background: p.id === selectedId ? 'var(--accent-soft)' : undefined }}
        >
          <span style={{ color: 'var(--text-1)' }}>
            {slipMonth(p)}{p.runStatus === 'draft' && <span style={{ color: 'var(--text-3)' }}> · draft</span>}
          </span>
          <span className="num text-right" style={{ color: 'var(--text-2)' }}>{formatINR(Number(p.gross))}</span>
          <span className="num text-right" style={{ color: 'var(--text-2)' }}>{formatINR(Number(p.totalDeductions))}</span>
          <span className="num text-right font-semibold" style={{ color: 'var(--text-1)' }}>{formatINR(Number(p.netPay))}</span>
        </button>
      ))}
    </div>
  );
}
