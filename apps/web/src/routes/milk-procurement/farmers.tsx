import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ApiClientError } from '@/lib/api-client';
import {
  PageHeader, Card, CardContent, Button, Badge, Modal, Input, Combobox, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton, useToast,
} from '@/components/ui';
import {
  useFarmers, useCreateFarmer, useUpdateFarmer, useDeleteFarmer, useNodes, useRateCharts,
  milkTypeLabel, rateChartLabel,
  type MilkType, type MpFarmer, type CattleBreedCount,
} from '@/hooks/queries/use-milk-procurement';
import { BreedCountEditor } from '@/components/milk-procurement/breed-count-editor';
import { FarmerPhotoUpload } from '@/components/milk-procurement/farmer-photo-upload';

const MILK_TYPES = [
  { value: 'cow_a1', label: 'Cow A1 (regular)' },
  { value: 'cow_a2', label: 'Cow A2 (desi)' },
  { value: 'buffalo', label: 'Buffalo' },
  { value: 'mixed', label: 'Mixed' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
      {children}
    </p>
  );
}

export function MpFarmersPage() {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editFarmer, setEditFarmer] = useState<MpFarmer | null>(null);
  const [deleteFarmer, setDeleteFarmer] = useState<MpFarmer | null>(null);
  const { data, isLoading } = useFarmers({ search: search || undefined, limit: 200 });
  const remove = useDeleteFarmer();
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
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.code}</TableCell>
                    <TableCell>{f.name}</TableCell>
                    <TableCell className="text-zinc-500">{f.phone ?? '—'}</TableCell>
                    <TableCell className="text-zinc-500">{f.village ?? '—'}</TableCell>
                    <TableCell>{milkTypeLabel(f.defaultMilkType)}</TableCell>
                    <TableCell>{f.isSociety ? <Badge>Society</Badge> : 'Farmer'}</TableCell>
                    <TableCell>{f.isActive ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditFarmer(f)} title="Edit"><Pencil className="h-4 w-4" /></Button>
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
      {editFarmer && <EditFarmerModal farmer={editFarmer} onClose={() => setEditFarmer(null)} />}

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

// ── shared form state type ────────────────────────────────────────────────────

interface FarmerFormState {
  name: string; phone: string; isSociety: boolean;
  defaultMilkType: string; rateChartId: string;
  village: string; address: string; aadhaar: string;
  cattleBreeds: CattleBreedCount[]; inMilkCount: string;
  bankAccountName: string; bankAccountNumber: string; bankIfsc: string; bankName: string; upiId: string;
}

function initForm(f?: MpFarmer): FarmerFormState {
  return {
    name: f?.name ?? '',
    phone: f?.phone ?? '',
    isSociety: f?.isSociety ?? false,
    defaultMilkType: f?.defaultMilkType ?? 'cow_a1',
    rateChartId: f?.rateChartId ?? '',
    village: f?.village ?? '',
    address: f?.address ?? '',
    aadhaar: f?.aadhaar ?? '',
    cattleBreeds: f?.cattleBreeds ?? [],
    inMilkCount: f?.inMilkCount != null ? String(f.inMilkCount) : '',
    bankAccountName: f?.bankAccountName ?? '',
    bankAccountNumber: f?.bankAccountNumber ?? '',
    bankIfsc: f?.bankIfsc ?? '',
    bankName: f?.bankName ?? '',
    upiId: f?.upiId ?? '',
  };
}

// ── IdentityFields ────────────────────────────────────────────────────────────

function IdentityFields({ f, setF }: { f: FarmerFormState; setF: (p: Partial<FarmerFormState>) => void }) {
  const aadhaarError = f.aadhaar && !/^\d{12}$/.test(f.aadhaar) ? 'Must be exactly 12 digits' : undefined;
  return (
    <>
      <SectionLabel>Identity</SectionLabel>
      <Input label="Village" value={f.village} onChange={(e) => setF({ village: e.target.value })} />
      <Input label="Address" value={f.address} onChange={(e) => setF({ address: e.target.value })} />
      <Input
        label="Aadhaar number"
        value={f.aadhaar}
        onChange={(e) => setF({ aadhaar: e.target.value.replace(/\D/g, '').slice(0, 12) })}
        placeholder="12-digit number"
        error={aadhaarError}
        maxLength={12}
      />
    </>
  );
}

// ── HerdFields ────────────────────────────────────────────────────────────────

function HerdFields({ f, setF }: { f: FarmerFormState; setF: (p: Partial<FarmerFormState>) => void }) {
  return (
    <>
      <SectionLabel>Herd</SectionLabel>
      <Combobox label="Default milk type" value={f.defaultMilkType} onChange={(v) => setF({ defaultMilkType: v })} options={MILK_TYPES} />
      <BreedCountEditor value={f.cattleBreeds} onChange={(cattleBreeds) => setF({ cattleBreeds })} />
      <Input
        label="In-milk count"
        type="number"
        min={0}
        value={f.inMilkCount}
        onChange={(e) => setF({ inMilkCount: e.target.value })}
        placeholder="0"
      />
    </>
  );
}

// ── PaymentFields ─────────────────────────────────────────────────────────────

