import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { useGstReadiness } from '../../hooks/queries/use-dashboard';
import {
  useMarkFiledExternally,
  type GstDeadlineAlert,
} from '../../hooks/queries/use-gst-returns';

/** "is due in 2 days" / "is due today" / "is 3 days overdue" */
export function urgencyPhrase(daysLeft: number): string {
  if (daysLeft > 0) return `is due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
  if (daysLeft === 0) return 'is due today';
  const late = Math.abs(daysLeft);
  return `is ${late} day${late === 1 ? '' : 's'} overdue`;
}

const STATUS_LINE: Record<string, string> = {
  pending: 'No draft has been generated yet.',
  draft: 'runQ has a draft ready for you to review.',
  validated: 'The draft passed pre-flight checks and is ready to upload.',
  uploaded: 'Uploaded to GSTN — it still needs to be filed with an EVC.',
  error: 'The last attempt failed. Open the return to see what went wrong.',
};

function formatDue(dueDate: string): string {
  return new Date(dueDate).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function GstDeadlineModal({ alert, onSnooze, onClose }: {
  alert: GstDeadlineAlert;
  onSnooze: () => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [declaringFiled, setDeclaringFiled] = useState(false);
  const overdue = alert.daysLeft < 0;

  const review = () => {
    const path = alert.returnId
      ? `/finance/gst/returns/${alert.returnId}`
      : '/finance/gst/returns';
    onClose();
    navigate({ to: path });
  };

  return (
    <Modal open onClose={onSnooze} title={`${alert.returnLabel} · ${alert.periodLabel}`} size="sm">
      <div className="space-y-4">
        <Headline alert={alert} overdue={overdue} />

        <div className="space-y-1 text-[13px]" style={{ color: 'var(--text-2)' }}>
          <div>Due {formatDue(alert.dueDate)}.</div>
          <div>{STATUS_LINE[alert.status] ?? STATUS_LINE.pending}</div>
          {overdue && alert.lateFeeEstimate > 0 && (
            <div style={{ color: 'var(--neg)' }}>
              Late fee so far is about ₹{alert.lateFeeEstimate.toLocaleString('en-IN')}.
            </div>
          )}
          <ReadinessLine />
        </div>

        {declaringFiled ? (
          <FiledOnPortalPanel
            alert={alert}
            onCancel={() => setDeclaringFiled(false)}
            onDone={onClose}
          />
        ) : (
          <Actions
            onReview={review}
            onSnooze={onSnooze}
            onDeclareFiled={() => setDeclaringFiled(true)}
            reviewLabel={`Review ${alert.returnLabel}`}
          />
        )}
      </div>
    </Modal>
  );
}

function Headline({ alert, overdue }: { alert: GstDeadlineAlert; overdue: boolean }) {
  const Icon = overdue ? AlertTriangle : CalendarClock;
  const tone = overdue || alert.daysLeft === 0 ? 'var(--neg)' : 'var(--warn)';
  const soft = overdue || alert.daysLeft === 0 ? 'var(--neg-soft)' : 'var(--warn-soft)';

  return (
    <div className="flex items-start gap-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: soft, color: tone }}
      >
        <Icon size={18} />
      </span>
      <p className="text-[15px] font-semibold leading-snug" style={{ color: 'var(--text-1)' }}>
        {alert.returnLabel} for {alert.periodLabel} {urgencyPhrase(alert.daysLeft)}.
      </p>
    </div>
  );
}

/**
 * Readiness is fetched only once the modal is on screen — it is a heavier
 * query than the deadline check and nobody needs it until they're deciding
 * whether to act now.
 */
function ReadinessLine() {
  const { data } = useGstReadiness();
  const score = data?.data?.score;
  if (score == null) return null;
  return <div>runQ has {score}% of the filing ready.</div>;
}

function Actions({ onReview, onSnooze, onDeclareFiled, reviewLabel }: {
  onReview: () => void;
  onSnooze: () => void;
  onDeclareFiled: () => void;
  reviewLabel: string;
}) {
  return (
    <div className="space-y-2 pt-1">
      <Button type="button" onClick={onReview} className="w-full">
        {reviewLabel}
      </Button>
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <button type="button" onClick={onSnooze} style={{ color: 'var(--text-2)' }}>
          Remind me tomorrow
        </button>
        <button type="button" onClick={onDeclareFiled} style={{ color: 'var(--text-2)' }}>
          I filed this on the portal
        </button>
      </div>
    </div>
  );
}

/**
 * The escape hatch. Without it the banner escalates forever against a return
 * the tenant already filed on gst.gov.in — which is how most of them still
 * file GSTR-3B today.
 */
function FiledOnPortalPanel({ alert, onCancel, onDone }: {
  alert: GstDeadlineAlert;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [arn, setArn] = useState('');
  const markFiled = useMarkFiledExternally();

  const confirm = () => {
    markFiled.mutate(
      { returnType: alert.returnType, period: alert.period, arn: arn.trim() || undefined },
      { onSuccess: onDone },
    );
  };

  return (
    <div
      className="space-y-3 rounded-lg border p-3"
      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
    >
      <p className="text-[12px]" style={{ color: 'var(--text-2)' }}>
        This marks {alert.returnLabel} for {alert.periodLabel} as filed in runQ and stops the
        reminders. Add the ARN if you have it.
      </p>
      <input
        value={arn}
        onChange={(e) => setArn(e.target.value.toUpperCase())}
        placeholder="ARN (optional)"
        className="w-full rounded-md border px-3 py-2 text-[13px]"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
      />
      {markFiled.isError && (
        <p className="text-[12px]" style={{ color: 'var(--neg)' }}>
          Could not save that. Please try again.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" onClick={confirm} loading={markFiled.isPending} className="flex-1">
          Mark as filed
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
