import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Building2, MapPin, CreditCard, FileText, Trash2, Pencil, X } from 'lucide-react';
import { useVendor, useDeleteVendor, useUpdateVendor } from '@/hooks/queries/use-vendors';
import { useGLAccounts } from '@/hooks/queries/use-gl';
import { formatINR } from '@/lib/utils';
import type { Vendor } from '@runq/types';
import {
  PageHeader, Badge, Button, Card, CardHeader, CardContent,
  StatsCard, EmptyState, ConfirmationDialog, CardSkeleton,
  Input, Select, useToast,
} from '@/components/ui';

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{value ?? '—'}</p>
    </div>
  );
}

function VendorCards({ vendor }: { vendor: Vendor }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Basic Info" />
        <CardContent className="grid grid-cols-2 gap-4">
          <DetailField label="Name" value={vendor.name} />
          <DetailField label="Status" value={null} />
          <DetailField label="Email" value={vendor.email} />
          <DetailField label="Phone" value={vendor.phone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Tax & Compliance" />
        <CardContent className="grid grid-cols-2 gap-4">
          <DetailField label="GSTIN" value={vendor.gstin} />
          <DetailField label="PAN" value={vendor.pan} />
          <DetailField label="Payment Terms" value={`Net ${vendor.paymentTermsDays} days`} />
          <DetailField label="Expense Account" value={vendor.expenseAccountCode ?? 'Default (5002)'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Address" />
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <DetailField
              label="Address"
              value={[vendor.addressLine1, vendor.addressLine2].filter(Boolean).join(', ') || null}
            />
          </div>
          <DetailField label="City" value={vendor.city} />
          <DetailField label="State" value={vendor.state} />
          <DetailField label="Pincode" value={vendor.pincode} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Bank Details" />
        <CardContent className="grid grid-cols-2 gap-4">
          <DetailField label="Account Name" value={vendor.bankAccountName} />
          <DetailField label="Account Number" value={vendor.bankAccountNumber} />
          <DetailField label="IFSC" value={vendor.bankIfsc} />
          <DetailField label="Bank Name" value={vendor.bankName} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadgeCell({ active }: { active: boolean }) {
  return <Badge variant={active ? 'success' : 'default'}>{active ? 'Active' : 'Inactive'}</Badge>;
}

const CATEGORY_OPTIONS = [
  { value: '', label: 'No category' },
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'service_provider', label: 'Service Provider' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'other', label: 'Other' },
];

const PAYMENT_TERMS_OPTIONS = [
  { value: '0', label: 'Due on receipt' },
  { value: '7', label: 'Net 7' },
  { value: '15', label: 'Net 15' },
  { value: '30', label: 'Net 30' },
  { value: '45', label: 'Net 45' },
  { value: '60', label: 'Net 60' },
  { value: '90', label: 'Net 90' },
];

function EditVendorModal({ vendor, onClose }: { vendor: Vendor; onClose: () => void }) {
  const updateMutation = useUpdateVendor();
  const { toast } = useToast();
  const { data: accountsData } = useGLAccounts();
  const allAccounts = (accountsData?.data ?? []).filter((a) => a.isActive);

  const ASSET_CATEGORIES = new Set(['raw_material', 'equipment']);
  const ASSET_CODE_PREFIXES = ['11', '12', '13']; // inventory + fixed + intangible

  function getExpenseAccountOptions() {
    const showAssets = ASSET_CATEGORIES.has(form.category);
    const filtered = allAccounts.filter((a) => {
      if (a.type === 'expense') return true;
      if (showAssets && a.type === 'asset') {
        return ASSET_CODE_PREFIXES.some((p) => a.code.startsWith(p) && a.code.length === 4);
      }
      return false;
    });
    return [
      { value: '', label: 'Default (Purchase Expenses)' },
      ...filtered.map((a) => ({ value: a.code, label: `${a.code} — ${a.name}` })),
    ];
  }

  const [form, setForm] = useState({
    name: vendor.name,
    email: vendor.email ?? '',
    phone: vendor.phone ?? '',
    category: vendor.category ?? '',
    expenseAccountCode: vendor.expenseAccountCode ?? '',
    paymentTermsDays: String(vendor.paymentTermsDays),
    bankAccountName: vendor.bankAccountName ?? '',
    bankAccountNumber: vendor.bankAccountNumber ?? '',
    bankIfsc: vendor.bankIfsc ?? '',
    bankName: vendor.bankName ?? '',
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = (v: string) => v.trim() || undefined;
    updateMutation.mutate(
      {
        id: vendor.id,
        data: {
          name: form.name,
          email: clean(form.email),
          phone: clean(form.phone),
          category: clean(form.category),
          expenseAccountCode: clean(form.expenseAccountCode),
          paymentTermsDays: Number(form.paymentTermsDays),
          bankAccountName: clean(form.bankAccountName),
          bankAccountNumber: clean(form.bankAccountNumber),
          bankIfsc: clean(form.bankIfsc),
          bankName: clean(form.bankName),
        },
      },
      {
        onSuccess: () => { toast('Vendor updated', 'success'); onClose(); },
        onError: () => toast('Failed to update vendor', 'error'),
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Edit Vendor</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            <Input label="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Category" options={CATEGORY_OPTIONS} value={form.category} onChange={(e) => set('category', e.target.value)} />
            <Select label="Payment Terms" options={PAYMENT_TERMS_OPTIONS} value={form.paymentTermsDays} onChange={(e) => set('paymentTermsDays', e.target.value)} />
          </div>
          <Select label="Expense Account" options={getExpenseAccountOptions()} value={form.expenseAccountCode} onChange={(e) => set('expenseAccountCode', e.target.value)} />
          <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-3">Bank Details</p>
            <div className="space-y-3">
              <Input label="Account Name" value={form.bankAccountName} onChange={(e) => set('bankAccountName', e.target.value)} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Account Number" value={form.bankAccountNumber} onChange={(e) => set('bankAccountNumber', e.target.value)} />
                <Input label="IFSC" value={form.bankIfsc} onChange={(e) => set('bankIfsc', e.target.value)} />
              </div>
              <Input label="Bank Name" value={form.bankName} onChange={(e) => set('bankName', e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" type="button" onClick={onClose}>Cancel</Button>
            <Button size="sm" type="submit" loading={updateMutation.isPending}>Save Changes</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface Props { vendorId: string }

export function VendorDetailPage({ vendorId }: Props) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useVendor(vendorId);
  const deleteMutation = useDeleteVendor();
  const [showDelete, setShowDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const vendor = data?.data;

  function handleDeleteConfirm() {
    deleteMutation.mutate(vendorId, {
      onSuccess: () => navigate({ to: '/ap/vendors' }),
    });
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (isError || !vendor) {
    return <p className="text-sm text-red-500">Vendor not found.</p>;
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Vendors', href: '/ap/vendors' },
          { label: vendor.name },
        ]}
        title={vendor.name}
        actions={
          <>
            <StatusBadgeCell active={vendor.isActive} />
            <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
              <Pencil size={14} /> Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)}>
              <Trash2 size={14} /> Delete
            </Button>
          </>
        }
      />

      <div className="mb-6">
        <StatsCard title="Outstanding Balance" value={0} formatValue={formatINR} />
      </div>

      <VendorCards vendor={vendor} />

      <div className="mt-6 flex flex-col gap-4">
        <Card>
          <CardHeader title="Invoices" />
          <CardContent>
            <EmptyState icon={FileText} title="No invoices yet" description="Invoices from this vendor will appear here." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Payments" />
          <CardContent>
            <EmptyState icon={CreditCard} title="No payments yet" description="Payments to this vendor will appear here." />
          </CardContent>
        </Card>
      </div>

      {showEdit && vendor && (
        <EditVendorModal vendor={vendor} onClose={() => setShowEdit(false)} />
      )}

      <ConfirmationDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Vendor"
        description={`Delete "${vendor.name}"? This cannot be undone. Any linked invoices and payments will remain but the vendor record will be permanently removed.`}
        confirmLabel="Delete Vendor"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
