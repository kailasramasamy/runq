import { and, eq, desc, sql, gte, lte } from 'drizzle-orm';
import { mpPours, mpSequences } from '@runq/db';
import type { Db, MpPourRow } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type { RecordPourInput, PourFilter } from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { RateChartService } from './rate-chart.service';
import { MpPrincipal, scopePours, assertNodeAccess } from './access-scope';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

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
  ): Promise<{ data: MpPourRow[]; meta: PaginationMeta }> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const where = this.buildWhere(filters, principal);
    const [rows, countResult] = await Promise.all([
      this.db.select().from(mpPours).where(where)
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
      milkType: input.milkType, fat: input.fat, snf: input.snf,
      scopeNodeId: input.nodeId, onDate: input.collectionDate,
    });
    const qty = input.qtyLitres;
    const baseAmount = round2(qty * res.baseRatePerLitre);
    const bonusAmount = round2(qty * res.bonusPerLitre);
    const lineAmount = round2(qty * res.ratePerLitre);

    return this.db.transaction(async (tx) => {
      // idempotent replay: same device row already synced → return it
      if (input.deviceLocalId) {
        const [dup] = await tx.select().from(mpPours).where(and(
          eq(mpPours.tenantId, this.tenantId), eq(mpPours.nodeId, input.nodeId),
          eq(mpPours.deviceLocalId, input.deviceLocalId),
        ));
        if (dup) return dup;
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
        fat: String(input.fat),
        snf: String(input.snf),
        clr: numOrNull(input.clr),
        tempC: numOrNull(input.tempC),
        qualityGrade: res.grade,
        rateChartId: res.rateChartId,
        ratePerLitre: String(res.ratePerLitre),
        baseAmount: String(baseAmount),
        bonusAmount: String(bonusAmount),
        lineAmount: String(lineAmount),
        captureSource: input.captureSource,
        receiptNo,
        status: 'recorded',
        reversalOf: priorId,
        deviceLocalId: input.deviceLocalId ?? null,
        recordedBy: userId ?? null,
        syncedAt: new Date(),
      }).returning();
      return pour!;
    });
  }

  async reverse(id: string, principal: MpPrincipal): Promise<MpPourRow> {
    const row = await this.getById(id, principal);
    if (row.status !== 'recorded') throw new ConflictError('Pour is not active');
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
