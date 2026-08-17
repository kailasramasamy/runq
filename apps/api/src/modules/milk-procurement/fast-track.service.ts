import { and, eq, inArray, isNull } from 'drizzle-orm';
import { mpNodes } from '@runq/db';
import type { Db, MpNodeRow } from '@runq/db';
import type { FastTrackInput } from '@runq/validators';
import { ForbiddenError, ValidationError } from '../../utils/errors';
import { ConsignmentService } from './consignment.service';
import { ShiftClosureService } from './shift-closure.service';
import { isPooled, poolSlots, type Slot } from './procurement-window';
import { isShiftClosed } from './shift-closure.queries';
import { MpPrincipal } from './access-scope';

type MilkType = NonNullable<MpNodeRow['defaultMilkType']>;
type Shift = 'am' | 'pm';

/** One milk type's worth of milk moving up the chain, QC carried from the pours. */
export interface FastTrackLeg {
  milkType: MilkType | null;
  qty: number;
  fat: number | null;
  snf: number | null;
  water: number | null;
}

/** What the chain will do for one VMCC — the unit the confirm sheet renders. */
export interface FastTrackVmccPlan {
  vmccId: string; vmccName: string;
  ccId: string; ccName: string;
  ppId: string; ppName: string;
  /** Shift stamped on the consignments; null when the VMCC dispatches pooled. */
  shift: Shift | null;
  /** Collection slots the VMCC close covers — named so the operator can see a
   * pooled node is about to close both halves of its day. */
  vmccSlots: Slot[];
  ccSlots: Slot[];
  legs: FastTrackLeg[];
  totalQty: number;
}

/** A VMCC left out of this run, and why — always reported, never silent. */
export interface FastTrackSkip { vmccId: string; vmccName: string; reason: string }

export interface FastTrackPlan {
  collectionDate: string;
  shift: Shift | null;
  vmccs: FastTrackVmccPlan[];
  skipped: FastTrackSkip[];
  totalQty: number;
}

/** Where a run stopped, if it did. Everything before it is committed and valid. */
export interface FastTrackFailure {
  vmccId: string; vmccName: string; step: string; message: string;
}

export interface FastTrackResult {
  plan: FastTrackPlan;
  /** Slots whose full chain reached the plant, as "vmccId:shift" — one entry
   * per planned slot, since a VMCC can send both its shifts in one run. */
  completed: string[];
  /** Litres landed in raw-milk stock at the plant. */
  receivedQty: number;
  failure?: FastTrackFailure;
}

/**
 * Single-site fast track — VMCC → CC → plant in one action.
 *
 * Some dairies run collection, chilling and processing on one premises with a
 * single operator covering all three tiers. The milk moves ten metres, but the
 * books still need the six steps a distributed network performs, because the
 * payout, the variance report and raw-milk stock all read those rows. Making
 * the operator walk six screens to record a move that took ten seconds is how
 * data stops being entered at all.
 *
 * This orchestrates the existing services rather than writing its own rows:
 * close the VMCC slot, dispatch, receive at the CC with identical figures
 * (variance 0), close the CC, dispatch onward, receive at the plant. Nothing
 * here can post milk that {@link ConsignmentService} would refuse on its own —
 * every guard (availability, closure-before-dispatch, node access) still runs.
 *
 * NOT atomic. Each underlying call owns its transaction, so a failure part-way
 * leaves earlier legs committed. That is deliberate: every intermediate state
 * is a legitimate one the operator can finish by hand on the normal screens,
 * and {@link FastTrackResult.failure} names exactly where it stopped. Faking
 * atomicity would mean rewriting six call sites to accept an outer transaction
 * and giving up their notification hooks.
 */
export class MpFastTrackService {
  private readonly consignments: ConsignmentService;
  private readonly closures: ShiftClosureService;

  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {
    this.consignments = new ConsignmentService(db, tenantId);
    this.closures = new ShiftClosureService(db, tenantId);
  }

