import { useState, useEffect } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  FileText, Receipt, Trash2, ExternalLink, Copy, Check,
  ArrowLeft, Pencil, MoreHorizontal, Plus, Bell, User, ShieldCheck,
} from 'lucide-react';
import { useCustomer, useDeleteCustomer, useUpdateCustomer } from '@/hooks/queries/use-customers';
import { useInvoices } from '@/hooks/queries/use-invoices';
import { useReceipts } from '@/hooks/queries/use-receipts';
import { api } from '@/lib/api-client';
import { formatINR } from '@/lib/utils';
import type { CustomerWithOutstanding } from '@runq/types';
import type { CreateCustomerInput } from '@runq/validators';
import { CustomerForm } from '@/components/forms/customer-form';
import {
  PageHeader, Badge, Button, StatusBadge, DetailCard, DetailRow, CreditScorePill,
  Table, TableHeader, Th, TableBody, TableRow, TableCell, EmptyState, formatDate,
} from '@/components/ar/primitives';
import { ConfirmationDialog, Modal, useToast } from '@/components/ui';

interface Props { customerId: string }
interface CreditScoreData { score: number; risk: 'high' | 'medium' | 'low'; factors: string[] }

interface PendingClaimRow {
  id: string;
  claimedAmount: number;
}

function usePendingClaimsForCustomer(customerId: string) {
  return useQuery({
    queryKey: ['payment-claims', 'pending', customerId],
    queryFn: () =>
      api.get<{ data: PendingClaimRow[] }>(
        `/ar/payment-claims?status=pending&customerId=${customerId}`,
      ),
    enabled: !!customerId,
  });
}

