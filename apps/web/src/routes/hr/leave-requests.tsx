import { useState } from 'react';
import { Plus, CheckCircle, XCircle, Ban, Calendar } from 'lucide-react';
import {
  PageHeader, Button, Input, Select, Textarea, Combobox, Card, CardHeader, CardContent,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge, useToast, Modal,
} from '@/components/ui';
import { StatTile, EmptyState } from '@/components/ar/primitives';
import {
  useLeaveRequests, useCreateLeaveRequest, useReviewLeaveRequest, useCancelLeaveRequest,
  useLeaveTypes, useEmployees,
  type LeaveRequestStatus, type LeaveRequest,
} from '@/hooks/queries/use-hr';
import { useIsReadOnly } from '@/providers/auth-provider';

const STATUS_OPTS: Array<{ value: '' | LeaveRequestStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_VARIANT: Record<LeaveRequestStatus, any> = {
  pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'outline',
};

export function LeaveRequestsPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const [status, setStatus] = useState<'' | LeaveRequestStatus>('');
  const [showNew, setShowNew] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useLeaveRequests({ status: status || undefined });
  const review = useReviewLeaveRequest();
  const cancel = useCancelLeaveRequest();

  const requests = data?.data ?? [];
  const counts = {
    pending: requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
    cancelled: requests.filter((r) => r.status === 'cancelled').length,
  };

  function handleApprove(id: string) {
    review.mutate({ id, approved: true }, {
      onSuccess: () => toast('Leave approved', 'success'),
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  function submitReject() {
    if (!rejectId) return;
    review.mutate({ id: rejectId, approved: false, rejectionReason: rejectReason }, {
      onSuccess: () => { setRejectId(null); setRejectReason(''); toast('Leave rejected', 'success'); },
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Leave requests' }]}
        title="Leave requests"
        description="Apply, review, and track leaves across the workforce."
        actions={!readOnly && (
          <Button size="sm" onClick={() => setShowNew(true)}><Plus size={13} /> New request</Button>
        )}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Pending" value={counts.pending} sub="Awaiting review" />
        <StatTile label="Approved" value={counts.approved} sub="Active" />
        <StatTile label="Rejected" value={counts.rejected} sub="Declined" />
        <StatTile label="Cancelled" value={counts.cancelled} sub="Withdrawn" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value as any)} options={STATUS_OPTS} />
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{requests.length} requests</span>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Employee</Th>
            <Th>Type</Th>
            <Th>From → To</Th>
            <Th align="right">Days</Th>
            <Th>Reason</Th>
            <Th>Status</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : requests.length === 0 ? (
            <tr><td colSpan={7}><EmptyState icon={<Calendar size={18} />} title="No leave requests" description="No requests match the current filter." /></td></tr>
          ) : requests.map((r: LeaveRequest) => (
            <TableRow key={r.id}>
              <TableCell>
                <div className="min-w-0">
                  <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>{r.employeeName}</div>
                  <div className="num truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{r.employeeCode}</div>
                </div>
              </TableCell>
              <TableCell><Badge variant="default">{r.typeCode}</Badge> <span className="ml-1 text-[11px]" style={{ color: 'var(--text-3)' }}>{r.typeName}</span></TableCell>
              <TableCell className="num" style={{ color: 'var(--text-2)' }}>{r.fromDate} → {r.toDate}{r.halfDay && <span className="ml-1 text-[10px]">(½)</span>}</TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{Number(r.days)}</TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>{r.reason ?? <span style={{ color: 'var(--text-3)' }}>—</span>}</TableCell>
              <TableCell><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></TableCell>
              <TableCell align="right">
                {!readOnly && r.status === 'pending' && (
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => handleApprove(r.id)} disabled={review.isPending}>
                      <CheckCircle size={12} /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejectId(r.id)}>
                      <XCircle size={12} /> Reject
                    </Button>
                  </div>
                )}
                {!readOnly && (r.status === 'pending' || r.status === 'approved') && (
                  <button
                    className="ml-1 rounded p-1 hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--text-3)' }}
                    onClick={() => cancel.mutate(r.id, {
                      onSuccess: () => toast('Cancelled', 'success'),
                      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
                    })}
                    aria-label="Cancel"
                  >
                    <Ban size={13} />
                  </button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {showNew && <NewLeaveModal onClose={() => setShowNew(false)} />}

      <Modal open={!!rejectId} onClose={() => setRejectId(null)} title="Reject leave request">
        <div className="space-y-3">
          <Textarea
            label="Reason for rejection"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="Optional"
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
            <Button onClick={submitReject} disabled={review.isPending}>Reject</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function NewLeaveModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const create = useCreateLeaveRequest();
  const { data: empData } = useEmployees({ status: 'active', limit: 200 });
  const { data: typeData } = useLeaveTypes();

  const [employeeId, setEmployeeId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      employeeId, leaveTypeId, fromDate, toDate: halfDay ? fromDate : toDate, halfDay, reason: reason || undefined,
    }, {
      onSuccess: () => { toast('Leave applied', 'success'); onClose(); },
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  const empOptions = (empData?.data ?? []).map((e) => ({
    value: e.id,
    label: `${e.employeeCode} — ${e.firstName}${e.lastName ? ' ' + e.lastName : ''}`,
  }));
  const typeOptions = (typeData?.data ?? []).map((t) => ({
    value: t.id, label: `${t.code} — ${t.name}`,
  }));

  return (
    <Modal open onClose={onClose} title="Apply for leave" size="lg">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Combobox label="Employee *" options={empOptions} value={employeeId} onChange={setEmployeeId} />
        <Combobox label="Leave type *" options={typeOptions} value={leaveTypeId} onChange={setLeaveTypeId} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input label="From date *" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} required />
          <Input label="To date *" type="date" value={halfDay ? fromDate : toDate} onChange={(e) => setToDate(e.target.value)} disabled={halfDay} required={!halfDay} />
        </div>
        <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-2)' }}>
          <input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} />
          Half day (counts as 0.5)
        </label>
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!employeeId || !leaveTypeId || !fromDate || create.isPending}>
            {create.isPending ? 'Applying…' : 'Apply'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
