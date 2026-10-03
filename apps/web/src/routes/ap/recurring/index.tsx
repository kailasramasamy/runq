import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Repeat } from 'lucide-react';
import { useRecurringBills } from '@/hooks/queries/use-recurring-bills';
import { formatINR, formatINRShort } from '@/lib/utils';
import {
  PageHeader, Button, StatTile,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  EmptyState, formatDate,
} from '@/components/ar/primitives';
import { useIsReadOnly } from '@/providers/auth-provider';
import { AgreementFormModal } from './_modals';
import { CategoryBadge, ActiveBadge, scheduleLabel } from './_shared';

const COLS = 8;

export function RecurringListPage() {
  const navigate = useNavigate();
  const readOnly = useIsReadOnly();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useRecurringBills();
  const rows = data?.data ?? [];

  const commitment = rows.filter((r) => r.isActive).reduce((a, r) => a + Number(r.amount), 0);
  const outstanding = rows.reduce((a, r) => a + r.outstanding, 0);
  const advance = rows.reduce((a, r) => a + r.advanceHeld, 0);

  const newButton = (
    <Button size="sm" icon={<Plus size={13} />} onClick={() => setCreating(true)}>New agreement</Button>
  );

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'AP', href: '/ap' }, { label: 'Rent & transport' }]}
        title="Rent & transport"
        description="Fixed monthly arrangements — a bill is raised every month, you record what you pay."
        actions={readOnly ? undefined : newButton}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Monthly commitment" value={formatINRShort(commitment)} sub={`${rows.filter((r) => r.isActive).length} active`} />
        <StatTile label="Outstanding" value={formatINRShort(outstanding)} sub="Billed, not yet paid" tone={outstanding > 0 ? 'warn' : 'neutral'} />
        <StatTile label="Advance held" value={formatINRShort(advance)} sub="Paid ahead of bills" tone={advance > 0 ? 'pos' : 'neutral'} />
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Agreement</Th>
            <Th>Type</Th>
            <Th align="right">Monthly</Th>
            <Th>Bill day</Th>
            <Th align="right">Outstanding</Th>
            <Th align="right">Advance held</Th>
            <Th>Last payment</Th>
            <Th>Status</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: COLS }).map((__, j) => (
                  <TableCell key={j}>
                    <div className="h-3 w-full max-w-[120px] animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={COLS}>
                <EmptyState
                  icon={<Repeat size={18} />}
                  title="No agreements yet"
                  description="Add rent or a transport contract and a bill is raised for it every month."
                  action={readOnly ? undefined : newButton}
                />
              </td>
            </tr>
          ) : rows.map((r) => (
            <TableRow key={r.id} onClick={() => navigate({ to: '/finance/ap/recurring/$id', params: { id: r.id } })}>
              <TableCell>
                <div className="font-medium" style={{ color: 'var(--text-1)' }}>{r.title}</div>
                <div className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>{r.vendorName}</div>
              </TableCell>
              <TableCell><CategoryBadge category={r.category} /></TableCell>
              <TableCell align="right" className="num">{formatINR(Number(r.amount))}</TableCell>
              <TableCell>{scheduleLabel(r)}</TableCell>
              <TableCell align="right" className="num">
                <span style={{ color: r.outstanding > 0 ? 'var(--neg)' : 'var(--text-3)' }}>{formatINR(r.outstanding)}</span>
              </TableCell>
              <TableCell align="right" className="num">
                <span style={{ color: r.advanceHeld > 0 ? 'var(--pos)' : 'var(--text-3)' }}>{formatINR(r.advanceHeld)}</span>
              </TableCell>
              <TableCell>
                {r.lastPayment ? `${formatDate(r.lastPayment.date)} · ${formatINR(r.lastPayment.amount)}` : '—'}
              </TableCell>
              <TableCell><ActiveBadge active={r.isActive} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {creating && <AgreementFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}