export function CustomerDetailPage({ customerId }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  const { data, isLoading, isError } = useCustomer(customerId);
  const deleteMutation = useDeleteCustomer();
  const [showDelete, setShowDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const customer = data?.data;

  const { data: pendingClaimsData } = usePendingClaimsForCustomer(customerId);
  const pendingClaims = pendingClaimsData?.data ?? [];
  const pendingClaimsAmount = pendingClaims.reduce((s, c) => s + c.claimedAmount, 0);

  const { data: creditScoreData } = useQuery({
    queryKey: ['customers', 'credit-score', customerId],
    queryFn: () => api.get<{ data: CreditScoreData }>(`/ar/customers/${customerId}/credit-score`),
    enabled: !!customer,
    retry: false,
  });
  // Pull all invoices so we can compute aging buckets accurately. The
  // Recent-invoices section below still shows just the first 6 via slice().
  // 500 is comfortably above the per-customer count we see in production.
  const { data: invoicesData } = useInvoices({ customerId, limit: 500 });
  const { data: receiptsData } = useReceipts({ customerId }, 1);

  function goBack() {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: '/finance/ar/customers' });
  }
  function handleDeleteConfirm() {
    deleteMutation.mutate(customerId, {
      onSuccess: () => navigate({ to: '/finance/ar/customers' }),
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

  if (isError || !customer) {
    return <p className="text-[13px]" style={{ color: 'var(--neg)' }}>Customer not found.</p>;
  }

  const invoices = invoicesData?.data ?? [];
  const receipts = (receiptsData?.data ?? []).slice(0, 6);
  const overdueCount = invoices.filter((i) => i.status === 'overdue').length;
  const openCount = invoices.filter((i) => ['sent', 'partially_paid', 'overdue'].includes(i.status)).length;
  const outstanding = customer.outstandingAmount ?? 0;
  const draftBalance = customer.draftAmount ?? 0;
  const draftCount = invoices.filter((i) => i.status === 'draft').length;

  // Aging buckets: open invoices grouped by days past due. Used to fill the
  // empty space below the outstanding-balance actions and surface what
  // really needs attention vs. just "open".
  const todayISO = new Date().toISOString().slice(0, 10);
  const aging = invoices
    .filter((i) => ['sent', 'partially_paid', 'overdue'].includes(i.status))
    .reduce(
      (acc, inv) => {
        const balance = Number(inv.balanceDue ?? 0);
        if (balance <= 0) return acc;
        const due = inv.dueDate;
        // days past due — negative means not yet due.
        const daysOverdue = Math.floor((Date.parse(todayISO) - Date.parse(due)) / 86400000);
        if (daysOverdue <= 0) acc.current += balance;
        else if (daysOverdue <= 30) acc.d1_30 += balance;
        else if (daysOverdue <= 60) acc.d31_60 += balance;
        else acc.d60plus += balance;
        return acc;
      },
      { current: 0, d1_30: 0, d31_60: 0, d60plus: 0 },
    );

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'Customers', href: '/ar/customers' },
          { label: customer.name },
        ]}
        title={customer.name}
        titleBadge={customer.nickname ? <Badge variant="info">{customer.nickname}</Badge> : undefined}
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={13} />} onClick={goBack}>Back</Button>
            <Badge variant={customer.isActive ? 'success' : 'outline'}>
              {customer.isActive ? 'Active' : 'Inactive'}
            </Badge>
            {creditScoreData?.data && (
              <CreditScorePill score={creditScoreData.data.score} risk={creditScoreData.data.risk} />
            )}
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
              Outstanding balance
            </div>
            <div className="num mt-2 text-[40px] font-semibold leading-none tabular-nums" style={{ color: 'var(--text-1)' }}>
              {formatINR(outstanding)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]" style={{ color: 'var(--text-3)' }}>
              <span><span className="num font-medium" style={{ color: 'var(--text-1)' }}>{overdueCount}</span> overdue</span>
              <span>·</span>
              <span><span className="num font-medium" style={{ color: 'var(--text-1)' }}>{openCount}</span> open</span>
              <span>·</span>
              <span>Net <span className="num font-medium" style={{ color: 'var(--text-1)' }}>{customer.paymentTermsDays}d</span> terms</span>
            </div>
            {pendingClaims.length > 0 && (
              <button
                onClick={() => navigate({ to: '/finance/ar/payment-claims' })}
                className="mt-2 mr-2 inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11.5px] hover:bg-amber-100"
                style={{ borderColor: '#fde68a', background: '#fffbeb', color: '#92400e' }}
              >
                <span>📩</span>
                <span>
                  <span className="num font-semibold tabular-nums">{pendingClaims.length}</span> payment report{pendingClaims.length === 1 ? '' : 's'} awaiting verification
                </span>
                <span className="num font-semibold tabular-nums">· {formatINR(pendingClaimsAmount)}</span>
              </button>
            )}
            {draftBalance > 0 && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11.5px]"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}
              >
                <span>Drafts (not yet sent):</span>
                <span className="num font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>
                  {formatINR(draftBalance)}
                </span>
                {draftCount > 0 && (
                  <span>· <span className="num font-medium" style={{ color: 'var(--text-2)' }}>{draftCount}</span> invoice{draftCount === 1 ? '' : 's'}</span>
                )}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/finance/ar/invoices/new' })}>
                New invoice
              </Button>
              <Button variant="outline" size="sm" icon={<Receipt size={13} />} onClick={() => navigate({ to: '/finance/ar/receipts/new' })}>
                Record receipt
              </Button>
              <Button variant="outline" size="sm" icon={<Bell size={13} />}>Send reminder</Button>
            </div>

            {outstanding > 0 && (
              <div className="mt-5">
                <div className="text-[10.5px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>
                  Aging
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <AgingBucket label="Current"  amount={aging.current} tone="ok" />
                  <AgingBucket label="1–30 d"   amount={aging.d1_30}   tone="warn" />
                  <AgingBucket label="31–60 d"  amount={aging.d31_60}  tone="warn" />
                  <AgingBucket label="60+ d"    amount={aging.d60plus} tone="bad" />
                </div>
              </div>
            )}
          </div>
        </div>
        <PortalLinkCard customerId={customerId} nickname={customer.nickname} />
      </div>

      {/* Detail cards */}
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetailCard title="Basic info" icon={<User size={14} />}>
          <DetailRow
            label="Type"
            value={customer.type === 'b2b' ? 'B2B' : customer.type === 'payment_gateway' ? 'Payment gateway' : 'B2C'}
          />
          <DetailRow label="Contact person" value={customer.contactPerson} />
          <DetailRow label="Email" value={customer.email} mono />
          <DetailRow label="Phone" value={customer.phone} mono />
          <DetailRow label="Payment terms" value={`Net ${customer.paymentTermsDays} days`} />
          <DetailRow
            label="Credit limit"
            value={customer.creditLimit ? formatINR(Number(customer.creditLimit)) : 'No limit'}
          />
        </DetailCard>
        <DetailCard title="Tax & legal" icon={<ShieldCheck size={14} />}>
          <DetailRow label="GSTIN" value={customer.gstin} mono />
          <DetailRow label="PAN" value={customer.pan} mono />
          <DetailRow
            label="Place of supply"
            value={customer.state ? `${customer.state}${customer.gstin ? ` (${customer.gstin.slice(0, 2)})` : ''}` : null}
          />
          <DetailRow
            label="Address"
            value={
              [customer.addressLine1, customer.addressLine2, customer.city, customer.state, customer.pincode]
                .filter(Boolean)
                .join(', ') || null
            }
          />
        </DetailCard>
      </div>

      {/* Invoices */}
      <div
        className="mb-4 overflow-hidden rounded-xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: 'var(--border-soft)' }}>
          <div className="flex items-center gap-2">
            <FileText size={14} style={{ color: 'var(--text-2)' }} />
            <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>Recent invoices</h3>
            <span className="num text-[11px]" style={{ color: 'var(--text-3)' }}>({invoices.length})</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/finance/ar/invoices', search: { customer: customerId } as any })}>
            View all
          </Button>
        </div>
        {invoices.length === 0 ? (
          <EmptyState
            icon={<FileText size={18} />}
            title="No invoices yet"
            description="Sales invoices for this customer will appear here."
          />
        ) : (
          <table className="w-full text-[13px]">
            <TableHeader>
              <tr>
                <Th>Invoice #</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th align="right">Total</Th>
                <Th align="right">Balance</Th>
                <Th>Status</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow
                  key={inv.id}
                  onClick={() => navigate({ to: '/finance/ar/invoices/$invoiceId', params: { invoiceId: inv.id } })}
                >
                  <TableCell>
                    <span className="num text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>
                      {inv.invoiceNumber}
                    </span>
                  </TableCell>
                  <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(inv.invoiceDate)}</TableCell>
                  <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(inv.dueDate)}</TableCell>
                  <TableCell align="right" numeric>{formatINR(inv.totalAmount)}</TableCell>
                  <TableCell align="right" numeric className="font-semibold">{formatINR(inv.balanceDue)}</TableCell>
                  <TableCell><StatusBadge status={inv.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        )}
      </div>

      {/* Receipts */}
      <div
        className="overflow-hidden rounded-xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: 'var(--border-soft)' }}>
          <div className="flex items-center gap-2">
            <Receipt size={14} style={{ color: 'var(--text-2)' }} />
            <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>Receipts</h3>
            <span className="num text-[11px]" style={{ color: 'var(--text-3)' }}>({receipts.length})</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/finance/ar/receipts' })}>View all</Button>
        </div>
        {receipts.length === 0 ? (
          <EmptyState
            icon={<Receipt size={18} />}
            title="No receipts yet"
            description="Payments from this customer will appear here."
          />
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <Th>Date</Th>
                <Th>Method</Th>
                <Th>Reference</Th>
                <Th align="right">Amount</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {receipts.map((r) => (
                <TableRow key={r.id} onClick={() => navigate({ to: '/finance/ar/receipts/$receiptId', params: { receiptId: r.id } })}>
                  <TableCell numeric>{formatDate(r.receiptDate)}</TableCell>
                  <TableCell className="capitalize" style={{ color: 'var(--text-2)' }}>
                    {r.paymentMethod.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell numeric style={{ color: 'var(--text-2)' }}>
                    {r.referenceNumber ?? <span style={{ color: 'var(--text-3)' }}>—</span>}
                  </TableCell>
                  <TableCell align="right" numeric className="font-semibold">{formatINR(r.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <EditCustomerDialog customer={customer} open={showEdit} onClose={() => setShowEdit(false)} />

      <ConfirmationDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Customer"
        description={`Delete "${customer.name}"? This cannot be undone. Any linked invoices and receipts will remain but the customer record will be permanently removed.`}
        confirmLabel="Delete Customer"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

/**
 * Single aging-bucket tile in the outstanding-balance card. Tones cue urgency:
 *   - `ok` for amounts within terms, kept low-contrast
 *   - `warn` for 1–60 day overdue
 *   - `bad` for 60+ day overdue
 * Zero-amount buckets render dimmed so the eye snaps to where money actually sits.
 */
function AgingBucket({
  label, amount, tone,
}: { label: string; amount: number; tone: 'ok' | 'warn' | 'bad' }) {
  const isZero = amount <= 0;
  const amountColor = isZero
    ? 'var(--text-3)'
    : tone === 'bad'
      ? 'var(--neg)'
      : tone === 'warn'
        ? '#b45309'
        : 'var(--text-1)';
  return (
    <div
      className="rounded-md border px-2.5 py-2"
      style={{
        background: isZero ? 'var(--surface-2)' : 'var(--surface)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="text-[10.5px]" style={{ color: 'var(--text-3)' }}>{label}</div>
      <div className="num mt-0.5 text-[13px] font-semibold tabular-nums" style={{ color: amountColor }}>
        {isZero ? '—' : formatINR(amount)}
      </div>
    </div>
  );
}

function PortalLinkCard({ customerId, nickname }: { customerId: string; nickname: string | null }) {
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function buildUrl(slug: string) {
    // Canonical share URL — `/portal/<slug>`. The legacy `/portal/s/<slug>`
    // shape still routes to the same page so any link sent before the
    // rename keeps working.
    return `${window.location.origin}/portal/${slug}`;
  }

  const generateToken = useMutation({
    mutationFn: () => api.post<{ data: { slug: string } }>(`/ar/customers/${customerId}/portal-token`),
    onSuccess: (res) => {
      setPortalUrl(buildUrl(res.data.slug));
    },
  });

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: { slug: string | null } }>(`/ar/customers/${customerId}/portal-slug`)
      .then((res) => {
        if (!cancelled && res.data.slug) setPortalUrl(buildUrl(res.data.slug));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [customerId]);

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
          Payment portal
        </div>
        <ExternalLink size={13} style={{ color: 'var(--text-3)' }} />
      </div>
      <p className="mb-3 text-[12px]" style={{ color: 'var(--text-2)' }}>
        Share this link so {nickname || 'the customer'} can view and pay invoices online.
      </p>
      {portalUrl ? (
        <>
          <div
            className="num mb-2 truncate rounded-md border px-2.5 py-2 text-[11px]"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            {portalUrl}
          </div>
          <div className="mb-3 flex items-center gap-1.5">
            <Button size="sm" variant="outline" icon={copied ? <Check size={12} /> : <Copy size={12} />} onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => generateToken.mutate()} loading={generateToken.isPending}>
              Regenerate
            </Button>
          </div>
          <PortalPinControl customerId={customerId} />
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          icon={<ExternalLink size={12} />}
          onClick={() => generateToken.mutate()}
          loading={generateToken.isPending}
        >
          Generate portal link
        </Button>
      )}
    </div>
  );
}

function PortalPinControl({ customerId }: { customerId: string }) {
  const [isSet, setIsSet] = useState<boolean | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);

  function copyPin() {
    if (!pin) return;
    navigator.clipboard.writeText(pin);
    setPinCopied(true);
    setTimeout(() => setPinCopied(false), 2000);
  }

  useEffect(() => {
    api
      .get<{ data: { isSet: boolean; pin: string | null } }>(`/ar/customers/${customerId}/portal-pin-status`)
      .then((res) => {
        setIsSet(res.data.isSet);
        setPin(res.data.pin);
      })
      .catch(() => setIsSet(false));
  }, [customerId]);

  async function generatePin() {
    setBusy(true);
    try {
      const res = await api.post<{ data: { pin: string } }>(`/ar/customers/${customerId}/portal-pin`);
      setPin(res.data.pin);
      setIsSet(true);
    } finally {
      setBusy(false);
    }
  }

  async function clearPin() {
    if (!confirm('Remove portal PIN? Anyone with the link will be able to view invoices.')) return;
    setBusy(true);
    try {
      await api.delete(`/ar/customers/${customerId}/portal-pin`);
      setIsSet(false);
      setPin(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
          Portal PIN
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            background: isSet ? '#dcfce7' : '#fef3c7',
            color: isSet ? '#15803d' : '#a16207',
          }}
        >
          {isSet === null ? '…' : isSet ? 'Required' : 'Not set'}
        </span>
      </div>
      {pin ? (
        <>
          <p className="mb-1 text-[11px]" style={{ color: 'var(--text-2)' }}>
            Share this PIN with the customer:
          </p>
          <div className="mb-3 flex items-center gap-2">
            <code
              className="num rounded-md border px-3 py-1.5 font-mono text-base tracking-widest"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              {pin}
            </code>
            <Button
              size="sm"
              variant="outline"
              icon={pinCopied ? <Check size={12} /> : <Copy size={12} />}
              onClick={copyPin}
            >
              {pinCopied ? 'Copied' : 'Copy PIN'}
            </Button>
          </div>
        </>
      ) : (
        <p className="mb-2 text-[11px]" style={{ color: 'var(--text-2)' }}>
          No PIN required — anyone with the link can view invoices. Generate one to protect this portal.
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <Button size="sm" onClick={generatePin} loading={busy}>
          {isSet ? 'Generate new PIN' : 'Generate PIN'}
        </Button>
        {isSet && (
          <Button size="sm" variant="outline" onClick={clearPin} disabled={busy}>
            Remove PIN
          </Button>
        )}
      </div>
    </div>
  );
}

function EditCustomerDialog({
  customer, open, onClose,
}: { customer: CustomerWithOutstanding; open: boolean; onClose: () => void }) {
  const updateMutation = useUpdateCustomer();
  const { toast } = useToast();
  function handleSubmit(data: CreateCustomerInput) {
    updateMutation.mutate(
      { id: customer.id, data },
      {
        onSuccess: () => { toast('Customer updated.', 'success'); onClose(); },
        onError: () => toast('Failed to update.', 'error'),
      },
    );
  }
  return (
    <Modal open={open} onClose={onClose} title="Edit Customer" wide>
      <CustomerForm
        initialData={customer}
        onSubmit={handleSubmit}
        onCancel={onClose}
        isLoading={updateMutation.isPending}
      />
    </Modal>
  );
}
