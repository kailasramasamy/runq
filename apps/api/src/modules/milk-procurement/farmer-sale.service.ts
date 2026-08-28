import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import {
  items, mpFarmerLedger, mpFarmerSales, mpFarmers, mpNodes, mpPayoutCycles, mpPayoutLines,
} from '@runq/db';
import type { Db, MpFarmerSaleRow } from '@runq/db';
import type {
  CreateFarmerSaleInput, FarmerSaleFilter, UpdateFarmerSaleInput,
} from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { ConsignmentService } from './consignment.service';
import { MpGlPoster } from './gl-poster';
import { appendLedgerEntry, foldOutstanding } from './farmer-ledger';
import { isPooled } from './procurement-window';
import { MpPrincipal, assertFarmerAtNode, assertNodeAccess } from './access-scope';

export type FarmerSaleListRow = MpFarmerSaleRow & {
  farmerName: string; farmerCode: string; nodeName: string;
  /** Null on a raw-milk line, which names its milk type instead. */
  itemName: string | null;
};

/** A product a farmer can be sold at the counter, for the picker. */
export interface SellableItem {
  id: string; name: string; sku: string | null;
  unit: string | null; defaultSellingPrice: string | null;
}

/**
 * Milk sold back TO a farmer — the trader-farmer who both supplies us and buys
 * from us. One write, two consequences:
 *   • money  — a `farmer_sale` debit on the farmer ledger, which the next
 *              payout cycle recovers as a deduction ahead of advances and feed
 *              loans (see farmer-ledger.ts). GL: Dr Sales Receivable / Cr Income.
 *   • litres — a RAW-MILK line only: those litres count as an outflow at the
 *              node, so availability and the pending-dispatch alert stay honest.
 *              A product line moves no bulk milk and draws nothing down.
 *
 * Products are money-only: no stock issue and no COGS, because Dhenu has no
 * per-centre warehouse to relieve. No tax invoice either — raw milk is exempt,
 * and the ledger line plus the farmer's statement are the documents. A
 * correction reverses (contra ledger + JE) rather than editing.
 */
