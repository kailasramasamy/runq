import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { FileText, Receipt, Trash2 } from 'lucide-react';
import { useCustomer, useDeleteCustomer } from '@/hooks/queries/use-customers';
import { api } from '@/lib/api-client';
import { formatINR } from '@/lib/utils';
import type { CustomerWithOutstanding } from '@runq/types';
import { CreditScoreBadge } from '@/components/ar/credit-score-badge';
import {
  PageHeader, Badge, Button, Card, CardHeader, CardContent,
  StatsCard, EmptyState, ConfirmationDialog, CardSkeleton,
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

interface Props { customerId: string }

interface CreditScoreData { score: number; risk: 'high' | 'medium' | 'low'; factors: string[] }

export function CustomerDetailPage({ customerId }: Props) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useCustomer(customerId);
  const deleteMutation = useDeleteCustomer();
  const [showDelete, setShowDelete] = useState(false);
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
        <StatsCard
          title="Outstanding Balance"
          value={customer.outstandingAmount}
          formatValue={formatINR}
        />
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
