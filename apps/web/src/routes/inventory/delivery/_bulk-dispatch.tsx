/**
 * Working the whole Awaiting-dispatch queue in one action — the web twin of
 * the mobile bulk screen, against the same two endpoints.
 *
 * Two ways out of a long queue, because there are two reasons it gets long:
 *
 *   * Ship it. Pages the server-side queue — not the 100 rows the tab loads —
 *     and hands ids over 25 at a time. The server ships each batch strictly
 *     one after another (two dispatches in flight race for the same batches),
 *     so chunking is also what keeps a request inside a proxy timeout and
 *     gives us something to show progress against. Stop takes effect between
 *     batches; what has posted stays posted — these are real stock movements,
 *     not a transaction to roll back.
 *   * Waive it. For invoices raised before stock was ever tracked there is
 *     nothing on hand to draw, and inventing an opening balance to make them
 *     dispatchable would fabricate a warehouse history. Waiving records the
 *     honest position: no delivery note, no ledger row, no COGS.
 *
 * A dispatched invoice leaves the queue, so page 1 refills as we work — but a
 * *skipped* one sits there forever. Tracking handled ids is what stops the
 * loop spinning on them, and stepping the page when a whole page is already
 * handled is what lets a backlog of >100 skips still terminate.
 */

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Truck, Ban } from 'lucide-react';
import { Button, Modal, useToast } from '@/components/ui';
import {
  bulkDispatch, fetchPendingDispatches, waiveDispatch,
} from '@/hooks/queries/use-sales-dispatch';

/** Ids per request. The server's own cap — raising it only earns a 400. */
const BATCH = 25;

interface Progress { done: number; total: number; shipped: number; skipped: number; failed: number }
interface Problem { invoiceNumber: string; reason: string; failed: boolean }

const ZERO: Progress = { done: 0, total: 0, shipped: 0, skipped: 0, failed: 0 };
const today = () => new Date().toISOString().slice(0, 10);

type Phase = 'idle' | 'confirm' | 'waive' | 'running' | 'report';

export function BulkDispatchActions({ from, total }: { from?: string; total: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<Progress>(ZERO);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [waiving, setWaiving] = useState(false);
  const [stopping, setStopping] = useState(false);
  const cancelled = useRef(false);

  async function shipAll() {
    cancelled.current = false;
    setStopping(false);
    setProgress({ ...ZERO, total });
    setProblems([]);
    setFatal(null);
    setPhase('running');
    const run = await runQueue(from, total, setProgress, () => cancelled.current);
    setProgress(run.progress);
    setProblems(run.problems);
    setFatal(run.fatal);
    setPhase('report');
    if (run.progress.shipped > 0) qc.invalidateQueries({ queryKey: ['inv'] });
  }

  async function waiveAll() {
    setWaiving(true);
    try {
      const { waived } = await waiveDispatch(today());
      qc.invalidateQueries({ queryKey: ['inv'] });
      toast(
        waived === 0 ? 'Nothing to clear'
          : `${waived} ${waived === 1 ? 'invoice' : 'invoices'} cleared from the queue`,
        waived === 0 ? 'info' : 'success',
      );
      setPhase('idle');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not clear the queue', 'error');
    } finally {
      setWaiving(false);
    }
  }

  return (
    <>
      <Button variant="primary" className="h-8 px-2.5 text-[12px]"
        onClick={() => setPhase('confirm')} disabled={total === 0}>
        <Truck size={13} /> Dispatch all
      </Button>
      <Button variant="secondary" className="h-8 px-2.5 text-[12px]"
        onClick={() => setPhase('waive')} disabled={total === 0}>
        <Ban size={13} /> Clear without stock
      </Button>

      <ConfirmShip open={phase === 'confirm'} total={total}
        onClose={() => setPhase('idle')} onConfirm={shipAll} />
      <ConfirmWaive open={phase === 'waive'} busy={waiving}
        onClose={() => setPhase('idle')} onConfirm={waiveAll} />
      <RunningDialog open={phase === 'running'} progress={progress} stopping={stopping}
        onStop={() => { cancelled.current = true; setStopping(true); }} />
      <ReportDialog open={phase === 'report'} progress={progress} problems={problems}
        fatal={fatal} onClose={() => setPhase('idle')} />
    </>
  );
}

/** Pages the queue and ships it, batch by batch. */
async function runQueue(
  from: string | undefined,
  seedTotal: number,
  onProgress: (p: Progress) => void,
  isCancelled: () => boolean,
): Promise<{ progress: Progress; problems: Problem[]; fatal: string | null }> {
  const handled = new Set<string>();
  const numberOf = new Map<string, string>();
  const problems: Problem[] = [];
  let p: Progress = { ...ZERO, total: seedTotal };
  let page = 1;

  try {
    while (!isCancelled()) {
      const queue = await fetchPendingDispatches({ from, page, limit: 100 });
      if (queue.data.length === 0) break;
      // Only a live page can be trusted for the count — invoices may have been
      // raised or shipped elsewhere since the tab loaded.
      p = { ...p, total: Math.max(p.total, queue.total) };
      for (const r of queue.data) numberOf.set(r.id, r.invoiceNumber);

      const batch = queue.data.filter((r) => !handled.has(r.id)).slice(0, BATCH);
      if (batch.length === 0) { page++; continue; } // Whole page skipped earlier.
      batch.forEach((r) => handled.add(r.id));

      const results = await bulkDispatch(batch.map((r) => r.id));
      p = tally(p, results, numberOf, problems);
      onProgress(p);
    }
  } catch (e) {
    // The batch call itself failed — auth, network, a 400. Whatever shipped
    // before this point is still shipped, so report rather than pretend.
    return { progress: p, problems, fatal: e instanceof Error ? e.message : 'Request failed' };
  }
  return { progress: p, problems, fatal: null };
}

function tally(
  p: Progress,
  results: Awaited<ReturnType<typeof bulkDispatch>>,
  numberOf: Map<string, string>,
  problems: Problem[],
): Progress {
  let { done, shipped, skipped, failed } = p;
  for (const { invoiceId, outcome } of results) {
    done++;
    if (outcome.status === 'dispatched') {
      shipped++;
      // Shipped, but not in full: the remainder is a draft someone must work
      // once stock lands, and it leaves the queue with this invoice.
      if (outcome.shortfall) {
        problems.push({
          invoiceNumber: numberOf.get(invoiceId) ?? '—',
          reason: `${outcome.shortfall.reason} — draft ${outcome.shortfall.dnNo}`,
          failed: false,
        });
      }
      continue;
    }
    const isFailure = outcome.status === 'failed';
    if (isFailure) failed++; else skipped++;
    problems.push({
      invoiceNumber: numberOf.get(invoiceId) ?? '—',
      reason: 'reason' in outcome ? outcome.reason : 'No reason given',
      failed: isFailure,
    });
  }
  return { ...p, done, shipped, skipped, failed };
}

function ConfirmShip({ open, total, onClose, onConfirm }: {
  open: boolean; total: number; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose}
      title={`Dispatch ${total} ${total === 1 ? 'invoice' : 'invoices'}?`}>
      <p className="text-[13px]" style={{ color: 'var(--text-1)' }}>
        Each invoice gets a delivery note dated to its own invoice date. Stock moves
        FEFO from the default warehouse and the cost of goods posts to that date.
      </p>
      <p className="mt-2.5 text-[12px]" style={{ color: 'var(--text-3)' }}>
        Backdating puts those costs into months you may already have reported.
        Invoices with nothing stocked to ship, or that already have a delivery
        note, are left alone.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={onConfirm}><Truck size={14} /> Dispatch all</Button>
      </div>
    </Modal>
  );
}

