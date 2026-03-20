import { FileMinus } from 'lucide-react';
import { useCreditNote, useIssueCreditNote } from '../../../hooks/queries/use-credit-notes';
import type { CreditNoteStatus } from '@runq/types';
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

const STATUS_VARIANT: Record<CreditNoteStatus, 'default' | 'info' | 'success' | 'outline'> = {
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

interface Props { creditNoteId: string }

export function CreditNoteDetailPage({ creditNoteId }: Props) {
  const { data, isLoading, isError } = useCreditNote(creditNoteId);
  const issueMutation = useIssueCreditNote();
  const { toast } = useToast();

  const cn = data?.data;

  function handleIssue() {
    issueMutation.mutate(creditNoteId, {
      onSuccess: () => toast('Credit note issued successfully.', 'success'),
      onError: () => toast('Failed to issue credit note.', 'error'),
    });
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !cn) {
    return <p className="text-sm text-red-500">Credit note not found.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={cn.creditNoteNumber}
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'Credit Notes', href: '/ar/credit-notes' },
          { label: cn.creditNoteNumber },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <Badge variant={STATUS_VARIANT[cn.status]} className="capitalize px-3 py-1 text-sm">
              {cn.status}
            </Badge>
            {cn.status === 'draft' && (
              <Button
                onClick={handleIssue}
                loading={issueMutation.isPending}
                disabled={issueMutation.isPending}
              >
                Issue Credit Note
              </Button>
            )}
          </div>
        }
      />

      {/* Amount hero */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
              <FileMinus size={22} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Credit Amount</p>
              <p className="mt-0.5 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatINR(cn.amount)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full flex-col justify-center py-5">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Status</p>
            <div className="mt-2">
              <Badge variant={STATUS_VARIANT[cn.status]} className="capitalize">
                {cn.status}
              </Badge>
            </div>
            <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Issue Date</p>
            <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{cn.issueDate}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader title="Credit Note Information" />
        <CardContent>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <DetailRow label="Customer" value={cn.customerId} />
            <DetailRow label="Issue Date" value={cn.issueDate} />
            <DetailRow label="Status" value={cn.status} />
            <DetailRow
              label="Linked Invoice"
              value={cn.invoiceId ? cn.invoiceId.slice(0, 8) + '…' : undefined}
            />
            <div className="col-span-2 sm:col-span-3">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Reason</p>
              <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{cn.reason}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
