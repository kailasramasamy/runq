import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useLoans } from '@/hooks/queries/use-hr-phase-next';
import { STATUS_VARIANT, STATUS_LABEL, KIND_LABEL } from '../_loan-modals';
import { SectionLabel } from './_employee-tabs';

// Loans still in play: being recovered, or awaiting approval. Closed, rejected
// and written-off ones live on the Loans page.
const OPEN = new Set(['draft', 'requested', 'manager_approved', 'active']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** An employee's open loans/advances: what payroll deducts each month and
 *  what is still owed. Renders nothing when there are none. */
export function LoansSection({ employeeId }: { employeeId: string }) {
  const { data } = useLoans({ employeeId });
  const loans = (data?.data ?? []).filter((l) => OPEN.has(l.status));
  if (!loans.length) return null;

  const active = loans.filter((l) => l.status === 'active');
  const outstanding = active.reduce((s, l) => s + Number(l.outstanding), 0);
  // The last instalment only takes what is left, never a full EMI.
  const monthly = active.reduce((s, l) => s + Math.min(Number(l.emiAmount), Number(l.outstanding)), 0);

  return (
    <div>
      <SectionLabel>Loans &amp; advances</SectionLabel>
      <div className="mb-2 grid grid-cols-2 gap-2">
        {[
          { label: 'Monthly deduction', value: formatINR(monthly) },
          { label: 'Balance owed', value: formatINR(outstanding) },
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
      {loans.map((l) => (
        <div
          key={l.id}
          className="flex items-center justify-between gap-3 border-b py-2 text-[13px] last:border-0"
          style={{ borderColor: 'var(--border-soft)' }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium" style={{ color: 'var(--text-1)' }}>{KIND_LABEL[l.kind] ?? l.kind}</span>
              <Badge variant={STATUS_VARIANT[l.status]}>{STATUS_LABEL[l.status] ?? l.status}</Badge>
            </div>
            <div className="num mt-0.5 text-[12px]" style={{ color: 'var(--text-3)' }}>
              {formatINR(Number(l.principal))} · {formatINR(Number(l.emiAmount))}/mo × {l.totalInstalments}
              {' · from '}{MONTHS[l.firstEmiMonth - 1]} {l.firstEmiYear}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="num font-semibold" style={{ color: 'var(--text-1)' }}>{formatINR(Number(l.outstanding))}</div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>left</div>
          </div>
        </div>
      ))}
      <Link to="/hr/loans" className="mt-2 inline-block text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>
        Manage on Loans page →
      </Link>
    </div>
  );
}
