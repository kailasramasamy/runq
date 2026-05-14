import { useState } from 'react';
import { Plus, Trash2, Briefcase } from 'lucide-react';
import {
  PageHeader, Button, Input,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast, ConfirmationDialog, Modal,
} from '@/components/ui';
import { EmptyState } from '@/components/ar/primitives';
import {
  useDepartments, useCreateDepartment, useUpdateDepartment, useDeleteDepartment,
  type Department,
} from '@/hooks/queries/use-hr';
import { useIsReadOnly } from '@/providers/auth-provider';

export function DepartmentsPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const { data, isLoading } = useDepartments();
  const create = useCreateDepartment();
  const update = useUpdateDepartment();
  const remove = useDeleteDepartment();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Department | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');

  const departments = data?.data ?? [];

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate({ name: name.trim(), code: code.trim() || null }, {
      onSuccess: () => { setName(''); setCode(''); setShowAdd(false); toast('Department created', 'success'); },
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  function startEdit(d: Department) {
    setEditing(d);
    setEditName(d.name);
    setEditCode(d.code ?? '');
  }

  function saveEdit() {
    if (!editing) return;
    update.mutate({ id: editing.id, name: editName.trim(), code: editCode.trim() || null }, {
      onSuccess: () => { setEditing(null); toast('Department updated', 'success'); },
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Departments' }]}
        title="Departments"
        description="Define your organisational structure."
        actions={!readOnly && (
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={13} /> New department</Button>
        )}
      />

      {showAdd && (
        <Modal open onClose={() => setShowAdd(false)} title="Add department">
          <form onSubmit={handleCreate} className="space-y-3">
            <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add'}</Button>
            </div>
          </form>
        </Modal>
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Name</Th>
            <Th>Code</Th>
            <Th align="right">Employees</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={4} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : departments.length === 0 ? (
            <tr><td colSpan={4}><EmptyState icon={<Briefcase size={18} />} title="No departments yet" description="Add your first department above." /></td></tr>
          ) : departments.map((d) => (
            <TableRow key={d.id}>
              <TableCell>
                {editing?.id === d.id ? (
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                ) : (
                  <span className="font-medium" style={{ color: 'var(--text-1)' }}>{d.name}</span>
                )}
              </TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>
                {editing?.id === d.id ? (
                  <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} />
                ) : (d.code ?? <span style={{ color: 'var(--text-3)' }}>—</span>)}
              </TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{d.employeeCount ?? 0}</TableCell>
              <TableCell align="right">
                {!readOnly && (
                  <div className="flex items-center justify-end gap-1">
                    {editing?.id === d.id ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button size="sm" onClick={saveEdit} disabled={update.isPending}>Save</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => startEdit(d)}>Edit</Button>
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
            onSuccess: () => { setDeleteId(null); toast('Department deleted', 'success'); },
            onError: (err: any) => { setDeleteId(null); toast(err?.message ?? 'Failed', 'error'); },
          });
        }}
        title="Delete department?"
        description="Cannot delete if employees are assigned to it."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
