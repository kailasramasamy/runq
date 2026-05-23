import { useState } from 'react';
import { Plus, Trash2, Gift, Sparkles } from 'lucide-react';
import {
  PageHeader, Button, Input, Select, Badge, useToast, ConfirmationDialog, Modal,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { EmptyState, ListToolbar } from '@/components/ar/primitives';
import { useIsReadOnly } from '@/providers/auth-provider';
import {
  useRewardTypes, useCreateRewardType, useUpdateRewardType,
  useDeleteRewardType, useSeedDefaultRewardTypes,
  type RewardType, type CreateRewardTypeInput,
} from '@/hooks/queries/use-rewards';

const KIND_OPTIONS = [
  { value: 'monetary', label: 'Monetary' },
  { value: 'recognition', label: 'Recognition' },
  { value: 'points', label: 'Points' },
];

function AddTypeModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const create = useCreateRewardType();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'monetary' | 'recognition' | 'points'>('monetary');
  const [glAccountCode, setGlAccountCode] = useState('5205');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input: CreateRewardTypeInput = { name: name.trim(), code: code.trim().toUpperCase(), kind };
    if (kind === 'monetary') input.glAccountCode = glAccountCode.trim();
    create.mutate(input, {
      onSuccess: () => { toast('Reward type created', 'success'); onClose(); },
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <Modal open onClose={onClose} title="Add reward type" size="lg">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Spot Bonus" autoFocus />
          <Input label="Code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required placeholder="SPOT" />
          <Select label="Kind" required value={kind} onChange={(e) => setKind(e.target.value as 'monetary' | 'recognition' | 'points')} options={KIND_OPTIONS} />
        </div>
        {kind === 'monetary' && (
          <Input
            label="GL account code"
            value={glAccountCode}
            onChange={(e) => setGlAccountCode(e.target.value)}
            placeholder="5205"
            maxLength={20}
          />
        )}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditTypeModal({ rewardType, onClose }: { rewardType: RewardType; onClose: () => void }) {
  const { toast } = useToast();
  const update = useUpdateRewardType();
  const [name, setName] = useState(rewardType.name);
  const [glAccountCode, setGlAccountCode] = useState(rewardType.glAccountCode ?? '5205');
  const [isActive, setIsActive] = useState(rewardType.isActive);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    update.mutate(
      { id: rewardType.id, data: { name: name.trim(), glAccountCode: glAccountCode.trim(), isActive } },
      {
        onSuccess: () => { toast('Updated', 'success'); onClose(); },
        onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title={`Edit — ${rewardType.name}`} size="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        {rewardType.kind === 'monetary' && (
          <Input
            label="GL account code"
            value={glAccountCode}
            onChange={(e) => setGlAccountCode(e.target.value)}
            placeholder="5205"
            maxLength={20}
          />
        )}
        <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-2)' }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function RewardTypesPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const { data, isLoading } = useRewardTypes();
  const remove = useDeleteRewardType();
  const seedDefaults = useSeedDefaultRewardTypes();

  const [showAdd, setShowAdd] = useState(false);
  const [editType, setEditType] = useState<RewardType | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const types = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q ? types.filter((t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)) : types;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Reward types' }]}
        title="Reward types"
        description="Define the categories of rewards and spot bonuses."
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
            <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={13} /> New type</Button>
          </div>
        )}
      />

      {showAdd && <AddTypeModal onClose={() => setShowAdd(false)} />}
      {editType && <EditTypeModal rewardType={editType} onClose={() => setEditType(null)} />}

      {types.length > 0 && (
        <ListToolbar search={search} onSearch={setSearch} placeholder="Search by name or code…" count={filtered.length} noun="type" />
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Code</Th>
            <Th>Name</Th>
            <Th>Kind</Th>
            <Th>GL account</Th>
            <Th>Active</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : types.length === 0 ? (
            <tr><td colSpan={6}><EmptyState icon={<Gift size={18} />} title="No reward types" description="Seed defaults or add manually above." /></td></tr>
          ) : filtered.length === 0 ? (
            <tr><td colSpan={6}><EmptyState icon={<Gift size={18} />} title="No types match" description="Try a different search term." /></td></tr>
          ) : filtered.map((t) => (
            <TableRow key={t.id}>
              <TableCell><span className="num font-medium" style={{ color: 'var(--text-1)' }}>{t.code}</span></TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>{t.name}</TableCell>
              <TableCell>
                {t.kind === 'monetary' ? (
                  <Badge variant="primary">Monetary</Badge>
                ) : t.kind === 'points' ? (
                  <Badge variant="warning">Points</Badge>
                ) : (
                  <Badge variant="info">Recognition</Badge>
                )}
              </TableCell>
              <TableCell className="num text-[12px]" style={{ color: 'var(--text-3)' }}>
                {t.kind === 'monetary' ? (t.glAccountCode || '—') : '—'}
              </TableCell>
              <TableCell>{t.isActive ? <Badge variant="success">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
              <TableCell align="right">
                {!readOnly && (
                  <div className="flex items-center justify-end gap-1">
                    <button
                      className="rounded p-1 text-[12px] hover:bg-[var(--surface-2)]"
                      style={{ color: 'var(--text-3)' }}
                      onClick={() => setEditType(t)}
                    >
                      Edit
                    </button>
                    <button
                      className="rounded p-1 hover:bg-[var(--surface-2)]"
                      style={{ color: 'var(--text-3)' }}
                      onClick={() => setDeleteId(t.id)}
                      aria-label="Delete"
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
        title="Delete reward type?"
        description="Cannot delete if any rewards reference it."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
