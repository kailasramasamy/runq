import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Building2, MapPin, CreditCard, FileText, Trash2 } from 'lucide-react';
import { useVendor, useDeleteVendor } from '@/hooks/queries/use-vendors';
import { formatINR } from '@/lib/utils';
import type { Vendor } from '@runq/types';
import {
  PageHeader, Badge, Button, Card, CardHeader, CardContent,
  StatsCard, EmptyState, ConfirmationDialog, CardSkeleton,
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

interface Props { vendorId: string }

export function VendorDetailPage({ vendorId }: Props) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useVendor(vendorId);
  const deleteMutation = useDeleteVendor();
  const [showDelete, setShowDelete] = useState(false);
  const vendor = data?.data;

  function handleDeleteConfirm() {
    deleteMutation.mutate(vendorId, {
      onSuccess: () => navigate({ to: '/ap/vendors' }),
    });
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
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
    <div className="mx-auto max-w-2xl">
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
            <Button variant="outline" size="sm" disabled title="Edit coming soon">
              Edit
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
