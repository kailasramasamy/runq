import { useNavigate, useRouter } from '@tanstack/react-router';
import { FilePlus, ArrowLeft } from 'lucide-react';
import { useCustomerDebitNote, useIssueCustomerDebitNote, useApplyCustomerDebitNote } from '../../../hooks/queries/use-customer-debit-notes';
import type { CustomerDebitNoteStatus } from '@runq/types';
import { formatINR } from '../../../lib/utils';
import {
  PageHeader,
  Badge,
  Button,
  Card,
  CardHeader,
  CardContent,
  Skeleton,
  useToast,
} from '@/components/ui';

const STATUS_VARIANT: Record<CustomerDebitNoteStatus, 'default' | 'info' | 'success' | 'outline'> = {
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

interface Props { customerDebitNoteId: string }

export function CustomerDebitNoteDetailPage({ customerDebitNoteId }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  function goBack(): void {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: '/finance/ar/customer-debit-notes' });
  }
  const { data, isLoading, isError } = useCustomerDebitNote(customerDebitNoteId);
  const issueMutation = useIssueCustomerDebitNote();
  const applyMutation = useApplyCustomerDebitNote();
  const { toast } = useToast();

  const cdn = data?.data;

  function handleIssue() {
    issueMutation.mutate(customerDebitNoteId, {
      onSuccess: () => toast('Debit note issued successfully.', 'success'),
      onError: () => toast('Failed to issue debit note.', 'error'),
    });
  }

  function handleApply() {
    applyMutation.mutate(customerDebitNoteId, {
      onSuccess: () => toast('Debit note applied to invoice. Balance updated.', 'success'),
      onError: () => toast('Failed to apply debit note.', 'error'),
    });
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !cdn) {
    return <p className="text-sm text-red-500">Debit note not found.</p>;
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={cdn.debitNoteNumber}
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'Debit Notes', href: '/ar/customer-debit-notes' },
          { label: cdn.debitNoteNumber },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={goBack}>
              <ArrowLeft size={14} /> Back
            </Button>
            <Badge variant={STATUS_VARIANT[cdn.status]} className="capitalize px-3 py-1 text-sm">
              {cdn.status}
            </Badge>
            {cdn.status === 'draft' && (
              <Button
                onClick={handleIssue}
                loading={issueMutation.isPending}
              >
                Issue Debit Note
              </Button>
            )}
            {cdn.status === 'issued' && cdn.invoiceId && (
              <Button
                onClick={handleApply}
                loading={applyMutation.isPending}
              >
                Apply to Invoice
              </Button>
            )}
          </div>
        }
      />

      {/* Amount hero */}
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="sm:col-span-2">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
              <FilePlus size={22} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Credit Amount</p>
              <p className="mt-0.5 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatINR(cdn.amount)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full flex-col justify-center py-5">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Status</p>
            <div className="mt-2">
              <Badge variant={STATUS_VARIANT[cdn.status]} className="capitalize">
                {cdn.status}
              </Badge>
            </div>
            <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Issue Date</p>
            <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{cdn.issueDate}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader title="Debit Note Information" />
        <CardContent>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <DetailRow label="Customer" value={(cdn as any).customerName ?? cdn.customerId} />
            <DetailRow label="Issue Date" value={cdn.issueDate} />
            <DetailRow label="Status" value={cdn.status} />
            {cdn.invoiceId && (
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Linked Invoice</p>
                <a
                  href={`/ar/invoices/${cdn.invoiceId}`}
                  className="mt-0.5 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  View Invoice
                </a>
              </div>
            )}
            {!cdn.invoiceId && <DetailRow label="Linked Invoice" value={undefined} />}
            <div className="col-span-2 sm:col-span-3">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Reason</p>
              <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{cdn.reason}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
