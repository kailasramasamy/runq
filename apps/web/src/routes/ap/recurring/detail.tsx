import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Pause, Pencil, Play, Trash2, Undo2, Wallet } from 'lucide-react';
import {
  useRecurringBill, useUpdateRecurringBill, type RecurringMonth, type RecurringPayment,
} from '@/hooks/queries/use-recurring-bills';
import { formatINR, formatINRShort } from '@/lib/utils';
import {
  PageHeader, Button, StatTile, Badge,
  Table, TableHeader, Th, TableBody, TableRow, TableCell, EmptyState, formatDate,
} from '@/components/ar/primitives';
import { useToast } from '@/components/ui';
import { useIsReadOnly } from '@/providers/auth-provider';
import { AgreementFormModal } from './_modals';
import { RecordPaymentModal } from './_record-payment';
import { DeleteAgreementDialog, CancelPaymentDialog } from './_confirms';
import { CategoryBadge, ActiveBadge, scheduleLabel } from './_shared';

const STATUS: Record<RecurringMonth['status'], { label: string; variant: 'success' | 'warning' | 'danger' }> = {
  paid: { label: 'Paid', variant: 'success' },
  partially_paid: { label: 'Part paid', variant: 'warning' },
  approved: { label: 'Due', variant: 'danger' },
};

function SectionTitle({ children }: { children: string }) {
  return <h2 className="mb-2 mt-6 text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>{children}</h2>;
}

export function RecurringDetailPage({ id }: { id: string }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const readOnly = useIsReadOnly();
  const { data, isLoading, isError } = useRecurringBill(id);
  const update = useUpdateRecurringBill(id);
  const [modal, setModal] = useState<'edit' | 'pay' | 'delete' | null>(null);
  const [cancelling, setCancelling] = useState<RecurringPayment | null>(null);
  const a = data?.data;

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }} />;
  }
  if (isError || !a) return <p className="text-[13px]" style={{ color: 'var(--neg)' }}>Agreement not found.</p>;

  const togglePause = () => update.mutate({ isActive: !a.isActive }, {
    onSuccess: () => toast(a.isActive ? 'Agreement paused' : 'Agreement resumed', 'success'),
    onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
  });

  return (
    <div>
      <PageHeader fullWidth
        title={a.title}
        titleBadge={<><CategoryBadge category={a.category} /><ActiveBadge active={a.isActive} /></>}
        description={a.vendorName}
        actions={(
          <>
            <Button variant="outline" size="sm" icon={<ArrowLeft size={13} />} onClick={() => navigate({ to: '/finance/ap/recurring' })}>Back</Button>
            {!readOnly && (
              <>
                <Button variant="outline" size="sm" icon={a.isActive ? <Pause size={13} /> : <Play size={13} />}
                  loading={update.isPending} onClick={togglePause}>
                  {a.isActive ? 'Pause' : 'Resume'}
                </Button>
                <Button variant="outline" size="sm" icon={<Pencil size={13} />} onClick={() => setModal('edit')}>Edit</Button>
                <Button variant="outline" size="sm" icon={<Trash2 size={13} />} onClick={() => setModal('delete')}>Delete</Button>
                <Button size="sm" icon={<Wallet size={13} />} onClick={() => setModal('pay')}>Record payment</Button>
              </>
            )}
          </>
        )}
      />

      <div className="mb-2 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Monthly amount" value={formatINRShort(Number(a.amount))} sub={scheduleLabel(a)} />
        <StatTile label="Billed to date" value={formatINRShort(a.billed)} />
        <StatTile label="Paid" value={formatINRShort(a.paid)} tone="pos" />
        <StatTile label="Outstanding" value={formatINRShort(a.outstanding)} tone={a.outstanding > 0 ? 'warn' : 'neutral'} />
        <StatTile label="Advance held" value={formatINRShort(a.advanceHeld)} tone={a.advanceHeld > 0 ? 'pos' : 'neutral'} />
      </div>

      <SectionTitle>Months</SectionTitle>
      <Table>
        <TableHeader>
          <tr>
            <Th>Month</Th><Th>Bill no.</Th><Th align="right">Amount</Th>
            <Th align="right">Paid</Th><Th align="right">Balance</Th><Th>Status</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {a.months.length === 0 ? (
            <tr><td colSpan={6}><EmptyState title="No bills raised yet" description="The first bill is raised once the bill day arrives." /></td></tr>
          ) : a.months.map((m) => (
            <TableRow key={m.id}>
              <TableCell>{m.label}</TableCell>
              <TableCell>
                <Link to="/finance/ap/bills/$billId" params={{ billId: m.id }} className="hover:underline" style={{ color: 'var(--accent-text)' }}>
                  {m.invoiceNumber}
                </Link>
              </TableCell>
              <TableCell align="right" numeric>{formatINR(Number(m.total))}</TableCell>
              <TableCell align="right" numeric>{formatINR(Number(m.paid))}</TableCell>
              <TableCell align="right" numeric>{formatINR(Number(m.balance))}</TableCell>
              <TableCell><Badge variant={STATUS[m.status].variant}>{STATUS[m.status].label}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <SectionTitle>Payments</SectionTitle>
      <Table>
        <TableHeader>
          <tr><Th>Date</Th><Th align="right">Amount</Th><Th>Paid for</Th><Th>Reference / UTR</Th><Th>Note</Th>{!readOnly && <Th />}</tr>
        </TableHeader>
        <TableBody>
          {a.payments.length === 0 ? (
            <tr><td colSpan={6}><EmptyState title="No payments yet" /></td></tr>
          ) : a.payments.map((p) => (
            <TableRow key={p.id}>
              <TableCell>{formatDate(p.date)}</TableCell>
              <TableCell align="right" numeric>{formatINR(p.amount)}</TableCell>
              <TableCell>
                {p.paidFor.length === 0 ? <span style={{ color: 'var(--text-3)' }}>—</span> : p.paidFor.map((f) => (
                  <div key={f.label} className="text-[12.5px]">
                    {f.label} <span className="num" style={{ color: 'var(--text-3)' }}>· {formatINR(f.amount)}</span>
                  </div>
                ))}
              </TableCell>
              <TableCell>{p.reference ?? '—'}</TableCell>
              <TableCell>
                {p.status === 'pending' && <Badge variant="warning">Awaiting approval</Badge>}
                {p.unapplied > 0 && (
                  <span className="text-[12px]" style={{ color: 'var(--pos)' }}>{formatINR(p.unapplied)} held as advance</span>
                )}
              </TableCell>
              {!readOnly && (
                <TableCell align="right">
                  <Button variant="ghost" size="sm" icon={<Undo2 size={13} />} onClick={() => setCancelling(p)}>Cancel</Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {modal === 'edit' && <AgreementFormModal agreement={a} onClose={() => setModal(null)} />}
      {modal === 'pay' && <RecordPaymentModal agreement={a} onClose={() => setModal(null)} />}
      {modal === 'delete' && <DeleteAgreementDialog agreement={a} onClose={() => setModal(null)} />}
      {cancelling && <CancelPaymentDialog agreementId={a.id} payment={cancelling} onClose={() => setCancelling(null)} />}
    </div>
  );
}
