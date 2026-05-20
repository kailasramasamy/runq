import { useState } from 'react';
import { Plus, Trash2, CalendarOff, Sparkles } from 'lucide-react';
import {
  PageHeader, Button, Input,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge, useToast, ConfirmationDialog, Modal,
} from '@/components/ui';
import { EmptyState, ListToolbar } from '@/components/ar/primitives';
import {
  useLeaveTypes, useCreateLeaveType, useUpdateLeaveType, useDeleteLeaveType, useSeedDefaultLeaveTypes,
  type LeaveType,
} from '@/hooks/queries/use-hr';
import { useIsReadOnly } from '@/providers/auth-provider';

export function LeaveTypesPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const { data, isLoading } = useLeaveTypes();
  const create = useCreateLeaveType();
  const update = useUpdateLeaveType();
  const remove = useDeleteLeaveType();
  const seedDefaults = useSeedDefaultLeaveTypes();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [daysPerYear, setDaysPerYear] = useState('');
  const [carryForward, setCarryForward] = useState(false);
  const [encashable, setEncashable] = useState(false);
  const [isPaid, setIsPaid] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const types = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? types.filter((t: LeaveType) =>
        t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q))
    : types;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      daysPerYear: Number(daysPerYear || 0),
      carryForward, encashable, isPaid,
    }, {
      onSuccess: () => {
        setName(''); setCode(''); setDaysPerYear(''); setCarryForward(false); setEncashable(false); setIsPaid(true);
        setShowAdd(false);
        toast('Leave type created', 'success');
      },
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
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Casual Leave" autoFocus />
              <Input label="Code *" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required placeholder="CL" />
              <Input label="Days/year" type="number" min="0" step="0.5" value={daysPerYear} onChange={(e) => setDaysPerYear(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[13px]" style={{ color: 'var(--text-2)' }}>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={carryForward} onChange={(e) => setCarryForward(e.target.checked)} /> Carry forward</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={encashable} onChange={(e) => setEncashable(e.target.checked)} /> Encashable</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} /> Paid</label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add'}</Button>
            </div>
          </form>
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
              <TableCell style={{ color: 'var(--text-2)' }}>{t.name}</TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{Number(t.daysPerYear)}</TableCell>
              <TableCell>{t.carryForward ? <Badge variant="info">{t.maxCarryForward ? `max ${Number(t.maxCarryForward)}` : 'Yes'}</Badge> : <span style={{ color: 'var(--text-3)' }}>—</span>}</TableCell>
              <TableCell>{t.isPaid ? <Badge variant="success">Paid</Badge> : <Badge variant="outline">Unpaid</Badge>}</TableCell>
              <TableCell>{t.encashable ? <Badge variant="primary">Yes</Badge> : <span style={{ color: 'var(--text-3)' }}>—</span>}</TableCell>
              <TableCell align="right">
                {!readOnly && (
                  <button
                    className="rounded p-1 hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--text-3)' }}
                    onClick={() => setDeleteId(t.id)}
                    aria-label="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
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
        description="Cannot delete if any requests reference it."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
