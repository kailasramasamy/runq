import '../ap/bills/detail-tokens.css';
import { useState, useMemo } from 'react';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import {
  ArrowLeft, ExternalLink, MoreHorizontal, Sparkles, Wand2,
  CircleCheck, AlertTriangle,
} from 'lucide-react';
import { useJournalEntry } from '@/hooks/queries/use-gl';
import { Skeleton } from '@/components/ui';
import { DocumentTrail } from '@/components/audit/document-trail';
import type { JournalEntryWithLines } from '@runq/types';

const fmtINR = (n: number, decimals = 2) => {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${n < 0 ? '−' : ''}₹${formatted}`;
};
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const SOURCE_LABELS: Record<string, string> = {
  sales_invoice: 'Sales Invoice',
  purchase_invoice: 'Purchase Bill',
  payment: 'Payment',
  receipt: 'Receipt',
  debit_note: 'Debit Note',
  credit_note: 'Credit Note',
  bank_expense: 'Bank Expense',
  bank_transaction: 'Bank Transaction',
};

function getSourceLink(sourceType: string | null, sourceId: string | null): string | null {
  if (!sourceType || !sourceId) return null;
  const routes: Record<string, string> = {
    sales_invoice: `/ar/invoices/${sourceId}`,
    purchase_invoice: `/ap/bills/${sourceId}`,
    payment: `/ap/payments/${sourceId}`,
    receipt: `/ar/receipts/${sourceId}`,
    debit_note: `/ap/debit-notes/${sourceId}`,
    credit_note: `/ar/credit-notes/${sourceId}`,
  };
  return routes[sourceType] ?? null;
}

interface AuditGap {
  id: string;
  title: string;
  detail: string;
  fixLabel: string;
  fixKind: 'primary' | 'secondary';
  onFix: () => void;
}

interface ActivityEvent {
  id: string;
  ts: string;
  who: string;
  action: string;
  icon: 'alert' | 'check' | 'eye' | 'import';
}

export function JournalEntryDetailPage({ journalEntryId }: { journalEntryId: string }) {
  const { data, isLoading, isError } = useJournalEntry(journalEntryId);
  const entry = data?.data;

  if (isLoading) return <JournalEntryDetailSkeleton />;
  if (isError || !entry) {
    return <div className="bill-detail-page p-6 text-sm text-[color:var(--bd-neg)]">Journal entry not found.</div>;
  }
  return <Content entry={entry} />;
}

function JournalEntryDetailSkeleton() {
  return (
    <div className="bill-detail-page p-7">
      <div className="mb-6 h-6 w-48 animate-pulse rounded bg-[color:var(--bd-surface-3)]" />
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
    </div>
  );
}

function Content({ entry }: { entry: JournalEntryWithLines }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const debit = Number(entry.totalDebit);
  const credit = Number(entry.totalCredit);
  const diff = Math.abs(debit - credit);
  const isBalanced = diff < 0.005;
  const sourceLabel = entry.sourceType ? (SOURCE_LABELS[entry.sourceType] ?? entry.sourceType) : null;
  const sourceLink = getSourceLink(entry.sourceType, entry.sourceId);

  const gaps = useDerivedGaps(entry, isBalanced, sourceLink, () => {
    if (sourceLink) navigate({ to: sourceLink as '/' });
  });
  const activity = useDerivedActivity(entry);
  const visibleGapCount = gaps.filter((g) => !dismissed.has(g.id)).length;

  function goBack() {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: '/finance/gl/journal-entries' });
  }

  function fixAll() {
    gaps.forEach((g, i) => {
      if (dismissed.has(g.id)) return;
      setTimeout(() => g.onFix(), i * 250);
    });
  }

  return (
    <div className="bill-detail-page">
      <div className="mx-auto max-w-[1480px] px-6 py-7 pb-16">
        <Header
          entry={entry}
          debit={debit} credit={credit} diff={diff} isBalanced={isBalanced}
          sourceLabel={sourceLabel} sourceLink={sourceLink}
          gapCount={visibleGapCount}
          onBack={goBack}
        />

        <div className="bd-grid">
          <div className="bd-grid-main">
            <DetailsCard entry={entry} sourceLabel={sourceLabel} sourceLink={sourceLink} />
            <LinesCard entry={entry} />
            <DocumentTrailCard entry={entry} />
          </div>
          <div className="bd-grid-rail">
            <AutoFixSidekick
              gaps={gaps}
              dismissedIds={dismissed}
              onDismiss={(id) => setDismissed((s) => new Set([...s, id]))}
              onFixAll={fixAll}
            />
            <ActivityTimeline history={activity} />
          </div>
        </div>
      </div>
    </div>
  );
}

interface HeaderProps {
  entry: JournalEntryWithLines;
  debit: number; credit: number; diff: number; isBalanced: boolean;
  sourceLabel: string | null; sourceLink: string | null;
  gapCount: number;
  onBack: () => void;
}

function Header({ entry, debit, credit, diff, isBalanced, sourceLabel, sourceLink, gapCount, onBack }: HeaderProps) {
  const isPosted = entry.status === 'posted';
  const isReversed = entry.status === 'reversed';
  const isDraft = entry.status === 'draft';

  return (
    <div className="bd-page-header">
      <div className="bd-ph-top">
        <div className="bd-ph-identity">
          <button onClick={onBack} className="bd-icon-btn" title="Back" aria-label="Back">
            <ArrowLeft size={16} />
          </button>
          <div className="bd-vendor-avatar">JE</div>
          <div className="bd-ph-meta">
            <div className="bd-ph-eyebrow">
              {isPosted && <span className="bd-pill bd-pill-success"><CircleCheck size={12} />Posted</span>}
              {isDraft && <span className="bd-pill bd-pill-neutral">Draft</span>}
              {isReversed && <span className="bd-pill bd-pill-warn"><AlertTriangle size={12} />Reversed</span>}
              {!isBalanced && <span className="bd-pill bd-pill-warn"><AlertTriangle size={12} />Unbalanced</span>}
              {sourceLabel && <span className="bd-pill bd-pill-info">{sourceLabel}</span>}
              <span className="bd-ph-id">{entry.entryNumber}</span>
            </div>
            <h1 className="bd-ph-title">Journal entry</h1>
            <div className="bd-ph-sub">
              <span>{fmtDate(entry.date)}</span>
              {entry.description && (<><span className="bd-dot">·</span><span className="truncate">{entry.description}</span></>)}
            </div>
          </div>
        </div>
        <div className="bd-ph-actions">
          {sourceLink && (
            <Link to={sourceLink as '/'}>
              <button className="bd-btn bd-btn-secondary">
                <ExternalLink size={15} />Open source
              </button>
            </Link>
          )}
          <button className="bd-btn bd-btn-ghost" aria-label="More"><MoreHorizontal size={15} /></button>
        </div>
      </div>

      <div className="bd-amount-grid">
        <AmountTile label="Total debit" value={debit} accent="info" big sub={`${entry.lines.filter((l) => l.debit > 0).length} line${entry.lines.filter((l) => l.debit > 0).length === 1 ? '' : 's'}`} />
        <AmountTile label="Total credit" value={credit} sub={`${entry.lines.filter((l) => l.credit > 0).length} line${entry.lines.filter((l) => l.credit > 0).length === 1 ? '' : 's'}`} />
        <AmountTile
          label="Balance check"
          value={diff}
          accent={isBalanced ? undefined : 'warn'}
          sub={isBalanced ? 'Balanced' : `Out of balance by ${fmtINR(diff)}`}
        />
        <AmountTile label="Audit gaps" count={gapCount} accent="info" sub={gapCount === 0 ? 'All clear' : 'Auto-Fix available'} />
      </div>
    </div>
  );
}

function AmountTile({ label, value, count, sub, accent, big }: { label: string; value?: number; count?: number; sub?: string; accent?: 'warn' | 'info'; big?: boolean }) {
  const cls = `bd-amt-tile ${accent ? `bd-amt-${accent}` : ''} ${big ? 'bd-amt-big' : ''}`;
  return (
    <div className={cls}>
      <div className="bd-amt-label">{label}</div>
      <div>
        <span className="bd-amt-num">{count != null ? count : value != null ? fmtINR(value) : '—'}</span>
      </div>
      {sub && <div className="bd-amt-sub">{sub}</div>}
    </div>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function DetailsCard({ entry, sourceLabel, sourceLink }: { entry: JournalEntryWithLines; sourceLabel: string | null; sourceLink: string | null }) {
  const fields = [
    { label: 'Entry number', value: entry.entryNumber, mono: true },
    { label: 'Date', value: fmtDate(entry.date) },
    { label: 'Status', value: entry.status },
    { label: 'Description', value: entry.description },
    {
      label: 'Source',
      value: sourceLabel,
      link: sourceLink,
      missing: !sourceLabel,
    },
    { label: 'Created by', value: entry.createdBy ?? null, missing: !entry.createdBy },
    { label: 'Created at', value: new Date(entry.createdAt).toLocaleString('en-IN') },
    { label: 'Total amount', value: fmtINR(Number(entry.totalDebit)), mono: true },
  ];
  return (
    <section className="bd-card">
      <header className="bd-card-header">
        <div className="bd-card-title">Entry info</div>
      </header>
      <div className="bd-info-grid">
        {fields.map((f, i) => (
          <div key={i} className="bd-info-field">
            <div className="bd-info-label">{f.label}</div>
            <div className={`bd-info-value ${f.mono ? 'bd-mono' : ''} ${f.missing ? 'bd-info-missing' : ''}`}>
              {f.link ? (
                <Link to={f.link as '/'} className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400">
                  {f.value} <ExternalLink size={11} />
                </Link>
              ) : (
                f.value || 'Not set'
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LinesCard({ entry }: { entry: JournalEntryWithLines }) {
  return (
    <section className="bd-card">
      <header className="bd-card-header">
        <div className="flex items-baseline gap-2.5">
          <div className="bd-card-title">Journal lines</div>
          <div className="bd-card-meta">{entry.lines.length} line{entry.lines.length === 1 ? '' : 's'}</div>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="bd-line-table">
          <thead>
            <tr>
              <th style={{ width: '50%' }}>Account</th>
              <th>Code</th>
              <th className="bd-col-num">Debit</th>
              <th className="bd-col-num">Credit</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <div className="bd-item-name">{line.accountName}</div>
                  {line.description && <div className="bd-item-desc">{line.description}</div>}
                </td>
                <td className="bd-mono bd-dim text-xs">{line.accountCode}</td>
                <td className={`bd-col-num bd-mono ${line.debit > 0 ? '' : 'bd-dim'}`}>
                  {line.debit > 0 ? fmtINR(line.debit) : '—'}
                </td>
                <td className={`bd-col-num bd-mono ${line.credit > 0 ? '' : 'bd-dim'}`}>
                  {line.credit > 0 ? fmtINR(line.credit) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bd-totals">
        <div className="bd-totals-grid">
          <div className="bd-totals-row">
            <span className="bd-totals-label">Total debit</span>
            <span className="bd-totals-val bd-mono">{fmtINR(Number(entry.totalDebit))}</span>
          </div>
          <div className="bd-totals-row">
            <span className="bd-totals-label">Total credit</span>
            <span className="bd-totals-val bd-mono">{fmtINR(Number(entry.totalCredit))}</span>
          </div>
          <div className="bd-totals-row bd-totals-grand">
            <span className="bd-totals-label">Difference</span>
            <span className="bd-totals-val bd-mono">{fmtINR(Math.abs(Number(entry.totalDebit) - Number(entry.totalCredit)))}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function DocumentTrailCard({ entry }: { entry: JournalEntryWithLines }) {
  return (
    <section className="bd-card">
      <header className="bd-card-header">
        <div className="bd-card-title">Document trail</div>
        <div className="bd-card-meta">Linked entities and reconciliation gaps</div>
      </header>
      <div className="p-4">
        <DocumentTrail entityType="journal_entry" entityId={entry.id} />
      </div>
    </section>
  );
}

// ─── Auto-Fix sidekick + Activity (mirror bill detail) ───────────────────────

function AutoFixSidekick({ gaps, dismissedIds, onDismiss, onFixAll }: { gaps: AuditGap[]; dismissedIds: Set<string>; onDismiss: (id: string) => void; onFixAll: () => void }) {
  const visible = gaps.filter((g) => !dismissedIds.has(g.id));
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  function handleFix(g: AuditGap) {
    setResolvingId(g.id);
    setTimeout(() => { g.onFix(); setResolvingId(null); }, 600);
  }
  return (
    <div className="bd-sidekick">
      <header className="bd-sidekick-header">
        <div className="flex items-start gap-2.5">
          <div className="bd-sidekick-icon"><Wand2 size={16} /></div>
          <div>
            <div className="bd-sidekick-title">Auto-Fix</div>
            <div className="bd-sidekick-sub">
              {visible.length === 0 ? 'No outstanding gaps' : `${visible.length} gap${visible.length === 1 ? '' : 's'} to resolve`}
            </div>
          </div>
        </div>
        {visible.length > 0 && (
          <button className="bd-fixall" onClick={onFixAll}>
            <Sparkles size={12} />Fix all
          </button>
        )}
      </header>
      <div>
        {visible.length === 0 ? (
          <div className="bd-gap-empty">
            <div className="bd-gap-empty-icon"><CircleCheck size={20} /></div>
            <div>All clear. This journal entry looks good.</div>
          </div>
        ) : (
          visible.map((g) => (
            <div key={g.id} className={`bd-gap-item ${resolvingId === g.id ? 'bd-gap-resolving' : ''}`}>
              <div className="bd-gap-marker"><span className="bd-gap-dot" /></div>
              <div className="flex-1">
                <div className="bd-gap-title">{g.title}</div>
                <div className="bd-gap-detail">{g.detail}</div>
                <div className="bd-gap-actions">
                  <button
                    className={`bd-gap-btn ${g.fixKind === 'primary' ? 'bd-gap-btn-primary' : ''}`}
                    onClick={() => handleFix(g)}
                    disabled={!!resolvingId}
                  >
                    <Sparkles size={11} />{g.fixLabel}
                  </button>
                  <button
                    className="bd-gap-btn bd-gap-btn-ghost"
                    onClick={() => onDismiss(g.id)}
                    disabled={!!resolvingId}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ActivityTimeline({ history }: { history: ActivityEvent[] }) {
  return (
    <div className="bd-card">
      <header className="bd-card-header">
        <div className="bd-card-title">Activity</div>
      </header>
      <ul className="py-2">
        {history.length === 0 ? (
          <li className="bd-activity-item">
            <div className="text-xs text-[color:var(--bd-ink-3)]">No activity recorded.</div>
          </li>
        ) : (
          history.map((h) => (
            <li key={h.id} className="bd-activity-item">
              <div className={`bd-activity-icon bd-activity-${h.icon}`}>
                {h.icon === 'alert' ? <AlertTriangle size={11} /> :
                 h.icon === 'check' ? <CircleCheck size={11} /> :
                 <ExternalLink size={11} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="bd-activity-line">
                  <span className="bd-activity-who">{h.who}</span>
                  <span className="bd-activity-action">{h.action}</span>
                </div>
                <div className="bd-activity-ts">{h.ts}</div>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

// ─── Gap derivation ───────────────────────────────────────────────────────────

function useDerivedGaps(entry: JournalEntryWithLines, isBalanced: boolean, sourceLink: string | null, onOpenSource: () => void): AuditGap[] {
  return useMemo<AuditGap[]>(() => {
    const out: AuditGap[] = [];
    if (!isBalanced) {
      out.push({
        id: 'g-balance',
        title: 'Entry is out of balance',
        detail: `Total debit ${fmtINR(Number(entry.totalDebit))} doesn't equal total credit ${fmtINR(Number(entry.totalCredit))}. This typically signals a posting bug — check the source document.`,
        fixLabel: sourceLink ? 'Open source' : 'Investigate',
        fixKind: 'primary',
        onFix: onOpenSource,
      });
    }
    if (entry.status === 'draft') {
      out.push({
        id: 'g-draft',
        title: 'Entry not posted yet',
        detail: 'This journal entry is in draft. Post it to reflect in trial balance and reports.',
        fixLabel: 'Post entry',
        fixKind: 'primary',
        onFix: () => undefined,
      });
    }
    if (!entry.sourceType) {
      out.push({
        id: 'g-source',
        title: 'No source document linked',
        detail: 'Manual entry without a linked source. If this should be tied to a bill, payment, or other document, link it for audit trail.',
        fixLabel: 'Link source',
        fixKind: 'secondary',
        onFix: () => undefined,
      });
    }
    return out;
  }, [entry, isBalanced, sourceLink, onOpenSource]);
}

function useDerivedActivity(entry: JournalEntryWithLines): ActivityEvent[] {
  return useMemo<ActivityEvent[]>(() => {
    const out: ActivityEvent[] = [];
    const fmt = (iso: string) => {
      const d = new Date(iso);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
        ' · ' +
        d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    };
    if (entry.status === 'posted') {
      out.push({ id: 'a-posted', ts: fmt(entry.createdAt), who: 'System', action: 'posted to general ledger', icon: 'check' });
    }
    if (entry.status === 'reversed') {
      out.push({ id: 'a-reversed', ts: fmt(entry.createdAt), who: 'System', action: 'entry reversed', icon: 'alert' });
    }
    out.push({
      id: 'a-created',
      ts: fmt(entry.createdAt),
      who: entry.createdBy ?? 'System',
      action: entry.sourceType ? `created from ${SOURCE_LABELS[entry.sourceType] ?? entry.sourceType}` : 'manually created',
      icon: 'eye',
    });
    return out;
  }, [entry]);
}
