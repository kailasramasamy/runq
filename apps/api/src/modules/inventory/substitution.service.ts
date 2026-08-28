/**
 * Sending something other than what was billed, on purpose and on the record.
 *
 * The warehouse runs out at 4am and the van still leaves — that already
 * happened, every day, and the only question was whether the books found out.
 * Before this, the operator adjusted the stand-in's stock by hand and the
 * billed line stayed open forever: two lies that happened to net off.
 *
 * A substituted DN line is the honest version. It carries the item that
 * physically left, so FEFO, costing and COGS all describe real goods, and it
 * carries `substitutedForItemId` so the invoice line it was sent against still
 * clears. What it must never do is quietly change what the customer was
 * charged, which is what `checkSubstitution` is for.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { deliveryNoteLines, deliveryNotes, itemSubstitutes, items } from '@runq/db';
import { AppError, ConflictError, NotFoundError } from '../../utils/errors';
import { RESOLVED_ITEM_JOIN } from './sales-dispatch.sql';
import { checkSubstitution } from './substitution.logic';
import type { SubstitutionCheck } from './substitution.logic';

interface Ctx { db: Db; tenantId: string; userId?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** A stand-in the dispatch screen can offer for one line. */
export interface SubstituteOption {
  itemId: string;
  itemName: string;
  itemSku: string | null;
  /** Pack size. One product name covers several SKUs, so the name alone
   * doesn't say what is being offered. */
  uom: string | null;
  /**
   * The stand-in's own list price. Carried so the client can show what
   * re-pricing the invoice to this item would do to the total before the
   * operator agrees to it.
   */
  sellingPrice: number | null;
  availableQty: number;
  verdict: SubstitutionCheck['verdict'];
  /** Why it's blocked, or what needs acknowledging. Absent when clear. */
  message?: string;
}

/** What the invoice line billed — the yardstick every candidate is held to. */
export interface BilledContext {
  itemId: string;
  itemName: string;
  hsnSacCode: string | null;
  taxRate: number | null;
  unitPrice: number;
}

/** One line as the dispatch request states it. */
export interface SubstitutionRequest {
  invoiceLineId: string;
  itemId: string;
  substitutedForItemId?: string | null;
  substitutionNote?: string | null;
}

export class SubstitutionService {
  constructor(private readonly ctx: Ctx) {}

  /**
   * Declared stand-ins for a set of items, priced against what each line
   * actually billed and scored with on-hand at this warehouse.
   *
   * One query for the whole preview: a ten-line invoice would otherwise fan
   * out into ten round trips for a picker most lines never open.
   */
  async optionsFor(
    billedByItemId: Map<string, BilledContext>,
    warehouseId: string,
  ): Promise<Map<string, SubstituteOption[]>> {
    const out = new Map<string, SubstituteOption[]>();
    const itemIds = [...billedByItemId.keys()];
    if (itemIds.length === 0) return out;

    const rows = await this.ctx.db
      .select({
        forItemId: itemSubstitutes.itemId,
        priority: itemSubstitutes.priority,
        itemId: items.id,
        itemName: items.name,
        itemSku: items.sku,
        uom: items.unit,
        hsnSacCode: items.hsnSacCode,
        gstRate: items.gstRate,
        defaultSellingPrice: items.defaultSellingPrice,
        availableQty: sql<string>`COALESCE((
          SELECT SUM(soh.qty) FROM stock_on_hand soh
          WHERE soh.tenant_id = ${this.ctx.tenantId}
            AND soh.item_id = ${items.id}
            AND soh.warehouse_id = ${warehouseId}
        ), 0)::text`,
      })
      .from(itemSubstitutes)
      .innerJoin(items, eq(items.id, itemSubstitutes.substituteItemId))
      .where(and(
        eq(itemSubstitutes.tenantId, this.ctx.tenantId),
        inArray(itemSubstitutes.itemId, itemIds),
        eq(items.isActive, true),
      ))
      .orderBy(itemSubstitutes.priority, items.name);

    for (const r of rows) {
      const billed = billedByItemId.get(r.forItemId)!;
      const available = Number(r.availableQty ?? 0);
      // A stand-in with nothing on the shelf is not an option, it's noise on
      // a screen someone is reading in a hurry.
      if (available <= 0) continue;
      const check = checkSubstitution(billed, {
        itemId: r.itemId,
        itemName: r.itemName,
        hsnSacCode: r.hsnSacCode,
        gstRate: numOrNull(r.gstRate),
        defaultSellingPrice: numOrNull(r.defaultSellingPrice),
      });
      const list = out.get(r.forItemId) ?? [];
      list.push({
        itemId: r.itemId,
        itemName: r.itemName,
        itemSku: r.itemSku,
        uom: r.uom,
        sellingPrice: numOrNull(r.defaultSellingPrice),
        availableQty: available,
        verdict: check.verdict,
        ...(check.verdict === 'clear' ? {} : { message: check.message }),
      });
      out.set(r.forItemId, list);
    }
    return out;
  }

