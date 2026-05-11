import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Inbox,
  FileText,
  Image as ImageIcon,
  ClipboardPaste,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
} from 'lucide-react';
import { PageHeader, Card, CardContent, Badge, EmptyState, Pagination } from '@/components/ui';
import { PoUploadZone } from '@/components/po-inbox/po-upload-zone';
import { InstallNudge } from '@/components/po-inbox/install-nudge';
import { TypePoModal } from '@/components/po-inbox/type-po-modal';
import { FirstRunEmpty } from '@/components/po-inbox/first-run-empty';
import {
  usePoInbox,
  useReparsePoUpload,
  useUploadPoFile,
  useUploadPoText,
  useBulkApprovePoDrafts,
  type PoInboxRow,
  type PoInboxFilterStatus,
  type PoSourceChannel,
} from '@/hooks/queries/use-po-inbox';
import { useToast, Button, Modal } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { RefreshCw, Zap, ListChecks, Pencil } from 'lucide-react';
import { consumePendingShares, sharedBlobToFile } from '@/lib/share-intake';
import { useNavigate } from '@tanstack/react-router';

const FILTER_TABS: Array<{ key: PoInboxFilterStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'needs_review', label: 'Needs review' },
  { key: 'ready', label: 'Ready' },
  { key: 'error', label: 'Errors' },
  { key: 'approved', label: 'Approved' },
];

export function PoInboxPage() {
  const [status, setStatus] = useState<PoInboxFilterStatus>('all');
  const [page, setPage] = useState(1);
  const [typeOpen, setTypeOpen] = useState(false);
  const limit = 20;

  const { data, isLoading } = usePoInbox({ status, page, limit });
  // Separate queries that always pull the full "ready" / "needs_review" sets
  // so the bottom action bar can show real counts + start a complete review
  // queue, regardless of which filter chip the user is looking at.
  const { data: readyData } = usePoInbox({ status: 'ready', limit: 100 });
  const { data: needsReviewData } = usePoInbox({ status: 'needs_review', limit: 100 });
  const rows = data?.data ?? [];
  const readyRows = readyData?.data ?? [];
  const needsReviewRows = needsReviewData?.data ?? [];
  const meta = data?.meta;

  // Show the rich first-run walkthrough only on the very first empty load.
  // Once any row exists, mark the user as onboarded so subsequent empty
  // states (e.g., after they reject everything) get the plain version.
  const [hasOnboarded, setHasOnboarded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('runq:po-inbox-onboarded') === '1';
  });
  useEffect(() => {
    if (rows.length > 0 && !hasOnboarded) {
      window.localStorage.setItem('runq:po-inbox-onboarded', '1');
      setHasOnboarded(true);
    }
  }, [rows.length, hasOnboarded]);

  // Drain anything the PWA share-target service worker stashed in IndexedDB.
  useShareIntake();

  return (
    <div>
      <PageHeader fullWidth
        title="PO Inbox"
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'PO Inbox' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => setTypeOpen(true)}>
            <Pencil className="h-4 w-4" />
            Type a PO
          </Button>
        }
      />

      <InstallNudge />

      <Card className="mb-4">
        <CardContent className="p-3">
          <PoUploadZone capturePaste />
        </CardContent>
      </Card>

      <TypePoModal open={typeOpen} onClose={() => setTypeOpen(false)} />

      <FilterChips
        active={status}
        onChange={(s) => {
          setStatus(s);
          setPage(1);
        }}
      />

      {isLoading ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        hasOnboarded ? (
          <EmptyState
            icon={Inbox}
            title="No POs in the inbox"
            description="Drop a file above, paste an image or text, or share a PO from WhatsApp. Once a row appears here, click into it to review and approve."
          />
        ) : (
          <FirstRunEmpty onTypeClick={() => setTypeOpen(true)} />
        )
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <PoInboxRowCard key={row.id} row={row} />
          ))}
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={limit}
            onPageChange={setPage}
          />
        </div>
      )}

      <BulkActionsBar readyRows={readyRows} needsReviewRows={needsReviewRows} />
    </div>
  );
}

/**
 * Sticky bottom bar with two parallel bulk actions:
 *   - "Process All Ready (N)" — kicks off bulk-approve for `ready` rows
 *   - "Review N flagged" — opens the review screen with a queue of all
 *     `needs_review` rows so the accountant walks them one by one
 *
 * Both are independent — the bar shows whichever has > 0 rows. If both
 * have rows, they stack on mobile and sit side-by-side on desktop.
 */
