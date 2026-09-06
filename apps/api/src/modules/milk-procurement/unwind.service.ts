import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { mpConsignments, mpNodes, mpPours, mpRejections } from '@runq/db';
import type { Db, MpConsignmentRow } from '@runq/db';
import type { UnwindInput } from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { ConsignmentService } from './consignment.service';
import { PourService } from './pour.service';
import { ShiftClosureService } from './shift-closure.service';
import { MpPrincipal, assertNodeAccess } from './access-scope';

/** One thing the unwind will do, in the order it must happen. */
export interface UnwindStep {
  kind: 'cancel_receipt' | 'cancel_dispatch' | 'reopen_shift' | 'reverse_pour';
  /** What it acts on — a document number, or a farmer's name for a pour. */
  label: string;
  detail: string;
  qtyLitres: number;
  consignmentId?: string;
  pourId?: string;
  nodeId?: string;
  shift?: 'am' | 'pm';
  /** Why this step cannot run. A plan with any blocker refuses to run at all. */
  blocked?: string;
}

export interface UnwindPlan {
  steps: UnwindStep[];
  totalQty: number;
  /** True when any step is blocked — the preview says why, and run() refuses. */
  blocked: boolean;
  includePours: boolean;
}

export interface UnwindResult {
  plan: UnwindPlan;
  /** Steps actually committed, in order. */
  completed: string[];
}

/**
 * Undo a load end to end, from one screen.
 *
 * The pieces already existed — cancel receipt, cancel dispatch, reopen, reverse
 * pour — but an operator had to find each of them in a different app mode, in
 * an order the guards enforce but nothing explains, and several of those
 * screens only show today. A load entered twice on Friday was, in practice,
 * uncorrectable by the person who entered it.
 *
 * Mirrors `MpFastTrackService`: plan, show the operator exactly what will
 * happen, then commit. The plan is rebuilt inside run() so what executes is the
 * state on the ground now, not what the preview showed minutes ago.
 */
export class MpUnwindService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async plan(input: UnwindInput, principal: MpPrincipal): Promise<UnwindPlan> {
    const anchor = await this.load(input.consignmentId);
    assertNodeAccess(principal, anchor.fromNodeId);
    const names = await this.nodeNames();
    const steps: UnwindStep[] = [];

    // Downstream first: milk cannot be taken off a node that has already sent
    // it on, so anything this load became has to go before the load itself.
    for (const leg of await this.downstreamOf(anchor, principal)) {
      steps.push(...this.legSteps(leg, names, await this.blockerFor(leg)));
    }
    steps.push(...this.legSteps(anchor, names, await this.blockerFor(anchor)));

    if (input.includePours && anchor.kind === 'vmcc_to_cc') {
      steps.push(...await this.pourSteps(anchor, names));
    }