  /**
   * Dry run: what a commit would do, with nothing written. Drives the confirm
   * sheet, so it must describe the real thing — same eligibility, same slots,
   * same litres the run will send.
   */
  async plan(input: FastTrackInput, principal: MpPrincipal): Promise<FastTrackPlan> {
    const chains = await this.eligibleChains(input, principal);
    const vmccs: FastTrackVmccPlan[] = [];
    const skipped: FastTrackSkip[] = [];

    for (const { vmcc, cc, pp } of chains) {
      const mismatch = cycleMismatch(vmcc, cc);
      if (mismatch) { skipped.push({ vmccId: vmcc.id, vmccName: vmcc.name, reason: mismatch }); continue; }
      // One entry per slot: naming a shift plans that one, omitting it plans
      // every slot already closed — which is how a VMCC that shut both AM and
      // PM sends the whole day in one confirmed action.
      for (const shift of await this.slotsToPlan(vmcc, input)) {
        const availability = await this.consignments.availability(
          vmcc.id, input.collectionDate, principal, shift ?? undefined);
        const legs: FastTrackLeg[] = availability.byMilkType
          .filter((r) => r.available > 0)
          .map((r) => ({
            milkType: r.milkType, qty: r.available,
            fat: r.avgFat, snf: r.avgSnf, water: r.avgWater,
          }));
        if (!legs.length) {
          // A centre with nothing collected simply isn't part of this run — a
          // plant with a dozen feeder VMCCs would otherwise bury the two that
          // have milk under ten "nothing here" rows. Milk that was collected and
          // has already gone is worth saying, because the operator expected it.
          if (availability.collected > 0) {
            skipped.push({
              vmccId: vmcc.id, vmccName: vmcc.name,
              reason: 'Already sent on — nothing left to dispatch',
            });
          }
          continue;
        }
        vmccs.push({
          vmccId: vmcc.id, vmccName: vmcc.name,
          ccId: cc.id, ccName: cc.name,
          ppId: pp.id, ppName: pp.name,
          shift,
          vmccSlots: poolSlots(vmcc.dispatchMode, input.collectionDate, shift ?? undefined),
          ccSlots: poolSlots(cc.dispatchMode, input.collectionDate, shift ?? undefined),
          legs,
          totalQty: round3(legs.reduce((t, x) => t + x.qty, 0)),
        });
      }
    }

    return {
      collectionDate: input.collectionDate,
      shift: input.shift ?? null,
      vmccs,
      skipped,
      totalQty: round3(vmccs.reduce((t, v) => t + v.totalQty, 0)),
    };
  }

