import { useState } from 'react';
import { Plus, Trash2, CalendarDays, Sparkles } from 'lucide-react';
import {
  PageHeader, Button, Input, Select,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge, useToast, ConfirmationDialog, Modal,
} from '@/components/ui';
import { EmptyState, ListToolbar, Select as FilterSelect } from '@/components/ar/primitives';
import {
  useHolidays, useCreateHoliday, useDeleteHoliday,
  useSuggestHolidays, useBulkCreateHolidays, type SuggestedHoliday,
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
  const [showGen, setShowGen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const holidays = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = holidays.filter((h) => {
    if (q && !h.name.toLowerCase().includes(q)) return false;
    if (typeFilter && h.type !== typeFilter) return false;
    return true;
  });

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
            {!readOnly && (
              <Button variant="outline" size="sm" onClick={() => setShowGen(true)}>
                <Sparkles size={13} className="text-teal-600" /> Generate with AI
              </Button>
            )}
            {!readOnly && <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={13} /> New holiday</Button>}
          </div>
        }
      />

      {showGen && <GenerateHolidaysModal year={year} onClose={() => setShowGen(false)} />}

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

      {holidays.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by name…"
          count={filtered.length}
          noun="holiday"
        >
          <FilterSelect
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[{ value: '', label: 'All types' }, ...TYPE_OPTIONS]}
          />
        </ListToolbar>
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
          ) : filtered.length === 0 ? (
            <tr><td colSpan={5}><EmptyState icon={<CalendarDays size={18} />} title="No holidays match" description="Try a different search or filter." /></td></tr>
          ) : filtered.map((h) => (
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

type Reviewable = SuggestedHoliday & { include: boolean };

function GenerateHolidaysModal({ year, onClose }: { year: number; onClose: () => void }) {
  const { toast } = useToast();
  const suggest = useSuggestHolidays();
  const bulk = useBulkCreateHolidays();
  const [stateName, setStateName] = useState('');
  const [rows, setRows] = useState<Reviewable[] | null>(null);

  function runSuggest(e: React.FormEvent) {
    e.preventDefault();
    suggest.mutate({ year, state: stateName.trim() || undefined }, {
      onSuccess: (r) => setRows(r.data.map((h) => ({ ...h, include: true }))),
      onError: (err: any) => toast(err?.message ?? 'Generation failed', 'error'),
    });
  }

  function saveSelected() {
    const selected = (rows ?? []).filter((r) => r.include).map(({ include, ...h }) => h);
    if (selected.length === 0) return;
    bulk.mutate(selected, {
      onSuccess: (r) => {
        const { createdCount, skipped } = r.data;
        toast(`Added ${createdCount} holiday${createdCount === 1 ? '' : 's'}${skipped.length ? ` · ${skipped.length} already existed` : ''}`, 'success');
        onClose();
      },
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  const selectedCount = (rows ?? []).filter((r) => r.include).length;

  return (
    <Modal open onClose={onClose} title={`Generate ${year} holidays with AI`} size="lg">
      {!rows ? (
        <form onSubmit={runSuggest} className="space-y-3">
          <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>
            We'll draft India's national holidays and major festivals with their correct {year} dates. You'll review and pick before saving.
          </p>
          <Input
            label="State (optional)"
            value={stateName}
            onChange={(e) => setStateName(e.target.value)}
            placeholder="e.g. Tamil Nadu — adds that state's holidays too"
          />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={suggest.isPending}>
              <Sparkles size={13} /> {suggest.isPending ? 'Generating…' : 'Generate'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[12px]" style={{ color: 'var(--text-3)' }}>
            <span>{selectedCount} of {rows.length} selected</span>
            <button
              className="hover:underline"
              onClick={() => setRows(rows.map((r) => ({ ...r, include: selectedCount !== rows.length })))}
            >
              {selectedCount === rows.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="max-h-[50vh] overflow-y-auto rounded-md border" style={{ borderColor: 'var(--border)' }}>
            {rows.map((r, i) => (
              <label key={`${r.date}-${r.name}`} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) => setRows(rows.map((x, idx) => idx === i ? { ...x, include: e.target.checked } : x))}
                  className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                />
                <span className="num w-24 shrink-0 text-[12px]" style={{ color: 'var(--text-2)' }}>{r.date}</span>
                <span className="flex-1 text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>{r.name}</span>
                <Badge variant={TYPE_VARIANT[r.type]}>{r.type}</Badge>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRows(null)}>Back</Button>
            <Button onClick={saveSelected} disabled={selectedCount === 0 || bulk.isPending}>
              {bulk.isPending ? 'Adding…' : `Add ${selectedCount} holiday${selectedCount === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
