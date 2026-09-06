import { and, eq, desc, sql, gte, lte, getTableColumns } from 'drizzle-orm';
import { mpPours, mpSequences } from '@runq/db';
import type { Db, MpPourRow } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type { RecordPourInput, CorrectPourInput, PourFilter } from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { RateChartService } from './rate-chart.service';
import { isShiftClosed } from './shift-closure.queries';
import { MpPrincipal, scopePours, assertNodeAccess } from './access-scope';
import { sendPourReceiptWhatsApp } from './mp-pour-notify';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Litres off this pour later refused, wherever it was caught.
 *
 * A VMCC operator otherwise reads their own screen as "97.7 L, paid" for milk
 * the plant threw away three legs later and the farmer is being charged for.
 * The pour stays recorded and correct — this is what happened to it afterwards.
 *
 * `mp_pours.id` is written out in full deliberately: interpolating the column
 * renders a BARE "id", which inside the subquery binds to the charge row's own
 * id and silently matches nothing.
 */
const pourRejectedQtySql = sql<string>`(
  select coalesce(sum(ch.qty_litres), 0)
  from mp_rejection_charges ch
  join mp_rejections rj on rj.id = ch.rejection_id
  where ch.pour_id = mp_pours.id and ch.reversed_at is null and rj.reversed_at is null)`;

/** A pour plus whatever was later refused off it. */
export type MpPourWithRejection = MpPourRow & { rejectedQty: string };

/** Farmer pour ledger — record (with rate resolution), list, reverse. */
export class PourService {
  private readonly rates: RateChartService;

  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {
    this.rates = new RateChartService(db, tenantId);
  }

