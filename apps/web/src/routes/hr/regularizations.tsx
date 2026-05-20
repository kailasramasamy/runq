import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import {
  PageHeader, Badge, Button,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast,
} from '@/components/ui';
import { EmptyState, ListToolbar, Select as FilterSelect } from '@/components/ar/primitives';
import { useRegularizations, useReviewRegularization } from '@/hooks/queries/use-hr-phase-next';
import { useIsReadOnly } from '@/providers/auth-provider';

const STATUS_VARIANT: Record<string, any> = {
  pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'outline',
};

export function RegularizationsPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const [status, setStatus] = useState<string>('pending');
  const [search, setSearch] = useState('');
  const { data, isLoading } = useRegularizations({ status: status || undefined });
  const review = useReviewRegularization();

  const rows = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => {
        const name = [r.firstName, r.lastName].filter(Boolean).join(' ').toLowerCase();
        return name.includes(q) ||
          (r.employeeCode ?? '').toLowerCase().includes(q) ||
          (r.reason ?? '').toLowerCase().includes(q);
      })
    : rows;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Regularizations' }]}
        title="Attendance regularizations"
        description="Employee-raised requests to fix missed or wrong attendance."
      />

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search by employee or reason…"
        count={filtered.length}
        noun="request"
      >
        <FilterSelect value={status} onChange={(e) => setStatus(e.target.value)} options={[
          { value: '', label: 'All statuses' },
          { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
          { value: 'cancelled', label: 'Cancelled' },
        ]} />
      </ListToolbar>

      {isLoading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-10 w-10" />} title="No requests" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Date</Th><Th>Employee</Th><Th>Requested</Th><Th>Reason</Th><Th>Status</Th><Th></Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6}><EmptyState icon={<ClipboardList className="h-10 w-10" />} title="No requests match" description="Try a different search term." /></td></tr>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.date}</TableCell>
                <TableCell className="font-medium">
                  {[r.firstName, r.lastName].filter(Boolean).join(' ')}{' '}
                  <span className="text-xs text-slate-500">{r.employeeCode}</span>
                </TableCell>
                <TableCell className="text-sm">
                  {r.requestedCheckIn ?? '—'} → {r.requestedCheckOut ?? '—'}
                  {r.requestedStatus && <div className="text-xs text-slate-500">{r.requestedStatus}</div>}
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm">{r.reason}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {!readOnly && r.status === 'pending' && (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => review.mutate(
                        { id: r.id, approved: true },
                        { onSuccess: () => toast('Approved', 'success'), onError: (e: any) => toast(e?.message ?? 'Failed', 'error') },
                      )}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        const reason = window.prompt('Rejection reason?') ?? undefined;
                        review.mutate({ id: r.id, approved: false, rejectionReason: reason }, {
                          onSuccess: () => toast('Rejected', 'success'),
                          onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
                        });
                      }}>Reject</Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
