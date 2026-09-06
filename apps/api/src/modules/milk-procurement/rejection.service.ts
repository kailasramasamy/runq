import { and, eq, sql, isNull, inArray, gte, lte } from 'drizzle-orm';
import {
  mpRejections, mpRejectionCharges, mpConsignments, mpPours, mpNodes, stockLedger,
} from '@runq/db';
import type { Db, MpRejectionRow, MpConsignmentRow } from '@runq/db';
import type {
  GateRejectionInput, ReceiptRejectionInput, RejectionFilter, RejectionStatsQuery,
} from '@runq/validators';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import { StockLedgerService } from '../inventory/stock-ledger.service';
import { MpPrincipal, assertNodeAccess, scopeRejections } from './access-scope';
import { appendLedgerEntry } from './farmer-ledger';
import { attribute, type AttributedCharge, type SourcePour } from './rejection-attribution';
import { RateChartService } from './rate-chart.service';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** One refusal charged to a farmer, as their payment breakdown shows it. */
export interface RejectionLine {
  collectionDate: string;
  shift: string | null;
  milkType: string | null;
  reason: string;
  notes: string | null;
  qtyLitres: number;
  ratePerLitre: number;
  amount: number;
}

/** One row of the rejection-rate report: a source, a reason, or a farmer. */
export interface RejectionStat {
  key: string | null;
  rejectedQty: number;
  events: number;
  amount: number;
}

/**
 * Milk refused for quality — recorded, not erased.
 *
 * The pour or receipt stays with its reading; this adds what was refused, why,
 * and who is out of pocket. Settlement is deliberately thin because two of the
 * three cases already have a rail:
 *
 *   gate      — no pour is created, so nothing ever accrues
 *   VMCC bulk — billed off `mp_consignments.receipt_qty`, and a rejection is
 *               taken NET, so the litres never reach the bill
 *   farmer    — the only case needing a deduction, and it rides the same
 *               farmer-ledger waterfall `mp_farmer_sales` already uses
 */
