import { and, eq, isNull, inArray } from 'drizzle-orm';
import { mpShiftClosures, mpNodes, mpConsignments } from '@runq/db';
import type { Db } from '@runq/db';
import type { CloseShiftInput, ReopenShiftInput } from '@runq/validators';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import { MpPrincipal, assertNodeAccess } from './access-scope';
import { ccReceiveWindow, type Slot } from './procurement-window';

type Shift = 'am' | 'pm';
export interface ShiftStatus { am: boolean; pm: boolean }
interface NodeMode { hasBmc: boolean; overnight: boolean }

/**
 * Per-slot collection close. Closing freezes pours/edits for a (node, date,
 * shift) and gates dispatch. A BMC node (pools the whole day) closes both am+pm;
 * an overnight CC closes its pool window (yesterday PM + today AM) so the gate
 * spans two calendar days. Reopen is blocked once a dispatch for the slot exists
 * — milk has physically left.
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
    if (await this.hasDispatch(input.nodeId, input.collectionDate, node, slots[0])) {
      throw new ConflictError('Shift already dispatched — cannot reopen');
    }
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

  /** Closed-state of the node's pool slots, mapped onto {am, pm} by each slot's
   * shift. For an overnight CC, `am` = today-AM closed and `pm` = yesterday-PM
   * closed, so `am && pm` still reads as "the whole pool is closed". */
  async status(nodeId: string, date: string, principal: MpPrincipal): Promise<ShiftStatus> {
    assertNodeAccess(principal, nodeId);
    const node = await this.loadNode(nodeId);
    const slots = this.statusSlots(node, date);
    const out: ShiftStatus = { am: false, pm: false };
    for (const s of slots) {
      const [row] = await this.db.select({ id: mpShiftClosures.id }).from(mpShiftClosures)
        .where(and(
          eq(mpShiftClosures.tenantId, this.tenantId), eq(mpShiftClosures.nodeId, nodeId),
          eq(mpShiftClosures.collectionDate, s.date), eq(mpShiftClosures.shift, s.shift),
          isNull(mpShiftClosures.reopenedAt),
        )).limit(1);
      if (row) out[s.shift] = true;
    }
    return out;
  }

  private async loadNode(nodeId: string): Promise<NodeMode> {
    const [node] = await this.db.select({
      hasBmc: mpNodes.hasBmc, nodeType: mpNodes.nodeType, overnightPooling: mpNodes.overnightPooling,
    }).from(mpNodes).where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, nodeId)));
    if (!node) throw new NotFoundError('Node not found');
    return { hasBmc: node.hasBmc, overnight: node.nodeType === 'cc' && node.overnightPooling };
  }

  /** Slots written by a close/reopen: overnight CC → pool window; BMC → both
   * shifts today; no-BMC → the named shift. */
  private closeSlots(node: NodeMode, anchorDate: string, inputShift?: Shift): Slot[] {
    if (node.overnight) return ccReceiveWindow(true, anchorDate);
    if (node.hasBmc) return [{ date: anchorDate, shift: 'am' }, { date: anchorDate, shift: 'pm' }];
    if (!inputShift) throw new ValidationError('This node has no BMC — select a shift (AM/PM) to close.');
    return [{ date: anchorDate, shift: inputShift }];
  }

  /** Slots reported by status — both shifts (or the overnight window). */
  private statusSlots(node: NodeMode, anchorDate: string): Slot[] {
    if (node.overnight) return ccReceiveWindow(true, anchorDate);
    return [{ date: anchorDate, shift: 'am' }, { date: anchorDate, shift: 'pm' }];
  }

  /** A dispatch for the slot exists — BMC/overnight pool the whole day (shift
   * null) on the anchor date; no-BMC is per-shift. */
  private async hasDispatch(nodeId: string, anchorDate: string, node: NodeMode, slot: Slot): Promise<boolean> {
    const pooled = node.hasBmc || node.overnight;
    const shiftCond = pooled ? isNull(mpConsignments.shift) : eq(mpConsignments.shift, slot.shift);
    const [row] = await this.db.select({ id: mpConsignments.id }).from(mpConsignments)
      .where(and(
        eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.fromNodeId, nodeId),
        eq(mpConsignments.collectionDate, anchorDate),
        inArray(mpConsignments.status, ['in_transit', 'received']), shiftCond,
      )).limit(1);
    return !!row;
  }
}
