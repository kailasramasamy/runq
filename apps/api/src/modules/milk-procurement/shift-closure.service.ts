import { and, eq, inArray, isNull } from 'drizzle-orm';
import { mpShiftClosures, mpNodes, mpConsignments } from '@runq/db';
import type { Db } from '@runq/db';
import type { CloseShiftInput, ReopenShiftInput } from '@runq/validators';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import { MpPrincipal, assertNodeAccess } from './access-scope';

type Shift = 'am' | 'pm';
export interface ShiftStatus { am: boolean; pm: boolean }

/**
 * Per-slot collection close. Closing freezes pours/edits for a (node, date,
 * shift) and gates dispatch. A BMC node (pools the whole day) is closed by
 * writing both am+pm rows, so the pour guard stays shift-exact. Reopen is
 * blocked once any consignment exists for the slot — milk has physically left.
 */
export class ShiftClosureService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async closeShift(input: CloseShiftInput, userId: string | undefined, principal: MpPrincipal): Promise<ShiftStatus> {
    assertNodeAccess(principal, input.nodeId);
    const { shifts } = await this.resolveShifts(input.nodeId, input.shift);
    const now = new Date();
    await this.db.insert(mpShiftClosures)
      .values(shifts.map((shift) => ({
        tenantId: this.tenantId, nodeId: input.nodeId,
        collectionDate: input.collectionDate, shift,
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
    const { hasBmc, shifts } = await this.resolveShifts(input.nodeId, input.shift);
    if (await this.hasDispatch(input.nodeId, input.collectionDate, hasBmc, shifts[0])) {
      throw new ConflictError('Shift already dispatched — cannot reopen');
    }
    await this.db.update(mpShiftClosures)
      .set({ reopenedAt: new Date(), reopenedBy: userId ?? null, updatedAt: new Date() })
      .where(and(
        eq(mpShiftClosures.tenantId, this.tenantId), eq(mpShiftClosures.nodeId, input.nodeId),
        eq(mpShiftClosures.collectionDate, input.collectionDate),
        inArray(mpShiftClosures.shift, shifts), isNull(mpShiftClosures.reopenedAt),
      ));
    return this.status(input.nodeId, input.collectionDate, principal);
  }

  async status(nodeId: string, date: string, principal: MpPrincipal): Promise<ShiftStatus> {
    assertNodeAccess(principal, nodeId);
    const rows = await this.db.select({ shift: mpShiftClosures.shift }).from(mpShiftClosures)
      .where(and(
        eq(mpShiftClosures.tenantId, this.tenantId), eq(mpShiftClosures.nodeId, nodeId),
        eq(mpShiftClosures.collectionDate, date), isNull(mpShiftClosures.reopenedAt),
      ));
    const closed = new Set(rows.map((r) => r.shift));
    return { am: closed.has('am'), pm: closed.has('pm') };
  }

  /** BMC nodes close the whole day (both shifts); non-BMC must name the shift. */
  private async resolveShifts(nodeId: string, inputShift?: Shift): Promise<{ hasBmc: boolean; shifts: Shift[] }> {
    const [node] = await this.db.select({ hasBmc: mpNodes.hasBmc }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, nodeId)));
    if (!node) throw new NotFoundError('Node not found');
    if (node.hasBmc) return { hasBmc: true, shifts: ['am', 'pm'] };
    if (!inputShift) throw new ValidationError('This node has no BMC — select a shift (AM/PM) to close.');
    return { hasBmc: false, shifts: [inputShift] };
  }

  /** A dispatch for the slot exists — BMC pools the whole day (shift null); non-BMC is per-shift. */
  private async hasDispatch(nodeId: string, date: string, hasBmc: boolean, shift: Shift): Promise<boolean> {
    const shiftCond = hasBmc ? isNull(mpConsignments.shift) : eq(mpConsignments.shift, shift);
    const [row] = await this.db.select({ id: mpConsignments.id }).from(mpConsignments)
      .where(and(
        eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.fromNodeId, nodeId),
        eq(mpConsignments.collectionDate, date),
        inArray(mpConsignments.status, ['in_transit', 'received']), shiftCond,
      )).limit(1);
    return !!row;
  }
}
