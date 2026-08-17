import { and, eq, asc, sql, or, ilike, inArray } from 'drizzle-orm';
import { mpNodes, vendors } from '@runq/db';
import type { Db, MpNodeRow } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type { CreateNodeInput, UpdateNodeInput, NodeFilter } from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { MpPrincipal, scopeNodes } from './access-scope';
import { assertAssignableRateChart } from './rate-chart.service';

/** A VMCC row carries whether the single-site chain is open to this caller, so
 * the app can offer the one-tap send without a second round trip. */
export type NodeListRow = MpNodeRow & { fastTrackEnabled?: boolean };

export interface NodeListResult {
  data: NodeListRow[];
  meta: PaginationMeta;
}

/** Collection-network nodes (VMCC / CC / PP). */
export class NodeService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(
    filters: NodeFilter,
    pagination: { page: number; limit: number },
    principal: MpPrincipal,
  ): Promise<NodeListResult> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const where = this.buildWhere(filters, principal);
    const [rows, countResult] = await Promise.all([
      // Alphabetical: these are picked by name everywhere (nodes list, billing
      // and rate-chart pickers, the operator's centre selector), and newest-first
      // ordering makes a centre's position depend on when it was created.
      this.db.select().from(mpNodes).where(where)
        .orderBy(asc(mpNodes.name)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(mpNodes).where(where),
    ]);
    const total = countResult[0]?.count ?? 0;
    return {
      data: await this.annotateFastTrack(rows, principal),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  /**
   * Mark the VMCCs whose whole chain this caller may run in one action: the
   * plant above them carries `singleSiteChain`, and the caller can operate the
   * CC and the plant too. Operator scope is descendant-expanded, so an operator
   * assigned to the plant qualifies — which is the single-site case — while a
   * VMCC-only operator does not.
   *
   * Costs one extra query, and only when the page actually holds VMCCs.
   */
  private async annotateFastTrack(
    rows: MpNodeRow[], principal: MpPrincipal,
  ): Promise<NodeListRow[]> {
    const parentIds = [...new Set(
      rows.filter((r) => r.nodeType === 'vmcc' && r.parentNodeId).map((r) => r.parentNodeId!),
    )];
    if (!parentIds.length) return rows;
    // Two hops in one pass: the CCs above these VMCCs, and the plants above
    // those CCs. The tree is only three deep, so a self-join isn't worth it.
    const ccs = await this.db.select().from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), inArray(mpNodes.id, parentIds)));
    const ppIds = [...new Set(ccs.filter((c) => c.parentNodeId).map((c) => c.parentNodeId!))];
    const pps = ppIds.length
      ? await this.db.select().from(mpNodes)
        .where(and(eq(mpNodes.tenantId, this.tenantId), inArray(mpNodes.id, ppIds)))
      : [];
    const ccById = new Map(ccs.map((c) => [c.id, c]));
    const ppById = new Map(pps.map((p) => [p.id, p]));
    const operable = (id: string) => principal.kind === 'all'
      || (principal.kind === 'operator' && principal.nodeIds.has(id));

    return rows.map((r) => {
      if (r.nodeType !== 'vmcc' || !r.parentNodeId) return r;
      const cc = ccById.get(r.parentNodeId);
      const pp = cc?.parentNodeId ? ppById.get(cc.parentNodeId) : undefined;
      const enabled = !!pp?.singleSiteChain && !!cc && operable(cc.id) && operable(pp.id);
      return enabled ? { ...r, fastTrackEnabled: true } : r;
    });
  }

  async getById(id: string): Promise<MpNodeRow> {
    const [row] = await this.db.select().from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, id)));
    if (!row || row.deletedAt) throw new NotFoundError('Node not found');
    return row;
  }

  async create(input: CreateNodeInput): Promise<MpNodeRow> {
    await this.assertCodeFree(input.code);
    if (input.rateChartId) await assertAssignableRateChart(this.db, this.tenantId, input.rateChartId);
    return this.db.transaction(async (tx) => {
      // A via-VMCC bill settles against an AP vendor. Auto-provision one for a new
      // VMCC (as farmers do) so billing never dead-ends on a missing payee; an
      // explicitly supplied vendor still wins.
      let payeeVendorId = input.payeeVendorId ?? null;
      if (!payeeVendorId && input.nodeType === 'vmcc') {
        const [v] = await tx.insert(vendors).values({
          tenantId: this.tenantId, name: input.name, category: 'vmcc',
        }).returning({ id: vendors.id });
        payeeVendorId = v!.id;
      }
      const [row] = await tx.insert(mpNodes).values({
        tenantId: this.tenantId,
        code: input.code,
        name: input.name,
        nodeType: input.nodeType,
        parentNodeId: input.parentNodeId ?? null,
        hasBmc: input.hasBmc,
        singleSiteChain: input.singleSiteChain ?? false,
        dispatchMode: input.dispatchMode,
        measurementMode: input.measurementMode,
        collectionShifts: input.collectionShifts,
        allowedMilkTypes: input.allowedMilkTypes ?? null,
        defaultMilkType: input.defaultMilkType ?? null,
        capacityLitres: num(input.capacityLitres),
        payoutMode: input.payoutMode ?? null,
        payeeVendorId,
        rateChartId: input.rateChartId ?? null,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        pincode: input.pincode ?? null,
        lat: num(input.lat),
        lng: num(input.lng),
      }).returning();
      return row!;
    });
  }

  async update(id: string, input: UpdateNodeInput): Promise<MpNodeRow> {
    await this.getById(id);
    if (input.rateChartId) await assertAssignableRateChart(this.db, this.tenantId, input.rateChartId);
    const patch: Partial<typeof mpNodes.$inferInsert> = { updatedAt: new Date() };
    // raw values: assignDefined skips `undefined` (not provided) and applies
    // `null` (explicit clear) — so nullable fields clear correctly.
    // nodeType is immutable — a node can't change type; the typed write route
    // already fixes which resource (and type) a node belongs to.
    assignDefined(patch, {
      name: input.name, hasBmc: input.hasBmc,
      singleSiteChain: input.singleSiteChain,
      dispatchMode: input.dispatchMode,
      measurementMode: input.measurementMode, collectionShifts: input.collectionShifts,
      allowedMilkTypes: input.allowedMilkTypes, defaultMilkType: input.defaultMilkType,
      payoutMode: input.payoutMode, payeeVendorId: input.payeeVendorId,
      rateChartId: input.rateChartId,
      parentNodeId: input.parentNodeId, addressLine1: input.addressLine1,
      addressLine2: input.addressLine2, city: input.city,
      state: input.state, pincode: input.pincode,
    });
    if (input.capacityLitres !== undefined) patch.capacityLitres = num(input.capacityLitres);
    if (input.lat !== undefined) patch.lat = num(input.lat);
    if (input.lng !== undefined) patch.lng = num(input.lng);
    const [row] = await this.db.update(mpNodes).set(patch)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, id))).returning();
    return row!;
  }

  async deactivate(id: string): Promise<MpNodeRow> {
    await this.getById(id);
    const [row] = await this.db.update(mpNodes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, id))).returning();
    return row!;
  }

  private buildWhere(filters: NodeFilter, principal: MpPrincipal) {
    const conds = [eq(mpNodes.tenantId, this.tenantId), sql`${mpNodes.deletedAt} IS NULL`];
    if (filters.nodeType) conds.push(eq(mpNodes.nodeType, filters.nodeType));
    if (filters.parentNodeId) conds.push(eq(mpNodes.parentNodeId, filters.parentNodeId));
    if (filters.isActive !== undefined) conds.push(eq(mpNodes.isActive, filters.isActive));
    if (filters.search) {
      conds.push(or(ilike(mpNodes.name, `%${filters.search}%`), ilike(mpNodes.code, `%${filters.search}%`))!);
    }
    // assignedOnly (operator selector): restrict to the nodes the operator is
    // DIRECTLY assigned to, ignoring descendant expansion and the nodeType
    // dispatch-lookup override below.
    if (filters.assignedOnly && principal.kind === 'operator') {
      conds.push(principal.directNodeIds.size ? inArray(mpNodes.id, [...principal.directNodeIds]) : sql`false`);
      return and(...conds);
    }
    // Operators are normally restricted to their own node(s) so the app lands on
    // an owned node. An explicit nodeType query is a dispatch-destination lookup
    // (e.g. "list the CCs a VMCC can send to"), so expose that tier tenant-wide —
    // operators may already dispatch to any node. Reads only; writes stay guarded.
    if (!(principal.kind === 'operator' && filters.nodeType)) {
      const scope = scopeNodes(principal);
      if (scope) conds.push(scope);
    }
    return and(...conds);
  }

  private async assertCodeFree(code: string): Promise<void> {
    const [existing] = await this.db.select({ id: mpNodes.id }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.code, code)));
    if (existing) throw new ConflictError(`Node code "${code}" already exists`);
  }
}

/** numeric column ← number|null|undefined → string|null */
function num(v: number | null | undefined): string | null {
  return v != null ? String(v) : null;
}

/** copy only defined keys onto the patch */
function assignDefined(patch: Record<string, unknown>, fields: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) patch[k] = v;
  }
}