function PaymentFields({ f, setF }: { f: FarmerFormState; setF: (p: Partial<FarmerFormState>) => void }) {
  return (
    <>
      <SectionLabel>Payment</SectionLabel>
      <Input label="Account holder name" value={f.bankAccountName} onChange={(e) => setF({ bankAccountName: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <Input label="Bank A/C no." value={f.bankAccountNumber} onChange={(e) => setF({ bankAccountNumber: e.target.value })} />
        <Input label="IFSC" value={f.bankIfsc} onChange={(e) => setF({ bankIfsc: e.target.value.toUpperCase() })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input label="Bank name" value={f.bankName} onChange={(e) => setF({ bankName: e.target.value })} />
        <Input label="UPI ID" value={f.upiId} onChange={(e) => setF({ upiId: e.target.value })} />
      </div>
    </>
  );
}

// ── PricingFields ─────────────────────────────────────────────────────────────

function PricingFields({ f, setF, currentId }: {
  f: FarmerFormState; setF: (p: Partial<FarmerFormState>) => void; currentId?: string | null;
}) {
  const { data } = useRateCharts({ limit: 200 });
  // active charts, plus the currently-assigned one even if since deactivated
  const charts = (data?.data ?? []).filter((c) => c.isActive || c.id === currentId);
  return (
    <>
      <SectionLabel>Pricing</SectionLabel>
      <Combobox
        label="Rate chart override"
        value={f.rateChartId}
        onChange={(v) => setF({ rateChartId: v })}
        options={[
          { value: '', label: 'None (use VMCC / tenant chart)' },
          ...charts.map((c) => ({ value: c.id, label: rateChartLabel(c) })),
        ]}
        placeholder="None"
      />
    </>
  );
}

// ── payload helpers ───────────────────────────────────────────────────────────

function formToPayload(f: FarmerFormState) {
  const aadhaarValid = /^\d{12}$/.test(f.aadhaar);
  return {
    name: f.name,
    phone: f.phone || null,
    isSociety: f.isSociety,
    defaultMilkType: f.defaultMilkType as MilkType,
    rateChartId: f.rateChartId || null,
    village: f.village || null,
    address: f.address || null,
    aadhaar: aadhaarValid ? f.aadhaar : null,
    cattleBreeds: f.cattleBreeds.length > 0 ? f.cattleBreeds : null,
    inMilkCount: f.inMilkCount !== '' ? parseInt(f.inMilkCount) : null,
    bankAccountName: f.bankAccountName || null,
    bankAccountNumber: f.bankAccountNumber || null,
    bankIfsc: f.bankIfsc || null,
    bankName: f.bankName || null,
    upiId: f.upiId || null,
  };
}

// ── EditFarmerModal ───────────────────────────────────────────────────────────

function EditFarmerModal({ farmer, onClose }: { farmer: MpFarmer; onClose: () => void }) {
  const update = useUpdateFarmer();
  const { toast } = useToast();
  const [f, setF] = useState<FarmerFormState>(() => initForm(farmer));
  const patch = (p: Partial<FarmerFormState>) => setF((prev) => ({ ...prev, ...p }));
  const hasAadhaarError = f.aadhaar !== '' && !/^\d{12}$/.test(f.aadhaar);

  const submit = () => {
    if (hasAadhaarError) return;
    update.mutate(
      { id: farmer.id, data: formToPayload(f) },
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
        <Input label="Name" value={f.name} onChange={(e) => patch({ name: e.target.value })} required />
        <Input label="Phone" value={f.phone} onChange={(e) => patch({ phone: e.target.value })} />
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={f.isSociety} onChange={(e) => patch({ isSociety: e.target.checked })} />
          This is a society / sub-collector
        </label>

        <IdentityFields f={f} setF={patch} />

        <HerdFields f={f} setF={patch} />

        <PricingFields f={f} setF={patch} currentId={farmer.rateChartId} />

        {farmer.lat != null && farmer.lng != null && (
          <>
            <SectionLabel>Location (GPS)</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Latitude" value={String(farmer.lat)} disabled />
              <Input label="Longitude" value={String(farmer.lng)} disabled />
            </div>
            <p className="text-xs text-zinc-400">GPS coordinates are captured by the mobile app and cannot be edited here.</p>
          </>
        )}

        <PaymentFields f={f} setF={patch} />

        <SectionLabel>Profile photo</SectionLabel>
        <FarmerPhotoUpload farmerId={farmer.id} currentPhotoUrl={farmer.profilePhotoUrl} />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={update.isPending} disabled={!f.name || hasAadhaarError}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── CreateFarmerModal ─────────────────────────────────────────────────────────

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
        onError: () => toast('Failed to create farmer', 'error'),
      },
    );
  };

  return (
    <Modal open onClose={onClose} title="Add farmer">
      <div className="space-y-3">
        <Input label="Code / farmer no. (auto-assigned if blank)" value={f.code} onChange={(e) => patch({ code: e.target.value })} />
        <Input label="Name" value={f.name} onChange={(e) => patch({ name: e.target.value })} required />
        <Input label="Phone (app login + ledger)" value={f.phone} onChange={(e) => patch({ phone: e.target.value })} />
        <Combobox label="Primary VMCC" value={f.nodeId} onChange={(v) => patch({ nodeId: v })}
          options={[{ value: '', label: 'None' }, ...vmccs.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))]} placeholder="None" />
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={f.isSociety} onChange={(e) => patch({ isSociety: e.target.checked })} />
          This is a society / sub-collector
        </label>

        <IdentityFields f={f} setF={patch} />

        <HerdFields f={f} setF={patch} />

        <PricingFields f={f} setF={patch} />

        <PaymentFields f={f} setF={patch} />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending} disabled={!f.name || hasAadhaarError}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}