  /**
   * Gate every line of an incoming dispatch.
   *
   * Also catches the unmarked case — a line whose item simply isn't the one
   * its invoice line billed, with no substitution claimed. That used to post
   * silently, drawing down stock of one SKU to settle another's obligation
   * with nothing on the document to say so.
   */
  async assertValid(tx: Tx, invoiceId: string, lines: SubstitutionRequest[]): Promise<void> {
    const billed = await this.billedLines(tx, invoiceId, lines.map((l) => l.invoiceLineId));

    for (const line of lines) {
      const row = billed.get(line.invoiceLineId);
      if (!row) throw new AppError(400, 'Invoice line not found');
      const billedItemId = row.itemId;

      if (line.itemId === billedItemId) {
        if (line.substitutedForItemId) {
          throw new AppError(400, `${row.itemName} is what the line billed — nothing to substitute`);
        }
        continue;
      }

      // The item differs. Either it's a declared substitution, or it's a
      // mistake wearing no label.
      if (!line.substitutedForItemId) {
        throw new AppError(
          400,
          `Line bills ${row.itemName} but the dispatch sends a different item. `
          + 'Send it as a substitute so the swap is recorded.',
        );
      }
      if (line.substitutedForItemId !== billedItemId) {
        throw new AppError(400, `Substitution names an item the line did not bill (${row.itemName})`);
      }
      await this.assertDeclaredAndPriced(tx, row, line);
    }
  }

  /** The pairing must be declared, and the candidate must clear the guard. */
  private async assertDeclaredAndPriced(
    tx: Tx,
    row: BilledContext,
    line: SubstitutionRequest,
  ): Promise<void> {
    const [candidate] = await tx
      .select({
        itemId: items.id,
        itemName: items.name,
        hsnSacCode: items.hsnSacCode,
        gstRate: items.gstRate,
        defaultSellingPrice: items.defaultSellingPrice,
      })
      .from(itemSubstitutes)
      .innerJoin(items, eq(items.id, itemSubstitutes.substituteItemId))
      .where(and(
        eq(itemSubstitutes.tenantId, this.ctx.tenantId),
        eq(itemSubstitutes.itemId, row.itemId),
        eq(itemSubstitutes.substituteItemId, line.itemId),
      ))
      .limit(1);
    if (!candidate) {
      throw new ConflictError(
        `Not a declared substitute for ${row.itemName}. `
        + 'Add it on the item master first — an undeclared swap is a decision nobody made.',
      );
    }

    const check = checkSubstitution(row, {
      itemId: candidate.itemId,
      itemName: candidate.itemName,
      hsnSacCode: candidate.hsnSacCode,
      gstRate: numOrNull(candidate.gstRate),
      defaultSellingPrice: numOrNull(candidate.defaultSellingPrice),
    });
    if (check.verdict === 'blocked') throw new ConflictError(check.message);
    if (check.verdict === 'needs_note' && !line.substitutionNote?.trim()) {
      throw new ConflictError(check.message);
    }
  }

