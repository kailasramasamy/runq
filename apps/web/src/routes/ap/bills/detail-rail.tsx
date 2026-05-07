import { useState, useMemo } from 'react';
import { Sparkles, Wand2, CircleCheck, AlertTriangle, Check, Eye, Download } from 'lucide-react';
import type { PurchaseInvoiceWithDetails } from '@runq/types';

export interface AuditGap {
  id: string;
  title: string;
  detail: string;
  fixLabel: string;
  fixKind: 'primary' | 'secondary';
  onFix: () => void;
}

export interface ActivityEvent {
  id: string;
  ts: string;
  who: string;
  action: string;
  icon: 'alert' | 'check' | 'eye' | 'import';
}

interface SidekickProps {
  gaps: AuditGap[];
  dismissedIds: Set<string>;
  onDismiss: (id: string) => void;
  onFixAll: () => void;
}

export function AutoFixSidekick({ gaps, dismissedIds, onDismiss, onFixAll }: SidekickProps) {
  const visibleGaps = gaps.filter((g) => !dismissedIds.has(g.id));
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  function handleFix(g: AuditGap) {
    setResolvingId(g.id);
    setTimeout(() => {
      g.onFix();
      setResolvingId(null);
    }, 600);
  }

  return (
    <div className="bd-sidekick">
      <header className="bd-sidekick-header">
        <div className="flex items-start gap-2.5">
          <div className="bd-sidekick-icon">
            <Wand2 size={16} />
          </div>
          <div>
            <div className="bd-sidekick-title">Auto-Fix</div>
            <div className="bd-sidekick-sub">
              {visibleGaps.length === 0
                ? 'No outstanding gaps'
                : `runQ found ${visibleGaps.length} gap${visibleGaps.length === 1 ? '' : 's'} to resolve`}
            </div>
          </div>
        </div>
        {visibleGaps.length > 0 && (
          <button className="bd-fixall" onClick={onFixAll}>
            <Sparkles size={12} />
            Fix all
          </button>
        )}
      </header>

      <div>
        {visibleGaps.length === 0 ? (
          <div className="bd-gap-empty">
            <div className="bd-gap-empty-icon"><CircleCheck size={20} /></div>
            <div>All clear. No outstanding audit gaps on this bill.</div>
          </div>
        ) : (
          visibleGaps.map((g) => (
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
                    <Sparkles size={11} />
                    {g.fixLabel}
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

export function ActivityTimeline({ history }: { history: ActivityEvent[] }) {
  return (
    <div className="bd-card">
      <header className="bd-card-header">
        <div className="bd-card-title">Activity</div>
      </header>
      <ul className="py-2">
        {history.length === 0 ? (
          <li className="bd-activity-item">
            <div className="text-xs text-[color:var(--bd-ink-3)]">No activity yet.</div>
          </li>
        ) : (
          history.map((h) => (
            <li key={h.id} className="bd-activity-item">
              <div className={`bd-activity-icon bd-activity-${h.icon}`}>
                <ActivityIcon name={h.icon} />
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

function ActivityIcon({ name }: { name: ActivityEvent['icon'] }) {
  if (name === 'alert') return <AlertTriangle size={11} />;
  if (name === 'check') return <Check size={11} />;
  if (name === 'eye') return <Eye size={11} />;
  return <Download size={11} />;
}

// ─── Gap derivation ────────────────────────────────────────────────────────────

interface GapHandlers {
  onApprove: () => void;
  onRecordPayment: () => void;
  onApplyAdvance: () => void;
  onLinkPo: () => void;
}

export function useDerivedGaps(
  bill: PurchaseInvoiceWithDetails,
  advanceBalance: number,
  handlers: GapHandlers,
): AuditGap[] {
  return useMemo<AuditGap[]>(() => {
    const out: AuditGap[] = [];
    const status = bill.status;
    const balance = Number(bill.balanceDue);
    const paid = Number(bill.amountPaid);

    if (status === 'draft') {
      out.push({
        id: 'g-approve',
        title: 'Bill not approved yet',
        detail: 'Approve to make this bill available for payment.',
        fixLabel: 'Approve',
        fixKind: 'primary',
        onFix: handlers.onApprove,
      });
    }

    if (status !== 'paid' && status !== 'cancelled' && balance > 0) {
      const due = new Date(bill.dueDate).getTime();
      const days = Math.floor((Date.now() - due) / (1000 * 60 * 60 * 24));
      if (days > 0) {
        out.push({
          id: 'g-overdue',
          title: `${days} day${days === 1 ? '' : 's'} overdue`,
          detail: `Vendor payment is past due. Record a payment or schedule one to clear the gap.`,
          fixLabel: 'Record payment',
          fixKind: 'primary',
          onFix: handlers.onRecordPayment,
        });
      }
    }

    if (advanceBalance > 0 && balance > 0) {
      out.push({
        id: 'g-advance',
        title: 'Vendor has open advance',
        detail: `₹${advanceBalance.toLocaleString('en-IN')} sitting unallocated against this vendor. Apply to this bill to reduce the balance due.`,
        fixLabel: 'Apply advance',
        fixKind: 'secondary',
        onFix: handlers.onApplyAdvance,
      });
    }

    if (!bill.poId && status === 'draft') {
      out.push({
        id: 'g-po',
        title: 'No PO reference linked',
        detail: 'This bill is not matched to a Purchase Order. Link a PO for 3-way matching, or skip if this is a service expense.',
        fixLabel: 'Link PO',
        fixKind: 'secondary',
        onFix: handlers.onLinkPo,
      });
    }

    // Only surface this on drafts — once approved/paid/etc the bill is locked
    // and Edit isn't reachable, so suggesting a fix the user can't take is noise.
    if (!bill.placeOfSupply && status === 'draft') {
      out.push({
        id: 'g-pos',
        title: 'Missing Place of Supply',
        detail: 'GST returns require a Place of Supply on every bill. Edit the bill to set it.',
        fixLabel: 'Set place of supply',
        fixKind: 'secondary',
        onFix: handlers.onLinkPo,
      });
    }

    if (paid > 0 && balance > 0 && status !== 'partially_paid') {
      out.push({
        id: 'g-status',
        title: 'Status out of sync with payments',
        detail: `Payments totalling ₹${paid.toLocaleString('en-IN')} are recorded but bill status is "${status}".`,
        fixLabel: 'Recalculate',
        fixKind: 'secondary',
        onFix: () => undefined,
      });
    }

    return out;
  }, [bill, advanceBalance, handlers]);
}

// ─── Activity derivation ──────────────────────────────────────────────────────

export function useDerivedActivity(bill: PurchaseInvoiceWithDetails): ActivityEvent[] {
  return useMemo<ActivityEvent[]>(() => {
    const out: ActivityEvent[] = [];
    const fmt = (iso: string) => {
      const d = new Date(iso);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
        ' · ' +
        d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    if (bill.approvedAt) {
      out.push({ id: 'a-approved', ts: fmt(bill.approvedAt), who: 'Approver', action: 'approved this bill', icon: 'check' });
    }
    if (Number(bill.amountPaid) > 0) {
      out.push({ id: 'a-payment', ts: fmt(bill.updatedAt), who: 'System', action: `recorded payment of ₹${Number(bill.amountPaid).toLocaleString('en-IN')}`, icon: 'check' });
    }
    out.push({ id: 'a-created', ts: fmt(bill.createdAt), who: 'System', action: bill.sourceId ? 'imported from external source' : 'bill created', icon: 'import' });
    return out;
  }, [bill]);
}
