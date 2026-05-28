import { Link } from '@tanstack/react-router';
import {
  ShoppingCart, Send, PackageCheck, ClipboardCheck, Boxes,
  FileText, Plus, Building2, Link as LinkIcon, History,
  AlertTriangle, CalendarClock, FileMinus,
} from 'lucide-react';
import {
  PageHeader, Card, CardContent, Skeleton, EmptyState,
} from '@/components/ui';
import { usePurchaseOrders } from '@/hooks/queries/use-purchase-orders';
import { useDirectReceipts } from '@/hooks/queries/use-direct-receipts';

/**
 * Purchase module dashboard. Mirrors the mobile `PurchaseHomeScreen`:
 *   - Hero KPI row    : Open / Awaiting / Partial / Received / Today direct
 *   - Attention strip : Overdue / Drafts / Match-pending
 *   - Two-column      : Quick actions  +  Recent orders
 *
 * No dedicated dashboard endpoint — every KPI is a thin list call with
 * `limit=1` so we just read `meta.total`. Same pattern the mobile
 * Riverpod providers use. Recent-orders list runs at `limit=6`.
 */
export function PurchaseDashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  const open       = usePurchaseOrders({ status: 'sent,partially_received', limit: 1 });
  const awaiting   = usePurchaseOrders({ status: 'sent', limit: 1 });
  const partial    = usePurchaseOrders({ status: 'partially_received', limit: 1 });
  const receivedM  = usePurchaseOrders({ status: 'received', dateFrom: monthStart, dateTo: today, limit: 1 });
  const drafts     = usePurchaseOrders({ status: 'draft', limit: 1 });
  const recent     = usePurchaseOrders({ limit: 6 });
  const directToday = useDirectReceipts({ dateFrom: today, dateTo: today, limit: 1 });

  // "Match pending" = POs received but not yet linked to a bill. We don't
  // have a server filter for that yet, so for v1 we show all `received`
  // POs as a proxy — it overstates slightly but is the right surface to
  // open Match flow from. Will tighten when the API grows a `billed` flag.
  const matchPending = usePurchaseOrders({ status: 'received', limit: 1 });

  return (
    <div>
      <PageHeader
        title="Purchase"
        description="Orders to vendors, receipts, and 3-way match — at a glance."
        fullWidth
      />

      {/* ── Hero KPI row (mirrors mobile hero) ─────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <HeroStat
          icon={ShoppingCart}
          label="Open orders"
          value={String(open.data?.meta.total ?? 0)}
          sub="Sent + partial"
          to="/purchase/pos?status=sent,partially_received"
          loading={open.isLoading}
        />
        <HeroStat
          icon={Send}
          label="Awaiting receipt"
          value={String(awaiting.data?.meta.total ?? 0)}
          sub="Sent, nothing received"
          to="/purchase/pos?status=sent"
          loading={awaiting.isLoading}
        />
        <HeroStat
          icon={PackageCheck}
          label="Partial"
          value={String(partial.data?.meta.total ?? 0)}
          sub="Mid-receive"
          to="/purchase/pos?status=partially_received"
          loading={partial.isLoading}
        />
        <HeroStat
          icon={ClipboardCheck}
          label="Received MTD"
          value={String(receivedM.data?.meta.total ?? 0)}
          sub="This month"
          to="/purchase/pos?status=received"
          loading={receivedM.isLoading}
          tone="success"
        />
        <HeroStat
          icon={Boxes}
          label="Direct today"
          value={String(directToday.data?.meta.total ?? 0)}
          sub="Walk-in receipts"
          to="/purchase/direct"
          loading={directToday.isLoading}
        />
      </div>

      {/* ── Attention strip ────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <AttentionTile
          icon={AlertTriangle}
          count={countOverdue(recent.data?.data, today)}
          label="Overdue (visible)"
          tone="danger"
          to="/purchase/pos?status=sent,partially_received"
          loading={recent.isLoading}
          hint="Past expected date"
        />
        <AttentionTile
          icon={FileText}
          count={drafts.data?.meta.total ?? 0}
          label="Drafts"
          tone="warning"
          to="/purchase/pos?status=draft"
          loading={drafts.isLoading}
          hint="Not yet sent to vendor"
        />
        <AttentionTile
          icon={LinkIcon}
          count={matchPending.data?.meta.total ?? 0}
          label="Ready to match"
          tone="info"
          to="/finance/ap/bills"
          loading={matchPending.isLoading}
          hint="Received POs awaiting a bill"
        />
      </div>

      {/* ── Quick actions — 6-up on desktop, responsive down ───── */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <ActionCard icon={Plus} title="New PO" body="Commit to a vendor" to="/purchase/pos/new" />
          <ActionCard icon={PackageCheck} title="Receive" body="Against open PO" to="/purchase/pos?status=sent,partially_received" />
          <ActionCard icon={Boxes} title="Direct receipt" body="Walk-in / no PO" to="/purchase/direct/new" />
          <ActionCard icon={LinkIcon} title="Match bills" body="3-way reconcile" to="/finance/ap/bills" />
          <ActionCard icon={History} title="All orders" body="Browse history" to="/purchase/pos" />
          <ActionCard icon={Building2} title="Vendors" body="Manage suppliers" to="/finance/ap/vendors" />
        </div>
      </div>

      {/* ── Recent orders ──────────────────────────────────────── */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
            Recent orders
          </h2>
          {recent.data && recent.data.data.length > 0 && (
            <Link to="/purchase/pos" className="text-xs font-medium hover:underline" style={{ color: 'var(--accent-text)' }}>
              View all →
            </Link>
          )}
        </div>
        <Card>
          <CardContent className="!p-0">
            {recent.isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : !recent.data || recent.data.data.length === 0 ? (
              <EmptyState
                icon={FileMinus}
                title="No purchase orders yet"
                description="Create your first PO to start tracking commitments to vendors."
              />
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {recent.data.data.map((po) => (
                  <li key={po.id}>
                    <Link
                      to="/purchase/pos/$poId"
                      params={{ poId: po.id }}
                      className="flex items-center gap-3 p-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                    >
                      <StatusBadge status={po.status} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-sm font-semibold">{po.poNumber}</span>
                          <span className="truncate text-sm text-zinc-700 dark:text-zinc-300">{po.vendorName}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {formatDate(po.poDate)}
                          {po.expectedDate ? ` · Expected ${formatDate(po.expectedDate)}` : ''}
                          {` · ${po.lineCount} ${po.lineCount === 1 ? 'line' : 'lines'}`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm font-semibold tabular-nums">
                          {formatInr(po.total)}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-[11px] text-zinc-500">
        Tip: Purchase tracks <em>committed</em> spend. Stock-on-hand and bill totals live in
        Inventory and Finance — switch modules from the top-left chip.
      </p>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function HeroStat({
  icon: Icon, label, value, sub, to, tone = 'default', loading,
}: {
  icon: typeof ShoppingCart;
  label: string; value: string; sub: string; to: string;
  tone?: 'default' | 'success'; loading?: boolean;
}) {
  const toneClass = tone === 'success' ? 'text-green-600 dark:text-green-400' : '';
  return (
    <Link to={to as never} className="block transition-transform hover:-translate-y-0.5">
      <Card>
        <CardContent>
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {label}
              </div>
              {loading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <div className={`font-mono text-xl font-semibold tabular-nums ${toneClass}`}>
                  {value}
                </div>
              )}
              <div className="mt-1 truncate text-xs text-zinc-500">{sub}</div>
            </div>
            <div
              className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
            >
              <Icon size={18} />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function AttentionTile({
  icon: Icon, count, label, tone, to, loading, hint,
}: {
  icon: typeof ShoppingCart;
  count: number; label: string; hint: string;
  tone: 'warning' | 'danger' | 'info'; to: string; loading?: boolean;
}) {
  const toneColors = {
    warning: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', icon: 'text-amber-600' },
    danger:  { bg: 'bg-red-50 dark:bg-red-950/30',     text: 'text-red-700 dark:text-red-400',     icon: 'text-red-600' },
    info:    { bg: 'bg-blue-50 dark:bg-blue-950/30',   text: 'text-blue-700 dark:text-blue-400',   icon: 'text-blue-600' },
  }[tone];
  const hot = count > 0;
  return (
    <Link
      to={to as never}
      className={`group flex items-center gap-3 rounded-xl border border-zinc-200 p-3 transition-colors dark:border-zinc-800 ${
        hot ? toneColors.bg : 'bg-white dark:bg-zinc-900'
      } hover:border-zinc-300 dark:hover:border-zinc-700`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
        hot ? 'bg-white/60 dark:bg-zinc-900/60' : 'bg-zinc-50 dark:bg-zinc-800'
      } ${toneColors.icon}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`font-mono text-xl font-semibold tabular-nums ${hot ? toneColors.text : ''}`}>
          {loading ? '…' : count}
        </div>
        <div className="truncate text-xs text-zinc-500">{label}</div>
        <div className="mt-0.5 truncate text-[11px] text-zinc-400">{hint}</div>
      </div>
    </Link>
  );
}

function ActionCard({
  icon: Icon, title, body, to,
}: { icon: typeof ShoppingCart; title: string; body: string; to: string }) {
  return (
    <Link
      to={to as never}
      className="group flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
    >
      <span
        className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="mt-0.5 truncate text-[12px] text-zinc-500">{body}</p>
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    draft:              { label: 'DRAFT',  bg: 'var(--surface-2)',           text: 'var(--text-2)' },
    sent:               { label: 'SENT',   bg: 'rgba(37, 99, 235, 0.10)',   text: '#2563eb' },
    partially_received: { label: 'PART',   bg: 'rgba(234, 88, 12, 0.10)',   text: '#ea580c' },
    received:           { label: 'RECV',   bg: 'rgba(22, 163, 74, 0.10)',   text: '#16a34a' },
    closed:             { label: 'CLOSED', bg: 'rgba(124, 58, 237, 0.10)',  text: '#6d28d9' },
    cancelled:          { label: 'CXL',    bg: 'rgba(220, 38, 38, 0.10)',   text: '#dc2626' },
  };
  const cfg = map[status] ?? { label: status.toUpperCase(), bg: 'var(--surface-2)', text: 'var(--text-2)' };
  return (
    <span
      className="inline-flex h-9 w-14 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tracking-wide"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────

function countOverdue(rows: Array<{ status: string; expectedDate: string | null }> | undefined, today: string): number {
  if (!rows) return 0;
  return rows.filter((r) =>
    (r.status === 'sent' || r.status === 'partially_received') &&
    r.expectedDate !== null && r.expectedDate < today
  ).length;
}

function formatInr(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)} Cr`;
  if (v >= 100_000) return `₹${(v / 100_000).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
