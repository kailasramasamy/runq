import { useState } from 'react';
import { PauseCircle, PlayCircle, X } from 'lucide-react';
import { Button, Input, useToast } from '@/components/ui';
import {
  usePauseContract, useResumeContract, useDeletePause,
  type ContractDetail,
} from '@/hooks/queries/use-hr-contracts';
import { fmtDate } from './contracts';

const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () =>
  new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

/**
 * Stopping and restarting the clock.
 *
 * Days accrue by themselves from the start date, so a stretch where nobody
 * turned up — rain, a stalled site, a festival — has to be taken out
 * explicitly or the crew is paid for it. Marking every one of those days as
 * leave, for every person, is the alternative this replaces.
 */
export function PauseBlock({ contract }: { contract: ContractDetail }) {
  const { toast } = useToast();
  const pause = usePauseContract();
  const remove = useDeletePause();
  const [open, setOpen] = useState(false);

  const state = contract.pauseState;
  const settled = contract.settlements.some((s) => s.status !== 'cancelled');
  const canChange = contract.status === 'active' && !settled;
  const paused = state.state === 'paused';
  /**
   * A pause that already has an end date is still "paused" today — work
   * restarts the morning after it. The strip has to say so, or resuming on
   * a Tuesday looks like it silently failed because the banner is still up.
   */
  const resumesOn = paused && state.until ? nextDay(state.until) : null;

  return (
    <div
      className={
        'rounded-lg border p-4 ' +
        (paused
          ? 'border-amber-500/40 bg-amber-500/10'
          : 'border-border')
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {paused
            ? <PauseCircle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            : <PlayCircle size={16} className="mt-0.5 shrink-0 text-muted-foreground" />}
          <div>
            <div className="text-sm font-semibold">
              {resumesOn
                ? `Paused · back on ${fmtDate(resumesOn)}`
                : paused
                  ? 'Work paused'
                  : state.state === 'pause_scheduled' ? 'Pause booked' : 'Work running'}
            </div>
            <p className="text-xs text-muted-foreground">{describe(state)}</p>
          </div>
        </div>
        {canChange && (
          <div className="flex gap-2">
            {paused ? (
              <ResumeButton contract={contract} scheduled={resumesOn} />
            ) : (
              <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
                <PauseCircle size={12} /> {open ? 'Cancel' : 'Pause work'}
              </Button>
            )}
          </div>
        )}
      </div>

      {open && canChange && !paused && (
        <PauseForm
          busy={pause.isPending}
          onSubmit={async (v) => {
            try {
              await pause.mutateAsync({ contractId: contract.id, ...v });
              setOpen(false);
              toast('Work paused — nothing accrues from that date', 'success');
            } catch (e: any) {
              toast(e?.message ?? 'Could not pause the work', 'error');
            }
          }}
        />
      )}

      {contract.pauses.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border/60 pt-3 text-xs">
          {contract.pauses.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">
                {fmtDate(p.fromDate)} → {p.toDate ? fmtDate(p.toDate) : 'not resumed'}
                {p.reason ? ` · ${p.reason}` : ''}
              </span>
              {canChange && (
                <button
                  type="button"
                  title="Remove this pause"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    try {
                      await remove.mutateAsync(p.id);
                      toast('Pause removed', 'success');
                    } catch (e: any) {
                      toast(e?.message ?? 'Could not remove the pause', 'error');
                    }
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function describe(state: ContractDetail['pauseState']): string {
  if (state.state === 'paused') {
    // The heading already carries the return date, so this says what the
    // pause costs rather than repeating it.
    return state.until
      ? `Nothing accrues from ${fmtDate(state.since)} to ${fmtDate(state.until)}.`
      + (state.reason ? ` ${state.reason}.` : '')
      : `Since ${fmtDate(state.since)}, with no date to resume yet.`
      + (state.reason ? ` ${state.reason}.` : '');
  }
  if (state.state === 'pause_scheduled') {
    return `Paused from ${fmtDate(state.from)}`
      + (state.until ? ` to ${fmtDate(state.until)}.` : ', until further notice.')
      + (state.reason ? ` ${state.reason}.` : '');
  }
  return 'Every day counts as worked unless marked otherwise.';
}

const nextDay = (iso: string) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * A pause usually starts on a date somebody already knows about and ends on
 * one they do not, so the end date is optional and `resume` fills it in.
 */
function PauseForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (v: { fromDate: string; toDate: string | null; reason: string | null }) => void;
}) {
  const [fromDate, setFromDate] = useState(tomorrow());
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');

  return (
    <div className="mt-3 space-y-2 rounded-md border border-dashed border-border p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input label="Pause from" type="date" value={fromDate}
          onChange={(e) => setFromDate(e.target.value)} />
        <Input label="Until (optional)" type="date" value={toDate}
          onChange={(e) => setToDate(e.target.value)} />
      </div>
      <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="Rain, site stalled, festival…" />
      <Button
        className="w-full"
        disabled={busy || !fromDate}
        onClick={() => onSubmit({
          fromDate,
          toDate: toDate || null,
          reason: reason.trim() || null,
        })}
      >
        {busy ? 'Pausing…' : 'Pause work'}
      </Button>
      <p className="text-xs text-muted-foreground">
        Leave the end date empty if you do not know when work restarts — resume it
        later and the pause closes the day before. Nothing accrues in between.
      </p>
    </div>
  );
}

/**
 * Resuming asks only for the first day back; the pause ends the day before.
 *
 * Once a resume date is booked the button changes rather than disappearing —
 * the date may still need moving, and "Resume work" on a pause that already
 * resumes tomorrow reads as though the last press did nothing.
 */
function ResumeButton({
  contract,
  scheduled,
}: {
  contract: ContractDetail;
  scheduled: string | null;
}) {
  const { toast } = useToast();
  const resume = useResumeContract();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(scheduled ?? today());

  if (!open) {
    return (
      <Button size="sm" variant={scheduled ? 'outline' : 'primary'} onClick={() => setOpen(true)}>
        <PlayCircle size={12} /> {scheduled ? 'Change date' : 'Resume work'}
      </Button>
    );
  }
  return (
    <div className="flex items-end gap-2">
      <Input label="First day back" type="date" value={date}
        onChange={(e) => setDate(e.target.value)} />
      <Button
        size="sm"
        disabled={resume.isPending}
        onClick={async () => {
          try {
            const r = await resume.mutateAsync({ contractId: contract.id, resumeDate: date });
            setOpen(false);
            // Resuming on the day the pause began removes it outright — it
            // would have covered no days.
            toast(r.data.removed ? 'Pause removed' : 'Work resumed', 'success');
          } catch (e: any) {
            toast(e?.message ?? 'Could not resume the work', 'error');
          }
        }}
      >
        {resume.isPending ? 'Saving…' : 'Resume'}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  );
}
