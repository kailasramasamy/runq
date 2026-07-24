import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ApiClientError } from '@/lib/api-client';
import {
  PageHeader, Card, CardContent, Button, Badge, Modal, Input, Combobox, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton, useToast,
} from '@/components/ui';
import {
  useFarmers, useCreateFarmer, useDeleteFarmer, useNodes,
  milkTypeLabel, type MpFarmer,
} from '@/hooks/queries/use-milk-procurement';
import {
  Section, SocietyToggle, IdentityFields, HerdFields, PaymentFields,
  initForm, formToPayload, type FarmerFormState,
} from './_farmer-form';

export function MpFarmersPage() {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteFarmer, setDeleteFarmer] = useState<MpFarmer | null>(null);
  const { data, isLoading } = useFarmers({ search: search || undefined, limit: 200 });
  const remove = useDeleteFarmer();
  const navigate = useNavigate();
  const { toast } = useToast();
  const farmers = data?.data ?? [];

  const openFarmer = (f: MpFarmer) =>
    navigate({ to: '/milk-procurement/farmers/$id', params: { id: f.id } });

  return (
    <div>
      <PageHeader
        title="Farmers"
        description="Farmer & society master. Each farmer is a vendor for payouts."
        fullWidth
        actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Add farmer</Button>}
      />

      <div className="mb-3 w-72">
        <Input placeholder="Search by name or code…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Code</Th><Th>Name</Th><Th>Phone</Th><Th>Village</Th><Th>Milk</Th><Th>Type</Th><Th>Status</Th><Th align="right">Actions</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={8} />
              ) : farmers.length === 0 ? (
                <TableEmpty colSpan={8} message="No farmers yet." />
              ) : (
                farmers.map((f) => (
                  <TableRow key={f.id} className="cursor-pointer" onClick={() => openFarmer(f)}>
                    <TableCell className="font-medium">{f.code}</TableCell>
                    <TableCell>{f.name}</TableCell>
                    <TableCell className="text-zinc-500">{f.phone ?? '—'}</TableCell>
                    <TableCell className="text-zinc-500">{f.village ?? '—'}</TableCell>
                    <TableCell>{milkTypeLabel(f.defaultMilkType)}</TableCell>
                    <TableCell>{f.isSociety ? <Badge>Society</Badge> : 'Farmer'}</TableCell>
                    <TableCell>{f.isActive ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => openFarmer(f)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteFarmer(f)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showCreate && <CreateFarmerModal onClose={() => setShowCreate(false)} />}

      <ConfirmationDialog
        open={!!deleteFarmer}
        title={`Delete ${deleteFarmer?.name ?? 'farmer'}?`}
        description="This permanently removes the farmer, their app login and VMCC membership. Farmers with existing pours or payouts can't be deleted."
        confirmLabel="Delete"
        variant="danger"
        loading={remove.isPending}
        onClose={() => setDeleteFarmer(null)}
        onConfirm={() => {
          if (!deleteFarmer) return;
          remove.mutate(deleteFarmer.id, {
            onSuccess: () => { toast('Farmer deleted', 'success'); setDeleteFarmer(null); },
            onError: (err) => toast(err instanceof ApiClientError ? err.message : 'Failed to delete', 'error'),
          });
        }}
      />
    </div>
  );
}

// ── CreateFarmerModal ─────────────────────────────────────────────────────────
// Creation stays a modal; rate charts, photo and edits live on the detail page.

function CreateFarmerModal({ onClose }: { onClose: () => void }) {
  const create = useCreateFarmer();
  const { toast } = useToast();
  const { data: nodesData } = useNodes({ nodeType: 'vmcc', limit: 200 });
  const vmccs = nodesData?.data ?? [];
  const [f, setF] = useState<FarmerFormState & { code: string; nodeId: string }>(() => ({
    ...initForm(),
    code: '',
    nodeId: '',
  }));
  const patch = (p: Partial<typeof f>) => setF((prev) => ({ ...prev, ...p }));
  const hasAadhaarError = f.aadhaar !== '' && !/^\d{12}$/.test(f.aadhaar);
  const allowedTypes = (vmccs.find((n) => n.id === f.nodeId)?.allowedMilkTypes) ?? [];

  const submit = () => {
    if (hasAadhaarError) return;
    create.mutate(
      {
        ...formToPayload(f),
        code: f.code || undefined,
        nodeId: f.nodeId || null,
      },
      {
        onSuccess: () => { toast('Farmer created', 'success'); onClose(); },
        onError: (err) => toast(err instanceof ApiClientError ? err.message : 'Failed to create farmer', 'error'),
      },
    );
  };

  return (
    <Modal open onClose={onClose} title="Add farmer">
      <div className="space-y-6">
        <Section title="Basics">
          <Input label="Name" value={f.name} onChange={(e) => patch({ name: e.target.value })} required />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Farmer code" placeholder="Auto-assigned if blank" value={f.code} onChange={(e) => patch({ code: e.target.value })} />
            <Input label="Phone" placeholder="App login + ledger" value={f.phone} onChange={(e) => patch({ phone: e.target.value })} />
          </div>
          <Combobox label="Primary VMCC" required value={f.nodeId} onChange={(v) => patch({ nodeId: v })}
            options={vmccs.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))} placeholder="Select a VMCC" />
          <SocietyToggle checked={f.isSociety} onChange={(v) => patch({ isSociety: v })} />
        </Section>

        <IdentityFields f={f} setF={patch} />

        <HerdFields f={f} setF={patch} allowedTypes={allowedTypes} />

        <PaymentFields f={f} setF={patch} />

        <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending} disabled={!f.name || !f.nodeId || f.suppliedMilkTypes.length === 0 || hasAadhaarError}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}
