import { useState, useEffect } from 'react';
import { Plus, CheckCircle, XCircle, Ban, Calendar } from 'lucide-react';
import {
  PageHeader, Button, Input, Textarea, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge, useToast, Modal,
} from '@/components/ui';
import { StatTile, EmptyState, Avatar } from '@/components/ar/primitives';
import {
  useLeaveRequests, useCreateLeaveRequest, useReviewLeaveRequest, useCancelLeaveRequest,
  useLeaveRequestPreview,
  useLeaveTypes, useEmployees, useHrMe,
  type LeaveRequestStatus, type LeaveRequest,
} from '@/hooks/queries/use-hr';

const STATUS_FILTERS: Array<{ value: '' | LeaveRequestStatus; label: string }> = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_VARIANT: Record<LeaveRequestStatus, any> = {
  pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'outline',
};

const VALID_STATUSES: LeaveRequestStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];

export function LeaveRequestsPage({ initialStatus }: { initialStatus?: string } = {}) {
  const { toast } = useToast();
  const { data: meData } = useHrMe();
  // Reviewing (approve/reject) is for admins (`all`) and managers (`subset`);
  // a plain employee (`self`) can raise and cancel their own requests only.
  const canReview = meData?.data?.scopeKind === 'all' || meData?.data?.scopeKind === 'subset';
  // Separation of duties — never offer to review your own request.
  const myEmployeeId = meData?.data?.employee?.id;
  const [status, setStatus] = useState<'' | LeaveRequestStatus>(
    initialStatus && VALID_STATUSES.includes(initialStatus as LeaveRequestStatus)
      ? (initialStatus as LeaveRequestStatus)
      : '',
  );
  const [showNew, setShowNew] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useLeaveRequests({});
  const review = useReviewLeaveRequest();
  const cancel = useCancelLeaveRequest();

  const allRequests = data?.data ?? [];
  const requests = status ? allRequests.filter((r) => r.status === status) : allRequests;
  const counts = {
    '': allRequests.length,
    pending: allRequests.filter((r) => r.status === 'pending').length,
    approved: allRequests.filter((r) => r.status === 'approved').length,
    rejected: allRequests.filter((r) => r.status === 'rejected').length,
    cancelled: allRequests.filter((r) => r.status === 'cancelled').length,
  } as Record<'' | LeaveRequestStatus, number>;

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
        actions={
          <Button size="sm" onClick={() => setShowNew(true)}><Plus size={13} /> New request</Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Pending" value={counts.pending} sub="Awaiting review" />
        <StatTile label="Approved" value={counts.approved} sub="Active" />
        <StatTile label="Rejected" value={counts.rejected} sub="Declined" />
        <StatTile label="Cancelled" value={counts.cancelled} sub="Withdrawn" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => {
            const active = status === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatus(f.value)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors"
                style={{
                  background: active ? 'var(--accent)' : 'var(--surface-2)',
                  color: active ? '#fff' : 'var(--text-2)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {f.label}
                <span
                  className="num rounded-full px-1.5 text-[10px] font-semibold"
                  style={{
                    background: active ? 'rgba(255,255,255,0.22)' : 'var(--surface)',
                    color: active ? '#fff' : 'var(--text-3)',
                  }}
                >
                  {counts[f.value]}
                </span>
              </button>
            );
          })}
        </div>
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
                <div className="flex items-center gap-2.5">
                  <Avatar name={r.employeeName} size={28} />
                  <div className="min-w-0">
                    <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>{r.employeeName}</div>
                    <div className="num truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{r.employeeCode}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="num rounded px-1.5 py-0.5 text-[11px] font-bold"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                  >
                    {r.typeCode}
                  </span>
                  <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>{r.typeName}</span>
                </span>
              </TableCell>
              <TableCell className="num" style={{ color: 'var(--text-2)' }}>{r.fromDate} → {r.toDate}{r.halfDay && <span className="ml-1 text-[10px]">(½)</span>}</TableCell>
              <TableCell align="right" className="num font-medium" style={{ color: 'var(--text-1)' }}>{Number(r.days)}</TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>{r.reason ?? <span style={{ color: 'var(--text-3)' }}>—</span>}</TableCell>
              <TableCell><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></TableCell>
              <TableCell align="right">
                <div className="flex items-center justify-end gap-1">
                  {canReview && r.status === 'pending' && r.employeeId !== myEmployeeId && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(r.id)}
                        disabled={review.isPending}
                        style={{ background: '#16a34a', borderColor: '#16a34a', color: '#fff' }}
                      >
                        <CheckCircle size={12} /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRejectId(r.id)}>
                        <XCircle size={12} /> Reject
                      </Button>
                    </>
                  )}
                  {(r.status === 'pending' || r.status === 'approved') && (
                    <button
                      className="rounded p-1 hover:bg-[var(--surface-2)]"
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
                </div>
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
  const { data: meData } = useHrMe();
  const me = meData?.data;
  // A plain employee applies for themselves — pre-fill and hide the picker.
  // Managers / admins pick whom the request is for.
  const isSelf = me?.scopeKind === 'self' || me?.scopeKind === 'none';
  const { data: empData } = useEmployees({ status: 'active', limit: 200 });
  const { data: typeData } = useLeaveTypes();

  // Default the picker to the logged-in user — a manager applying for
  // their own leave shouldn't have to search for their own name. They can
  // still switch it to a report. (`isSelf` users skip the picker entirely.)
  const [employeeId, setEmployeeId] = useState(me?.employee?.id ?? '');
  useEffect(() => {
    if (!employeeId && me?.employee?.id) setEmployeeId(me.employee.id);
  }, [me?.employee?.id]);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');

  const effectiveEmployeeId = isSelf ? (me?.employee?.id ?? '') : employeeId;

  // Price the request as it's filled in, so a shortfall shows up here rather
  // than as an unexplained deduction on the payslip.
  const { data: previewData } = useLeaveRequestPreview({
    employeeId: effectiveEmployeeId || undefined,
    leaveTypeId: leaveTypeId || undefined,
    fromDate: fromDate || undefined,
    toDate: (halfDay ? fromDate : toDate) || undefined,
    halfDay,
  });
  const preview = previewData?.data;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      employeeId: effectiveEmployeeId, leaveTypeId, fromDate, toDate: halfDay ? fromDate : toDate, halfDay, reason: reason || undefined,
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
        {isSelf ? (
          <div className="rounded-md px-3 py-2 text-[13px]" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
            Applying as{' '}
            <span className="font-medium" style={{ color: 'var(--text-1)' }}>
              {me?.employee ? `${me.employee.firstName}${me.employee.lastName ? ' ' + me.employee.lastName : ''}` : 'you'}
            </span>
          </div>
        ) : (
          <Combobox label="Employee *" options={empOptions} value={employeeId} onChange={setEmployeeId} />
        )}
        <Combobox label="Leave type *" options={typeOptions} value={leaveTypeId} onChange={setLeaveTypeId} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input label="From date *" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} required />
          <Input label="To date *" type="date" value={halfDay ? fromDate : toDate} onChange={(e) => setToDate(e.target.value)} disabled={halfDay} required={!halfDay} />
        </div>
        <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-2)' }}>
          <input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} />
          Half day (counts as 0.5)
        </label>
        {preview && preview.days > 0 && (
          <div
            className="rounded-md px-3 py-2.5 text-[13px]"
            style={
              preview.unpaidDays > 0
                ? { background: 'var(--warning-bg, #FEF3C7)', color: 'var(--warning-fg, #92400E)' }
                : { background: 'var(--surface-2)', color: 'var(--text-2)' }
            }
          >
            {preview.unpaidDays > 0 ? (
              <>
                <span className="font-medium">
                  {preview.paidDays} paid, {preview.unpaidDays} unpaid
                </span>
                {' — '}only {preview.available} day(s) of {preview.leaveTypeName} left.
                The unpaid days are deducted as Loss of Pay.
              </>
            ) : (
              <>
                {preview.days} day(s) · {preview.available} day(s) of {preview.leaveTypeName} available
              </>
            )}
          </div>
        )}
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!effectiveEmployeeId || !leaveTypeId || !fromDate || create.isPending}>
            {create.isPending ? 'Applying…' : 'Apply'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
