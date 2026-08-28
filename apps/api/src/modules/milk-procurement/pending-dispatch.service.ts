import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { mpConsignments, mpFarmerSales, mpNodes, mpPours, mpShiftClosures } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError } from '../../utils/errors';
import { assertNodeAccess, type MpPrincipal } from './access-scope';
import { isPooled, prevDay, type DispatchMode } from './procurement-window';

/**
 * Milk collected at a node that was never dispatched onward — the operator's
 * outstanding work, however old.
 *
 * This is deliberately NOT `availability()` in a loop. The alert has to reach
 * back over the whole history (a shift closed in March and never dispatched
 * stays a real gap), so both sides are read as one grouped aggregate and
 * differenced here. Litres only: a badge needs a count, and the dispatch screen
 * recomputes the exact per-milk-type figure when the operator lands on it.
 */

/** Below this, a slot is rounding dust — collected and dispatched litres are
 * measured separately and never tie to the millilitre. Alerting on a 0.4 L gap
 * would pin a permanent badge on every node that ever dispatched. */
const TOLERANCE_LITRES = 5;

export interface PendingDispatchSlot {
  collectionDate: string;
  /** Null for a pooled (day / overnight) node — it dispatches its whole window
   * as one tanker, so there is no per-shift figure to draw against. */
  shift: 'am' | 'pm' | null;
  available: number;
  /** Closed means dispatch is unblocked — the operator can act now. An open slot
   * needs its collection closed first, and only ever appears here once the date
   * itself is past. */
  closed: boolean;
  /**
   * How many received consignments make up this slot's milk — what the operator
   * counts when he looks at the floor. Two tankers in from two VMCCs is two
   * pieces of work to him, even though they land in one (date, shift) slot and
   * may well leave as one tanker.
   *
   * Zero at a VMCC, whose milk arrives as pours rather than consignments. There
   * the slot itself is the unit of work.
   */
  sources: number;
}

type SlotKey = string;
type Tally = Map<SlotKey, number>;
/** What a slot holds: litres, and the number of consignments they arrived in. */
type Collected = { litres: Tally; sources: Tally };
/** Dispatched litres, split so untagged (whole-day / legacy) tankers can be
 * drawn across a date's shifts rather than pinned to one of them. */
type Dispatched = { tagged: Tally; untagged: Map<string, number> };

const key = (date: string, shift: 'am' | 'pm'): SlotKey => `${date}|${shift}`;

