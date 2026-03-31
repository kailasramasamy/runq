import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { FileText, Receipt, Trash2, ExternalLink, Copy, Check } from 'lucide-react';
import { useCustomer, useDeleteCustomer, useUpdateCustomer } from '@/hooks/queries/use-customers';
import { api } from '@/lib/api-client';
import { formatINR } from '@/lib/utils';
import type { CustomerWithOutstanding } from '@runq/types';
import { CreditScoreBadge } from '@/components/ar/credit-score-badge';
import {
  PageHeader, Badge, Button, Card, CardHeader, CardContent,
  StatsCard, EmptyState, ConfirmationDialog, CardSkeleton,
  Input, useToast,
} from '@/components/ui';

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{value ?? '—'}</p>
    </div>
  );
}

function CustomerCards({ customer }: { customer: CustomerWithOutstanding }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Basic Info" />
        <CardContent className="grid grid-cols-2 gap-4">
          <DetailField label="Name" value={customer.name} />
          <DetailField
            label="Type"
            value={customer.type === 'b2b' ? 'B2B' : 'Payment Gateway'}
          />
          <DetailField label="Email" value={customer.email} />
          <DetailField label="Phone" value={customer.phone} />
          <DetailField label="Contact Person" value={customer.contactPerson} />
          <DetailField label="Payment Terms" value={`Net ${customer.paymentTermsDays} days`} />
          <DetailField label="Credit Limit" value={customer.creditLimit ? formatINR(Number(customer.creditLimit)) : 'No limit'} />
          <DetailField
            label="Overdue Interest Rate"
            value={customer.overdueInterestRate ? `${customer.overdueInterestRate}% p.a.` : 'Not set'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Tax Info" />
        <CardContent className="grid grid-cols-2 gap-4">
          <DetailField label="GSTIN" value={customer.gstin} />
          <DetailField label="PAN" value={customer.pan} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Address" />
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <DetailField
              label="Address"
              value={
                [customer.addressLine1, customer.addressLine2].filter(Boolean).join(', ') || null
              }
            />
          </div>
          <DetailField label="City" value={customer.city} />
          <DetailField label="State" value={customer.state} />
          <DetailField label="Pincode" value={customer.pincode} />
        </CardContent>
      </Card>
    </div>
  );
}

function PortalLinkCard({ customerId }: { customerId: string }) {
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateToken = useMutation({
    mutationFn: () =>
      api.post<{ data: { slug: string } }>(`/ar/customers/${customerId}/portal-token`),
    onSuccess: (res) => {
      const slug = res.data.slug;
      setPortalUrl(`${window.location.origin}/portal/s/${slug}`);
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
      <CardHeader title="Payment Portal" />
      <CardContent>
        {portalUrl ? (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Share this link with the customer. No login required.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {portalUrl}
              </code>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(portalUrl, '_blank')}
              >
                <ExternalLink size={14} /> Open
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateToken.mutate()}
              loading={generateToken.isPending}
            >
              Regenerate Link
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Generate a portal link so this customer can view their outstanding invoices and pay online.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateToken.mutate()}
              loading={generateToken.isPending}
            >
              <ExternalLink size={14} /> Generate Portal Link
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface Props { customerId: string }

interface CreditScoreData { score: number; risk: 'high' | 'medium' | 'low'; factors: string[] }

function EditCustomerDialog({
  customer,
  open,
  onClose,
}: {
  customer: CustomerWithOutstanding;
  open: boolean;
  onClose: () => void;
}) {
  const updateMutation = useUpdateCustomer();
  const { toast } = useToast();
  const [paymentTermsDays, setPaymentTermsDays] = useState(String(customer.paymentTermsDays));
  const [creditLimit, setCreditLimit] = useState(customer.creditLimit ? String(customer.creditLimit) : '');
  const [overdueInterestRate, setOverdueInterestRate] = useState(
    customer.overdueInterestRate ? String(customer.overdueInterestRate) : '',
  );
  const [contactPerson, setContactPerson] = useState(customer.contactPerson ?? '');

  if (!open) return null;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate(
      {
        id: customer.id,
        data: {
          paymentTermsDays: Number(paymentTermsDays) || 30,
          creditLimit: creditLimit ? Number(creditLimit) : null,
          overdueInterestRate: overdueInterestRate ? Number(overdueInterestRate) : null,
          contactPerson: contactPerson || null,
        },
      },
      {
        onSuccess: () => {
          toast('Customer updated.', 'success');
          onClose();
        },
        onError: () => toast('Failed to update.', 'error'),
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md">
        <CardHeader title="Edit Customer" />
        <form onSubmit={handleSave}>
          <CardContent className="space-y-4">
            <Input
              label="Payment Terms (days)"
              type="number"
              min={0}
              max={365}
              value={paymentTermsDays}
              onChange={(e) => setPaymentTermsDays(e.target.value)}
            />
            <Input
              label="Credit Limit"
              type="number"
              min={0}
              placeholder="No limit"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
            />
            <Input
              label="Overdue Interest Rate (% p.a.)"
              type="number"
              min={0}
              max={100}
              step="0.5"
              placeholder="e.g. 18"
              value={overdueInterestRate}
              onChange={(e) => setOverdueInterestRate(e.target.value)}
            />
            <Input
              label="Contact Person"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
            />
          </CardContent>
          <div className="flex justify-end gap-2 px-6 pb-4">
            <Button variant="outline" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" type="submit" loading={updateMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export function CustomerDetailPage({ customerId }: Props) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useCustomer(customerId);
  const deleteMutation = useDeleteCustomer();
  const [showDelete, setShowDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const customer = data?.data;

  const { data: creditScoreData } = useQuery({
    queryKey: ['customers', 'credit-score', customerId],
    queryFn: () => api.get<{ data: CreditScoreData }>(`/ar/customers/${customerId}/credit-score`),
    enabled: !!customer,
    retry: false,
  });

  function handleDeleteConfirm() {
    deleteMutation.mutate(customerId, {
      onSuccess: () => navigate({ to: '/ar/customers' }),
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

  if (isError || !customer) {
    return <p className="text-sm text-red-500">Customer not found.</p>;
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'Customers', href: '/ar/customers' },
          { label: customer.name },
        ]}
        title={customer.name}
        actions={
          <>
            <Badge variant={customer.isActive ? 'success' : 'default'}>
              {customer.isActive ? 'Active' : 'Inactive'}
            </Badge>
            {creditScoreData?.data && (
              <CreditScoreBadge score={creditScoreData.data.score} risk={creditScoreData.data.risk} />
            )}
            <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)}>
              <Trash2 size={14} /> Delete
            </Button>
          </>
        }
      />

      <div className="mb-6">
        <StatsCard
          title="Outstanding Balance"
          value={customer.outstandingAmount}
          formatValue={formatINR}
        />
      </div>

      <div className="mb-6">
        <PortalLinkCard customerId={customerId} />
      </div>

      <CustomerCards customer={customer} />

      <div className="mt-6 flex flex-col gap-4">
        <Card>
          <CardHeader title="Invoices" />
          <CardContent>
            <EmptyState
              icon={FileText}
              title="No invoices yet"
              description="Sales invoices for this customer will appear here."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Receipts" />
          <CardContent>
            <EmptyState
              icon={Receipt}
              title="No receipts yet"
              description="Receipts from this customer will appear here."
            />
          </CardContent>
        </Card>
      </div>

      <EditCustomerDialog
        customer={customer}
        open={showEdit}
        onClose={() => setShowEdit(false)}
      />

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
