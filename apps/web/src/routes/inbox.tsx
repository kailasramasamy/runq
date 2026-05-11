import { useNavigate } from '@tanstack/react-router';
import {
  ArrowRight, FileCheck2, FileSearch, Send, Sparkles, Wallet, Banknote,
  Inbox as InboxIcon,
} from 'lucide-react';
import {
  PageHeader, Card, Button, Badge, useToast,
} from '@/components/ui';
import { StatTile, Avatar } from '@/components/ar/primitives';
import { formatINR, formatINRShort } from '@/lib/utils';
import {
  useInbox, type InboxGroup, type InboxGroupKey, type InboxItem,
} from '@/hooks/queries/use-inbox';

// ─── Per-group icon + CTA label ─────────────────────────────────────────────

const GROUP_ICON: Record<InboxGroupKey, React.ReactNode> = {
  invoices_to_send: <Send size={14} />,
  bills_to_approve: <FileCheck2 size={14} />,
  bills_pending_match: <FileSearch size={14} />,
  po_drafts_to_review: <Sparkles size={14} />,
  expenses_to_approve: <Wallet size={14} />,
  expenses_to_reimburse: <Banknote size={14} />,
};

// Per-group icon tile colors. Soft tinted backgrounds + matching foregrounds
// so each section is visually distinct without competing with the row data.
// Pulls from the same OKLCH palette the design handoff used.
const GROUP_ICON_BG: Record<InboxGroupKey, string> = {
  invoices_to_send: 'var(--accent-soft)',
  bills_to_approve: 'oklch(0.94 0.05 155)',
  bills_pending_match: 'oklch(0.94 0.06 80)',
  po_drafts_to_review: 'oklch(0.93 0.05 305)',
  expenses_to_approve: 'oklch(0.93 0.06 305)',
  expenses_to_reimburse: 'oklch(0.93 0.06 180)',
};

const GROUP_ICON_FG: Record<InboxGroupKey, string> = {
  invoices_to_send: 'var(--accent-text)',
  bills_to_approve: 'oklch(0.45 0.14 155)',
  bills_pending_match: 'oklch(0.48 0.16 75)',
  po_drafts_to_review: 'oklch(0.45 0.2 305)',
  expenses_to_approve: 'oklch(0.45 0.2 305)',
  expenses_to_reimburse: 'oklch(0.42 0.15 180)',
};

const ACTION_LABEL: Record<InboxGroupKey, string> = {
  invoices_to_send: 'Send',
  bills_to_approve: 'Approve',
  bills_pending_match: 'Match',
  po_drafts_to_review: 'Review',
  expenses_to_approve: 'Approve',
  expenses_to_reimburse: 'Reimburse',
};

// ─── Page ───────────────────────────────────────────────────────────────────