export class PendingDispatchService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /** Every slot at [nodeId] still holding undispatched milk, oldest first. */
  async list(nodeId: string, principal: MpPrincipal, today = istToday()): Promise<PendingDispatchSlot[]> {
    assertNodeAccess(principal, nodeId);
    const [node] = await this.db.select({
      nodeType: mpNodes.nodeType, dispatchMode: mpNodes.dispatchMode,
    }).from(mpNodes).where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, nodeId)));
    if (!node) throw new NotFoundError('Node not found');

    const [collected, dispatched, closures] = await Promise.all([
      node.nodeType === 'vmcc'
        ? this.pouredBySlot(nodeId).then((litres) => ({ litres, sources: new Map() }))
        : this.receivedBySlot(nodeId),
      this.outflowBySlot(nodeId),
      this.closedSlots(nodeId),
    ]);

    const mode = node.dispatchMode as DispatchMode;
    const slots = isPooled(mode)
      ? poolSlotsOf(mode, collected, dispatched, closures)
      : perShiftSlotsOf(collected, dispatched, closures);

    // An open slot on today's date is live work, not a miss — the operator is
    // still collecting into it. Only once the day is behind them does silence
    // become the bug.
    return slots
      .filter((s) => s.available > TOLERANCE_LITRES && (s.closed || s.collectionDate < today))
      .sort((a, b) => a.collectionDate.localeCompare(b.collectionDate)
        || (a.shift ?? '').localeCompare(b.shift ?? ''));
  }

  /** Litres poured at a VMCC per (date, shift). */
  private async pouredBySlot(nodeId: string): Promise<Tally> {
    const rows = await this.db.select({
      collectionDate: mpPours.collectionDate,
      shift: mpPours.shift,
      qty: sql<string>`sum(${mpPours.qtyLitres})`,
    }).from(mpPours)
      .where(and(eq(mpPours.tenantId, this.tenantId), eq(mpPours.nodeId, nodeId),
        eq(mpPours.status, 'recorded')))
      .groupBy(mpPours.collectionDate, mpPours.shift);
    return tally(rows);
  }

  /** Litres received in at a CC per (date, shift). A whole-day receipt carries a
   * null shift and folds onto AM, exactly as `receiptShiftCond` does — otherwise
   * milk from a BMC VMCC belongs to no shift and can never be sent onward. */
  private async receivedBySlot(nodeId: string): Promise<Collected> {
    const rows = await this.db.select({
      collectionDate: mpConsignments.collectionDate,
      shift: sql<'am' | 'pm'>`coalesce(${mpConsignments.shift}, 'am')`,
      qty: sql<string>`sum(${mpConsignments.receiptQty})`,
      n: sql<number>`count(*)::int`,
    }).from(mpConsignments)
      .where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.toNodeId, nodeId),
        eq(mpConsignments.status, 'received')))
      .groupBy(mpConsignments.collectionDate, sql`coalesce(${mpConsignments.shift}, 'am')`);
    return { litres: tally(rows), sources: tally(rows.map((r) => ({ ...r, qty: String(r.n) }))) };
  }

  /**
   * Litres sent onward per (date, shift), with untagged dispatches kept apart.
   *
   * A null shift is NOT folded onto AM here, unlike `receiptShiftCond`. That
   * fold understates availability, which is the safe direction for the dispatch
   * gate — it can only prevent a double-dispatch. For an alert it is the unsafe
   * direction: a per-shift CC that sent its whole day as one null-shift tanker
   * would have all of it charged to AM, leaving PM looking permanently owed.
   * Untagged litres are drawn across the date's shifts by [perShiftSlotsOf]
   * instead.
   *
   * Reversed consignments are excluded — a corrected-away dispatch left its milk
   * on hand.
   *
   * Milk sold to a trader-farmer at the gate counts here too: those litres are
   * gone, so leaving them out would pin a permanent "never dispatched" badge on
   * the centre for milk it no longer has.
   */
  private async outflowBySlot(nodeId: string): Promise<Dispatched> {
    const rows = await this.db.select({
      collectionDate: mpConsignments.collectionDate,
      shift: mpConsignments.shift,
      qty: sql<string>`sum(${mpConsignments.dispatchQty})`,
    }).from(mpConsignments)
      .where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.fromNodeId, nodeId),
        ne(mpConsignments.status, 'reversed')))
      .groupBy(mpConsignments.collectionDate, mpConsignments.shift);
    const sales = await this.db.select({
      collectionDate: mpFarmerSales.saleDate,
      shift: mpFarmerSales.shift,
      qty: sql<string>`sum(${mpFarmerSales.qty})`,
    }).from(mpFarmerSales)
      .where(and(eq(mpFarmerSales.tenantId, this.tenantId), eq(mpFarmerSales.nodeId, nodeId),
        // Product sales move no bulk milk, so they owe no dispatch.
        eq(mpFarmerSales.kind, 'raw_milk'), isNull(mpFarmerSales.reversedAt)))
      .groupBy(mpFarmerSales.saleDate, mpFarmerSales.shift);

    const tagged: Tally = new Map();
    const untagged = new Map<string, number>();
    for (const r of [...rows, ...sales]) {
      const qty = Number(r.qty ?? 0);
      if (r.shift == null) {
        untagged.set(r.collectionDate, (untagged.get(r.collectionDate) ?? 0) + qty);
      } else {
        const k = key(r.collectionDate, r.shift);
        tagged.set(k, (tagged.get(k) ?? 0) + qty);
      }
    }
    return { tagged, untagged };
  }

  /** Slots with an active (not reopened) close. */
  private async closedSlots(nodeId: string): Promise<Set<SlotKey>> {
    const rows = await this.db.select({
      collectionDate: mpShiftClosures.collectionDate, shift: mpShiftClosures.shift,
    }).from(mpShiftClosures)
      .where(and(eq(mpShiftClosures.tenantId, this.tenantId), eq(mpShiftClosures.nodeId, nodeId),
        isNull(mpShiftClosures.reopenedAt)));
    return new Set(rows.map((r) => key(r.collectionDate, r.shift)));
  }
}