    return {
      steps,
      totalQty: round3(Number(anchor.dispatchQty ?? 0)),
      blocked: steps.some((s) => s.blocked),
      includePours: input.includePours,
    };
  }

  /**
   * Commit the plan, all or nothing.
   *
   * A half-unwound chain is worse than an untouched one: it leaves litres at a
   * tier with nothing behind them, which is the exact mess this feature exists
   * to clean up. So a single blocked step aborts everything.
   */
  async run(
    input: UnwindInput, userId: string | undefined, principal: MpPrincipal,
  ): Promise<UnwindResult> {
    const plan = await this.plan(input, principal);
    if (plan.blocked) {
      const why = plan.steps.find((s) => s.blocked)!;
      throw new ConflictError(`${why.label}: ${why.blocked}`);
    }
    if (!plan.steps.length) throw new ConflictError('Nothing to undo on this load');
    const consignments = new ConsignmentService(this.db, this.tenantId);
    const pours = new PourService(this.db, this.tenantId);
    const shifts = new ShiftClosureService(this.db, this.tenantId);
    const completed: string[] = [];
    for (const step of plan.steps) {
      switch (step.kind) {
        case 'cancel_receipt':
          await consignments.cancelReceipt(step.consignmentId!, userId, principal);
          break;
        case 'cancel_dispatch':
          await consignments.cancelDispatch(step.consignmentId!, principal);
          break;
        case 'reopen_shift':
          // The node's own mode decides which slots reopen; a per-shift VMCC
          // needs the leg's shift named, a pooled one ignores it.
          await shifts.reopenShift(
            { nodeId: step.nodeId!, collectionDate: step.detail, shift: step.shift },
            userId, principal);
          break;
        case 'reverse_pour':
          await pours.reverse(step.pourId!, principal);
          break;
      }
      completed.push(step.label);
    }
    return { plan, completed };
  }

  /**
   * The legs this load became. A VMCC→CC leg feeds the CC's onward tankers of
   * the same milk on the same date; a CC→PP leg is the end of the line.
   *
   * A tanker blending several centres' milk is listed but blocked: cancelling
   * it to remove one VMCC's duplicate would throw away everyone else's milk
   * too, and no automated flow should make that call.
   */
  private async downstreamOf(
    anchor: MpConsignmentRow, principal: MpPrincipal,
  ): Promise<MpConsignmentRow[]> {
    if (anchor.kind !== 'vmcc_to_cc' || anchor.status !== 'received') return [];
    // Only what actually stands in the way. Cancelling a receipt needs the
    // destination to still hold those litres, and a CC holding two loads of a
    // type but forwarding one has the headroom already — taking its onward
    // tanker down as well cancelled a delivery nobody asked to cancel, and the
    // operator had to notice and re-dispatch it.
    const avail = await new ConsignmentService(this.db, this.tenantId).availability(
      anchor.toNodeId, anchor.collectionDate, principal,
      anchor.shift ?? undefined, anchor.milkType ?? undefined);
    if (avail.available - Number(anchor.receiptQty ?? 0) >= -1e-6) return [];
    return this.db.select().from(mpConsignments).where(and(
      eq(mpConsignments.tenantId, this.tenantId),
      eq(mpConsignments.kind, 'cc_to_pp'),
      eq(mpConsignments.fromNodeId, anchor.toNodeId),
      eq(mpConsignments.collectionDate, anchor.collectionDate),
      ne(mpConsignments.status, 'reversed'),
      ...(anchor.milkType ? [eq(mpConsignments.milkType, anchor.milkType)] : []),
    ));
  }

  /** Un-receive then un-dispatch, skipping whichever half has already happened. */
  private legSteps(
    c: MpConsignmentRow, names: Map<string, string>, blocked: string | undefined,
  ): UnwindStep[] {
    const from = names.get(c.fromNodeId) ?? '—';
    const to = names.get(c.toNodeId) ?? '—';
    const out: UnwindStep[] = [];
    if (c.status === 'received') {
      out.push({
        kind: 'cancel_receipt', label: c.consignmentNo,
        detail: `Un-receive at ${to}`, qtyLitres: round3(Number(c.receiptQty ?? 0)),
        consignmentId: c.id, blocked,
      });
    }
    if (c.status !== 'reversed') {
      out.push({
        kind: 'cancel_dispatch', label: c.consignmentNo,
        detail: `Cancel dispatch from ${from}`, qtyLitres: round3(Number(c.dispatchQty ?? 0)),
        consignmentId: c.id, blocked,
      });
    }
    return out;
  }

  /**
   * Why a leg cannot be undone. Checked here so the operator reads it in the
   * preview rather than meeting it half way through a run — the same conditions
   * `cancelReceipt` enforces, asked in advance.
   */
  private async blockerFor(c: MpConsignmentRow): Promise<string | undefined> {
    const [rejected] = await this.db.select({ n: sql<number>`count(*)::int` }).from(mpRejections)
      .where(and(
        eq(mpRejections.tenantId, this.tenantId),
        eq(mpRejections.subjectType, 'consignment'),
        eq(mpRejections.subjectId, c.id),
        isNull(mpRejections.reversedAt),
      ));
    if ((rejected?.n ?? 0) > 0) {
      return 'A quality rejection is recorded on this load — undo that first';
    }
    if (c.kind === 'cc_to_pp' && await this.blendsOtherSources(c)) {
      return 'This tanker also carries milk from other centres — cancel it by hand';
    }
    return undefined;
  }

  /** More than one source VMCC fed the CC that day for this milk type. */
  private async blendsOtherSources(c: MpConsignmentRow): Promise<boolean> {
    const rows = await this.db.selectDistinct({ from: mpConsignments.fromNodeId })
      .from(mpConsignments).where(and(
        eq(mpConsignments.tenantId, this.tenantId),
        eq(mpConsignments.kind, 'vmcc_to_cc'),
        eq(mpConsignments.toNodeId, c.fromNodeId),
        eq(mpConsignments.collectionDate, c.collectionDate),
        eq(mpConsignments.status, 'received'),
        ...(c.milkType ? [eq(mpConsignments.milkType, c.milkType)] : []),
      ));
    return rows.length > 1;
  }

  /** Reopen the slot, then reverse each pour behind the leg. Opt-in only. */
  private async pourSteps(
    anchor: MpConsignmentRow, names: Map<string, string>,
  ): Promise<UnwindStep[]> {
    const rows = await this.db.select({
      id: mpPours.id, qty: mpPours.qtyLitres, farmerId: mpPours.farmerId,
    }).from(mpPours).where(and(
      eq(mpPours.tenantId, this.tenantId),
      eq(mpPours.nodeId, anchor.fromNodeId),
      eq(mpPours.collectionDate, anchor.collectionDate),
      eq(mpPours.status, 'recorded'),
      ...(anchor.shift ? [eq(mpPours.shift, anchor.shift)] : []),
      ...(anchor.milkType ? [eq(mpPours.milkType, anchor.milkType)] : []),
    ));
    if (!rows.length) return [];
    const node = names.get(anchor.fromNodeId) ?? '—';
    // A slot holding more milk than this leg carried cannot say which pours
    // were "behind" it — nothing links a pour to a consignment. Reversing the
    // lot took a farmer's real morning delivery along with the duplicate, so
    // the option is refused rather than guessed at.
    const slotQty = round3(rows.reduce((sum, r) => sum + Number(r.qty), 0));
    const legQty = round3(Number(anchor.dispatchQty ?? 0));
    if (Math.abs(slotQty - legQty) > 1e-6) {
      return [{
        kind: 'reverse_pour', label: node,
        detail: `Remove the farmer entries at ${node}`,
        qtyLitres: slotQty,
        blocked: `This slot holds ${slotQty} L but the load carried ${legQty} L`
          + ' — remove the extra entries from the collection screen instead',
      }];
    }
    return [
      {
        kind: 'reopen_shift', label: node, detail: anchor.collectionDate,
        qtyLitres: 0, nodeId: anchor.fromNodeId, shift: anchor.shift ?? undefined,
      },
      ...rows.map((r) => ({
        kind: 'reverse_pour' as const,
        label: r.id.slice(0, 8),
        detail: `Reverse pour at ${node}`,
        qtyLitres: round3(Number(r.qty)),
        pourId: r.id,
      })),
    ];
  }

  private async nodeNames(): Promise<Map<string, string>> {
    const rows = await this.db.select({ id: mpNodes.id, name: mpNodes.name })
      .from(mpNodes).where(eq(mpNodes.tenantId, this.tenantId));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private async load(id: string): Promise<MpConsignmentRow> {
    const [row] = await this.db.select().from(mpConsignments)
      .where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.id, id)));
    if (!row) throw new NotFoundError('Consignment not found');
    if (row.status === 'reversed') throw new ConflictError('This load is already cancelled');
    return row;
  }
}

function round3(n: number): number { return Math.round(n * 1000) / 1000; }
