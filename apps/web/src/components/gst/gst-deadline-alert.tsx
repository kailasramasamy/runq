import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { AlertTriangle, CalendarClock, X } from 'lucide-react';
import { useAuth, canAccessFinanceModule } from '../../providers/auth-provider';
import { useGstDeadlineAlert, type GstDeadlineAlert as Alert } from '../../hooks/queries/use-gst-returns';
import { GstDeadlineModal, urgencyPhrase } from './gst-deadline-modal';

/**
 * App-wide GST filing deadline alert: a strip that escalates as the due date
 * approaches, plus a once-a-day modal in the last 48 hours and while overdue.
 *
 * Deliberately not a modal on every app open — a nag that appears for two
 * weeks straight gets dismissed without being read, which is worse than no
 * nag at all. The tiers come from the server (`alertTierFor`).
 */
export function GstDeadlineAlert() {
  const { user, hasModule } = useAuth();
  const canFile = canAccessFinanceModule(user?.role) && hasModule('finance');

  const { data } = useGstDeadlineAlert(canFile);
  const alert = data?.data ?? null;

  // The snooze is keyed to one return of one period, so a new period (or a
  // newly-urgent second return) always starts unsnoozed.
  const key = alert ? snoozeKey(user?.id, alert) : null;
  const [snoozedKey, setSnoozedKey] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
    setSnoozedKey(key && readSnooze(key) === today() ? key : null);
  }, [key]);

  if (!alert || !key) return null;

  const snoozedToday = snoozedKey === key;
  const critical = alert.tier === 'critical';

  const snooze = () => {
    writeSnooze(key, today());
    setSnoozedKey(key);
  };

  // A critical strip does not go away — the deadline has passed and the late
  // fee is still running. Only its modal can be silenced for the day.
  const showStrip = critical || !(snoozedToday || dismissed);
  const showModal = alert.tier !== 'strip' && !snoozedToday && !dismissed;

  return (
    <>
      {showStrip && (
        <DeadlineStrip
          alert={alert}
          onDismiss={critical ? undefined : snooze}
        />
      )}
      {showModal && (
        <GstDeadlineModal alert={alert} onSnooze={snooze} onClose={() => setDismissed(true)} />
      )}
    </>
  );
}

function DeadlineStrip({ alert, onDismiss }: { alert: Alert; onDismiss?: () => void }) {
  const navigate = useNavigate();
  const urgent = alert.daysLeft <= 0;
  const Icon = urgent ? AlertTriangle : CalendarClock;

  return (
    <div
      className="sticky top-0 z-40 flex items-center justify-between gap-3 px-4 py-2 text-[13px]"
      style={{
        background: urgent ? 'var(--neg-soft)' : 'var(--warn-soft)',
        color: urgent ? 'var(--neg)' : 'var(--warn)',
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon size={15} className="shrink-0" />
        <span className="truncate">
          <strong>{alert.returnLabel}</strong> for {alert.periodLabel}{' '}
          {urgencyPhrase(alert.daysLeft)}
          {urgent && alert.lateFeeEstimate > 0
            && ` — about ₹${alert.lateFeeEstimate.toLocaleString('en-IN')} in late fees so far`}.
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => navigate({
            to: alert.returnId ? `/finance/gst/returns/${alert.returnId}` : '/finance/gst/returns',
          })}
          className="rounded-md bg-black/5 px-3 py-1 text-[12px] font-semibold dark:bg-white/10"
        >
          Review
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss until tomorrow"
            className="rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Snooze (per user, per return, per period) ──────────────────────────
// A nag, not an audit trail — browser-local is the right home for it. Reads
// and writes are guarded because storage access throws outright in private
// windows and when site data is blocked.

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function snoozeKey(userId: string | undefined, alert: Alert): string {
  return `runq-gst-alert:${userId ?? 'anon'}:${alert.returnType}:${alert.period}`;
}

function readSnooze(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSnooze(key: string, day: string): void {
  try {
    localStorage.setItem(key, day);
  } catch {
    // Storage blocked — the alert simply reappears on the next load.
  }
}