function BulkActionsBar({
  readyRows,
  needsReviewRows,
}: {
  readyRows: PoInboxRow[];
  needsReviewRows: PoInboxRow[];
}) {
  const navigate = useNavigate();
  const hasReady = readyRows.length > 0;
  const hasFlagged = needsReviewRows.length > 0;

  if (!hasReady && !hasFlagged) return null;

  const startReviewQueue = () => {
    const ids = needsReviewRows.map((r) => r.id);
    const queue = ids.join(',');
    void navigate({
      to: '/ar/po-inbox/$uploadId' as never,
      params: { uploadId: ids[0]! } as never,
      search: { queue } as never,
    });
  };

  return (
    <div className="sticky bottom-4 mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
      {hasFlagged && (
        <button
          onClick={startReviewQueue}
          className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-amber-600"
        >
          <ListChecks className="h-4 w-4" />
          Review {needsReviewRows.length} flagged
        </button>
      )}
      {hasReady && <BulkApproveButton readyRows={readyRows} />}
    </div>
  );
}

function BulkApproveButton({ readyRows }: { readyRows: PoInboxRow[] }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState<BulkApproveResultUI | null>(null);
  const bulk = useBulkApprovePoDrafts();
  const { toast } = useToast();

  if (readyRows.length === 0) return null;

  const totalAmount = readyRows.reduce(
    (s, r) => s + (r.grandTotal ? Number(r.grandTotal) : 0),
    0,
  );

  const handleConfirm = async () => {
    setConfirmOpen(false);
    try {
      const res = await bulk.mutateAsync(readyRows.map((r) => r.id));
      const { created, failed } = res.data;
      if (failed.length === 0) {
        toast(
          created.length === 1
            ? `Created invoice ${created[0]!.invoiceNumber}`
            : `Created ${created.length} draft invoices`,
          'success',
        );
      } else {
        // Some failed — open the result modal so the user can see why
        setReviewOpen({ created, failed });
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Bulk approve failed', 'error');
    }
  };

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        disabled={bulk.isPending}
        className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-indigo-700 disabled:opacity-60"
      >
        <Zap className="h-4 w-4" />
        {bulk.isPending
          ? 'Approving…'
          : `Process All Ready (${readyRows.length})`}
        {totalAmount > 0 && (
          <span className="font-mono text-xs opacity-90">· {formatINR(totalAmount)}</span>
        )}
      </button>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Create draft invoices?">
        <div className="space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            This will create <strong>{readyRows.length}</strong> draft invoice
            {readyRows.length === 1 ? '' : 's'} totalling{' '}
            <strong>{formatINR(totalAmount)}</strong>. Each invoice lands in
            your AR / Invoices list as <strong>draft</strong> — you or the
            owner can review and send them from there.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleConfirm}>
              Create {readyRows.length} invoice{readyRows.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </Modal>

      {reviewOpen && (
        <BulkResultModal result={reviewOpen} onClose={() => setReviewOpen(null)} />
      )}
    </>
  );
}

interface BulkApproveResultUI {
  created: Array<{ uploadId: string; invoiceId: string; invoiceNumber: string }>;
  failed: Array<{ uploadId: string; reason: string }>;
}

