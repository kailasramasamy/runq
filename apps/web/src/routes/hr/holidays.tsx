import { useState } from 'react';
import { Plus, Trash2, CalendarDays } from 'lucide-react';
import {
  PageHeader, Button, Input, Select,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge, useToast, ConfirmationDialog, Modal,
} from '@/components/ui';
import { EmptyState } from '@/components/ar/primitives';
import {
  useHolidays, useCreateHoliday, useDeleteHoliday,
} from '@/hooks/queries/use-hr';
import { useIsReadOnly } from '@/providers/auth-provider';

const TYPE_OPTIONS = [
  { value: 'national', label: 'National' },
  { value: 'state', label: 'State' },
  { value: 'company', label: 'Company' },
  { value: 'optional', label: 'Optional' },
];

const TYPE_VARIANT: Record<string, any> = {
  national: 'primary', state: 'info', company: 'default', optional: 'outline',
};

export function HolidaysPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isLoading } = useHolidays(year);
  const create = useCreateHoliday();
  const remove = useDeleteHoliday();

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState<'national' | 'state' | 'company' | 'optional'>('company');
  const [stateName, setStateName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const holidays = data?.data ?? [];

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({ name: name.trim(), date, type, state: stateName || null, isPaid: true }, {
      onSuccess: () => { setName(''); setDate(''); setStateName(''); setShowAdd(false); toast('Holiday added', 'success'); },
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Holidays' }]}
        title="Holidays"
        description="Manage national, state, and company holidays."
        actions={
          <div className="flex items-center gap-2">
            <div className="w-32">
              <Select
                value={String(year)}
                onChange={(e) => setYear(Number(e.target.value))}
                options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))}
              />
            </div>
            {!readOnly && <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={13} /> New holiday</Button>}
          </div>
        }
      />

      {showAdd && (
        <Modal open onClose={() => setShowAdd(false)} title="Add holiday" size="lg">
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              <Input label="Date *" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              <Select label="Type" options={TYPE_OPTIONS} value={type} onChange={(e) => setType(e.target.value as any)} />
              <Input label="State (if applicable)" value={stateName} onChange={(e) => setStateName(e.target.value)} />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add holiday'}</Button>
            </div>
          </form>
        </Modal>
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Date</Th>
            <Th>Name</Th>
            <Th>Type</Th>
            <Th>State</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={5} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : holidays.length === 0 ? (
            <tr><td colSpan={5}><EmptyState icon={<CalendarDays size={18} />} title="No holidays" description="Add holidays for the selected year." /></td></tr>
          ) : holidays.map((h) => (
            <TableRow key={h.id}>
              <TableCell className="num" style={{ color: 'var(--text-2)' }}>{h.date}</TableCell>
              <TableCell><span className="font-medium" style={{ color: 'var(--text-1)' }}>{h.name}</span></TableCell>
              <TableCell><Badge variant={TYPE_VARIANT[h.type]}>{h.type}</Badge></TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>{h.state ?? <span style={{ color: 'var(--text-3)' }}>—</span>}</TableCell>
              <TableCell align="right">
                {!readOnly && (
                  <button
                    className="rounded p-1 hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--text-3)' }}
                    onClick={() => setDeleteId(h.id)}
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
        title="Delete holiday?"
        description="This holiday will be removed."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
