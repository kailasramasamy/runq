import { useState } from 'react';
import { Plus, Pencil, Power } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Button, Badge, Modal, Input, Combobox, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton, useToast,
} from '@/components/ui';
import {
  useFarmers, useCreateFarmer, useUpdateFarmer, useDeactivateFarmer, useNodes,
  type MilkType, type MpFarmer,
} from '@/hooks/queries/use-milk-procurement';

const MILK_TYPES = [
  { value: 'cow', label: 'Cow' },
  { value: 'buffalo', label: 'Buffalo' },
  { value: 'mixed', label: 'Mixed' },
];

export function MpFarmersPage() {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editFarmer, setEditFarmer] = useState<MpFarmer | null>(null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const { data, isLoading } = useFarmers({ search: search || undefined, limit: 200 });
  const deactivate = useDeactivateFarmer();
  const { toast } = useToast();
  const farmers = data?.data ?? [];

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
                <Th>Code</Th><Th>Name</Th><Th>Phone</Th><Th>Milk</Th><Th>Type</Th><Th>Status</Th><Th align="right">Actions</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : farmers.length === 0 ? (
                <TableEmpty colSpan={7} message="No farmers yet." />
              ) : (
                farmers.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.code}</TableCell>
                    <TableCell>{f.name}</TableCell>
                    <TableCell className="text-zinc-500">{f.phone ?? '—'}</TableCell>
                    <TableCell>{f.defaultMilkType}</TableCell>
                    <TableCell>{f.isSociety ? <Badge>Society</Badge> : 'Farmer'}</TableCell>
                    <TableCell>{f.isActive ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditFarmer(f)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                      {f.isActive && (
                        <Button variant="ghost" size="sm" onClick={() => setDeactivateId(f.id)} title="Deactivate"><Power className="h-4 w-4" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showCreate && <CreateFarmerModal onClose={() => setShowCreate(false)} />}
      {editFarmer && <EditFarmerModal farmer={editFarmer} onClose={() => setEditFarmer(null)} />}

      <ConfirmationDialog
        open={!!deactivateId}
        title="Deactivate farmer?"
        description="They'll be hidden from active lists. Existing pours and payouts are unaffected."
        confirmLabel="Deactivate"
        variant="danger"
        loading={deactivate.isPending}
        onClose={() => setDeactivateId(null)}
        onConfirm={() => {
          if (!deactivateId) return;
          deactivate.mutate(deactivateId, {
            onSuccess: () => { toast('Farmer deactivated', 'success'); setDeactivateId(null); },
            onError: () => toast('Failed to deactivate', 'error'),
          });
        }}
      />
    </div>
  );
}

function EditFarmerModal({ farmer, onClose }: { farmer: MpFarmer; onClose: () => void }) {
  const update = useUpdateFarmer();
  const { toast } = useToast();
  const [f, setF] = useState({
    name: farmer.name,
    phone: farmer.phone ?? '',
    isSociety: farmer.isSociety,
    defaultMilkType: farmer.defaultMilkType as string,
  });

  const submit = () => {
    update.mutate(
      {
        id: farmer.id,
        data: {
          name: f.name,
          phone: f.phone || null,
          isSociety: f.isSociety,
          defaultMilkType: f.defaultMilkType as MilkType,
        },
      },
      {
        onSuccess: () => { toast('Farmer updated', 'success'); onClose(); },
        onError: () => toast('Failed to update farmer', 'error'),
      },
    );
  };

  return (
    <Modal open onClose={onClose} title={`Edit ${farmer.code}`}>
      <div className="space-y-3">
        <Input label="Code" value={farmer.code} disabled />
        <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <Input label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Combobox label="Default milk" value={f.defaultMilkType} onChange={(v) => setF({ ...f, defaultMilkType: v })} options={MILK_TYPES} />
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={f.isSociety} onChange={(e) => setF({ ...f, isSociety: e.target.checked })} />
          This is a society / sub-collector
        </label>
        <p className="text-xs text-zinc-500">Bank details &amp; VMCC membership are managed separately.</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={update.isPending} disabled={!f.name}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function CreateFarmerModal({ onClose }: { onClose: () => void }) {
  const create = useCreateFarmer();
  const { toast } = useToast();
  const { data: nodesData } = useNodes({ nodeType: 'vmcc', limit: 200 });
  const vmccs = nodesData?.data ?? [];
  const [f, setF] = useState({
    code: '', name: '', phone: '', isSociety: false, defaultMilkType: 'cow', nodeId: '',
    bankAccountNumber: '', bankIfsc: '', bankName: '',
  });

  const submit = () => {
    create.mutate(
      {
        code: f.code,
        name: f.name,
        phone: f.phone || null,
        isSociety: f.isSociety,
        defaultMilkType: f.defaultMilkType as MilkType,
        nodeId: f.nodeId || null,
        bankAccountNumber: f.bankAccountNumber || null,
        bankIfsc: f.bankIfsc || null,
        bankName: f.bankName || null,
      },
      {
        onSuccess: () => { toast('Farmer created', 'success'); onClose(); },
        onError: () => toast('Failed to create farmer', 'error'),
      },
    );
  };

  return (
    <Modal open onClose={onClose} title="Add farmer">
      <div className="space-y-3">
        <Input label="Code / farmer no." value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required />
        <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <Input label="Phone (app login + ledger)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Combobox label="Default milk" value={f.defaultMilkType} onChange={(v) => setF({ ...f, defaultMilkType: v })} options={MILK_TYPES} />
        <Combobox label="Primary VMCC" value={f.nodeId} onChange={(v) => setF({ ...f, nodeId: v })}
          options={[{ value: '', label: 'None' }, ...vmccs.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))]} placeholder="None" />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Bank A/C no." value={f.bankAccountNumber} onChange={(e) => setF({ ...f, bankAccountNumber: e.target.value })} />
          <Input label="IFSC" value={f.bankIfsc} onChange={(e) => setF({ ...f, bankIfsc: e.target.value })} />
        </div>
        <Input label="Bank name" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} />
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={f.isSociety} onChange={(e) => setF({ ...f, isSociety: e.target.checked })} />
          This is a society / sub-collector
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending} disabled={!f.code || !f.name}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}
