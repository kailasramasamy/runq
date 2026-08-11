import { useState } from 'react';
import { Plus, Pencil, Trash2, CalendarOff, Sparkles } from 'lucide-react';
import {
  PageHeader, Button,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge, useToast, ConfirmationDialog, Modal,
} from '@/components/ui';
import { EmptyState, ListToolbar } from '@/components/ar/primitives';
import { LeaveTypeForm, type LeaveTypeFormValues } from '@/components/hr/leave-type-form';
import {
  useLeaveTypes, useCreateLeaveType, useUpdateLeaveType, useDeleteLeaveType, useSeedDefaultLeaveTypes,
  type LeaveType,
} from '@/hooks/queries/use-hr';
import { useIsReadOnly } from '@/providers/auth-provider';

export function LeaveTypesPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  // The one screen that shows retired types — it's where you re-activate them.
  const { data, isLoading } = useLeaveTypes({ includeInactive: true });
  const create = useCreateLeaveType();
  const update = useUpdateLeaveType();
  const remove = useDeleteLeaveType();
  const seedDefaults = useSeedDefaultLeaveTypes();

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const types = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? types.filter((t: LeaveType) =>
        t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q))
    : types;

  function handleCreate(values: LeaveTypeFormValues) {
    create.mutate(values, {
      onSuccess: () => { setShowAdd(false); toast('Leave type created', 'success'); },
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  function handleUpdate(values: LeaveTypeFormValues) {
    if (!editing) return;
    update.mutate({ id: editing.id, ...values }, {
      onSuccess: () => { setEditing(null); toast('Leave type updated', 'success'); },
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Leave types' }]}
        title="Leave types"
        description="Configure leave categories, accrual, carry-forward rules."
        actions={!readOnly && (
          <div className="flex items-center gap-2">
            {types.length === 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => seedDefaults.mutate(undefined, {
                  onSuccess: (r) => toast(r.data.skipped ? 'Already seeded' : `Seeded ${r.data.count} defaults`, 'success'),
                  onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
                })}
                disabled={seedDefaults.isPending}
              >
                <Sparkles size={13} /> Seed defaults
              </Button>
            )}
            <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={13} /> New leave type</Button>
          </div>
        )}
      />

      {showAdd && (
        <Modal open onClose={() => setShowAdd(false)} title="Add leave type" size="lg">
          <LeaveTypeForm
            onSubmit={handleCreate}
            onCancel={() => setShowAdd(false)}
            pending={create.isPending}
          />
        </Modal>
      )}

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={`Edit ${editing.name}`} size="lg">
          <LeaveTypeForm
            initial={editing}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
            pending={update.isPending}
          />
        </Modal>
      )}

      {types.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by name or code…"
          count={filtered.length}
          noun="leave type"
        />
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Code</Th>
            <Th>Name</Th>
            <Th align="right">Days / yr</Th>
            <Th>Carry fwd</Th>
            <Th>Paid</Th>
            <Th>Encashable</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : types.length === 0 ? (
            <tr><td colSpan={7}><EmptyState icon={<CalendarOff size={18} />} title="No leave types" description="Click Seed defaults or add manually above." /></td></tr>
          ) : filtered.length === 0 ? (
            <tr><td colSpan={7}><EmptyState icon={<CalendarOff size={18} />} title="No leave types match" description="Try a different search term." /></td></tr>
          ) : filtered.map((t: LeaveType) => (
            <TableRow key={t.id}>
              <TableCell><span className="num font-medium" style={{ color: 'var(--text-1)' }}>{t.code}</span></TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>
                <span className="flex items-center gap-2">
                  {t.name}
                  {!t.isActive && <Badge variant="outline">Retired</Badge>}
                </span>
              </TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{Number(t.daysPerYear)}</TableCell>
              <TableCell>{t.carryForward ? <Badge variant="info">{t.maxCarryForward ? `max ${Number(t.maxCarryForward)}` : 'Yes'}</Badge> : <span style={{ color: 'var(--text-3)' }}>—</span>}</TableCell>
              <TableCell>{t.isPaid ? <Badge variant="success">Paid</Badge> : <Badge variant="outline">Unpaid</Badge>}</TableCell>
              <TableCell>{t.encashable ? <Badge variant="primary">Yes</Badge> : <span style={{ color: 'var(--text-3)' }}>—</span>}</TableCell>
              <TableCell align="right">
                {!readOnly && (
                  <div className="flex items-center justify-end gap-1">
                    <button
                      className="rounded p-1 hover:bg-[var(--surface-2)]"
                      style={{ color: 'var(--text-3)' }}
                      onClick={() => setEditing(t)}
                      aria-label="Edit"
                      title="Edit leave type"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="rounded p-1 hover:bg-[var(--surface-2)]"
                      style={{ color: 'var(--text-3)' }}
                      onClick={() => setDeleteId(t.id)}
                      aria-label="Delete"
                      title="Delete leave type"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmationDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (!deleteId) return;
          remove.mutate(deleteId, {
            onSuccess: () => { setDeleteId(null); toast('Deleted', 'success'); },
            onError: (err: any) => { setDeleteId(null); toast(err?.message ?? 'Failed', 'error'); },
          });
        }}
        title="Delete leave type?"
        description="Its accrued balances go too. Blocked if any leave requests reference it."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