function ConfirmWaive({ open, busy, onClose, onConfirm }: {
  open: boolean; busy: boolean; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Clear the queue without stock?">
      <p className="text-[13px]" style={{ color: 'var(--text-1)' }}>
        Marks every invoice up to today as settled outside inventory. No stock moves,
        no delivery notes, no cost postings — the invoices simply stop asking to be
        dispatched.
      </p>
      <p className="mt-2.5 text-[12px]" style={{ color: 'var(--text-3)' }}>
        Use this once, when starting to track stock: everything billed before today
        is written off the queue, and tomorrow starts clean. Invoices raised from
        tomorrow will queue as normal.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="destructive" onClick={onConfirm} disabled={busy}>
          {busy ? 'Clearing…' : 'Clear queue'}
        </Button>
      </div>
    </Modal>
  );
}

function RunningDialog({ open, progress: p, stopping, onStop }: {
  open: boolean; progress: Progress; stopping: boolean; onStop: () => void;
}) {
  const pct = p.total === 0 ? 0 : Math.min(100, Math.round((p.done / p.total) * 100));
  return (
    // Closing means stopping — the run itself only breaks between batches, so
    // the dialog stays up until the one in flight lands.
    <Modal open={open} onClose={onStop} title="Dispatching">
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full transition-[width]"
          style={{ width: `${pct}%`, background: 'var(--accent-text)' }} />
      </div>
      <p className="mt-3 text-[13px] font-medium tabular-nums" style={{ color: 'var(--text-1)' }}>
        {p.done} of {p.total}
      </p>
      <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-3)' }}>
        {p.shipped} dispatched
        {p.skipped > 0 && ` · ${p.skipped} skipped`}
        {p.failed > 0 && ` · ${p.failed} failed`}
      </p>
      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onStop} disabled={stopping}>
          {stopping ? 'Finishing batch…' : 'Stop'}
        </Button>
      </div>
    </Modal>
  );
}

function ReportDialog({ open, progress: p, problems, fatal, onClose }: {
  open: boolean; progress: Progress; problems: Problem[]; fatal: string | null; onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose}
      title={p.shipped > 0 ? `Dispatched ${p.shipped}` : 'Nothing dispatched'}>
      {fatal && (
        <p className="mb-2.5 text-[13px]" style={{ color: 'var(--neg)' }}>
          Stopped early: {fatal}
        </p>
      )}
      <p className="text-[13px]" style={{ color: 'var(--text-1)' }}>
        {p.shipped} delivery notes posted
        {p.skipped > 0 && `, ${p.skipped} skipped`}
        {p.failed > 0 && `, ${p.failed} failed`}.
      </p>
      {problems.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide"
            style={{ color: 'var(--text-3)' }}>Still in the queue</p>
          <div className="max-h-64 overflow-y-auto">
            {problems.slice(0, 50).map((x, i) => (
              <p key={`${x.invoiceNumber}-${i}`} className="mb-1 text-[12px]"
                style={{ color: x.failed ? 'var(--neg)' : 'var(--text-3)' }}>
                <span className="font-mono">{x.invoiceNumber}</span> — {x.reason}
              </p>
            ))}
            {problems.length > 50 && (
              <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
                …and {problems.length - 50} more
              </p>
            )}
          </div>
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <Button variant="primary" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