function tally(rows: { collectionDate: string; shift: 'am' | 'pm'; qty: string | null }[]): Tally {
  const m: Tally = new Map();
  for (const r of rows) {
    const k = key(r.collectionDate, r.shift);
    m.set(k, (m.get(k) ?? 0) + Number(r.qty ?? 0));
  }
  return m;
}

/**
 * A per-shift node owes one dispatch per (date, shift) it collected into.
 *
 * Each shift is charged its own tagged dispatches first. Whatever left the node
 * untagged is then drawn across that date's shifts oldest-first — a legacy or
 * whole-day tanker belongs to the day, not to AM, and pinning it there would
 * leave PM permanently owed. Mirrors how `drawDown` consumes untyped dispatches
 * in the availability service.
 */
function perShiftSlotsOf(
  collected: Collected, dispatched: Dispatched, closures: Set<SlotKey>,
): PendingDispatchSlot[] {
  const dates = new Set([...collected.litres.keys()].map((k) => k.split('|')[0]));
  return [...dates].flatMap((date) => {
    let untagged = dispatched.untagged.get(date) ?? 0;
    return (['am', 'pm'] as const).flatMap((shift) => {
      const k = key(date, shift);
      if (!collected.litres.has(k)) return [];
      const left = (collected.litres.get(k) ?? 0) - (dispatched.tagged.get(k) ?? 0);
      const drawn = Math.min(Math.max(left, 0), untagged);
      untagged -= drawn;
      return [{
        collectionDate: date,
        shift,
        available: round3(left - drawn),
        closed: closures.has(k),
        sources: collected.sources.get(k) ?? 0,
      }];
    });
  });
}

/**
 * A pooled node dispatches one tanker per window, anchored on a single date, so
 * its constituent shifts are summed before differencing. `day` pools AM+PM of
 * the anchor date; `overnight` pools the previous PM with the anchor's AM. The
 * dispatched side is already anchored — its rows carry the anchor date — so it
 * is read whole for that date rather than per shift.
 */
function poolSlotsOf(
  mode: DispatchMode, collected: Collected, dispatched: Dispatched, closures: Set<SlotKey>,
): PendingDispatchSlot[] {
  const anchors = new Set<string>();
  for (const k of collected.litres.keys()) {
    const [date, shift] = k.split('|') as [string, 'am' | 'pm'];
    anchors.add(mode === 'overnight' && shift === 'pm' ? nextDay(date) : date);
  }
  return [...anchors].map((anchor) => {
    const window = mode === 'overnight'
      ? [key(prevDay(anchor), 'pm'), key(anchor, 'am')]
      : [key(anchor, 'am'), key(anchor, 'pm')];
    const inPool = window.reduce((t, k) => t + (collected.litres.get(k) ?? 0), 0);
    // Every tanker that fed the pool, across the whole window — two VMCCs into
    // one morning's BMC is two, even though it leaves as one.
    const sources = window.reduce((t, k) => t + (collected.sources.get(k) ?? 0), 0);
    // A pool's tanker is anchored on this date whatever shift it carries, so
    // every dispatch dated here counts against it.
    const sentOut = (dispatched.tagged.get(key(anchor, 'am')) ?? 0)
      + (dispatched.tagged.get(key(anchor, 'pm')) ?? 0)
      + (dispatched.untagged.get(anchor) ?? 0);
    return {
      collectionDate: anchor,
      shift: null,
      sources,
      available: round3(inPool - sentOut),
      // A pool is only dispatchable once its whole window is closed, matching
      // the `poolSlots` gate the dispatch route enforces.
      closed: window.every((k) => closures.has(k)),
    };
  });
}

/**
 * Today as an IST calendar date. The dairies are Indian, but Railway runs UTC —
 * with a bare `toISOString()` every open slot would look like yesterday's between
 * 00:00 and 05:30 IST and alert hours before the operator has done anything
 * wrong. `en-CA` is the locale that formats as `yyyy-mm-dd`.
 */
function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
