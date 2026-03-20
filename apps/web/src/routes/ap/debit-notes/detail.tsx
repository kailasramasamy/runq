import { Send } from 'lucide-react';
import { useDebitNote, useIssueDebitNote } from '../../../hooks/queries/use-debit-notes';
import { useVendor } from '../../../hooks/queries/use-vendors';
import type { DebitNote, DebitNoteStatus } from '@runq/types';
import { formatINR } from '../../../lib/utils';
import {
  PageHeader,
  Badge,
  Button,
  Card,
  CardHeader,
  CardContent,
  Skeleton,
} from '@/components/ui';

const STATUS_VARIANT: Record<DebitNoteStatus, 'default' | 'info' | 'success' | 'outline'> = {
  draft: 'default',
  issued: 'info',
  adjusted: 'success',
  cancelled: 'outline',
};

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{value ?? '—'}</p>
    </div>
  );
}

function VendorName({ vendorId }: { vendorId: string }) {
  const { data } = useVendor(vendorId);
  return <>{data?.data?.name ?? vendorId}</>;
}

function DebitNoteActions({ dn }: { dn: DebitNote }) {
  const issueMutation = useIssueDebitNote();

  if (dn.status !== 'draft') return null;

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" disabled title="Edit coming soon">
        Edit
      </Button>
      <Button
        onClick={() => issueMutation.mutate(dn.id)}
        loading={issueMutation.isPending}
      >
        <Send size={14} />
        Issue
      </Button>
    </div>
  );
}

interface Props { debitNoteId: string }

export function DebitNoteDetailPage({ debitNoteId }: Props) {
  const { data, isLoading, isError } = useDebitNote(debitNoteId);
  const dn = data?.data;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !dn) {
    return <p className="text-sm text-red-500">Debit note not found.</p>;
  }

  const isCancelled = dn.status === 'cancelled';

  return (
    <div className={`mx-auto max-w-2xl ${isCancelled ? 'opacity-70' : ''}`}>
      <PageHeader
        title={dn.debitNoteNumber}
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Debit Notes', href: '/ap/debit-notes' },
          { label: dn.debitNoteNumber },
        ]}
        actions={<DebitNoteActions dn={dn} />}
      />

      {/* Hero amount row */}
      <div className="mb-4 flex items-center gap-4 rounded-lg border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex-1">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Amount</p>
          <p className={`mt-0.5 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100 ${isCancelled ? 'line-through text-zinc-400 dark:text-zinc-500' : ''}`}>
            {formatINR(dn.amount)}
          </p>
        </div>
        <div className="text-right">
          <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Status</p>
          <Badge variant={STATUS_VARIANT[dn.status]} className={`capitalize px-3 py-1 text-sm ${isCancelled ? 'line-through' : ''}`}>
            {dn.status}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader title="Debit Note Details" />
        <CardContent>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Vendor</p>
              <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">
                <VendorName vendorId={dn.vendorId} />
              </p>
            </div>
            <DetailRow label="Issue Date" value={dn.issueDate} />
            {dn.invoiceId && (
              <DetailRow label="Linked Invoice" value={dn.invoiceId} />
            )}
            <DetailRow label="DN Number" value={dn.debitNoteNumber} />
            <div className="col-span-2">
              <DetailRow label="Reason" value={dn.reason} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
