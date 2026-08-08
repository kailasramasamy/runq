import { and, eq, isNull } from 'drizzle-orm';
import { mpShiftClosures, mpNodes } from '@runq/db';
import type { Db } from '@runq/db';
import type { CloseShiftInput, ReopenShiftInput } from '@runq/validators';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { MpPrincipal, assertNodeAccess } from './access-scope';
import {
  poolSlots, statusSlots, type Slot, type DispatchMode,
} from './procurement-window';

type Shift = 'am' | 'pm';

/** One slot of the node's window and whether collection is closed on it. */
export interface ShiftSlotStatus { date: string; shift: Shift; closed: boolean }

/**
 * `am`/`pm` are the flat view every existing client reads: the closed-state of
 * each slot keyed by its shift. For an overnight node `pm` is YESTERDAY's PM, so
 * `am && pm` still means "the whole pool is closed" — which is why `slots`
 * carries the dates explicitly. Prefer `slots` in new code; the flat pair cannot
 * express a two-day window.
 */
export interface ShiftStatus {
  am: boolean;
  pm: boolean;
  mode: DispatchMode;
  slots: ShiftSlotStatus[];
}

interface NodeMode { mode: DispatchMode }

/**
 * Per-slot collection close. Closing freezes pours/edits for a (node, date,
 * shift) and gates dispatch. What a close covers is the node's `dispatchMode`:
 * `per_shift` closes the named shift alone, `day` closes today's AM+PM, and
 * `overnight` closes the pool window (yesterday PM + today AM) so the gate spans
 * two calendar days.
 *
 * Reopen is always allowed, including after a dispatch: an operator who spots a
 * missed VMCC or a wrong reading has to be able to reopen, correct it, and send
 * the balance on. The already-dispatched consignments are left standing — a
 * correction that drops collected below what has left is a real-world mismatch
 * the operator must resolve by editing or reversing that consignment.
 */
export class ShiftClosureService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async closeShift(input: CloseShiftInput, userId: string | undefined, principal: MpPrincipal): Promise<ShiftStatus> {
    assertNodeAccess(principal, input.nodeId);
    const node = await this.loadNode(input.nodeId);
    const slots = this.closeSlots(node, input.collectionDate, input.shift);
    const now = new Date();
    await this.db.insert(mpShiftClosures)
      .values(slots.map((s) => ({
        tenantId: this.tenantId, nodeId: input.nodeId,
        collectionDate: s.date, shift: s.shift,
        closedBy: userId ?? null, closedAt: now,
      })))
      .onConflictDoUpdate({
        target: [mpShiftClosures.tenantId, mpShiftClosures.nodeId, mpShiftClosures.collectionDate, mpShiftClosures.shift],
        set: { closedBy: userId ?? null, closedAt: now, reopenedAt: null, reopenedBy: null, updatedAt: now },
      });
    return this.status(input.nodeId, input.collectionDate, principal);
  }

  async reopenShift(input: ReopenShiftInput, userId: string | undefined, principal: MpPrincipal): Promise<ShiftStatus> {
    assertNodeAccess(principal, input.nodeId);
    const node = await this.loadNode(input.nodeId);
    const slots = this.closeSlots(node, input.collectionDate, input.shift);
    const now = new Date();
    for (const s of slots) {
      await this.db.update(mpShiftClosures)
        .set({ reopenedAt: now, reopenedBy: userId ?? null, updatedAt: now })
        .where(and(
          eq(mpShiftClosures.tenantId, this.tenantId), eq(mpShiftClosures.nodeId, input.nodeId),
          eq(mpShiftClosures.collectionDate, s.date), eq(mpShiftClosures.shift, s.shift),
          isNull(mpShiftClosures.reopenedAt),
        ));
    }
    return this.status(input.nodeId, input.collectionDate, principal);
  }

  /** Closed-state of every slot in the node's current window. */
  async status(nodeId: string, date: string, principal: MpPrincipal): Promise<ShiftStatus> {
    assertNodeAccess(principal, nodeId);
    const node = await this.loadNode(nodeId);
    const out: ShiftStatus = { am: false, pm: false, mode: node.mode, slots: [] };
    for (const s of statusSlots(node.mode, date)) {
      const [row] = await this.db.select({ id: mpShiftClosures.id }).from(mpShiftClosures)
        .where(and(
          eq(mpShiftClosures.tenantId, this.tenantId), eq(mpShiftClosures.nodeId, nodeId),
          eq(mpShiftClosures.collectionDate, s.date), eq(mpShiftClosures.shift, s.shift),
          isNull(mpShiftClosures.reopenedAt),
        )).limit(1);
      out.slots.push({ date: s.date, shift: s.shift, closed: !!row });
      if (row) out[s.shift] = true;
    }
    return out;
  }

  private async loadNode(nodeId: string): Promise<NodeMode> {
    const [node] = await this.db.select({ dispatchMode: mpNodes.dispatchMode })
      .from(mpNodes).where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, nodeId)));
    if (!node) throw new NotFoundError('Node not found');
    return { mode: node.dispatchMode };
  }

  /** Slots written by a close/reopen — the node's mode decides, not the caller. */
  private closeSlots(node: NodeMode, anchorDate: string, inputShift?: Shift): Slot[] {
    if (node.mode === 'per_shift' && !inputShift) {
      throw new ValidationError('This node closes per shift — select AM or PM.');
    }
    return poolSlots(node.mode, anchorDate, inputShift);
  }
}