export function InboxPage() {
  const { data, isLoading, isError } = useInbox();
  const payload = data?.data;
  const groups = (payload?.groups ?? []).filter((g) => g.count > 0);

  const totalCount = payload?.totalCount ?? 0;
  const grandTotal = groups.reduce(
    (s, g) => s + g.items.reduce((a, i) => a + (i.amount ?? 0), 0),
    0,
  );
  const needsReview = groups.reduce(
    (s, g) => s + g.items.filter((i) => i.status === 'needs_review').length,
    0,
  );

  return (
    <div>
      <PageHeader
        title="Inbox"
        description="Everything that needs your attention — sorted by what to do next."
      />

      {/* KPI strip — same shape as every other content page so the inbox
          reads as a peer to invoices / bills / expenses, not a one-off. */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="To do" value={totalCount} sub="across all groups" />
        <StatTile
          label="Total at stake"
          value={grandTotal > 0 ? formatINRShort(grandTotal) : '—'}
          sub="across these items"
        />
        <StatTile
          label="Needs review"
          value={needsReview}
          sub={needsReview > 0 ? 'flagged for attention' : 'none flagged'}
          tone={needsReview > 0 ? 'warn' : 'neutral'}
        />
        <StatTile
          label="Categories"
          value={groups.length}
          sub="active worklists"
        />
      </div>

      {isLoading && <SkeletonGrid />}
      {isError && (
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>
          Could not load inbox. Try refreshing.
        </p>
      )}
      {!isLoading && !isError && groups.length === 0 && <EmptyState />}

      <div className="space-y-4">
        {groups.map((group) => (
          <GroupCard key={group.key} group={group} />
        ))}
      </div>
    </div>
  );
}

// ─── Group card ─────────────────────────────────────────────────────────────

function GroupCard({ group }: { group: InboxGroup }) {
  const groupTotal = group.items.reduce((s, i) => s + (i.amount ?? 0), 0);
  return (
    <Card>
      <div className="flex items-start gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ background: GROUP_ICON_BG[group.key], color: GROUP_ICON_FG[group.key] }}
        >
          {GROUP_ICON[group.key]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {group.title}
            </h3>
            <Badge variant="outline">{group.count}</Badge>
          </div>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-3)' }}>
            {group.caption}
          </p>
        </div>
        {groupTotal > 0 && (
          <span className="num shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>
            {formatINR(groupTotal)}
          </span>
        )}
      </div>
      <ul>
        {group.items.map((item, i) => (
          <ItemRow
            key={`${group.key}-${item.id}`}
            group={group}
            item={item}
            isLast={i === group.items.length - 1}
          />
        ))}
      </ul>
    </Card>
  );
}

// ─── Item row ───────────────────────────────────────────────────────────────

function ItemRow({
  group, item, isLast,
}: {
  group: InboxGroup;
  item: InboxItem;
  isLast: boolean;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();

  function handleAction(e?: React.MouseEvent) {
    e?.stopPropagation();
    try {
      navigate({ to: item.href as never });
    } catch {
      toast('Could not open this item.', 'error');
    }
  }

  return (
    <li
      className={
        'relative flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[color:var(--surface-2)] ' +
        (isLast ? '' : 'border-b border-zinc-100 dark:border-zinc-800/60')
      }
    >
      <Avatar name={item.title} size={28} />
      <StatusDot status={item.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
          {item.title}
        </p>
        <div className="mt-[1px] flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--text-3)' }}>
          <span className="num">{item.subtitle}</span>
          <span aria-hidden>·</span>
          <span>{relativeDate(item.date)}</span>
          {item.status === 'needs_review' && (
            <Badge variant="warning">Needs review</Badge>
          )}
        </div>
      </div>
      {item.amount != null && (
        <span className="num shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>
          {formatINR(item.amount)}
        </span>
      )}
      <Button variant="outline" size="sm" onClick={handleAction} className="shrink-0">
        {ACTION_LABEL[group.key]}
        <ArrowRight size={12} />
      </Button>
      {/* Whole-row click target sits behind the action button so the row
          itself is tappable for the same destination — keeps the CTA the
          strong affordance while making the entire row navigable. */}
      <button
        type="button"
        onClick={handleAction}
        aria-label={`Open ${item.title}`}
        className="absolute inset-0 -z-10"
      />
    </li>
  );
}

function StatusDot({ status }: { status: InboxItem['status'] }) {
  const color =
    status === 'draft' ? 'var(--text-3)' :
    status === 'needs_review' ? 'var(--warn)' :
    'var(--pos)'; // ready, approved
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: 6, height: 6, background: color }}
    />
  );
}

// ─── States / helpers ───────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return 'today';
  if (diffMs < 2 * day) return 'yesterday';
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function SkeletonGrid() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="h-3 w-40 animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
          </div>
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-4 w-full animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div
          className="mb-3 flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
        >
          <InboxIcon size={18} />
        </div>
        <p className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>You're all caught up.</p>
        <p className="mt-1 max-w-xs text-[12.5px]" style={{ color: 'var(--text-3)' }}>
          New invoices to send, bills to approve, and expenses to reimburse will land here when there's work to do.
        </p>
      </div>
    </Card>
  );
}
