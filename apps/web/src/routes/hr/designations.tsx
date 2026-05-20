import { useState } from 'react';
import { Plus, Trash2, IdCard } from 'lucide-react';
import {
  PageHeader, Button, Input,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast, ConfirmationDialog, Modal,
} from '@/components/ui';
import { EmptyState, ListToolbar } from '@/components/ar/primitives';
import {
  useDesignations, useCreateDesignation, useUpdateDesignation, useDeleteDesignation,
  type Designation,
} from '@/hooks/queries/use-hr';
import { useIsReadOnly } from '@/providers/auth-provider';

export function DesignationsPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const { data, isLoading } = useDesignations();
  const create = useCreateDesignation();
  const update = useUpdateDesignation();
  const remove = useDeleteDesignation();

  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Designation | null>(null);
  const [editName, setEditName] = useState('');
  const [editLevel, setEditLevel] = useState('');
  const [search, setSearch] = useState('');

  const designations = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? designations.filter((d) => d.name.toLowerCase().includes(q))
    : designations;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate({ name: name.trim(), level: level ? Number(level) : null }, {
      onSuccess: () => { setName(''); setLevel(''); setShowAdd(false); toast('Designation created', 'success'); },
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Designations' }]}
        title="Designations"
        description="Roles and seniority levels in your organisation."
        actions={!readOnly && (
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={13} /> New designation</Button>
        )}
      />

      {showAdd && (
        <Modal open onClose={() => setShowAdd(false)} title="Add designation">
          <form onSubmit={handleCreate} className="space-y-3">
            <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            <Input label="Level" type="number" min="0" max="20" value={level} onChange={(e) => setLevel(e.target.value)} helper="Optional 0–20 for sorting" />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {designations.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by name…"
          count={filtered.length}
          noun="designation"
        />
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Name</Th>
            <Th align="right">Level</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={3} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : designations.length === 0 ? (
            <tr><td colSpan={3}><EmptyState icon={<IdCard size={18} />} title="No designations yet" description="Add your first designation above." /></td></tr>
          ) : filtered.length === 0 ? (
            <tr><td colSpan={3}><EmptyState icon={<IdCard size={18} />} title="No designations match" description="Try a different search term." /></td></tr>
          ) : filtered.map((d) => (
            <TableRow key={d.id}>
              <TableCell>
                {editing?.id === d.id ? (
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                ) : (
                  <span className="font-medium" style={{ color: 'var(--text-1)' }}>{d.name}</span>
                )}
              </TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>
                {editing?.id === d.id ? (
                  <Input type="number" value={editLevel} onChange={(e) => setEditLevel(e.target.value)} />
                ) : (d.level ?? <span style={{ color: 'var(--text-3)' }}>—</span>)}
              </TableCell>
              <TableCell align="right">
                {!readOnly && (
                  <div className="flex items-center justify-end gap-1">
                    {editing?.id === d.id ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button size="sm" onClick={() => {
                          update.mutate({ id: d.id, name: editName.trim(), level: editLevel ? Number(editLevel) : null }, {
                            onSuccess: () => { setEditing(null); toast('Updated', 'success'); },
                            onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
                          });
                        }} disabled={update.isPending}>Save</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => { setEditing(d); setEditName(d.name); setEditLevel(d.level?.toString() ?? ''); }}>Edit</Button>
                        <button
                          className="rounded p-1 hover:bg-[var(--surface-2)]"
                          style={{ color: 'var(--text-3)' }}
                          onClick={() => setDeleteId(d.id)}
                          aria-label="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
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
        title="Delete designation?"
        description="Cannot delete if employees are assigned to it."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