export class FarmerSaleService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async create(
    input: CreateFarmerSaleInput, principal: MpPrincipal, userId?: string,
  ): Promise<MpFarmerSaleRow> {
    assertNodeAccess(principal, input.nodeId);
    await assertFarmerAtNode(this.db, this.tenantId, principal, input.farmerId);

    const [node] = await this.db.select({ dispatchMode: mpNodes.dispatchMode })
      .from(mpNodes).where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, input.nodeId))).limit(1);
    if (!node) throw new NotFoundError('Node not found');
    const isMilk = input.kind === 'raw_milk';
    // Shift scopes a bulk-milk slot; a tin of ghee belongs to no shift. At a
    // pooled node even milk carries none — it holds one pool, not two shifts,
    // so a shift would name a slot availability cannot draw against.
    const shift = isMilk && !isPooled(node.dispatchMode) ? input.shift ?? null : null;
    if (isMilk && !isPooled(node.dispatchMode) && !shift) {
      throw new ConflictError('Shift is required at a per-shift centre');
    }
    // Unit is snapshotted so the row still reads correctly years later, after
    // someone edits the item master.
    const item = isMilk ? null : await this.loadItem(input.itemId!);

    if (input.qty <= 0 || input.ratePerUnit <= 0) {
      throw new ConflictError('Quantity and rate must both be greater than zero');
    }
    if (isMilk) await this.assertNotAlreadyDispatched(input, shift, principal);
    const amount = round2(input.qty * input.ratePerUnit);
    return this.db.transaction(async (tx) => {
      const ledger = await appendLedgerEntry(tx, this.tenantId, {
        farmerId: input.farmerId, entryType: 'farmer_sale', amount,
        occurredOn: input.saleDate, refType: 'farmer_sale', createdBy: userId,
      });
      const [sale] = await tx.insert(mpFarmerSales).values({
        tenantId: this.tenantId,
        farmerId: input.farmerId,
        nodeId: input.nodeId,
        saleDate: input.saleDate,
        kind: input.kind,
        shift,
        milkType: isMilk ? input.milkType! : null,
        itemId: isMilk ? null : input.itemId!,
        qty: String(input.qty),
        unit: isMilk ? 'L' : (item?.unit ?? 'nos'),
        ratePerUnit: String(input.ratePerUnit),
        amount: String(amount),
        note: input.note ?? null,
        ledgerEntryId: ledger.id,
        createdBy: userId ?? null,
      }).returning();
      const jeId = await new MpGlPoster(this.tenantId, userId).postFarmerSale(tx, {
        saleId: sale!.id, date: input.saleDate, amount,
      });
      if (jeId) {
        await tx.update(mpFarmerSales).set({ journalEntryId: jeId })
          .where(eq(mpFarmerSales.id, sale!.id));
      }
      return { ...sale!, journalEntryId: jeId };
    });
  }

  /**
   * Refuses a gate sale of milk that already left on a tanker.
   *
   * A thin collection is NOT a reason to block: milk is handed over off what
   * the centre physically holds, which is not always what the app has been told
   * about yet — pours keyed later, milk drawn from the tank. Those litres just
   * take the slot to zero.
   *
   * Milk already dispatched is a different claim. It is on a lorry to the
   * chilling centre, so it cannot also have been carried home from the gate,
   * and letting the sale through books the same litres as leaving twice: the
   * node's day then says more went out than ever came in. Seen on 20 and 24 Aug
   * at Vrindavan, where an 80 L sale was written up after the morning dispatch
   * had already sent the whole collection.
   *
   * Only the create path is gated. An edit is how a wrong sale gets corrected,
   * and a correction that the guard refuses to accept is a trap.
   */
  private async assertNotAlreadyDispatched(
    input: CreateFarmerSaleInput, shift: 'am' | 'pm' | null, principal: MpPrincipal,
  ): Promise<void> {
    const a = await new ConsignmentService(this.db, this.tenantId).availability(
      input.nodeId, input.saleDate, principal, shift ?? undefined, input.milkType!,
    );
    if (a.dispatched <= 0 || input.qty <= a.available + 0.001) return;
    throw new ConflictError(
      `Only ${round3(a.available)} L left at this centre — `
      + `${round3(a.dispatched)} L of the ${round3(a.collected)} L collected has already been `
      + 'dispatched. Record the sale before dispatching, or correct the dispatch quantity.',
    );
  }

  async list(filters: FarmerSaleFilter, principal: MpPrincipal): Promise<FarmerSaleListRow[]> {
    // A farmer reads their own sales, whatever they asked for; everyone else is
    // held to the nodes (and farmers) they're scoped to.
    if (principal.kind === 'farmer') {
      filters = { ...filters, farmerId: principal.farmerId, nodeId: undefined };
    } else {
      if (filters.nodeId) assertNodeAccess(principal, filters.nodeId);
      if (filters.farmerId) await assertFarmerAtNode(this.db, this.tenantId, principal, filters.farmerId);
    }
    const conds = [eq(mpFarmerSales.tenantId, this.tenantId), scopeSales(principal, filters)];
    if (filters.farmerId) conds.push(eq(mpFarmerSales.farmerId, filters.farmerId));
    if (filters.kind) conds.push(eq(mpFarmerSales.kind, filters.kind));
    if (filters.nodeId) conds.push(eq(mpFarmerSales.nodeId, filters.nodeId));
    if (filters.from) conds.push(gte(mpFarmerSales.saleDate, filters.from));
    if (filters.to) conds.push(lte(mpFarmerSales.saleDate, filters.to));
    if (!filters.includeReversed) conds.push(isNull(mpFarmerSales.reversedAt));
    const rows = await this.db.select({
      sale: mpFarmerSales,
      farmerName: mpFarmers.name, farmerCode: mpFarmers.code, nodeName: mpNodes.name,
      itemName: items.name,
    }).from(mpFarmerSales)
      .innerJoin(mpFarmers, eq(mpFarmerSales.farmerId, mpFarmers.id))
      .innerJoin(mpNodes, eq(mpFarmerSales.nodeId, mpNodes.id))
      .leftJoin(items, eq(mpFarmerSales.itemId, items.id))
      .where(and(...conds))
      .orderBy(desc(mpFarmerSales.saleDate), desc(mpFarmerSales.createdAt))
      .limit(filters.limit);
    return rows.map((r) => ({
      ...r.sale, farmerName: r.farmerName, farmerCode: r.farmerCode,
      nodeName: r.nodeName, itemName: r.itemName,
    }));
  }

  private async loadItem(itemId: string): Promise<{ unit: string | null }> {
    const [item] = await this.db.select({ unit: items.unit }).from(items)
      .where(and(eq(items.tenantId, this.tenantId), eq(items.id, itemId))).limit(1);
    if (!item) throw new NotFoundError('Product not found');
    return item;
  }

  /**
   * Correct a recorded sale in place. Only while it is still unrecovered — once
   * a cycle has taken it off a payment, the amount is settled and editing it
   * here would silently disagree with a statement the farmer already holds.
   */
  async update(
    id: string, input: UpdateFarmerSaleInput, principal: MpPrincipal, userId?: string,
  ): Promise<MpFarmerSaleRow> {
    const sale = await this.loadEditable(id, principal);
    if (input.qty <= 0 || input.ratePerUnit <= 0) {
      throw new ConflictError('Quantity and rate must both be greater than zero');
    }
    const isMilk = input.kind === 'raw_milk';
    const [node] = await this.db.select({ dispatchMode: mpNodes.dispatchMode }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, sale.nodeId))).limit(1);
    const shift = isMilk && node && !isPooled(node.dispatchMode) ? input.shift ?? null : null;
    const item = isMilk ? null : await this.loadItem(input.itemId!);
    const amount = round2(input.qty * input.ratePerUnit);
    const delta = round2(amount - Number(sale.amount));

    return this.db.transaction(async (tx) => {
      const [row] = await tx.update(mpFarmerSales).set({
        saleDate: input.saleDate,
        kind: input.kind,
        shift,
        milkType: isMilk ? input.milkType! : null,
        itemId: isMilk ? null : input.itemId!,
        qty: String(input.qty),
        unit: isMilk ? 'L' : (item?.unit ?? 'nos'),
        ratePerUnit: String(input.ratePerUnit),
        amount: String(amount),
        note: input.note ?? null,
      }).where(eq(mpFarmerSales.id, sale.id)).returning();
      // The ledger debit has to move with it, or the next cycle recovers the
      // old figure.
      if (sale.ledgerEntryId) {
        await tx.update(mpFarmerLedger)
          .set({ amount: String(amount), occurredOn: input.saleDate })
          .where(eq(mpFarmerLedger.id, sale.ledgerEntryId));
      }
      await new MpGlPoster(this.tenantId, userId).postFarmerSaleAdjust(tx, {
        saleId: sale.id, date: input.saleDate, delta,
      });
      return row!;
    });
  }

  /**
   * Delete a sale outright — the same-day "wrong farmer, wrong number" fix an
   * operator expects. The row and its ledger debit go, and a contra JE keeps
   * the books balanced and the correction visible. Blocked once a cycle has
   * recovered it, which is what `reverse` is for.
   */
  async remove(id: string, principal: MpPrincipal, userId?: string): Promise<void> {
    const sale = await this.loadEditable(id, principal);
    await this.db.transaction(async (tx) => {
      await tx.delete(mpFarmerSales).where(eq(mpFarmerSales.id, sale.id));
      if (sale.ledgerEntryId) {
        await tx.delete(mpFarmerLedger).where(eq(mpFarmerLedger.id, sale.ledgerEntryId));
      }
      // Deleting the ledger row is safe because the running balance is summed,
      // never read off the last row (see farmer-ledger.ts → ledgerBalance).
      if (sale.journalEntryId) {
        await new MpGlPoster(this.tenantId, userId).postFarmerSale(tx, {
          saleId: sale.id, date: sale.saleDate, amount: Number(sale.amount), reverse: true,
        });
      }
    });
  }

  /** A sale the caller may change: theirs, live, and not yet recovered. */
  private async loadEditable(id: string, principal: MpPrincipal): Promise<MpFarmerSaleRow> {
    const [sale] = await this.db.select().from(mpFarmerSales)
      .where(and(eq(mpFarmerSales.tenantId, this.tenantId), eq(mpFarmerSales.id, id))).limit(1);
    if (!sale) throw new NotFoundError('Sale not found');
    if (sale.reversedAt) throw new ConflictError('This sale is already reversed');
    assertNodeAccess(principal, sale.nodeId);
    await assertFarmerAtNode(this.db, this.tenantId, principal, sale.farmerId);
    await this.assertUnrecovered(sale);
    return sale;
  }

  /**
   * Guard the money, on two counts — a cycle can have claimed this sale in
   * either of two ways:
   *
   *   1. A payout line already covers the sale's date. Deductions are computed
   *      at cycle GENERATE but the repayment ledger rows are only written at
   *      LOCK, so between the two the ledger still shows the sale outstanding
   *      while the line has already counted it. Editing there would leave the
   *      line disagreeing with a statement the farmer can already read.
   *   2. The ledger says it has been repaid — which catches recovery by a LATER
   *      cycle whose window doesn't contain the sale date at all (an August
   *      cycle clearing a July purchase the milk was too small to cover).
   */
  private async assertUnrecovered(sale: MpFarmerSaleRow): Promise<void> {
    const [claimed] = await this.db.select({ id: mpPayoutLines.id })
      .from(mpPayoutLines)
      .innerJoin(mpPayoutCycles, eq(mpPayoutLines.payoutCycleId, mpPayoutCycles.id))
      .where(and(
        eq(mpPayoutLines.tenantId, this.tenantId),
        eq(mpPayoutLines.farmerId, sale.farmerId),
        ne(mpPayoutCycles.status, 'reversed'),
        lte(mpPayoutCycles.periodStart, sale.saleDate),
        gte(mpPayoutCycles.periodEnd, sale.saleDate),
      )).limit(1);
    if (claimed) {
      throw new ConflictError('A payout cycle already covers this date — reverse the cycle first');
    }
    const rows = await this.db.select({
      entryType: mpFarmerLedger.entryType, refType: mpFarmerLedger.refType, amount: mpFarmerLedger.amount,
    }).from(mpFarmerLedger).where(and(
      eq(mpFarmerLedger.tenantId, this.tenantId), eq(mpFarmerLedger.farmerId, sale.farmerId)));
    if (foldOutstanding(rows).farmerSale + 1e-6 < Number(sale.amount)) {
      throw new ConflictError('Already recovered in a payout cycle — reverse the cycle first');
    }
  }

  /** Contra the sale: an `adjustment` credit on the ledger + the inverse JE. */
  async reverse(id: string, principal: MpPrincipal, userId?: string): Promise<MpFarmerSaleRow> {
    const sale = await this.loadEditable(id, principal);
    const amount = Number(sale.amount);

    return this.db.transaction(async (tx) => {
      await appendLedgerEntry(tx, this.tenantId, {
        farmerId: sale.farmerId, entryType: 'adjustment', amount,
        occurredOn: sale.saleDate, refType: 'farmer_sale', refId: sale.id, createdBy: userId,
      });
      await new MpGlPoster(this.tenantId, userId).postFarmerSale(tx, {
        saleId: sale.id, date: sale.saleDate, amount, reverse: true,
      });
      const [row] = await tx.update(mpFarmerSales)
        .set({ reversedAt: new Date(), reversedBy: userId ?? null })
        .where(eq(mpFarmerSales.id, sale.id)).returning();
      return row!;
    });
  }
}

