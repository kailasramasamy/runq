import { useState } from 'react';
import { Wallet, Plus, Pencil, Trash2, Ban, Eye } from 'lucide-react';
import {
  PageHeader, Badge, Button, Combobox, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  useToast, ConfirmationDialog,
} from '@/components/ui';
import { EmptyState, ListToolbar } from '@/components/ar/primitives';
import { formatINR } from '@/lib/utils';
import { useEmployees } from '@/hooks/queries/use-hr';
import { useIsReadOnly } from '@/providers/auth-provider';
import {
  useDeductions, useCancelDeduction, useDeleteDeduction, type EmployeeDeduction,
} from '@/hooks/queries/use-hr-recovery';
import {
  CATEGORY_LABEL, STATUS_VARIANT, STATUS_LABEL, DeductionFormModal, DeductionDetailModal,
} from './_deduction-modals';

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

function monthLabel(month: number, year: number): string {
  return `${new Date(2000, month - 1, 1).toLocaleString('en-IN', { month: 'short' })} ${year}`;
}

export function DeductionsPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeDeduction | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<EmployeeDeduction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeDeduction | null>(null);

  const { data: empData } = useEmployees({ limit: 200, status: 'active' });
  const employees = empData?.data ?? [];
  const { data, isLoading } = useDeductions({ employeeId: employeeFilter || undefined, status: statusFilter || undefined });
  const cancel = useCancelDeduction();
  const remove = useDeleteDeduction();

  const rows = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = rows.filter((d) => {
    const name = [d.firstName, d.lastName].filter(Boolean).join(' ').toLowerCase();
    if (q && !name.includes(q) && !(d.employeeCode ?? '').toLowerCase().includes(q) && !(d.description ?? '').toLowerCase().includes(q)) return false;
    return true;
  });

  function confirmCancel() {
    if (!cancelTarget) return;
    cancel.mutate(cancelTarget.id, {
      onSuccess: () => { setCancelTarget(null); toast('Deduction cancelled', 'success'); },
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    remove.mutate(deleteTarget.id, {
      onSuccess: () => { setDeleteTarget(null); toast('Deduction deleted', 'success'); },
      onError: (e: any) => toast(e?.message ?? 'Delete failed', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Deductions' }]}
        title="Employee deductions"
        description="Recoverable dues — goods purchases, canteen, damage, fines — auto-deducted in payroll."
        actions={!readOnly && (
          <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" />Add deduction</Button>
        )}
      />

      {rows.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by employee name, code, or description…"
          count={filtered.length}
          noun="deduction"
        >
          <div className="w-56">
            <Combobox
              options={[{ value: '', label: 'All employees' }, ...employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName ?? ''} (${e.employeeCode})` }))]}
              value={employeeFilter}
              onChange={setEmployeeFilter}
              placeholder="Filter by employee"
            />
          </div>
          <div className="w-44">
            <Combobox options={STATUS_FILTER_OPTIONS} value={statusFilter} onChange={setStatusFilter} placeholder="Filter by status" />
          </div>
        </ListToolbar>
      )}

      {isLoading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Wallet className="h-10 w-10" />} title="No deductions" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Employee</Th><Th>Category</Th><Th>Description</Th><Th>Amount</Th>
              <Th>Per-run</Th><Th>Outstanding</Th><Th>Start</Th><Th>Status</Th><Th></Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9}><EmptyState icon={<Wallet className="h-10 w-10" />} title="No deductions match" description="Try a different search or filter." /></td></tr>
            ) : filtered.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">
                  {[d.firstName, d.lastName].filter(Boolean).join(' ')}{' '}
                  <span className="text-xs text-slate-500">{d.employeeCode}</span>
                </TableCell>
                <TableCell>{CATEGORY_LABEL[d.category] ?? d.category}</TableCell>
                <TableCell className="max-w-[200px] truncate">{d.description || '—'}</TableCell>
                <TableCell>₹{formatINR(Number(d.amount))}</TableCell>
                <TableCell>₹{formatINR(Number(d.instalment))}</TableCell>
                <TableCell>₹{formatINR(Number(d.outstanding))}</TableCell>
                <TableCell>{monthLabel(d.startMonth, d.startYear)}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[d.status]}>{STATUS_LABEL[d.status] ?? d.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setViewId(d.id)}><Eye className="h-4 w-4" /></Button>
                    {!readOnly && d.status === 'active' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setEditTarget(d)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="outline" onClick={() => setCancelTarget(d)}><Ban className="h-4 w-4" /></Button>
                      </>
                    )}
                    {!readOnly && (
                      <Button size="sm" variant="outline" onClick={() => setDeleteTarget(d)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {showForm && <DeductionFormModal deduction={null} employees={employees} onClose={() => setShowForm(false)} />}
      {editTarget && <DeductionFormModal deduction={editTarget} employees={employees} onClose={() => setEditTarget(null)} />}
      {viewId && <DeductionDetailModal id={viewId} onClose={() => setViewId(null)} />}

      <ConfirmationDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
        title="Cancel deduction?"
        description="No further amounts will be recovered from this employee's payroll for this deduction."
        confirmLabel="Cancel deduction"
        variant="warning"
        loading={cancel.isPending}
      />

      <ConfirmationDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete deduction?"
        description="This cannot be undone. Deductions already recovered in a payroll run cannot be deleted."
        confirmLabel="Delete"
        variant="danger"
        loading={remove.isPending}
      />
    </div>
  );
}
