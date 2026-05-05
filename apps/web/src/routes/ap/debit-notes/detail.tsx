import { useNavigate, useRouter } from '@tanstack/react-router';
import { Send, ArrowLeft, FileWarning, FileText, Building2 } from 'lucide-react';
import { useDebitNote, useIssueDebitNote, useApplyDebitNote } from '@/hooks/queries/use-debit-notes';
import { useVendor } from '@/hooks/queries/use-vendors';
import { formatINR } from '@/lib/utils';
import {
  PageHeader, Button, StatusBadge, DetailCard, DetailRow,
} from '@/components/ar/primitives';
import { useToast } from '@/components/ui';

interface Props { debitNoteId: string }

export function DebitNoteDetailPage({ debitNoteId }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  const { data, isLoading, isError } = useDebitNote(debitNoteId);
  const issueMutation = useIssueDebitNote();
  const applyMutation = useApplyDebitNote();
  const { toast } = useToast();
  const dn = data?.data;
  const { data: vendorData } = useVendor(dn?.vendorId ?? '');
  const vendor = vendorData?.data;

  function goBack() {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: '/ap/debit-notes' });
  }
  function handleIssue() {
    issueMutation.mutate(debitNoteId, {
      onSuccess: () => toast('Debit note issued successfully.', 'success'),
      onError: () => toast('Failed to issue debit note.', 'error'),
    });
  }
  function handleApply() {
    applyMutation.mutate(debitNoteId, {
      onSuccess: () => toast('Debit note applied to bill. Balance updated.', 'success'),
      onError: () => toast('Failed to apply debit note.', 'error'),
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl border"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          />
        ))}
      </div>
    );
  }

  if (isError || !dn) {
    return <p className="text-[13px]" style={{ color: 'var(--neg)' }}>Debit note not found.</p>;
  }

  return (
    <div>
      <PageHeader
        title={dn.debitNoteNumber}
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Debit notes', href: '/ap/debit-notes' },
          { label: dn.debitNoteNumber },
        ]}
        titleBadge={<StatusBadge status={dn.status} />}
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={13} />} onClick={goBack}>Back</Button>
            {dn.status === 'draft' && (
              <Button size="sm" icon={<Send size={13} />} loading={issueMutation.isPending} onClick={handleIssue}>
                Issue
              </Button>
            )}
            {dn.status === 'issued' && dn.invoiceId && (
              <Button size="sm" loading={applyMutation.isPending} onClick={handleApply}>
                Apply to bill
              </Button>
            )}
          </>
        }
      />

      {/* Hero amount */}
      <div
        className="relative mb-5 overflow-hidden rounded-xl border p-5"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div
          className="absolute -right-12 -top-12 h-44 w-44 rounded-full opacity-50"
          style={{ background: 'radial-gradient(circle, var(--neg-soft) 0%, transparent 70%)' }}
        />
        <div className="relative flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--neg-soft)', color: 'var(--neg)' }}
          >
            <FileWarning size={22} />
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              Debit note amount
            </div>
            <div
              className="num mt-1 text-[32px] font-semibold leading-none tabular-nums"
              style={{ color: dn.status === 'cancelled' ? 'var(--text-3)' : 'var(--text-1)' }}
            >
              {formatINR(Number(dn.amount))}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
              <span>Issued {dn.issueDate}</span>
              {dn.invoiceId && (
                <>
                  <span>·</span>
                  <span>Linked to bill</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetailCard title="Debit note details" icon={<FileWarning size={14} />}>
          <DetailRow label="Number" value={dn.debitNoteNumber} mono />
          <DetailRow label="Issue date" value={dn.issueDate} mono />
          <DetailRow label="Status" value={dn.status} />
          <DetailRow label="Linked bill" value={dn.invoiceId ? dn.invoiceId.slice(0, 12) + '…' : null} mono />
          <div className="sm:col-span-2">
            <DetailRow label="Reason" value={dn.reason} />
          </div>
        </DetailCard>

        <DetailCard title="Vendor" icon={<Building2 size={14} />}>
          <DetailRow label="Name" value={vendor?.name ?? dn.vendorId} />
          <DetailRow label="Email" value={vendor?.email} mono />
          <DetailRow label="Phone" value={vendor?.phone} mono />
          <DetailRow label="GSTIN" value={vendor?.gstin} mono />
        </DetailCard>
      </div>

      {dn.invoiceId && (
        <button
          onClick={() => navigate({ to: '/ap/bills/$billId', params: { billId: dn.invoiceId! } })}
          className="mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12.5px] font-medium hover:bg-[var(--surface-2)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          <FileText size={13} />
          View linked bill
        </button>
      )}
    </div>
  );
}
