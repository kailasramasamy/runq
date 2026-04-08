import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CreditCard, FileText, Trash2, Pencil, ExternalLink, Copy, Check } from 'lucide-react';
import { useVendor, useDeleteVendor, useUpdateVendor } from '@/hooks/queries/use-vendors';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { formatINR } from '@/lib/utils';
import type { Vendor } from '@runq/types';
import type { CreateVendorInput } from '@runq/validators';
import { VendorForm } from '@/components/forms/vendor-form';
import {
  PageHeader, Badge, Button, Card, CardHeader, CardContent,
  StatsCard, EmptyState, ConfirmationDialog, CardSkeleton,
  Modal, useToast,
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
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DetailField label="Name" value={vendor.name} />
          <DetailField label="Status" value={null} />
          <DetailField label="Email" value={vendor.email} />
          <DetailField label="Phone" value={vendor.phone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Tax & Compliance" />
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DetailField label="GSTIN" value={vendor.gstin} />
          <DetailField label="PAN" value={vendor.pan} />
          <DetailField label="Payment Terms" value={`Net ${vendor.paymentTermsDays} days`} />
          <DetailField label="Expense Account" value={vendor.expenseAccountCode ?? 'Default (5002)'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Address" />
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DetailField label="Account Name" value={vendor.bankAccountName} />
          <DetailField label="Account Number" value={vendor.bankAccountNumber} />
          <DetailField label="IFSC" value={vendor.bankIfsc} />
          <DetailField label="Bank Name" value={vendor.bankName} />
        </CardContent>
      </Card>
    </div>
  );
}

function VendorPortalCard({ vendorId }: { vendorId: string }) {
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateSlug = useMutation({
    mutationFn: () =>
      api.post<{ data: { slug: string } }>(`/ap/vendors/${vendorId}/portal-slug`),
    onSuccess: (res) => {
      const slug = res.data.slug;
      setPortalUrl(`${window.location.origin}/vendor-portal/s/${slug}`);
    },
  });

  function handleCopy() {
    if (!portalUrl) return;
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader title="Vendor Portal" />
      <CardContent>
        {portalUrl ? (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Share this link with the vendor. They can view POs, bills, and payment history without logging in.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {portalUrl}
              </code>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.open(portalUrl, '_blank')}>
                <ExternalLink size={14} /> Open
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => generateSlug.mutate()} loading={generateSlug.isPending}>
              Regenerate Link
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Generate a portal link so this vendor can view their purchase orders, outstanding bills, and payment history.
            </p>
            <Button variant="outline" size="sm" onClick={() => generateSlug.mutate()} loading={generateSlug.isPending}>
              <ExternalLink size={14} /> Generate Portal Link
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadgeCell({ active }: { active: boolean }) {
  return <Badge variant={active ? 'success' : 'default'}>{active ? 'Active' : 'Inactive'}</Badge>;
}

function EditVendorModal({
  vendor,
  open,
  onClose,
}: {
  vendor: Vendor;
  open: boolean;
  onClose: () => void;
}) {
  const updateMutation = useUpdateVendor();
  const { toast } = useToast();

  function handleSubmit(data: CreateVendorInput) {
    updateMutation.mutate(
      { id: vendor.id, data },
      {
        onSuccess: () => { toast('Vendor updated', 'success'); onClose(); },
        onError: () => toast('Failed to update vendor', 'error'),
      },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Vendor" wide>
      <VendorForm
        initialData={vendor}
        onSubmit={handleSubmit}
        onCancel={onClose}
        isLoading={updateMutation.isPending}
      />
    </Modal>
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
      <VendorPortalCard vendorId={vendorId} />

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

      <EditVendorModal vendor={vendor} open={showEdit} onClose={() => setShowEdit(false)} />

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
