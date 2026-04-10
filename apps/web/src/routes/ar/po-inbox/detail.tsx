import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  SkipForward,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  CardContent,
  Button,
  Badge,
  Input,
  DateInput,
  Combobox,
  Modal,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  EmptyState,
  useToast,
} from '@/components/ui';
import { useCustomers } from '@/hooks/queries/use-customers';
import { useItems } from '@/hooks/queries/use-items';
import {
  usePoInboxItem,
  useUpdatePoDraft,
  useUpdatePoDraftLine,
  useApprovePoDraft,
  useRejectPoDraft,
  useReparsePoUpload,
  type PoInboxDetail,
  type PoInboxLineRaw,
} from '@/hooks/queries/use-po-inbox';
import { formatINR } from '@/lib/utils';

interface Props {
  uploadId: string;
}

/**
 * Bulk-mode navigation. When the user enters via "Review N flagged" on the
 * inbox, the URL carries `?queue=id1,id2,id3,…`. The review screen reads
 * the queue, shows "X of N", and after each approve/reject/skip advances
 * to the next item — or returns to the inbox after the last one.
 */
interface ReviewQueue {
  ids: string[];
  index: number;
  next: string | null;
}

function readQueue(currentId: string): ReviewQueue | null {
  if (typeof window === 'undefined') return null;
  const param = new URLSearchParams(window.location.search).get('queue');
  if (!param) return null;
  const ids = param.split(',').filter((s) => s.length > 0);
  if (ids.length === 0) return null;
  const index = ids.indexOf(currentId);
  if (index < 0) return { ids, index: 0, next: ids[0] === currentId ? null : ids[0]! };
  const next = index + 1 < ids.length ? ids[index + 1]! : null;
  return { ids, index, next };
}

export function PoDraftReviewPage({ uploadId }: Props) {
  const { data, isLoading } = usePoInboxItem(uploadId);
  const draft = data?.data ?? null;
  const queue = useMemo(() => readQueue(uploadId), [uploadId]);

  if (isLoading) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;
  if (!draft) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="PO not found"
        description="It may have been deleted or you may not have access."
      />
    );
  }
  return <ReviewView draft={draft} queue={queue} />;
}

function ReviewView({ draft, queue }: { draft: PoInboxDetail; queue: ReviewQueue | null }) {
  const isLocked =
    draft.uploadStatus === 'parsing' ||
    draft.reviewStatus === 'approved' ||
    draft.reviewStatus === 'rejected';

  const title =
    draft.customerName ??
    draft.buyerNameRaw ??
    draft.fileName ??
    (draft.hasRawText ? 'Pasted text PO' : 'PO Review');

  return (
    <div>
      <PageHeader
        title={title}
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'PO Inbox', href: '/ar/po-inbox' },
          { label: 'Review' },
        ]}
        actions={<ReviewActions draft={draft} queue={queue} />}
      />

      {queue && <QueueProgress queue={queue} />}

      <DraftHeaderCard draft={draft} disabled={isLocked} />
      <SourcePreviewCard draft={draft} />
      <LineItemsCard draft={draft} disabled={isLocked} />
      <TotalsCard draft={draft} />
    </div>
  );
}

function QueueProgress({ queue }: { queue: ReviewQueue }) {
  return (
    <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      Reviewing item <strong>{queue.index + 1}</strong> of <strong>{queue.ids.length}</strong>
      {queue.next && ' — approve, reject, or skip to advance'}
    </div>
  );
}

// ─── Header actions: status badge + Approve / Reject / Re-parse / Skip ──