  /** Billed item, HSN, rate and price per invoice line, resolved via alias. */
  private async billedLines(
    tx: Tx,
    invoiceId: string,
    invoiceLineIds: string[],
  ): Promise<Map<string, BilledContext>> {
    const result = await tx.execute(sql`
      SELECT
        sii.id                AS invoice_line_id,
        -- Fall back to the item master. A line that simply didn't record its
        -- HSN is not the same as an item that has none: mobile-created
        -- invoices omit these fields entirely, and treating that as "unset"
        -- blocked every substitution on them.
        COALESCE(sii.hsn_sac_code, i.hsn_sac_code) AS hsn_sac_code,
        COALESCE(sii.tax_rate, i.gst_rate)::text   AS tax_rate,
        sii.unit_price::text  AS unit_price,
        sii.description       AS description,
        i.id                  AS item_id,
        i.name                AS item_name
      FROM sales_invoice_items sii
      ${RESOLVED_ITEM_JOIN}
      LEFT JOIN items i ON i.id = COALESCE(sii.item_id, a.item_id)
      WHERE sii.tenant_id = ${this.ctx.tenantId}
        AND sii.invoice_id = ${invoiceId}
        AND sii.id IN (${sql.join(invoiceLineIds.map((id) => sql`${id}`), sql`, `)})
    `);
    const rows = (result as unknown as { rows: Row[] }).rows;
    const out = new Map<string, BilledContext>();
    for (const r of rows) {
      if (!r.item_id) continue;
      out.set(r.invoice_line_id, {
        itemId: r.item_id,
        itemName: r.item_name ?? r.description,
        hsnSacCode: r.hsn_sac_code ?? null,
        taxRate: numOrNull(r.tax_rate),
        unitPrice: Number(r.unit_price ?? 0),
      });
    }
    return out;
  }

  /**
   * Stand-in options for the lines of a draft delivery note.
   *
   * The dispatch-from-invoice screen isn't the only place a substitution is
   * decided — most of them are decided *later*, against the shortfall draft
   * auto-dispatch parked when the shelf ran out. That draft is where the
   * operator actually meets the problem, so the same picker has to work here.
   */
  async optionsForDraft(dnId: string): Promise<Map<string, SubstituteOption[]>> {
    const [dn] = await this.ctx.db
      .select({
        id: deliveryNotes.id,
        status: deliveryNotes.status,
        warehouseId: deliveryNotes.warehouseId,
        invoiceId: deliveryNotes.invoiceId,
      })
      .from(deliveryNotes)
      .where(and(
        eq(deliveryNotes.id, dnId),
        eq(deliveryNotes.tenantId, this.ctx.tenantId),
      ))
      .limit(1);
    if (!dn) throw new NotFoundError('Delivery note');
    // Only a draft can still change what it will send.
    if (dn.status !== 'draft' || !dn.invoiceId) return new Map();

    const lines = await this.ctx.db
      .select({ id: deliveryNoteLines.id, invoiceLineId: deliveryNoteLines.invoiceLineId })
      .from(deliveryNoteLines)
      .where(eq(deliveryNoteLines.dnId, dnId));
    const lineIds = lines.map((l) => l.invoiceLineId).filter((v): v is string => !!v);
    if (lineIds.length === 0) return new Map();

    const billed = await this.billedLines(this.ctx.db, dn.invoiceId, lineIds);
    const byItem = new Map<string, BilledContext>();
    for (const ctx of billed.values()) byItem.set(ctx.itemId, ctx);
    const options = await this.optionsFor(byItem, dn.warehouseId);

    // Re-key by DN line — the screen edits lines, not items.
    const out = new Map<string, SubstituteOption[]>();
    for (const l of lines) {
      if (!l.invoiceLineId) continue;
      const ctx = billed.get(l.invoiceLineId);
      if (!ctx) continue;
      out.set(l.id, options.get(ctx.itemId) ?? []);
    }
    return out;
  }

