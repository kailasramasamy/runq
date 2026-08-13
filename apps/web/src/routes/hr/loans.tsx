import { useState } from 'react';
import { CreditCard, Plus, Banknote } from 'lucide-react';
import {
  PageHeader, Badge, Button, Input, Select, Modal, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast, ConfirmationDialog,
} from '@/components/ui';
import { EmptyState, ListToolbar, Select as FilterSelect } from '@/components/ar/primitives';
import { useLoans, useCreateLoan, useApproveLoan, useRejectLoan, useDeleteLoan, type EmployeeLoan } from '@/hooks/queries/use-hr-phase-next';
import { useEmployees } from '@/hooks/queries/use-hr';
import { useAuth, useIsReadOnly, canAccessFinanceModule } from '@/providers/auth-provider';
import { QuickAdvanceModal } from './_advance-modal';
import {
  STATUS_VARIANT, STATUS_LABEL, KIND_LABEL, fmt,
  DisburseModal, EditLoanModal, WriteOffModal, LoanRowActions,
} from './_loan-modals';

export function LoansPage() {
  const readOnly = useIsReadOnly();
  const { user } = useAuth();
  const canQuickAdvance = canAccessFinanceModule(user?.role);
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [showQuickAdvance, setShowQuickAdvance] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [kind, setKind] = useState<'advance' | 'personal' | 'festival' | 'education' | 'other'>('advance');
  const [principal, setPrincipal] = useState('');
  const [instalments, setInstalments] = useState('6');
  const [disbursedOn, setDisbursedOn] = useState(new Date().toISOString().slice(0, 10));
  const [firstMonth, setFirstMonth] = useState(String(new Date().getMonth() + 1));
  const [firstYear, setFirstYear] = useState(String(new Date().getFullYear()));
  const [reason, setReason] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<any | null>(null);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [approveDisbursedOn, setApproveDisbursedOn] = useState(new Date().toISOString().slice(0, 10));
  const [approveFirstMonth, setApproveFirstMonth] = useState('');
  const [approveFirstYear, setApproveFirstYear] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [disburseTarget, setDisburseTarget] = useState<any | null>(null);
  const [editTarget, setEditTarget] = useState<EmployeeLoan | null>(null);
  const [writeOffTarget, setWriteOffTarget] = useState<EmployeeLoan | null>(null);

  const { data: empData } = useEmployees({ limit: 200, status: 'active' });
  const employees = empData?.data ?? [];
  const { data, isLoading } = useLoans();
  const create = useCreateLoan();
  const approve = useApproveLoan();
  const reject = useRejectLoan();
  const remove = useDeleteLoan();

  function openApprove(l: any) {
    setApproveTarget(l);
    setApproveDisbursedOn(new Date().toISOString().slice(0, 10));
    setApproveFirstMonth(String(l.firstEmiMonth));
    setApproveFirstYear(String(l.firstEmiYear));
  }
  function openReject(l: any) {
    setRejectTarget(l);
    setRejectReason('');
  }
  function confirmApprove() {
    if (!approveTarget) return;
    approve.mutate({
      id: approveTarget.id,
      approved: true,
      disbursedOn: approveDisbursedOn,
      firstEmiMonth: Number(approveFirstMonth),
      firstEmiYear: Number(approveFirstYear),
    }, {
      onSuccess: () => { setApproveTarget(null); toast('Loan approved & schedule generated', 'success'); },
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }
  function confirmReject() {
    if (!rejectTarget || !rejectReason.trim()) return;
    reject.mutate({ id: rejectTarget.id, rejectionReason: rejectReason.trim() }, {
      onSuccess: () => { setRejectTarget(null); toast('Loan rejected', 'success'); },
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const rows = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = rows.filter((l) => {
    const name = [l.firstName, l.lastName].filter(Boolean).join(' ').toLowerCase();
    if (q && !name.includes(q) && !(l.employeeCode ?? '').toLowerCase().includes(q)) return false;
    if (statusFilter && l.status !== statusFilter) return false;
    return true;
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      employeeId, kind,
      principal: Number(principal),
      totalInstalments: Number(instalments),
      disbursedOn,
      firstEmiMonth: Number(firstMonth),
      firstEmiYear: Number(firstYear),
      reason: reason || undefined,
    }, {
      onSuccess: () => {
        setShowAdd(false); setEmployeeId(''); setPrincipal(''); setInstalments('6'); setReason('');
        toast('Loan drafted', 'success');
      },
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Loans & advances' }]}
        title="Employee loans & advances"
        description="Salary advances and loans with EMI auto-deducted in payroll."
        actions={!readOnly && (
          <div className="flex gap-2">
            {canQuickAdvance && (
              <Button variant="outline" onClick={() => setShowQuickAdvance(true)}>
                <Banknote className="h-4 w-4 mr-1" />Quick advance
              </Button>
            )}
            <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" />New loan</Button>
          </div>
        )}
      />

      {rows.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by employee name or code…"
          count={filtered.length}
          noun="loan"
        >
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All statuses' },
              ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
        </ListToolbar>
      )}

      {isLoading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<CreditCard className="h-10 w-10" />} title="No loans" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Employee</Th><Th>Kind</Th><Th>Principal</Th><Th>EMI</Th><Th>Outstanding</Th>
              <Th>Tenure</Th><Th>Disbursed</Th><Th>Status</Th><Th></Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9}><EmptyState icon={<CreditCard className="h-10 w-10" />} title="No loans match" description="Try a different search or filter." /></td></tr>
            ) : filtered.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">
                  {[l.firstName, l.lastName].filter(Boolean).join(' ')}{' '}
                  <span className="text-xs text-slate-500">{l.employeeCode}</span>
                </TableCell>
                <TableCell>{KIND_LABEL[l.kind] ?? l.kind}</TableCell>
                <TableCell>₹{fmt(l.principal)}</TableCell>
                <TableCell>₹{fmt(l.emiAmount)}</TableCell>
                <TableCell>₹{fmt(l.outstanding)}</TableCell>
                <TableCell>{l.totalInstalments} mo</TableCell>
                <TableCell>{l.disbursedOn}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[l.status]}>{STATUS_LABEL[l.status] ?? l.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {!readOnly && (
                    <div className="flex justify-end items-center gap-2">
                      {(l.status === 'draft' || l.status === 'requested' || l.status === 'manager_approved') && (
                        <>
                          <Button size="sm" onClick={() => openApprove(l)}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => openReject(l)}>Reject</Button>
                        </>
                      )}
                      {l.status === 'active' && !l.isDisbursed && (
                        <Button size="sm" variant="outline" onClick={() => setDisburseTarget(l)}>
                          <Banknote className="h-4 w-4 mr-1" />Disburse
                        </Button>
                      )}
                      <LoanRowActions
                        loan={l}
                        canWriteOff={canQuickAdvance}
                        onEdit={() => setEditTarget(l)}
                        onWriteOff={() => setWriteOffTarget(l)}
                        onDelete={() => setDeleteId(l.id)}
                      />
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New loan / advance" size="lg">
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="text-sm font-medium">Employee</label>
            <Combobox
              options={employees.map((e) => ({
                value: e.id,
                label: `${e.firstName} ${e.lastName ?? ''} (${e.employeeCode})`,
              }))}
              value={employeeId}
              onChange={setEmployeeId}
              placeholder="Select employee"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Kind</label>
              <Select value={kind} onChange={(e) => setKind(e.target.value as any)} options={[
                { value: 'advance', label: 'Salary advance' },
                { value: 'personal', label: 'Personal' },
                { value: 'festival', label: 'Festival' },
                { value: 'education', label: 'Education' },
                { value: 'other', label: 'Other' },
              ]} />
            </div>
            <div>
              <label className="text-sm font-medium">Principal (₹)</label>
              <Input value={principal} onChange={(e) => setPrincipal(e.target.value)} type="number" min={0} required />
            </div>
            <div>
              <label className="text-sm font-medium">Instalments</label>
              <Input value={instalments} onChange={(e) => setInstalments(e.target.value)} type="number" min={1} max={120} required />
            </div>
            <div>
              <label className="text-sm font-medium">Disbursed on</label>
              <Input value={disbursedOn} onChange={(e) => setDisbursedOn(e.target.value)} type="date" required />
            </div>
            <div>
              <label className="text-sm font-medium">Repayment starts (month)</label>
              <Select
                value={firstMonth}
                onChange={(e) => setFirstMonth(e.target.value)}
                options={Array.from({ length: 12 }, (_, i) => ({
                  value: String(i + 1),
                  label: new Date(2000, i, 1).toLocaleString('en-IN', { month: 'long' }),
                }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Repayment starts (year)</label>
              <Select
                value={firstYear}
                onChange={(e) => setFirstYear(e.target.value)}
                options={Array.from({ length: 6 }, (_, i) => {
                  const y = new Date().getFullYear() + i;
                  return { value: String(y), label: String(y) };
                })}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Reason (optional)</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || !employeeId}>{create.isPending ? 'Saving…' : 'Save draft'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!approveTarget} onClose={() => setApproveTarget(null)} title="Approve loan" size="md">
        {approveTarget && (
          <div className="space-y-3">
            <div className="text-sm text-slate-600">
              {[approveTarget.firstName, approveTarget.lastName].filter(Boolean).join(' ')} —{' '}
              {KIND_LABEL[approveTarget.kind] ?? approveTarget.kind} of ₹{fmt(approveTarget.principal)} over{' '}
              {approveTarget.totalInstalments} months.
            </div>
            {approveTarget.reason && (
              <div className="text-sm bg-slate-50 dark:bg-slate-800 p-2 rounded">
                <span className="text-slate-500">Employee reason:</span> {approveTarget.reason}
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Disbursed on</label>
              <Input type="date" value={approveDisbursedOn} onChange={(e) => setApproveDisbursedOn(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Repayment starts (month)</label>
                <Select
                  value={approveFirstMonth}
                  onChange={(e) => setApproveFirstMonth(e.target.value)}
                  options={Array.from({ length: 12 }, (_, i) => ({
                    value: String(i + 1),
                    label: new Date(2000, i, 1).toLocaleString('en-IN', { month: 'long' }),
                  }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Repayment starts (year)</label>
                <Select
                  value={approveFirstYear}
                  onChange={(e) => setApproveFirstYear(e.target.value)}
                  options={Array.from({ length: 6 }, (_, i) => {
                    const y = new Date().getFullYear() + i;
                    return { value: String(y), label: String(y) };
                  })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setApproveTarget(null)}>Cancel</Button>
              <Button onClick={confirmApprove} disabled={approve.isPending}>
                {approve.isPending ? 'Approving…' : 'Approve & generate schedule'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject loan" size="md">
        {rejectTarget && (
          <div className="space-y-3">
            <div className="text-sm text-slate-600">
              {[rejectTarget.firstName, rejectTarget.lastName].filter(Boolean).join(' ')} —{' '}
              {KIND_LABEL[rejectTarget.kind] ?? rejectTarget.kind} of ₹{fmt(rejectTarget.principal)}
            </div>
            <div>
              <label className="text-sm font-medium">Reason for rejection</label>
              <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Visible to employee" autoFocus />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmReject} disabled={reject.isPending || !rejectReason.trim()}>
                {reject.isPending ? 'Rejecting…' : 'Reject'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmationDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (!deleteId) return;
          remove.mutate(deleteId, {
            onSuccess: () => { setDeleteId(null); toast('Loan deleted', 'success'); },
            onError: (err: any) => toast(err?.message ?? 'Delete failed', 'error'),
          });
        }}
        title="Delete loan?"
        description="Only drafts and closed loans can be deleted."
        confirmLabel="Delete"
        variant="danger"
      />

      {disburseTarget && (
        <DisburseModal loan={disburseTarget} onClose={() => setDisburseTarget(null)} />
      )}

      {editTarget && <EditLoanModal loan={editTarget} onClose={() => setEditTarget(null)} />}
      {writeOffTarget && <WriteOffModal loan={writeOffTarget} onClose={() => setWriteOffTarget(null)} />}

      {showQuickAdvance && <QuickAdvanceModal onClose={() => setShowQuickAdvance(false)} />}
    </div>
  );
}
