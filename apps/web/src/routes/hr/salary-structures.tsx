import { useState } from 'react';
import { Plus, Trash2, Layers, X } from 'lucide-react';
import {
  PageHeader, Button, Input, Select, Combobox, Textarea, Card, CardHeader, CardContent,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge, useToast, Modal, ConfirmationDialog,
} from '@/components/ui';
import { EmptyState, ListToolbar } from '@/components/ar/primitives';
import {
  useSalaryStructures, useSalaryStructure, useCreateSalaryStructure, useDeleteSalaryStructure,
  useSalaryComponents,
  type CalcType,
} from '@/hooks/queries/use-hr-payroll';
import { useIsReadOnly } from '@/providers/auth-provider';

const CALC_OPTS: Array<{ value: CalcType; label: string }> = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'percent_of_basic', label: '% of Basic' },
  { value: 'percent_of_ctc', label: '% of CTC' },
];

export function SalaryStructuresPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const { data, isLoading } = useSalaryStructures();
  const remove = useDeleteSalaryStructure();
  const [showNew, setShowNew] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const structures = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? structures.filter((s) =>
        s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q))
    : structures;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Salary structures' }]}
        title="Salary structures"
        description="Templates of components — assigned to employees with a CTC."
        actions={!readOnly && (
          <Button size="sm" onClick={() => setShowNew(true)}><Plus size={13} /> New structure</Button>
        )}
      />

      {structures.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by name…"
          count={filtered.length}
          noun="structure"
        />
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Name</Th>
            <Th>Description</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={3} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : structures.length === 0 ? (
            <tr><td colSpan={3}><EmptyState icon={<Layers size={18} />} title="No structures yet" description="Create a structure (e.g. Worker, Office Staff) to assign to employees." /></td></tr>
          ) : filtered.length === 0 ? (
            <tr><td colSpan={3}><EmptyState icon={<Layers size={18} />} title="No structures match" description="Try a different search term." /></td></tr>
          ) : filtered.map((s) => (
            <TableRow key={s.id} onClick={() => setViewId(s.id)}>
              <TableCell><span className="font-medium" style={{ color: 'var(--text-1)' }}>{s.name}</span></TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>{s.description ?? <span style={{ color: 'var(--text-3)' }}>—</span>}</TableCell>
              <TableCell align="right">
                {!readOnly && (
                  <button className="rounded p-1 hover:bg-[var(--surface-2)]" style={{ color: 'var(--text-3)' }} onClick={(e) => { e.stopPropagation(); setDeleteId(s.id); }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {showNew && <NewStructureModal onClose={() => setShowNew(false)} />}
      {viewId && <ViewStructureModal id={viewId} onClose={() => setViewId(null)} />}

      <ConfirmationDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (!deleteId) return;
          remove.mutate(deleteId, {
            onSuccess: () => { setDeleteId(null); toast('Deleted', 'success'); },
            onError: (e: any) => { setDeleteId(null); toast(e?.message ?? 'Failed', 'error'); },
          });
        }}
        title="Delete structure?"
        description="Employees assigned this structure keep their snapshot, but you can't pick it again."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}

function NewStructureModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const create = useCreateSalaryStructure();
  const { data: compData } = useSalaryComponents();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<Array<{ salaryComponentId: string; value: string; calcType: CalcType }>>([
    { salaryComponentId: '', value: '', calcType: 'fixed' },
  ]);

  const compOptions = (compData?.data ?? []).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }));

  function setLine(i: number, patch: Partial<{ salaryComponentId: string; value: string; calcType: CalcType }>) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }
  function addLine() { setLines((p) => [...p, { salaryComponentId: '', value: '', calcType: 'fixed' }]); }
  function removeLine(i: number) { setLines((p) => p.filter((_, idx) => idx !== i)); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      name: name.trim(),
      description: description || undefined,
      components: lines.filter((l) => l.salaryComponentId).map((l) => ({
        salaryComponentId: l.salaryComponentId,
        value: Number(l.value || 0),
        calcType: l.calcType,
      })),
    }, {
      onSuccess: () => { toast('Structure created', 'success'); onClose(); },
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <Modal open onClose={onClose} title="New salary structure" size="lg">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Worker / Office Staff / Supervisor" />
        <Textarea label="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>Components</label>
            <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus size={12} /> Add line</Button>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6">
                  <Combobox options={compOptions} value={l.salaryComponentId} onChange={(v) => setLine(i, { salaryComponentId: v })} placeholder="Pick component" />
                </div>
                <div className="col-span-3">
                  <Select options={CALC_OPTS} value={l.calcType} onChange={(e) => setLine(i, { calcType: e.target.value as CalcType })} />
                </div>
                <div className="col-span-2">
                  <Input type="number" step="0.01" min="0" value={l.value} onChange={(e) => setLine(i, { value: e.target.value })} placeholder="0" />
                </div>
                <button type="button" onClick={() => removeLine(i)} className="col-span-1 mb-1 rounded p-1 hover:bg-[var(--surface-2)]" style={{ color: 'var(--text-3)' }}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!name || create.isPending}>{create.isPending ? 'Saving…' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ViewStructureModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useSalaryStructure(id);
  const s = data?.data;

  return (
    <Modal open onClose={onClose} title={s?.name ?? 'Structure'} size="lg">
      {isLoading ? <p style={{ color: 'var(--text-3)' }}>Loading…</p> : !s ? null : (
        <div className="space-y-3">
          {s.description && <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>{s.description}</p>}
          <Table>
            <TableHeader>
              <tr><Th>Code</Th><Th>Name</Th><Th>Type</Th><Th>Calc</Th><Th align="right">Value</Th></tr>
            </TableHeader>
            <TableBody>
              {(s.components ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell><span className="num font-medium">{c.code}</span></TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell><Badge variant="default">{c.type}</Badge></TableCell>
                  <TableCell>{c.calcType.replace(/_/g, ' ')}</TableCell>
                  <TableCell align="right" className="num">{Number(c.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Modal>
  );
}