  async list(
    filters: PourFilter,
    pagination: { page: number; limit: number },
    principal: MpPrincipal,
  ): Promise<{ data: MpPourWithRejection[]; meta: PaginationMeta }> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const where = this.buildWhere(filters, principal);
    const [rows, countResult] = await Promise.all([
      this.db.select({ ...getTableColumns(mpPours), rejectedQty: pourRejectedQtySql })
        .from(mpPours).where(where)
        .orderBy(desc(mpPours.collectionDate), desc(mpPours.recordedAt)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(mpPours).where(where),
    ]);
    const total = countResult[0]?.count ?? 0;
    return { data: rows, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(id: string, principal: MpPrincipal): Promise<MpPourRow> {
    const [row] = await this.db.select().from(mpPours)
      .where(and(eq(mpPours.tenantId, this.tenantId), eq(mpPours.id, id), scopePours(principal)));
    if (!row) throw new NotFoundError('Pour not found');
    return row;
  }

  async record(input: RecordPourInput, userId: string | undefined, principal: MpPrincipal): Promise<MpPourRow> {
    // operators may only record at a node they're assigned to
    assertNodeAccess(principal, input.nodeId);
    // resolve rate from the active chart for this milk type / node scope
    const res = await this.rates.resolveRate({
      milkType: input.milkType,
      fat: input.fat ?? undefined, snf: input.snf ?? undefined, clr: input.clr ?? undefined,
      scopeNodeId: input.nodeId, farmerId: input.farmerId, onDate: input.collectionDate,
    });
    const qty = input.qtyLitres;
    const baseAmount = round2(qty * res.baseRatePerLitre);
    const bonusAmount = round2(qty * res.bonusPerLitre);
    const lineAmount = round2(qty * res.ratePerLitre);
    // Banked per pour, settled at quarter close — deliberately outside
    // lineAmount, which is what the fortnightly cycle pays.
    const quarterlyBonusAmount = round2(qty * res.quarterlyBonusPerLitre);

    let isNew = false;
    const saved = await this.db.transaction(async (tx) => {
      // idempotent replay: same device row already synced → return it
      if (input.deviceLocalId) {
        const [dup] = await tx.select().from(mpPours).where(and(
          eq(mpPours.tenantId, this.tenantId), eq(mpPours.nodeId, input.nodeId),
          eq(mpPours.deviceLocalId, input.deviceLocalId),
        ));
        if (dup) return dup;
      }
      // once the slot is closed for collection, no new pours or corrections —
      // covers both the insert below and the implicit prior-reversal.
      if (await isShiftClosed(tx, {
        tenantId: this.tenantId, nodeId: input.nodeId,
        collectionDate: input.collectionDate, shift: input.shift,
      })) {
        throw new ConflictError('Shift is closed for collection');
      }
      // last-write-wins: a repeat for the same (farmer, date, shift, milk type)
      // reverses ALL prior readings for that slot (a "Replace" is one corrected
      // reading) — unless the operator deliberately adds a lot.
      let priorId: string | null = null;
      if (!input.asNewLot) {
        const priors = await tx.update(mpPours).set({ status: 'reversed' }).where(and(
          eq(mpPours.tenantId, this.tenantId), eq(mpPours.farmerId, input.farmerId),
          eq(mpPours.collectionDate, input.collectionDate), eq(mpPours.shift, input.shift),
          eq(mpPours.milkType, input.milkType), eq(mpPours.status, 'recorded'),
        )).returning({ id: mpPours.id });
        priorId = priors[0]?.id ?? null;
      }
      const receiptNo = await this.nextReceiptNo(tx, input.collectionDate);
      const [pour] = await tx.insert(mpPours).values({
        tenantId: this.tenantId,
        nodeId: input.nodeId,
        farmerId: input.farmerId,
        collectionDate: input.collectionDate,
        shift: input.shift,
        milkType: input.milkType,
        qtyLitres: String(qty),
        fat: numOrNull(input.fat),
        snf: numOrNull(input.snf),
        clr: numOrNull(input.clr),
        water: numOrNull(input.water),
        tempC: numOrNull(input.tempC),
        qualityGrade: res.grade,
        snfGated: res.snfGated,
        rateChartId: res.rateChartId,
        ratePerLitre: String(res.ratePerLitre),
        baseAmount: String(baseAmount),
        bonusAmount: String(bonusAmount),
        lineAmount: String(lineAmount),
        quarterlyBonusAmount: String(quarterlyBonusAmount),
        captureSource: input.captureSource,
        receiptNo,
        status: 'recorded',
        reversalOf: priorId ?? input.supersedesPourId ?? null,
        deviceLocalId: input.deviceLocalId ?? null,
        recordedBy: userId ?? null,
        syncedAt: new Date(),
      }).returning();
      isNew = true;
      return pour!;
    });

    // Fire-and-forget: WhatsApp receipt to the farmer for a freshly recorded
    // pour (skips idempotent device replays). The notifier gates on VMCC node
    // type, farmer phone, and Interakt config.
    if (isNew) {
      void sendPourReceiptWhatsApp(this.db, this.tenantId, saved)
        .catch((err) => console.error('pour WhatsApp receipt failed:', err));
    }
    return saved;
  }

  /**
   * Correct a recorded pour's readings in place of the operator's mistake. One
   * transaction: reverse the original (kept as audit) and insert a re-priced
   * replacement with the same identity, linked via reversalOf. Re-prices on the
   * pour's own collectionDate, and — unlike record(asNewLot:false) — targets
   * this pour by id, so a sibling lot in the same slot is left untouched.
   */
  async correct(
    id: string, input: CorrectPourInput, userId: string | undefined, principal: MpPrincipal,
  ): Promise<MpPourRow> {
    const existing = await this.getById(id, principal);
    assertNodeAccess(principal, existing.nodeId);
    if (existing.status !== 'recorded') throw new ConflictError('Pour is not active');
    const res = await this.rates.resolveRate({
      milkType: existing.milkType,
      fat: input.fat ?? undefined, snf: input.snf ?? undefined, clr: input.clr ?? undefined,
      scopeNodeId: existing.nodeId, farmerId: existing.farmerId, onDate: existing.collectionDate,
    });
    const qty = input.qtyLitres;
    return this.db.transaction(async (tx) => {
      if (await isShiftClosed(tx, {
        tenantId: this.tenantId, nodeId: existing.nodeId,
        collectionDate: existing.collectionDate, shift: existing.shift,
      })) {
        throw new ConflictError('Shift is closed — reopen it to edit pours');
      }
      // Reverse only this pour (id-targeted), guarding against a concurrent edit.
      const reversed = await tx.update(mpPours).set({ status: 'reversed' })
        .where(and(
          eq(mpPours.tenantId, this.tenantId), eq(mpPours.id, id), eq(mpPours.status, 'recorded'),
        )).returning({ id: mpPours.id });
      if (!reversed.length) throw new ConflictError('Pour is not active');
      const receiptNo = await this.nextReceiptNo(tx, existing.collectionDate);
      const [pour] = await tx.insert(mpPours).values({
        tenantId: this.tenantId,
        nodeId: existing.nodeId,
        farmerId: existing.farmerId,
        collectionDate: existing.collectionDate,
        shift: existing.shift,
        milkType: existing.milkType,
        qtyLitres: String(qty),
        fat: numOrNull(input.fat), snf: numOrNull(input.snf), clr: numOrNull(input.clr),
        water: numOrNull(input.water),
        qualityGrade: res.grade,
        snfGated: res.snfGated,
        rateChartId: res.rateChartId,
        ratePerLitre: String(res.ratePerLitre),
        baseAmount: String(round2(qty * res.baseRatePerLitre)),
        bonusAmount: String(round2(qty * res.bonusPerLitre)),
        lineAmount: String(round2(qty * res.ratePerLitre)),
        quarterlyBonusAmount: String(round2(qty * res.quarterlyBonusPerLitre)),
        captureSource: 'manual',
        receiptNo,
        status: 'recorded',
        reversalOf: id,
        recordedBy: userId ?? null,
        syncedAt: new Date(),
      }).returning();
      return pour!;
    });
  }

  async reverse(id: string, principal: MpPrincipal): Promise<MpPourRow> {
    const row = await this.getById(id, principal);
    if (row.status !== 'recorded') throw new ConflictError('Pour is not active');
    if (await isShiftClosed(this.db, {
      tenantId: this.tenantId, nodeId: row.nodeId,
      collectionDate: row.collectionDate, shift: row.shift,
    })) {
      throw new ConflictError('Shift is closed — reopen it to edit pours');
    }
    const [updated] = await this.db.update(mpPours)
      .set({ status: 'reversed' })
      .where(and(eq(mpPours.tenantId, this.tenantId), eq(mpPours.id, id))).returning();
    return updated!;
  }

  /** Atomically bump the per-(tenant, FY) receipt counter. */
  private async nextReceiptNo(tx: Tx, date: string): Promise<string> {
    const fy = financialYear(date);
    const [seq] = await tx.insert(mpSequences)
      .values({ tenantId: this.tenantId, docType: 'receipt', financialYear: fy, lastSequence: 1 })
      .onConflictDoUpdate({
        target: [mpSequences.tenantId, mpSequences.docType, mpSequences.financialYear],
        set: { lastSequence: sql`${mpSequences.lastSequence} + 1`, updatedAt: new Date() },
      })
      .returning({ n: mpSequences.lastSequence });
    return `RCP/${fy}/${String(seq!.n).padStart(5, '0')}`;
  }

  private buildWhere(filters: PourFilter, principal: MpPrincipal) {
    const conds = [eq(mpPours.tenantId, this.tenantId)];
    if (filters.nodeId) conds.push(eq(mpPours.nodeId, filters.nodeId));
    if (filters.farmerId) conds.push(eq(mpPours.farmerId, filters.farmerId));
    if (filters.collectionDate) conds.push(eq(mpPours.collectionDate, filters.collectionDate));
    if (filters.from) conds.push(gte(mpPours.collectionDate, filters.from));
    if (filters.to) conds.push(lte(mpPours.collectionDate, filters.to));
    if (filters.shift) conds.push(eq(mpPours.shift, filters.shift));
    if (filters.status) conds.push(eq(mpPours.status, filters.status));
    const scope = scopePours(principal);
    if (scope) conds.push(scope);
    return and(...conds);
  }
}

/** Indian financial year (Apr–Mar) for a YYYY-MM-DD date, e.g. "2026-27". */
function financialYear(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function numOrNull(v: number | null | undefined): string | null {
  return v != null ? String(v) : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
