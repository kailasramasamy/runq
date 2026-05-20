import { useState } from 'react';
import { Plus, Trash2, Clock3 } from 'lucide-react';
import {
  PageHeader, Button, Input,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge, useToast, ConfirmationDialog, Modal,
} from '@/components/ui';
import { EmptyState, ListToolbar } from '@/components/ar/primitives';
import {
  useShifts, useCreateShift, useDeleteShift,
} from '@/hooks/queries/use-hr';
import { useIsReadOnly } from '@/providers/auth-provider';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ShiftsPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const { data, isLoading } = useShifts();
  const create = useCreateShift();
  const remove = useDeleteShift();

  const [name, setName] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [breakMin, setBreakMin] = useState('60');
  const [offDays, setOffDays] = useState<number[]>([0]);
  const [isNight, setIsNight] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const shifts = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q ? shifts.filter((s) => s.name.toLowerCase().includes(q)) : shifts;

  function toggleDay(d: number) {
    setOffDays((p) => p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort());
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      name: name.trim(), startTime: start, endTime: end,
      breakMinutes: Number(breakMin || 0), weeklyOffDays: offDays, isNightShift: isNight,
    }, {
      onSuccess: () => {
        setName(''); setStart('09:00'); setEnd('18:00'); setBreakMin('60'); setOffDays([0]); setIsNight(false);
        setShowAdd(false);
        toast('Shift created', 'success');
      },
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Shifts' }]}
        title="Shifts"
        description="Define general and factory shifts with weekly offs."
        actions={!readOnly && (
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={13} /> New shift</Button>
        )}
      />

      {showAdd && (
        <Modal open onClose={() => setShowAdd(false)} title="Add shift" size="lg">
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} required placeholder="General / Morning / Night" autoFocus />
              <Input label="Break (minutes)" type="number" min="0" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} />
              <Input label="Start time *" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
              <Input label="End time *" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium" style={{ color: 'var(--text-2)' }}>Weekly off days</label>
              <div className="mt-2 flex flex-wrap gap-1">
                {DAY_LABELS.map((lbl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className="rounded-md border px-2 py-1 text-[12px]"
                    style={{
                      background: offDays.includes(idx) ? 'var(--accent-soft)' : 'var(--surface)',
                      borderColor: 'var(--border)',
                      color: offDays.includes(idx) ? 'var(--accent-text)' : 'var(--text-2)',
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-2)' }}>
              <input type="checkbox" checked={isNight} onChange={(e) => setIsNight(e.target.checked)} />
              Night shift
            </label>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add shift'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {shifts.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by name…"
          count={filtered.length}
          noun="shift"
        />
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Name</Th>
            <Th>Timing</Th>
            <Th>Break</Th>
            <Th>Weekly offs</Th>
            <Th>Night</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : shifts.length === 0 ? (
            <tr><td colSpan={6}><EmptyState icon={<Clock3 size={18} />} title="No shifts yet" description="Define a shift above." /></td></tr>
          ) : filtered.length === 0 ? (
            <tr><td colSpan={6}><EmptyState icon={<Clock3 size={18} />} title="No shifts match" description="Try a different search term." /></td></tr>
          ) : filtered.map((s) => (
            <TableRow key={s.id}>
              <TableCell><span className="font-medium" style={{ color: 'var(--text-1)' }}>{s.name}</span></TableCell>
              <TableCell className="num" style={{ color: 'var(--text-2)' }}>{s.startTime} – {s.endTime}</TableCell>
              <TableCell className="num" style={{ color: 'var(--text-2)' }}>{s.breakMinutes} min</TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>
                {s.weeklyOffDays.map((d) => DAY_LABELS[d]).join(', ')}
              </TableCell>
              <TableCell>{s.isNightShift ? <Badge variant="info">Night</Badge> : <span style={{ color: 'var(--text-3)' }}>—</span>}</TableCell>
              <TableCell align="right">
                {!readOnly && (
                  <button
                    className="rounded p-1 hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--text-3)' }}
                    onClick={() => setDeleteId(s.id)}
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
        title="Delete shift?"
        description="This shift will be removed."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
