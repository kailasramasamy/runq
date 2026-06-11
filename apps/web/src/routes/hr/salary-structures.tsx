import { useState } from 'react';
import { Plus, Trash2, Layers, X, Sparkles } from 'lucide-react';
import {
  PageHeader, Button, Input, Select, Combobox, Textarea, Card, CardHeader, CardContent,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge, useToast, Modal, ConfirmationDialog,
} from '@/components/ui';
import { EmptyState, ListToolbar } from '@/components/ar/primitives';
import {
  useSalaryStructures, useSalaryStructure, useCreateSalaryStructure, useDeleteSalaryStructure,
  useSalaryComponents, useGenerateSalaryStructure,
  type CalcType, type GeneratedStructure,
} from '@/hooks/queries/use-hr-payroll';
import { useIsReadOnly } from '@/providers/auth-provider';

const CALC_OPTS: Array<{ value: CalcType; label: string }> = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'percent_of_basic', label: '% of Basic' },
  { value: 'percent_of_ctc', label: '% of CTC' },
];

type Line = { salaryComponentId: string; value: string; calcType: CalcType };
type StructureDraft = { name: string; description: string; lines: Line[] };

function draftFromGenerated(g: GeneratedStructure): StructureDraft {
  return {
    name: g.name,
    description: g.description,
    lines: g.components.map((c) => ({ salaryComponentId: c.salaryComponentId, value: String(c.value), calcType: c.calcType })),
  };
}

export function SalaryStructuresPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const { data, isLoading } = useSalaryStructures();
  const remove = useDeleteSalaryStructure();
  const [showNew, setShowNew] = useState(false);
  const [showGen, setShowGen] = useState(false);
  const [draft, setDraft] = useState<StructureDraft | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  function openNew(initial: StructureDraft | null) {
    setDraft(initial);
    setShowNew(true);
  }

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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowGen(true)}>
              <Sparkles size={13} className="text-teal-600" /> Generate with AI
            </Button>
            <Button size="sm" onClick={() => openNew(null)}><Plus size={13} /> New structure</Button>
          </div>
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

      {showNew && <NewStructureModal initial={draft} onClose={() => { setShowNew(false); setDraft(null); }} />}
      {showGen && (
        <GenerateStructureModal
          onClose={() => setShowGen(false)}
          onGenerated={(g) => { setShowGen(false); openNew(draftFromGenerated(g)); }}
        />
      )}
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

function NewStructureModal({ onClose, initial }: { onClose: () => void; initial?: StructureDraft | null }) {
  const { toast } = useToast();
  const create = useCreateSalaryStructure();
  const { data: compData } = useSalaryComponents();

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [lines, setLines] = useState<Line[]>(
    initial?.lines?.length ? initial.lines : [{ salaryComponentId: '', value: '', calcType: 'fixed' }],
  );

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
        {initial && (
          <div className="flex items-start gap-2 rounded-md px-3 py-2 text-[12px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
            <Sparkles size={14} className="mt-0.5 shrink-0" />
            <span>AI-drafted from your role hint. Review the components and values, then save.</span>
          </div>
        )}
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

function GenerateStructureModal({ onClose, onGenerated }: { onClose: () => void; onGenerated: (g: GeneratedStructure) => void }) {
  const { toast } = useToast();
  const generate = useGenerateSalaryStructure();
  const [name, setName] = useState('');
  const [roleHint, setRoleHint] = useState('');
  const [includeStatutory, setIncludeStatutory] = useState(true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    generate.mutate(
      { name: name.trim() || undefined, roleHint: roleHint.trim(), includeStatutory },
      {
        onSuccess: (r) => onGenerated(r.data),
        onError: (err: any) => toast(err?.message ?? 'Generation failed', 'error'),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title="Generate structure with AI" size="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>
          Describe the role and we'll draft an India-standard salary structure from your existing components. You'll review it before saving.
        </p>
        <Input
          label="Role / grade *"
          value={roleHint}
          onChange={(e) => setRoleHint(e.target.value)}
          required
          placeholder="e.g. Factory worker, Senior Engineer, Office staff"
        />
        <Input
          label="Structure name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Optional — AI suggests one if left blank"
        />
        <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-2)' }}>
          <input
            type="checkbox"
            checked={includeStatutory}
            onChange={(e) => setIncludeStatutory(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
          />
          Include statutory components (PF, ESI, PT, TDS)
        </label>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!roleHint.trim() || generate.isPending}>
            <Sparkles size={13} /> {generate.isPending ? 'Generating…' : 'Generate'}
          </Button>
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