function BulkResultModal({
  result,
  onClose,
}: {
  result: BulkApproveResultUI;
  onClose: () => void;
}) {
  return (
    <Modal open={true} onClose={onClose} title="Bulk approve results">
      <div className="space-y-3 text-sm">
        <p>
          <strong className="text-green-700 dark:text-green-400">
            {result.created.length} created
          </strong>
          {result.failed.length > 0 && (
            <>
              {' · '}
              <strong className="text-amber-700 dark:text-amber-400">
                {result.failed.length} failed
              </strong>
            </>
          )}
        </p>
        {result.failed.length > 0 && (
          <div>
            <p className="mb-1 text-xs uppercase text-zinc-500">Failed items</p>
            <ul className="max-h-48 overflow-y-auto rounded border border-zinc-200 text-xs dark:border-zinc-700">
              {result.failed.map((f) => (
                <li
                  key={f.uploadId}
                  className="border-b border-zinc-100 px-3 py-1.5 last:border-b-0 dark:border-zinc-800"
                >
                  <code className="text-zinc-400">{f.uploadId.slice(0, 8)}</code>{' '}
                  <span className="text-zinc-700 dark:text-zinc-300">{f.reason}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-zinc-500">
              Open each failed row from the inbox to fix the flagged items, then
              re-run.
            </p>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function FilterChips({
  active,
  onChange,
}: {
  active: PoInboxFilterStatus;
  onChange: (s: PoInboxFilterStatus) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {FILTER_TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={[
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            active === tab.key
              ? 'bg-indigo-600 text-white'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700',
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function PoInboxRowCard({ row }: { row: PoInboxRow }) {
  const status = derivedStatus(row);
  const SourceIcon = sourceIcon(row.source);
  const reparse = useReparsePoUpload();
  const { toast } = useToast();
  const title =
    row.customerName ??
    row.buyerNameRaw ??
    row.fileName ??
    (row.hasRawText ? 'Pasted text PO' : 'Untitled PO');

  // Rows that are still parsing have no draft yet, so the review screen
  // would 404 — make them non-navigable until the parser flips status.
  const navigable = status !== 'parsing';

  const handleReparse = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await reparse.mutateAsync(row.id);
      toast('Re-parse queued', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Re-parse failed', 'error');
    }
  };

  const cardBody = (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0 text-zinc-400">
        <SourceIcon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{title}</p>
          <StatusBadge status={status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          {row.poNumberExtracted && (
            <span className="font-mono">{row.poNumberExtracted}</span>
          )}
          {row.poDate && <span>{row.poDate}</span>}
          {row.grandTotal && (
            <span className="font-mono">{formatINR(Number(row.grandTotal))}</span>
          )}
          <span>{relativeTime(row.uploadedAt)}</span>
          <span className="capitalize">{row.source.replace('_', ' ')}</span>
        </div>
        {row.errorMessage && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{row.errorMessage}</p>
        )}
        {(status === 'error' || status === 'needs_review') && (
          <div className="mt-2">
            <button
              onClick={handleReparse}
              disabled={reparse.isPending}
              className="inline-flex items-center gap-1 rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RefreshCw className={`h-3 w-3 ${reparse.isPending ? 'animate-spin' : ''}`} />
              Re-parse
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const cardClass =
    'block rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900';

  if (!navigable) return <div className={cardClass}>{cardBody}</div>;

  return (
    <Link
      to="/ar/po-inbox/$uploadId"
      params={{ uploadId: row.id }}
      className={`${cardClass} cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50`}
    >
      {cardBody}
    </Link>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
        />
      ))}
    </div>
  );
}

type DerivedStatus =
  | 'parsing'
  | 'ready'
  | 'needs_review'
  | 'error'
  | 'approved'
  | 'rejected';

function derivedStatus(row: PoInboxRow): DerivedStatus {
  if (row.uploadStatus === 'parse_error') return 'error';
  if (row.uploadStatus === 'pending' || row.uploadStatus === 'parsing') return 'parsing';
  if (row.reviewStatus === 'ready') return 'ready';
  if (row.reviewStatus === 'needs_review') return 'needs_review';
  if (row.reviewStatus === 'approved') return 'approved';
  if (row.reviewStatus === 'rejected') return 'rejected';
  if (row.reviewStatus === 'error') return 'error';
  return 'parsing';
}

function StatusBadge({ status }: { status: DerivedStatus }) {
  switch (status) {
    case 'parsing':
      return (
        <Badge variant="default" className="inline-flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Parsing
        </Badge>
      );
    case 'ready':
      return (
        <Badge variant="success" className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Ready
        </Badge>
      );
    case 'needs_review':
      return (
        <Badge variant="warning" className="inline-flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Review
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="danger" className="inline-flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Error
        </Badge>
      );
    case 'approved':
      return <Badge variant="success">Approved</Badge>;
    case 'rejected':
      return <Badge variant="outline">Rejected</Badge>;
  }
}

function sourceIcon(source: PoSourceChannel) {
  switch (source) {
    case 'paste_image':
      return ImageIcon;
    case 'paste_text':
      return ClipboardPaste;
    case 'email_forward':
      return Mail;
    case 'share_sheet':
      return MessageSquare;
    case 'web_drop':
    case 'web_upload':
    default:
      return FileText;
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * On mount, check for `?share=pending` (set by the SW after a PWA share)
 * and drain whatever the SW stashed in IndexedDB into the upload pipeline
 * via the existing JWT-authenticated mutations. Cleans the URL after.
 */
function useShareIntake(): void {
  const uploadFile = useUploadPoFile();
  const uploadText = useUploadPoText();
  const { toast } = useToast();
  // Guard against React.StrictMode double-invocation in dev
  const ranRef = useRef(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const param = url.searchParams.get('share');
    if (!param) return;
    if (ranRef.current) return;
    ranRef.current = true;

    void (async () => {
      // Strip the param immediately so a refresh doesn't re-trigger
      url.searchParams.delete('share');
      window.history.replaceState({}, '', url.toString());

      if (param === 'error') {
        toast('Share failed — please try again', 'error');
        return;
      }

      try {
        const items = await consumePendingShares();
        let uploaded = 0;
        for (const item of items) {
          if (item.files.length > 0) {
            for (const blob of item.files) {
              const file = sharedBlobToFile(blob);
              await uploadFile.mutateAsync({ file, source: 'share_sheet' });
              uploaded += 1;
            }
          } else if (item.text && item.text.trim().length > 0) {
            // Some share sources only send text (no files) — treat as paste-text
            await uploadText.mutateAsync({
              text: item.text,
              sourceMetadata: { sharedTitle: item.title || undefined },
            });
            uploaded += 1;
          }
        }
        if (uploaded > 0) {
          toast(
            uploaded === 1 ? 'Shared PO uploaded' : `${uploaded} shared POs uploaded`,
            'success',
          );
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Share intake failed', 'error');
      }
    })();
    // Intentionally empty deps — this runs exactly once per page load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
