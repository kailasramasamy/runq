import { useState } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import {
  CreditCard, FileText, Trash2, Pencil, ExternalLink, Copy, Check,
  ArrowLeft, MoreHorizontal, User, ShieldCheck, Landmark, Plus,
} from 'lucide-react';
import { useVendor, useDeleteVendor, useUpdateVendor } from '@/hooks/queries/use-vendors';
import { usePurchaseInvoices } from '@/hooks/queries/use-purchase-invoices';
import { api } from '@/lib/api-client';
import { formatINR } from '@/lib/utils';
import type { Vendor } from '@runq/types';
import type { CreateVendorInput } from '@runq/validators';
import { VendorForm } from '@/components/forms/vendor-form';
import {
  PageHeader, Badge, Button, StatusBadge, DetailCard, DetailRow,
  Table, TableHeader, Th, TableBody, TableRow, TableCell, EmptyState, formatDate,
} from '@/components/ar/primitives';
import { ConfirmationDialog, Modal, useToast } from '@/components/ui';

interface Props { vendorId: string }

export function VendorDetailPage({ vendorId }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  const { data, isLoading, isError } = useVendor(vendorId);
  const deleteMutation = useDeleteVendor();
  const [showDelete, setShowDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const vendor = data?.data;

  const { data: billsData } = usePurchaseInvoices({ vendorId }, 1, 6);
  const bills = billsData?.data ?? [];

  function goBack() {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: '/ap/vendors' });
  }
  function handleDeleteConfirm() {
    deleteMutation.mutate(vendorId, {
      onSuccess: () => navigate({ to: '/ap/vendors' }),
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl border"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          />
        ))}
      </div>
    );
  }

  if (isError || !vendor) {
    return <p className="text-[13px]" style={{ color: 'var(--neg)' }}>Vendor not found.</p>;
  }

  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = bills.filter(
    (b) => Number(b.balanceDue) > 0 && !['paid', 'cancelled'].includes(b.status) && b.dueDate < today,
  ).length;
  const openCount = bills.filter((b) => ['pending_match', 'matched', 'approved', 'partially_paid'].includes(b.status)).length;
  const outstanding = bills.reduce((a, b) => a + Number(b.balanceDue ?? 0), 0);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Vendors', href: '/ap/vendors' },
          { label: vendor.name },
        ]}
        title={vendor.name}
        titleBadge={vendor.category ? <Badge variant="info">{vendor.category.replace(/_/g, ' ')}</Badge> : undefined}
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={13} />} onClick={goBack}>Back</Button>
            <Badge variant={vendor.isActive ? 'success' : 'outline'}>
              {vendor.isActive ? 'Active' : 'Inactive'}
            </Badge>
            <Button variant="outline" size="sm" icon={<Pencil size={13} />} onClick={() => setShowEdit(true)}>
              Edit
            </Button>
            <Button variant="outline" size="sm" icon={<Trash2 size={13} />} onClick={() => setShowDelete(true)} />
            <Button variant="outline" size="sm" icon={<MoreHorizontal size={13} />} />
          </>
        }
      />

      {/* Outstanding hero + portal */}
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div
          className="relative overflow-hidden rounded-xl border p-5 lg:col-span-2"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div
            className="absolute -right-12 -top-12 h-44 w-44 rounded-full opacity-50"
            style={{ background: 'radial-gradient(circle, var(--accent-soft) 0%, transparent 70%)' }}
          />
          <div className="relative">
            <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              Outstanding payable
            </div>
            <div className="num mt-2 text-[40px] font-semibold leading-none tabular-nums" style={{ color: 'var(--text-1)' }}>
              {formatINR(outstanding)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]" style={{ color: 'var(--text-3)' }}>
              <span><span className="num font-medium" style={{ color: 'var(--text-1)' }}>{overdueCount}</span> overdue</span>
              <span>·</span>
              <span><span className="num font-medium" style={{ color: 'var(--text-1)' }}>{openCount}</span> open</span>
              <span>·</span>
              <span>Net <span className="num font-medium" style={{ color: 'var(--text-1)' }}>{vendor.paymentTermsDays}d</span> terms</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/ap/bills/new' })}>
                New bill
              </Button>
              <Button variant="outline" size="sm" icon={<CreditCard size={13} />} onClick={() => navigate({ to: '/ap/payments/new' })}>
                Record payment
              </Button>
            </div>
          </div>
        </div>
        <VendorPortalCard vendorId={vendorId} />
      </div>

      {/* Detail cards */}
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetailCard title="Basic info" icon={<User size={14} />}>
          <DetailRow label="Email" value={vendor.email} mono />
          <DetailRow label="Phone" value={vendor.phone} mono />
          <DetailRow label="Payment terms" value={`Net ${vendor.paymentTermsDays} days`} />
          <DetailRow
            label="Early discount"
            value={
              vendor.earlyPaymentDiscountPercent != null
                ? `${vendor.earlyPaymentDiscountPercent}% if paid in ${vendor.earlyPaymentDiscountDays}d`
                : null
            }
          />
          <DetailRow label="Expense account" value={vendor.expenseAccountCode ?? 'Default (5002)'} mono />
          <DetailRow
            label="Address"
            value={
              [vendor.addressLine1, vendor.addressLine2, vendor.city, vendor.state, vendor.pincode]
                .filter(Boolean)
                .join(', ') || null
            }
          />
        </DetailCard>
        <DetailCard title="Tax & legal" icon={<ShieldCheck size={14} />}>
          <DetailRow label="GSTIN" value={vendor.gstin} mono />
          <DetailRow label="PAN" value={vendor.pan} mono />
          <DetailRow
            label="Place of supply"
            value={vendor.state ? `${vendor.state}${vendor.gstin ? ` (${vendor.gstin.slice(0, 2)})` : ''}` : null}
          />
          <DetailRow label="Requires invoice" value={vendor.requiresInvoice ? 'Yes' : 'No'} />
        </DetailCard>
      </div>

      {/* Bank details */}
      <div className="mb-5">
        <DetailCard title="Bank details" icon={<Landmark size={14} />}>
          <DetailRow label="Account name" value={vendor.bankAccountName} />
          <DetailRow label="Account number" value={vendor.bankAccountNumber} mono />
          <DetailRow label="IFSC" value={vendor.bankIfsc} mono />
          <DetailRow label="Bank name" value={vendor.bankName} />
        </DetailCard>
      </div>

      {/* Bills */}
      <div
        className="overflow-hidden rounded-xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: 'var(--border-soft)' }}>
          <div className="flex items-center gap-2">
            <FileText size={14} style={{ color: 'var(--text-2)' }} />
            <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>Recent bills</h3>
            <span className="num text-[11px]" style={{ color: 'var(--text-3)' }}>({bills.length})</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/ap/bills' })}>View all</Button>
        </div>
        {bills.length === 0 ? (
          <EmptyState
            icon={<FileText size={18} />}
            title="No bills yet"
            description="Bills from this vendor will appear here."
          />
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <Th>Bill #</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th align="right">Total</Th>
                <Th align="right">Balance</Th>
                <Th>Status</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {bills.map((b) => (
                <TableRow
                  key={b.id}
                  onClick={() => navigate({ to: '/ap/bills/$billId', params: { billId: b.id } })}
                >
                  <TableCell>
                    <span className="num text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>
                      {b.invoiceNumber}
                    </span>
                  </TableCell>
                  <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(b.invoiceDate)}</TableCell>
                  <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(b.dueDate)}</TableCell>
                  <TableCell align="right" numeric>{formatINR(Number(b.totalAmount))}</TableCell>
                  <TableCell align="right" numeric className="font-semibold">{formatINR(Number(b.balanceDue ?? 0))}</TableCell>
                  <TableCell><StatusBadge status={b.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <EditVendorModal vendor={vendor} open={showEdit} onClose={() => setShowEdit(false)} />

      <ConfirmationDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Vendor"
        description={`Delete "${vendor.name}"? This cannot be undone. Any linked bills and payments will remain but the vendor record will be permanently removed.`}
        confirmLabel="Delete Vendor"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

function VendorPortalCard({ vendorId }: { vendorId: string }) {
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateSlug = useMutation({
    mutationFn: () => api.post<{ data: { slug: string } }>(`/ap/vendors/${vendorId}/portal-slug`),
    onSuccess: (res) => {
      setPortalUrl(`${window.location.origin}/vendor-portal/s/${res.data.slug}`);
    },
  });

  function handleCopy() {
    if (!portalUrl) return;
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
          Vendor portal
        </div>
        <ExternalLink size={13} style={{ color: 'var(--text-3)' }} />
      </div>
      <p className="mb-3 text-[12px]" style={{ color: 'var(--text-2)' }}>
        Share this link so the vendor can view POs, bills, and payment history — no login required.
      </p>
      {portalUrl ? (
        <>
          <div
            className="num mb-2 truncate rounded-md border px-2.5 py-2 text-[11px]"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            {portalUrl}
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" icon={copied ? <Check size={12} /> : <Copy size={12} />} onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => generateSlug.mutate()} loading={generateSlug.isPending}>
              Regenerate
            </Button>
          </div>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          icon={<ExternalLink size={12} />}
          onClick={() => generateSlug.mutate()}
          loading={generateSlug.isPending}
        >
          Generate portal link
        </Button>
      )}
    </div>
  );
}

function EditVendorModal({
  vendor, open, onClose,
}: { vendor: Vendor; open: boolean; onClose: () => void }) {
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