/**
 * What an operator may sell at the counter: active, stocked finished or trading
 * goods. Raw materials, packaging and spares are inventory the dairy consumes,
 * not a catalogue — offering them would bury the four things farmers buy.
 *
 * Served from the Dhenu module rather than the masters routes so an operator
 * never needs the inventory module's access grant.
 */
export async function sellableItems(db: Db, tenantId: string): Promise<SellableItem[]> {
  return db.select({
    id: items.id, name: items.name, sku: items.sku,
    unit: items.unit, defaultSellingPrice: items.defaultSellingPrice,
  }).from(items).where(and(
    eq(items.tenantId, tenantId),
    eq(items.isActive, true),
    eq(items.type, 'product'),
    inArray(items.itemClass, ['finished_good', 'trading_good']),
  )).orderBy(items.name);
}

/** Node scope for an unfiltered list: an operator sees only their own centres. */
function scopeSales(principal: MpPrincipal, filters: FarmerSaleFilter) {
  if (principal.kind === 'all' || principal.kind === 'farmer' || filters.nodeId) return undefined;
  if (principal.kind === 'operator' && principal.nodeIds.size) {
    return inArray(mpFarmerSales.nodeId, [...principal.nodeIds]);
  }
  return sql`false`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Litres, at the precision the column stores them. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