function ReviewActions({
  draft,
  queue,
}: {
  draft: PoInboxDetail;
  queue: ReviewQueue | null;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const approve = useApprovePoDraft();
  const reparse = useReparsePoUpload();
  const [rejectOpen, setRejectOpen] = useState(false);

  const isApprovable = !blockingFlags(draft);
  const isLocked =
    draft.reviewStatus === 'approved' || draft.reviewStatus === 'rejected';

  // After a successful approve/reject in queue mode, advance to the next id;
  // outside queue mode, behave the same as before (jump to invoice on approve).
  const advanceAfterAction = (fallback: () => void) => {
    if (queue && queue.next) {
      void navigate({
        to: '/ar/po-inbox/$uploadId' as never,
        params: { uploadId: queue.next } as never,
        search: { queue: queue.ids.join(',') } as never,
      });
      return;
    }
    if (queue && !queue.next) {
      // End of queue — back to inbox
      void navigate({ to: '/ar/po-inbox' as never });
      return;
    }
    fallback();
  };

  const handleApprove = async () => {
    try {
      const res = await approve.mutateAsync(draft.id);
      toast(`Invoice ${res.data.invoiceNumber} created (draft)`, 'success');
      advanceAfterAction(() => {
        void navigate({
          to: '/ar/invoices/$invoiceId' as never,
          params: { invoiceId: res.data.invoiceId } as never,
        });
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Approve failed', 'error');
    }
  };

  const handleReparse = async () => {
    try {
      await reparse.mutateAsync(draft.id);
      toast('Re-parse queued', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Re-parse failed', 'error');
    }
  };

  const handleSkip = () => {
    if (!queue) return;
    if (queue.next) {
      void navigate({
        to: '/ar/po-inbox/$uploadId' as never,
        params: { uploadId: queue.next } as never,
        search: { queue: queue.ids.join(',') } as never,
      });
    } else {
      void navigate({ to: '/ar/po-inbox' as never });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge draft={draft} />
      {!isLocked && (
        <>
          <Button variant="outline" size="sm" onClick={handleReparse} disabled={reparse.isPending}>
            <RefreshCw className={`h-4 w-4 ${reparse.isPending ? 'animate-spin' : ''}`} />
            Re-parse
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRejectOpen(true)}>
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!isApprovable || approve.isPending}
            onClick={handleApprove}
            title={isApprovable ? 'Create draft invoice' : 'Fix flagged items first'}
          >
            <CheckCircle2 className="h-4 w-4" />
            {approve.isPending ? 'Approving…' : 'Approve & create invoice'}
          </Button>
        </>
      )}
      {queue && (
        <Button variant="outline" size="sm" onClick={handleSkip}>
          <SkipForward className="h-4 w-4" />
          {queue.next ? 'Skip' : 'Done'}
          {queue.next && <ChevronRight className="h-4 w-4" />}
        </Button>
      )}
      <RejectModal open={rejectOpen} draft={draft} queue={queue} onClose={() => setRejectOpen(false)} />
    </div>
  );
}

function StatusBadge({ draft }: { draft: PoInboxDetail }) {
  if (draft.uploadStatus === 'parse_error') {
    return <Badge variant="danger">Parse error</Badge>;
  }
  if (draft.uploadStatus === 'parsing' || draft.uploadStatus === 'pending') {
    return <Badge variant="default">Parsing</Badge>;
  }
  if (draft.reviewStatus === 'approved') return <Badge variant="success">Approved</Badge>;
  if (draft.reviewStatus === 'rejected') return <Badge variant="outline">Rejected</Badge>;
  if (draft.reviewStatus === 'ready') return <Badge variant="success">Ready</Badge>;
  if (draft.reviewStatus === 'needs_review') return <Badge variant="warning">Needs review</Badge>;
  return <Badge variant="default">{draft.reviewStatus ?? 'unknown'}</Badge>;
}

function blockingFlags(draft: PoInboxDetail): string | null {
  if (!draft.customerId) return 'no_customer';
  if (draft.lines.length === 0) return 'no_lines';
  for (const l of draft.lines) {
    if (!l.matchedItemId) return 'unmatched_sku';
    if (!l.rawQty || Number(l.rawQty) <= 0) return 'zero_qty';
    if (!l.resolvedRate || Number(l.resolvedRate) <= 0) return 'no_rate';
  }
  return null;
}

// ─── Header card: customer + PO fields ───────────────────────────────────

function DraftHeaderCard({
  draft,
  disabled,
}: {
  draft: PoInboxDetail;
  disabled: boolean;
}) {
  const { data: customersData } = useCustomers({ limit: 200 });
  const update = useUpdatePoDraft(draft.id);
  const { toast } = useToast();

  const customerOptions = useMemo(
    () => [
      { value: '', label: '— Pick a customer —' },
      ...(customersData?.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [customersData],
  );

  const save = async (patch: Parameters<typeof update.mutateAsync>[0]) => {
    try {
      await update.mutateAsync(patch);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  return (
    <Card className="mb-4">
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Combobox
            label="Customer"
            required
            options={customerOptions}
            value={draft.customerId ?? ''}
            onChange={(v) => save({ customerId: v || null })}
            placeholder="Search customer…"
            disabled={disabled}
          />
          {draft.buyerNameRaw && draft.buyerNameRaw !== draft.customerName && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              PO says: <span className="font-medium">{draft.buyerNameRaw}</span>
              {draft.buyerGstinRaw && <> · GSTIN {draft.buyerGstinRaw}</>}
            </p>
          )}
        </div>
        <Input
          label="PO number"
          value={draft.poNumberExtracted ?? ''}
          onChange={(e) => save({ poNumberExtracted: e.target.value || null })}
          placeholder="e.g. PO-2104"
          disabled={disabled}
        />
        <DateInput
          label="PO date"
          value={draft.poDate ?? ''}
          onChange={(e) => save({ poDate: e.target.value || null })}
          disabled={disabled}
        />
        <DateInput
          label="Delivery date"
          value={draft.deliveryDate ?? ''}
          onChange={(e) => save({ deliveryDate: e.target.value || null })}
          disabled={disabled}
        />
      </CardContent>
    </Card>
  );
}

// ─── Source preview (file or pasted text) ────────────────────────────────

function SourcePreviewCard({ draft }: { draft: PoInboxDetail }) {
  const [open, setOpen] = useState(false);
  const hasFile = draft.fileName != null;

  return (
    <Card className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-3 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/50"
      >
        <span className="inline-flex items-center gap-2">
          <FileText className="h-4 w-4 text-zinc-400" />
          {hasFile ? draft.fileName : 'Pasted text source'}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && hasFile && (
        <div className="border-t border-zinc-200 dark:border-zinc-700">
          <FilePreview draft={draft} />
        </div>
      )}
      {open && !hasFile && draft.rawText && (
        <div className="border-t border-zinc-200 dark:border-zinc-700">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs text-zinc-600 dark:text-zinc-300">
            {draft.rawText}
          </pre>
        </div>
      )}
      {open && !hasFile && !draft.rawText && (
        <div className="border-t border-zinc-200 p-3 text-xs text-zinc-500 dark:border-zinc-700">
          No source content recorded.
        </div>
      )}
    </Card>
  );
}

/**
 * Lazy-loaded inline preview of the source file. Fetches via authenticated
 * XHR (the JWT path), wraps the response in a blob URL, and renders
 * &lt;img&gt; for images, &lt;embed&gt; for PDFs, &lt;pre&gt; for text. Cleans up
 * the blob URL on unmount to avoid leaks.
 */
function FilePreview({ draft }: { draft: PoInboxDetail }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mime = draft.fileMime ?? 'application/octet-stream';

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    void (async () => {
      try {
        const token = localStorage.getItem('runq-token');
        const res = await fetch(`/api/v1/ar/po-uploads/${draft.id}/file`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`Preview unavailable (${res.status})`);

        if (mime.startsWith('text/')) {
          const text = await res.text();
          if (!cancelled) setTextContent(text);
        } else {
          const blob = await res.blob();
          createdUrl = URL.createObjectURL(blob);
          if (!cancelled) setBlobUrl(createdUrl);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Preview failed');
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [draft.id, mime]);

  if (error) {
    return <p className="p-3 text-xs text-red-600 dark:text-red-400">{error}</p>;
  }
  if (textContent !== null) {
    return (
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs text-zinc-600 dark:text-zinc-300">
        {textContent}
      </pre>
    );
  }
  if (!blobUrl) {
    return <p className="p-3 text-xs text-zinc-400">Loading preview…</p>;
  }
  if (mime.startsWith('image/')) {
    return (
      <div className="bg-zinc-50 p-3 dark:bg-zinc-800/30">
        <img src={blobUrl} alt={draft.fileName ?? ''} className="mx-auto max-h-[600px] rounded" />
      </div>
    );
  }
  if (mime === 'application/pdf') {
    return (
      <embed
        src={blobUrl}
        type="application/pdf"
        className="h-[600px] w-full bg-zinc-50 dark:bg-zinc-800/30"
      />
    );
  }
  return (
    <p className="p-3 text-xs text-zinc-500">
      Preview not available for {mime}.{' '}
      <a href={blobUrl} download={draft.fileName ?? 'po'} className="text-indigo-600 hover:underline">
        Download
      </a>
    </p>
  );
}

// ─── Line items card ─────────────────────────────────────────────────────

function LineItemsCard({
  draft,
  disabled,
}: {
  draft: PoInboxDetail;
  disabled: boolean;
}) {
  const { data: itemsData } = useItems({ status: 'active', limit: 100 });
  const itemOptions = useMemo(
    () => [
      { value: '', label: '— Unmatched —' },
      ...(itemsData?.data ?? []).map((it) => ({
        value: it.id,
        label: it.sku ? `${it.name} (${it.sku})` : it.name,
      })),
    ],
    [itemsData],
  );

  if (draft.lines.length === 0) {
    return (
      <Card className="mb-4">
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="No line items"
            description="The parser didn't find any line items in this PO. Re-parse or reject."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4 overflow-visible">
      <CardContent className="p-0 overflow-visible">
        {/* Mobile: stacked card per line */}
        <div className="flex flex-col gap-2 p-3 md:hidden">
          {draft.lines.map((line) => (
            <LineItemCard
              key={line.id}
              line={line}
              draftId={draft.id}
              customerId={draft.customerId}
              itemOptions={itemOptions}
              disabled={disabled}
            />
          ))}
        </div>
        {/* Desktop: dense table */}
        <div className="hidden md:block">
          <Table noOverflow>
            <TableHeader>
              <tr>
                <Th>Customer's description</Th>
                <Th>Match to SKU</Th>
                <Th align="right">Qty</Th>
                <Th>UOM</Th>
                <Th align="right">Rate</Th>
                <Th align="right">Amount</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {draft.lines.map((line) => (
                <LineItemRow
                  key={line.id}
                  line={line}
                  draftId={draft.id}
                  customerId={draft.customerId}
                  itemOptions={itemOptions}
                  disabled={disabled}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface LineItemRowProps {
  line: PoInboxLineRaw;
  draftId: string;
  customerId: string | null;
  itemOptions: Array<{ value: string; label: string }>;
  disabled: boolean;
}

/**
 * Shared edit state + persist logic for both the desktop table row and the
 * mobile stacked card. Holds local qty/rate drafts so typing doesn't fire a
 * mutation per keystroke; commits on blur.
 */
function useLineItemEdit(line: PoInboxLineRaw, draftId: string) {
  const update = useUpdatePoDraftLine(draftId);
  const { toast } = useToast();
  const [qtyDraft, setQtyDraft] = useState(line.rawQty ?? '');
  const [rateDraft, setRateDraft] = useState(line.resolvedRate ?? '');

  useEffect(() => setQtyDraft(line.rawQty ?? ''), [line.rawQty]);
  useEffect(() => setRateDraft(line.resolvedRate ?? ''), [line.resolvedRate]);

  const persist = async (data: Parameters<typeof update.mutateAsync>[0]['data']) => {
    try {
      await update.mutateAsync({ lineId: line.id, data });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const commitQty = () => {
    const v = qtyDraft === '' ? null : Number(qtyDraft);
    if (v !== (line.rawQty != null ? Number(line.rawQty) : null)) {
      void persist({ quantity: v });
    }
  };
  const commitRate = () => {
    const v = rateDraft === '' ? null : Number(rateDraft);
    if (v !== (line.resolvedRate != null ? Number(line.resolvedRate) : null)) {
      void persist({ rate: v });
    }
  };

  return { qtyDraft, setQtyDraft, rateDraft, setRateDraft, persist, commitQty, commitRate };
}

function LineItemRow({
  line,
  draftId,
  customerId,
  itemOptions,
  disabled,
}: LineItemRowProps) {
  const { qtyDraft, setQtyDraft, rateDraft, setRateDraft, persist, commitQty, commitRate } =
    useLineItemEdit(line, draftId);

  const flagBadge = !line.matchedItemId ? (
    <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">unmatched</span>
  ) : null;

  return (
    <TableRow>
      <TableCell className="max-w-[220px]">
        <span className="text-sm text-zinc-700 dark:text-zinc-200">
          {line.rawDescription}
        </span>
        {flagBadge}
      </TableCell>
      <TableCell className="min-w-[200px]">
        <Combobox
          options={itemOptions}
          value={line.matchedItemId ?? ''}
          onChange={(v) =>
            persist({ matchedItemId: v || null, recordAlias: !!v && !!customerId })
          }
          placeholder="Pick item…"
          disabled={disabled || !customerId}
        />
        {!customerId && (
          <p className="mt-1 text-xs text-zinc-400">Pick a customer first</p>
        )}
      </TableCell>
      <TableCell align="right" className="w-24">
        <Input
          type="number"
          value={qtyDraft}
          onChange={(e) => setQtyDraft(e.target.value)}
          onBlur={commitQty}
          disabled={disabled}
        />
      </TableCell>
      <TableCell className="w-16 text-xs text-zinc-500">
        {line.resolvedUom ?? line.rawUom ?? '—'}
      </TableCell>
      <TableCell align="right" className="w-28">
        <Input
          type="number"
          value={rateDraft}
          onChange={(e) => setRateDraft(e.target.value)}
          onBlur={commitRate}
          disabled={disabled || !line.matchedItemId}
        />
      </TableCell>
      <TableCell align="right" numeric>
        {line.amount ? formatINR(Number(line.amount)) : '—'}
      </TableCell>
    </TableRow>
  );
}

/**
 * Mobile-friendly stacked card for a single line item. Same persist hooks
 * as LineItemRow — only the layout differs. Item picker is the dominant
 * control; qty + rate sit in a 2-column row beneath it.
 */
function LineItemCard({
  line,
  draftId,
  customerId,
  itemOptions,
  disabled,
}: LineItemRowProps) {
  const { qtyDraft, setQtyDraft, rateDraft, setRateDraft, persist, commitQty, commitRate } =
    useLineItemEdit(line, draftId);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm text-zinc-700 dark:text-zinc-200">{line.rawDescription}</p>
        {!line.matchedItemId && (
          <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">unmatched</span>
        )}
      </div>
      <Combobox
        options={itemOptions}
        value={line.matchedItemId ?? ''}
        onChange={(v) =>
          persist({ matchedItemId: v || null, recordAlias: !!v && !!customerId })
        }
        placeholder="Pick item…"
        disabled={disabled || !customerId}
      />
      {!customerId && (
        <p className="mt-1 text-xs text-zinc-400">Pick a customer first</p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Input
          label="Qty"
          type="number"
          value={qtyDraft}
          onChange={(e) => setQtyDraft(e.target.value)}
          onBlur={commitQty}
          disabled={disabled}
        />
        <Input
          label={`Rate (${line.resolvedUom ?? line.rawUom ?? ''})`}
          type="number"
          value={rateDraft}
          onChange={(e) => setRateDraft(e.target.value)}
          onBlur={commitRate}
          disabled={disabled || !line.matchedItemId}
        />
      </div>
      <div className="mt-2 text-right text-sm font-mono text-zinc-700 dark:text-zinc-200">
        {line.amount ? formatINR(Number(line.amount)) : '—'}
      </div>
    </div>
  );
}

// ─── Totals card ─────────────────────────────────────────────────────────

function TotalsCard({ draft }: { draft: PoInboxDetail }) {
  const subtotal = draft.subtotal ? Number(draft.subtotal) : 0;
  const isApprovable = !blockingFlags(draft);

  return (
    <Card className="mb-4">
      <CardContent className="flex items-end justify-between text-sm">
        <div className="text-zinc-500 dark:text-zinc-400">
          <p className="text-xs uppercase tracking-wide">Pre-tax subtotal</p>
          <p className="text-xs">
            GST will be computed at invoice creation based on customer place of supply.
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg text-zinc-900 dark:text-zinc-100">
            {formatINR(subtotal)}
          </p>
          {!isApprovable && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-3 w-3" />
              Fix flagged items to enable approve
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Reject modal ────────────────────────────────────────────────────────

function RejectModal({
  open,
  draft,
  queue,
  onClose,
}: {
  open: boolean;
  draft: PoInboxDetail;
  queue: ReviewQueue | null;
  onClose: () => void;
}) {
  const reject = useRejectPoDraft();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [reason, setReason] = useState('');

  const handleReject = async () => {
    if (!reason.trim()) {
      toast('Enter a reason', 'error');
      return;
    }
    try {
      await reject.mutateAsync({ uploadId: draft.id, reason: reason.trim() });
      toast('PO rejected', 'success');
      onClose();
      // In queue mode, advance to the next item
      if (queue) {
        if (queue.next) {
          void navigate({
            to: '/ar/po-inbox/$uploadId' as never,
            params: { uploadId: queue.next } as never,
            search: { queue: queue.ids.join(',') } as never,
          });
        } else {
          void navigate({ to: '/ar/po-inbox' as never });
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Reject failed', 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Reject this PO?">
      <div className="space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          The upload + draft are kept for audit, but the workflow stops here.
          You can re-parse later if you change your mind.
        </p>
        <Input
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. customer cancelled, duplicate of PO-2103"
          required
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleReject}
            disabled={reject.isPending}
          >
            <ArrowLeft className="h-4 w-4" />
            Reject PO
          </Button>
        </div>
      </div>
    </Modal>
  );
}