  /**
   * Swap what a draft line will send, in place.
   *
   * In place rather than cancel-and-recreate: a shortfall draft usually holds
   * several lines, and tearing it down to change one would drop the others
   * out of the shortages queue while they are still owed.
   */
  async substituteDraftLine(
    dnId: string,
    lineId: string,
    input: { itemId: string; note?: string | null },
  ) {
    return this.ctx.db.transaction(async (tx: Tx) => {
      const [dn] = await tx
        .select({
          id: deliveryNotes.id,
          status: deliveryNotes.status,
          invoiceId: deliveryNotes.invoiceId,
        })
        .from(deliveryNotes)
        .where(and(
          eq(deliveryNotes.id, dnId),
          eq(deliveryNotes.tenantId, this.ctx.tenantId),
        ))
        .limit(1);
      if (!dn) throw new NotFoundError('Delivery note');
      if (dn.status !== 'draft') {
        throw new ConflictError(`Delivery note is ${dn.status} — its lines can no longer change`);
      }
      if (!dn.invoiceId) {
        throw new AppError(400, 'Only a delivery note raised from an invoice can substitute');
      }

      const [line] = await tx
        .select({
          id: deliveryNoteLines.id,
          itemId: deliveryNoteLines.itemId,
          invoiceLineId: deliveryNoteLines.invoiceLineId,
          substitutedForItemId: deliveryNoteLines.substitutedForItemId,
        })
        .from(deliveryNoteLines)
        .where(and(eq(deliveryNoteLines.id, lineId), eq(deliveryNoteLines.dnId, dnId)))
        .limit(1);
      if (!line) throw new NotFoundError('Delivery note line');
      if (!line.invoiceLineId) {
        throw new AppError(400, 'This line is not linked to an invoice line');
      }

      // The item this line is *meant* to deliver — the original billed item,
      // not whatever a previous substitution swapped in. Without this, a
      // second swap would validate against the first stand-in and drift away
      // from what the customer was actually billed.
      const billedItemId = line.substitutedForItemId ?? line.itemId;

      await this.assertValid(tx, dn.invoiceId, [{
        invoiceLineId: line.invoiceLineId,
        itemId: input.itemId,
        substitutedForItemId: input.itemId === billedItemId ? null : billedItemId,
        substitutionNote: input.note,
      }]);

      const revert = input.itemId === billedItemId;
      const [updated] = await tx
        .update(deliveryNoteLines)
        .set({
          itemId: input.itemId,
          substitutedForItemId: revert ? null : billedItemId,
          substitutionNote: revert ? null : (input.note?.trim() || null),
          // The batch belonged to the item being replaced; FEFO re-picks for
          // whatever is going out now.
          batchNo: null,
        })
        .where(eq(deliveryNoteLines.id, lineId))
        .returning();
      return updated!;
    });
  }

  /**
   * Replace the declared stand-ins for an item, as a set.
   *
   * Self-reference and unknown items are rejected rather than filtered: a
   * picker that silently drops half a selection teaches people to distrust it.
   */
  async setSubstitutes(itemId: string, substituteItemIds: string[]) {
    const unique = [...new Set(substituteItemIds)];
    if (unique.includes(itemId)) {
      throw new AppError(400, 'An item cannot substitute for itself');
    }
    const known = await this.ctx.db
      .select({ id: items.id })
      .from(items)
      .where(and(
        eq(items.tenantId, this.ctx.tenantId),
        inArray(items.id, [itemId, ...unique]),
      ));
    const knownIds = new Set(known.map((i) => i.id));
    if (!knownIds.has(itemId)) throw new NotFoundError('Item');
    const missing = unique.filter((id) => !knownIds.has(id));
    if (missing.length) throw new NotFoundError('Substitute item');

    return this.ctx.db.transaction(async (tx: Tx) => {
      await tx
        .delete(itemSubstitutes)
        .where(and(
          eq(itemSubstitutes.tenantId, this.ctx.tenantId),
          eq(itemSubstitutes.itemId, itemId),
        ));
      if (unique.length === 0) return [];
      return tx
        .insert(itemSubstitutes)
        .values(unique.map((substituteItemId, i) => ({
          tenantId: this.ctx.tenantId,
          itemId,
          substituteItemId,
          priority: i,
        })))
        .returning();
    });
  }

  /** The declared list for the item master screen, in the order it offers them. */
  async listSubstitutes(itemId: string) {
    return this.ctx.db
      .select({
        itemId: items.id,
        itemName: items.name,
        itemSku: items.sku,
        priority: itemSubstitutes.priority,
      })
      .from(itemSubstitutes)
      .innerJoin(items, eq(items.id, itemSubstitutes.substituteItemId))
      .where(and(
        eq(itemSubstitutes.tenantId, this.ctx.tenantId),
        eq(itemSubstitutes.itemId, itemId),
      ))
      .orderBy(itemSubstitutes.priority, items.name);
  }
}

function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}