export class MpRejectionService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(filters: RejectionFilter, principal: MpPrincipal): Promise<MpRejectionRow[]> {
    const conds = [eq(mpRejections.tenantId, this.tenantId)];
    if (filters.nodeId) conds.push(eq(mpRejections.nodeId, filters.nodeId));
    if (filters.fromNodeId) conds.push(eq(mpRejections.fromNodeId, filters.fromNodeId));
    if (filters.stage) conds.push(eq(mpRejections.stage, filters.stage));
    if (filters.reason) conds.push(eq(mpRejections.reason, filters.reason));
    if (filters.collectionDate) conds.push(eq(mpRejections.collectionDate, filters.collectionDate));
    if (filters.from) conds.push(gte(mpRejections.collectionDate, filters.from));
    if (filters.to) conds.push(lte(mpRejections.collectionDate, filters.to));
    if (!filters.includeReversed) conds.push(isNull(mpRejections.reversedAt));
    const scope = scopeRejections(principal);
    if (scope) conds.push(scope);
    return this.db.select().from(mpRejections).where(and(...conds))
      .orderBy(sql`${mpRejections.collectionDate} desc, ${mpRejections.rejectedAt} desc`);
  }

  /**
   * Refuse a farmer's milk at the gate — the cheapest place in the network to
   * catch it. No pour is created for these litres, so there is nothing to
   * accrue and nothing to deduct later; the row exists purely so the refusal,
   * and the reading behind it, survive.
   */
  async rejectAtGate(
    input: GateRejectionInput, userId: string | undefined, principal: MpPrincipal,
  ): Promise<MpRejectionRow> {
    assertNodeAccess(principal, input.nodeId);
    const [row] = await this.db.insert(mpRejections).values({
      tenantId: this.tenantId,
      stage: 'gate',
      subjectType: 'pour',
      subjectId: null,
      nodeId: input.nodeId,
      fromNodeId: null,
      collectionDate: input.collectionDate,
      shift: input.shift,
      milkType: input.milkType,
      qtyLitres: String(input.qtyLitres),
      reason: input.reason,
      notes: input.notes ?? null,
      disposition: input.disposition,
      borneBy: 'farmer',
      rejectedBy: userId ?? null,
    }).returning();
    return row!;
  }

  /**
   * Refuse part of a load already taken in, at a CC or the plant.
   *
   * The receipt is reduced to what was ACCEPTED, so the litres never join the
   * node's pool or the plant's raw-milk stock. `variance_qty` is deliberately
   * left alone: it measures what went missing between dispatch and arrival, and
   * a rejection is a deliberate reduction, not leakage. Recomputing it here
   * would report every rejection as a short delivery and poison the very figure
   * a CC uses to police its VMCCs.
   */
  async rejectReceipt(
    consignmentId: string, input: ReceiptRejectionInput,
    userId: string | undefined, principal: MpPrincipal,
  ): Promise<MpRejectionRow> {
    const c = await this.loadConsignment(consignmentId);
    assertNodeAccess(principal, c.toNodeId);
    if (c.status !== 'received') throw new ConflictError('Only a received load can be rejected');
    const accepted = Number(c.receiptQty ?? 0);
    if (input.qtyLitres - accepted > 1e-6) {
      throw new ValidationError(`Only ${accepted} L was received — cannot reject more than arrived.`);
    }
    await this.assertBatchUnconsumed(c, input.qtyLitres);
    const stage = await this.stageFor(c);
    const resolved = attribute({
      qtyLitres: input.qtyLitres,
      pours: await this.sourcePours(c),
      fromNodeId: c.directReceive ? c.fromNodeId : null,
      vmccRatePerLitre: c.directReceive ? await this.vmccRate(c) : null,
      attributeToFarmerId: input.attributeToFarmerId,
    });
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(mpRejections).values({
        tenantId: this.tenantId,
        stage,
        subjectType: 'consignment',
        subjectId: c.id,
        nodeId: c.toNodeId,
        fromNodeId: c.fromNodeId,
        collectionDate: c.collectionDate,
        shift: c.shift,
        milkType: c.milkType,
        qtyLitres: String(input.qtyLitres),
        reason: input.reason,
        notes: input.notes ?? null,
        disposition: input.disposition,
        borneBy: resolved.borneBy,
        rejectedBy: userId ?? null,
      }).returning();
      await this.writeCharges(tx, row!, resolved.charges, userId);
      await this.applyToReceipt(tx, c, input.qtyLitres, userId);
      return row!;
    });
  }

  /**
   * Take a rejection back. A judgement call got wrong is still a judgement
   * call, so it reverses rather than deletes: the litres go back onto the
   * receipt and the stock, and every charge is contra'd on its farmer's ledger.
   */
  async reverse(
    id: string, userId: string | undefined, principal: MpPrincipal,
  ): Promise<MpRejectionRow> {
    const [r] = await this.db.select().from(mpRejections)
      .where(and(eq(mpRejections.tenantId, this.tenantId), eq(mpRejections.id, id)));
    if (!r) throw new NotFoundError('Rejection not found');
    assertNodeAccess(principal, r.nodeId);
    if (r.reversedAt) throw new ConflictError('This rejection is already reversed');
    const c = r.subjectId ? await this.loadConsignment(r.subjectId).catch(() => null) : null;
    return this.db.transaction(async (tx) => {
      const charges = await tx.select().from(mpRejectionCharges)
        .where(and(eq(mpRejectionCharges.tenantId, this.tenantId),
          eq(mpRejectionCharges.rejectionId, r.id), isNull(mpRejectionCharges.reversedAt)));
      for (const ch of charges) {
        if (ch.farmerId) {
          await appendLedgerEntry(tx, this.tenantId, {
            farmerId: ch.farmerId, entryType: 'adjustment', amount: Number(ch.amount),
            occurredOn: r.collectionDate, refType: 'quality_rejection', refId: r.id,
            createdBy: userId ?? null,
          });
        }
        await tx.update(mpRejectionCharges).set({ reversedAt: new Date() })
          .where(eq(mpRejectionCharges.id, ch.id));
      }
      if (c) await this.applyToReceipt(tx, c, -Number(r.qtyLitres), userId);
      const [row] = await tx.update(mpRejections)
        .set({ reversedAt: new Date(), reversedBy: userId ?? null, updatedAt: new Date() })
        .where(eq(mpRejections.id, r.id)).returning();
      return row!;
    });
  }

  /**
   * Rejection rate over a window — the figure the whole feature exists to
   * produce. A farmer whose rate is climbing is the one to visit BEFORE the
   * milk goes bad, which is not knowable from any report that exists today.
   *
   * Denominator is accepted + rejected: what was brought, not what was kept.
   * Dividing by accepted alone flatters a source whose milk is mostly refused.
   */
  async stats(q: RejectionStatsQuery, principal: MpPrincipal): Promise<RejectionStat[]> {
    const conds = [
      eq(mpRejections.tenantId, this.tenantId), isNull(mpRejections.reversedAt),
      gte(mpRejections.collectionDate, q.from), lte(mpRejections.collectionDate, q.to),
    ];
    if (q.nodeId) conds.push(eq(mpRejections.nodeId, q.nodeId));
    const scope = scopeRejections(principal);
    if (scope) conds.push(scope);
    // Grouping by farmer reads off the charges, which is where a farmer is
    // named — one rejection can split across several. The other two group the
    // rejections themselves and pick their money up in a second pass rather
    // than joining: a rejection with three charges would otherwise have its
    // litres counted three times over.
    if (q.groupBy === 'farmer') return this.statsByFarmer(conds);
    const key = q.groupBy === 'reason' ? mpRejections.reason : mpRejections.fromNodeId;
    const rows = await this.db.select({
      key: sql<string | null>`${key}`,
      rejectedQty: sql<string>`coalesce(sum(${mpRejections.qtyLitres}), 0)`,
      events: sql<number>`count(*)::int`,
    }).from(mpRejections).where(and(...conds)).groupBy(sql`${key}`);
    const money = await this.db.select({
      key: sql<string | null>`${key}`,
      amount: sql<string>`coalesce(sum(${mpRejectionCharges.amount}), 0)`,
    }).from(mpRejectionCharges)
      .innerJoin(mpRejections, eq(mpRejectionCharges.rejectionId, mpRejections.id))
      .where(and(...conds, isNull(mpRejectionCharges.reversedAt)))
      .groupBy(sql`${key}`);
    const amountByKey = new Map(money.map((m) => [m.key, Number(m.amount)]));
    return rows.map((r) => ({
      key: r.key, rejectedQty: Number(r.rejectedQty), events: r.events,
      amount: amountByKey.get(r.key) ?? 0,
    }));
  }

  private async statsByFarmer(conds: Parameters<typeof and>): Promise<RejectionStat[]> {
    const rows = await this.db.select({
      key: mpRejectionCharges.farmerId,
      rejectedQty: sql<string>`coalesce(sum(${mpRejectionCharges.qtyLitres}), 0)`,
      events: sql<number>`count(*)::int`,
      amount: sql<string>`coalesce(sum(${mpRejectionCharges.amount}), 0)`,
    }).from(mpRejectionCharges)
      .innerJoin(mpRejections, eq(mpRejectionCharges.rejectionId, mpRejections.id))
      .where(and(...conds, isNull(mpRejectionCharges.reversedAt),
        sql`${mpRejectionCharges.farmerId} is not null`))
      .groupBy(mpRejectionCharges.farmerId);
    return rows.map((r) => ({
      key: r.key, rejectedQty: Number(r.rejectedQty), events: r.events, amount: Number(r.amount),
    }));
  }

  /**
   * Undo every live rejection on one load. The card is the unit an operator
   * thinks in — "un-reject this tanker" — not the individual rejection rows
   * behind it, which they never see and cannot name.
   */
  async reverseForConsignment(
    consignmentId: string, userId: string | undefined, principal: MpPrincipal,
  ): Promise<MpRejectionRow[]> {
    const live = await this.db.select({ id: mpRejections.id }).from(mpRejections)
      .where(and(
        eq(mpRejections.tenantId, this.tenantId),
        eq(mpRejections.subjectType, 'consignment'),
        eq(mpRejections.subjectId, consignmentId),
        isNull(mpRejections.reversedAt),
      ));
    if (!live.length) throw new NotFoundError('No rejection to undo on this load');
    const out: MpRejectionRow[] = [];
    for (const r of live) out.push(await this.reverse(r.id, userId, principal));
    return out;
  }

  /**
   * One farmer's refused milk over a window, charge by charge.
   *
   * The deduction on their payment is otherwise a bare number under whichever
   * bucket label the app guessed — it showed as "Advance recovery", which is
   * both wrong and the most alarming thing it could have said. A farmer looking
   * at money taken off their milk cheque is owed the date, the litres and the
   * reason.
   */
  async farmerLines(farmerId: string, from: string, to: string): Promise<RejectionLine[]> {
    const rows = await this.db.select({
      collectionDate: mpRejections.collectionDate,
      shift: mpRejections.shift,
      milkType: mpRejections.milkType,
      reason: mpRejections.reason,
      notes: mpRejections.notes,
      qtyLitres: mpRejectionCharges.qtyLitres,
      ratePerLitre: mpRejectionCharges.ratePerLitre,
      amount: mpRejectionCharges.amount,
    }).from(mpRejectionCharges)
      .innerJoin(mpRejections, eq(mpRejectionCharges.rejectionId, mpRejections.id))
      .where(and(
        eq(mpRejectionCharges.tenantId, this.tenantId),
        eq(mpRejectionCharges.farmerId, farmerId),
        isNull(mpRejectionCharges.reversedAt),
        isNull(mpRejections.reversedAt),
        gte(mpRejections.collectionDate, from),
        lte(mpRejections.collectionDate, to),
      ));
    return rows
      .map((r) => ({
        collectionDate: r.collectionDate,
        shift: r.shift,
        milkType: r.milkType,
        reason: r.reason,
        notes: r.notes,
        qtyLitres: Number(r.qtyLitres),
        ratePerLitre: Number(r.ratePerLitre),
        amount: Number(r.amount),
      }))
      .sort((a, b) => a.collectionDate.localeCompare(b.collectionDate));
  }

  /** Litres refused against one consignment, so callers that recompute variance
   *  can add them back — the milk arrived, it just wasn't kept. */
  async rejectedLitres(db: Db | Tx, consignmentId: string): Promise<number> {
    const [r] = await (db as Db).select({
      q: sql<string>`coalesce(sum(${mpRejections.qtyLitres}), 0)`,
    }).from(mpRejections).where(and(
      eq(mpRejections.tenantId, this.tenantId), eq(mpRejections.subjectType, 'consignment'),
      eq(mpRejections.subjectId, consignmentId), isNull(mpRejections.reversedAt),
    ));
    return Number(r?.q ?? 0);
  }

  /** Any live rejection on a consignment — blocks un-receiving it. */
  async hasLiveRejection(consignmentId: string): Promise<boolean> {
    return (await this.rejectedLitres(this.db, consignmentId)) > 0;
  }

  /**
   * A farmer charge becomes a `quality_rejection` debit on their running
   * ledger, which the payout waterfall recovers ahead of everything else. It is
   * deliberately not tied to a particular cycle: outstanding is summed over the
   * whole ledger, so a rejection raised against an already-locked period simply
   * comes off the next one, with no guard needed.
   *
   * A VMCC charge is recorded and nothing more — its milk is billed off the
   * receipt this rejection just reduced.
   */
  private async writeCharges(
    tx: Tx, rejection: MpRejectionRow, charges: AttributedCharge[], userId: string | undefined,
  ): Promise<void> {
    for (const ch of charges) {
      const ledger = ch.farmerId
        ? await appendLedgerEntry(tx, this.tenantId, {
            farmerId: ch.farmerId, entryType: 'quality_rejection', amount: ch.amount,
            occurredOn: rejection.collectionDate, refType: 'quality_rejection',
            refId: rejection.id, createdBy: userId ?? null,
          })
        : null;
      await tx.insert(mpRejectionCharges).values({
        tenantId: this.tenantId,
        rejectionId: rejection.id,
        farmerId: ch.farmerId,
        vmccNodeId: ch.vmccNodeId,
        pourId: ch.pourId,
        qtyLitres: String(ch.qtyLitres),
        ratePerLitre: String(ch.ratePerLitre),
        amount: String(ch.amount),
        ledgerEntryId: ledger?.id ?? null,
      });
    }
  }

  /** Move `qty` litres off the receipt (negative to put them back), keeping the
   *  plant's raw-milk batch in step. Variance is untouched — see `rejectReceipt`. */
  private async applyToReceipt(
    tx: Tx, c: MpConsignmentRow, qty: number, userId: string | undefined,
  ): Promise<void> {
    const next = round3(Number(c.receiptQty ?? 0) - qty);
    await tx.update(mpConsignments)
      .set({ receiptQty: String(Math.max(0, next)), updatedAt: new Date() })
      .where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.id, c.id)));
    if (!c.stockLedgerId || Math.abs(qty) <= 1e-6) return;
    const [orig] = await tx.select({
      itemId: stockLedger.itemId, warehouseId: stockLedger.warehouseId, batchNo: stockLedger.batchNo,
    }).from(stockLedger)
      .where(and(eq(stockLedger.tenantId, this.tenantId), eq(stockLedger.id, c.stockLedgerId)));
    if (!orig) return;
    await new StockLedgerService(this.tenantId).recordMovement(tx, {
      itemId: orig.itemId, warehouseId: orig.warehouseId, batchNo: orig.batchNo,
      movementType: qty > 0 ? 'adjustment_out' : 'adjustment_in',
      sourceType: 'mp_rejection', sourceId: c.id, qtyDelta: -qty, unitCost: 0,
      movedAt: new Date(), postedBy: userId ?? null,
    });
  }

  /**
   * The pours standing behind a load.
   *
   * A VMCC→CC leg is its centre's own pours for that slot. A CC→PP tanker is
   * everything the plant's CC took in that day, so it can blend several VMCCs —
   * and only the pour-backed ones contribute; a direct-receive leg has no pours
   * to name. When a pooled tanker traces to no pours at all there is no single
   * supplier to charge, and `attribute` falls back to the company unless the
   * operator names a farmer.
   */
  private async sourcePours(c: MpConsignmentRow): Promise<SourcePour[]> {
    const legs = c.kind === 'vmcc_to_cc'
      ? [c]
      : await this.db.select().from(mpConsignments).where(and(
          eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.kind, 'vmcc_to_cc'),
          eq(mpConsignments.toNodeId, c.fromNodeId), eq(mpConsignments.collectionDate, c.collectionDate),
          eq(mpConsignments.status, 'received'), eq(mpConsignments.directReceive, false),
        ));
    // Keyed by pour id, not appended: a CC that took in cow AND buffalo from
    // one VMCC has two legs from the same node and shift, and filtering each by
    // the tanker's milk type hands back the SAME pour once per leg. Appending
    // split one farmer's rejection across two identical charges.
    const byPour = new Map<string, SourcePour>();
    for (const leg of legs) {
      if (leg.directReceive) continue;
      const rows = await this.db.select({
        id: mpPours.id, farmerId: mpPours.farmerId,
        qty: mpPours.qtyLitres, rate: mpPours.ratePerLitre,
      }).from(mpPours).where(and(
        eq(mpPours.tenantId, this.tenantId), eq(mpPours.nodeId, leg.fromNodeId),
        eq(mpPours.collectionDate, leg.collectionDate), eq(mpPours.status, 'recorded'),
        ...(leg.shift ? [eq(mpPours.shift, leg.shift)] : []),
        ...(c.milkType ? [eq(mpPours.milkType, c.milkType)] : []),
      ));
      for (const r of rows) {
        byPour.set(r.id, {
          pourId: r.id, farmerId: r.farmerId,
          qtyLitres: Number(r.qty), ratePerLitre: Number(r.rate),
        });
      }
    }
    return [...byPour.values()];
  }

  /** What a direct-receive VMCC's milk was priced at, so the charge matches the
   *  bill it would otherwise have earned. Null when no chart applies. */
  private async vmccRate(c: MpConsignmentRow): Promise<number | null> {
    if (!c.milkType || c.receiptFat == null || c.receiptSnf == null) return null;
    try {
      const { ratePerLitre } = await new RateChartService(this.db, this.tenantId).resolveRate({
        milkType: c.milkType, fat: Number(c.receiptFat), snf: Number(c.receiptSnf),
        scopeNodeId: c.fromNodeId, onDate: c.collectionDate,
      });
      return ratePerLitre;
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
  }

  private async stageFor(c: MpConsignmentRow): Promise<'cc_receipt' | 'pp_receipt'> {
    const [to] = await this.db.select({ nodeType: mpNodes.nodeType }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, c.toNodeId)));
    return to?.nodeType === 'pp' ? 'pp_receipt' : 'cc_receipt';
  }

  /** Refuse to pull litres out from under production that already drew on the
   *  batch — the same gate the cancel chain uses, for the same reason. */
  private async assertBatchUnconsumed(c: MpConsignmentRow, qty: number): Promise<void> {
    if (!c.stockLedgerId) return;
    const [orig] = await this.db.select({
      itemId: stockLedger.itemId, warehouseId: stockLedger.warehouseId, batchNo: stockLedger.batchNo,
    }).from(stockLedger)
      .where(and(eq(stockLedger.tenantId, this.tenantId), eq(stockLedger.id, c.stockLedgerId)));
    if (!orig?.batchNo) return;
    const [bal] = await this.db.select({
      inQty: sql<string>`coalesce(sum(${stockLedger.qtyIn}), 0)`,
      outQty: sql<string>`coalesce(sum(${stockLedger.qtyOut}), 0)`,
    }).from(stockLedger).where(and(
      eq(stockLedger.tenantId, this.tenantId), eq(stockLedger.itemId, orig.itemId),
      eq(stockLedger.warehouseId, orig.warehouseId), eq(stockLedger.batchNo, orig.batchNo),
    ));
    const onHand = Number(bal?.inQty ?? 0) - Number(bal?.outQty ?? 0);
    if (qty - onHand > 1e-6) {
      throw new ConflictError(
        `Only ${round3(onHand)} L of this batch is still in stock — the rest has been used in production.`);
    }
  }

  private async loadConsignment(id: string): Promise<MpConsignmentRow> {
    const [row] = await this.db.select().from(mpConsignments)
      .where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.id, id)));
    if (!row) throw new NotFoundError('Consignment not found');
    return row;
  }
}

function round3(n: number): number { return Math.round(n * 1000) / 1000; }