  /**
   * Commit the chain. Re-plans first rather than trusting a plan posted by the
   * client: minutes may have passed since the preview, and the litres that
   * matter are the ones on hand now.
   */
  async run(
    input: FastTrackInput, userId: string | undefined, principal: MpPrincipal,
  ): Promise<FastTrackResult> {
    const plan = await this.plan(input, principal);
    if (!plan.vmccs.length) {
      return { plan, completed: [], receivedQty: 0 };
    }
    const completed: string[] = [];
    let receivedQty = 0;

    for (const v of plan.vmccs) {
      try {
        receivedQty = round3(receivedQty + await this.runOne(v, input, userId, principal));
        completed.push(`${v.vmccId}:${v.shift ?? 'pooled'}`);
      } catch (err) {
        return {
          plan, completed, receivedQty,
          failure: {
            vmccId: v.vmccId, vmccName: v.vmccName,
            step: (err as StepError).step ?? 'unknown',
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    }
    return { plan, completed, receivedQty };
  }

  /** The six steps, for one VMCC. Returns the litres landed at the plant. */
  private async runOne(
    v: FastTrackVmccPlan, input: FastTrackInput, userId: string | undefined, principal: MpPrincipal,
  ): Promise<number> {
    const date = input.collectionDate;
    const shift = v.shift ?? undefined;

    // 1. Freeze collection at the VMCC. The upsert is idempotent, so a slot the
    //    operator already closed by hand passes straight through.
    await step('close_vmcc', () =>
      this.closures.closeShift({ nodeId: v.vmccId, collectionDate: date, shift }, userId, principal));

    let landed = 0;
    for (const leg of v.legs) {
      // 2. VMCC → CC. QC is the weighted average of the pours behind it, which
      //    is what the manual dispatch screen prefills too.
      const out = await step('dispatch_to_cc', () => this.consignments.dispatch({
        kind: 'vmcc_to_cc',
        fromNodeId: v.vmccId, toNodeId: v.ccId,
        collectionDate: date, shift: v.shift, milkType: leg.milkType,
        dispatchQty: leg.qty, dispatchFat: leg.fat, dispatchSnf: leg.snf, dispatchWater: leg.water,
      }, userId, principal, { silent: true }));

      // 3. Receive it at the CC with the dispatch figures — one tank, one
      //    measurement, so a variance here would be invented.
      await step('receive_at_cc', () => this.consignments.receive(out.id, {
        receiptQty: leg.qty, receiptFat: leg.fat, receiptSnf: leg.snf, receiptWater: leg.water,
      }, userId, principal, { silent: true }));
    }

    // 4. Close the CC's own window — dispatch onward is gated on it.
    await step('close_cc', () =>
      this.closures.closeShift({ nodeId: v.ccId, collectionDate: date, shift }, userId, principal));

    for (const leg of v.legs) {
      // 5. CC → plant, exactly the litres just received. Deliberately not the
      //    CC's whole availability: milk that arrived by another route is the
      //    operator's call to send, not this action's.
      const out = await step('dispatch_to_pp', () => this.consignments.dispatch({
        kind: 'cc_to_pp',
        fromNodeId: v.ccId, toNodeId: v.ppId,
        collectionDate: date, shift: v.shift, milkType: leg.milkType,
        dispatchQty: leg.qty, dispatchFat: leg.fat, dispatchSnf: leg.snf, dispatchWater: leg.water,
      }, userId, principal, { silent: true }));

      // 6. Take it in at the plant — this is the step that posts the raw-milk
      //    batch manufacturing draws on.
      await step('receive_at_pp', () => this.consignments.receive(out.id, {
        receiptQty: leg.qty, receiptFat: leg.fat, receiptSnf: leg.snf, receiptWater: leg.water,
      }, userId, principal, { silent: true }));
      landed = round3(landed + leg.qty);
    }
    return landed;
  }

  /**
   * Which of a VMCC's slots this call covers.
   *
   * A pooled node has one: its whole window travels as a single untagged
   * tanker. A per-shift node named in the request covers that shift alone.
   *
   * Omitting the shift on a per-shift node means "everything ready", and that
   * is deliberately limited to slots the operator has already CLOSED. Sweeping
   * open slots too would close the evening shift at ten in the morning — the
   * accident this feature was gated behind a close to prevent. An explicitly
   * named shift keeps the old behaviour, closing as step 1, because the caller
   * has said which slot it means.
   */
  private async slotsToPlan(
    vmcc: MpNodeRow, input: FastTrackInput,
  ): Promise<(Shift | null)[]> {
    if (isPooled(vmcc.dispatchMode)) return [null];
    if (input.shift) return [input.shift];
    const closed: Shift[] = [];
    for (const shift of ['am', 'pm'] as const) {
      if (await isShiftClosed(this.db, {
        tenantId: this.tenantId, nodeId: vmcc.id,
        collectionDate: input.collectionDate, shift,
      })) closed.push(shift);
    }
    if (!closed.length) {
      throw new ValidationError('Close a shift before sending it on.');
    }
    return closed;
  }

  /**
   * The VMCC→CC→PP chains this principal may fast-track: the plant carries the
   * `singleSiteChain` flag and the caller can operate all three nodes.
   *
   * Operator scope is already descendant-expanded, so an operator assigned to
   * the plant covers the CCs and VMCCs beneath it — which is exactly the
   * single-site case. A VMCC-only operator has no CC or plant in scope and gets
   * nothing back.
   */
  private async eligibleChains(
    input: FastTrackInput, principal: MpPrincipal,
  ): Promise<{ vmcc: MpNodeRow; cc: MpNodeRow; pp: MpNodeRow }[]> {
    if (principal.kind !== 'all' && principal.kind !== 'operator') {
      throw new ForbiddenError('Not allowed for this node');
    }
    const scope = principal.kind === 'operator' ? principal.nodeIds : null;
    if (scope && !scope.size) return [];

    const nodes = await this.db.select().from(mpNodes).where(and(
      eq(mpNodes.tenantId, this.tenantId),
      eq(mpNodes.isActive, true),
      isNull(mpNodes.deletedAt),
      ...(scope ? [inArray(mpNodes.id, [...scope])] : []),
    ));
    return resolveChains(nodes, input.vmccNodeIds);
  }
}

/**
 * The eligible chains within a set of nodes: a VMCC whose parent is a CC whose
 * parent is a plant carrying `singleSiteChain`. `nodes` is already narrowed to
 * what the caller may operate, so a CC or plant outside their scope is simply
 * absent from the map and its VMCCs drop out — no separate permission pass.
 *
 * Pure, so the eligibility rules can be tested without a database.
 */
export function resolveChains(
  nodes: MpNodeRow[], vmccNodeIds?: string[],
): { vmcc: MpNodeRow; cc: MpNodeRow; pp: MpNodeRow }[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const wanted = vmccNodeIds ? new Set(vmccNodeIds) : null;

  const out: { vmcc: MpNodeRow; cc: MpNodeRow; pp: MpNodeRow }[] = [];
  for (const vmcc of nodes) {
    if (vmcc.nodeType !== 'vmcc') continue;
    if (wanted && !wanted.has(vmcc.id)) continue;
    const cc = vmcc.parentNodeId ? byId.get(vmcc.parentNodeId) : undefined;
    const pp = cc?.parentNodeId ? byId.get(cc.parentNodeId) : undefined;
    if (!cc || cc.nodeType !== 'cc' || !pp || pp.nodeType !== 'pp') continue;
    if (!pp.singleSiteChain) continue;
    out.push({ vmcc, cc, pp });
  }
  // Stable order so the confirm sheet and the run agree on what runs first.
  return out.sort((a, b) => a.vmcc.name.localeCompare(b.vmcc.name));
}

/**
 * A VMCC and its CC must close on the same kind of cycle. A pooled VMCC sends
 * one untagged tanker; a per-shift CC files an untagged receipt under its AM
 * slot, so PM milk would silently join the morning pool — and the reverse leaves
 * a shift-tagged receipt outside the pool the CC is about to dispatch. Neither
 * is recoverable without editing consignments, so these are skipped and sent by
 * hand instead of half-run.
 */
export function cycleMismatch(vmcc: MpNodeRow, cc: MpNodeRow): string | null {
  if (isPooled(vmcc.dispatchMode) === isPooled(cc.dispatchMode)) return null;
  return 'This centre and its chilling centre close on different cycles — send this one by hand';
}

interface StepError extends Error { step?: string }

/** Run a chain step, tagging any failure with the step it died on so the
 * operator is told where the chain stopped, not just that it did. */
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    (err as StepError).step = name;
    throw err;
  }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
