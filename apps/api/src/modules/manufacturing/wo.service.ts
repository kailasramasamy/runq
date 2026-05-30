import { and, eq, desc, sql, ilike, gte, lte, inArray } from 'drizzle-orm';
import { workOrders, boms, bomLines, items, warehouses } from '@runq/db';
import type { Db } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type {
  WorkOrderListRow,
  WorkOrderWithDetail,
  WorkOrderExpectedLine,
  WorkOrderStatus,
} from '@runq/types';
import type { PaginationMeta } from '@runq/types';
import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  CancelWorkOrderInput,
  WorkOrderFilter,
} from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';

export interface WorkOrderListResult {
  data: WorkOrderListRow[];
  meta: PaginationMeta;
}

const PRE_CLOSE_STATUSES = ['draft', 'in_progress', 'completed'] as const;

export class WorkOrderService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(
    filters: WorkOrderFilter,
    pagination: { page: number; limit: number },
  ): Promise<WorkOrderListResult> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const where = this.buildWhere(filters);

    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          wo: workOrders,
          bomCode: boms.bomCode,
          bomName: boms.name,
          outputItemName: items.name,
          warehouseName: warehouses.name,
        })
        .from(workOrders)
        .innerJoin(boms, eq(boms.id, workOrders.bomId))
        .innerJoin(items, eq(items.id, boms.outputItemId))
        .innerJoin(warehouses, eq(warehouses.id, workOrders.warehouseId))
        .where(where)
        .orderBy(desc(workOrders.scheduledFor), desc(workOrders.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(workOrders)
        .where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => ({
        ...this.toWO(r.wo),
        bomCode: r.bomCode,
        bomName: r.bomName,
        outputItemName: r.outputItemName,
        warehouseName: r.warehouseName,
      })),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getById(id: string): Promise<WorkOrderWithDetail> {
    const [row] = await this.db
      .select({
        wo: workOrders,
        bom: boms,
        outputItemName: items.name,
        warehouseName: warehouses.name,
      })
      .from(workOrders)
      .innerJoin(boms, eq(boms.id, workOrders.bomId))
      .innerJoin(items, eq(items.id, boms.outputItemId))
      .innerJoin(warehouses, eq(warehouses.id, workOrders.warehouseId))
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('WorkOrder');

    // Fetch BOM lines at the snapshotted version
    const inputItems = this.db
      .select({ id: items.id, name: items.name })
      .from(items)
      .as('input_items');

    const lines = await this.db
      .select({ line: bomLines, inputItemName: inputItems.name })
      .from(bomLines)
      .innerJoin(inputItems, eq(inputItems.id, bomLines.inputItemId))
      .where(
        and(
          eq(bomLines.bomId, row.wo.bomId),
        ),
      )
      .orderBy(bomLines.lineNo);

    const plannedQty = Number(row.wo.plannedQty);

    const expected: WorkOrderExpectedLine[] = lines.map((l) => {
      const qtyPerOutput = Number(l.line.qtyPerOutput);
      const scrapPct = Number(l.line.scrapPct);
      const expectedQty = qtyPerOutput * plannedQty * (1 + scrapPct / 100);
      return {
        bomLineId: l.line.id,
        inputItemId: l.line.inputItemId,
        inputItemName: l.inputItemName,
        qtyPerOutput,
        inputUom: l.line.inputUom,
        scrapPct,
        expectedQty,
        isOptional: l.line.isOptional,
      };
    });

    return {
      ...this.toWO(row.wo),
      bomCode: row.bom.bomCode,
      bomName: row.bom.name,
      outputItemId: row.bom.outputItemId,
      outputItemName: row.outputItemName,
      outputUom: row.bom.outputUom,
      warehouseName: row.warehouseName,
      expected,
    };
  }

  async create(input: CreateWorkOrderInput, userId?: string): Promise<WorkOrderWithDetail> {
    // Validate BOM is active and belongs to tenant
    const [activeBom] = await this.db
      .select()
      .from(boms)
      .where(
        and(
          eq(boms.id, input.bomId),
          eq(boms.tenantId, this.tenantId),
          eq(boms.isActive, true),
        ),
      )
      .limit(1);

    if (!activeBom) {
      throw new ConflictError('BOM not found or is not active for this tenant');
    }

    const MAX_ATTEMPTS = 5;
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const woNumber = await this.nextWoNumber(input.scheduledFor);
      try {
        const result = await this.db.transaction(async (tx) => {
          const [wo] = await tx
            .insert(workOrders)
            .values({
              tenantId: this.tenantId,
              woNumber,
              bomId: input.bomId,
              bomVersion: activeBom.version,
              plannedQty: String(input.plannedQty),
              warehouseId: input.warehouseId,
              shift: input.shift ?? null,
              scheduledFor: input.scheduledFor,
              status: 'draft',
              createdBy: userId ?? null,
            })
            .returning();
          return wo!;
        });
        return this.getById(result.id);
      } catch (err) {
        lastErr = err;
        const code =
          (err as { code?: string })?.code ??
          (err as { cause?: { code?: string } })?.cause?.code;
        if (code === '23505') {
          console.warn(
            `[wo.create] wo_number ${woNumber} collided, retrying (attempt ${attempt + 1}/${MAX_ATTEMPTS})`,
          );
          continue;
        }
        throw err;
      }
    }
    throw lastErr ?? new Error('Failed to allocate a unique WO number after retries');
  }

  async update(id: string, input: UpdateWorkOrderInput, userId?: string): Promise<WorkOrderWithDetail> {
    void userId;
    const existing = await this.getById(id);
    if (existing.status !== 'draft') {
      throw new ConflictError(`Only draft work orders can be edited (current: ${existing.status})`);
    }

    // If bomId is changing, validate the new BOM
    if (input.bomId && input.bomId !== existing.bomId) {
      const [newBom] = await this.db
        .select()
        .from(boms)
        .where(
          and(
            eq(boms.id, input.bomId),
            eq(boms.tenantId, this.tenantId),
            eq(boms.isActive, true),
          ),
        )
        .limit(1);
      if (!newBom) throw new ConflictError('BOM not found or is not active');
    }

    const patch: Partial<typeof workOrders.$inferInsert> = { updatedAt: new Date() };
    if (input.bomId !== undefined) patch.bomId = input.bomId;
    if (input.plannedQty !== undefined) patch.plannedQty = String(input.plannedQty);
    if (input.warehouseId !== undefined) patch.warehouseId = input.warehouseId;
    if (input.shift !== undefined) patch.shift = input.shift ?? null;
    if (input.scheduledFor !== undefined) patch.scheduledFor = input.scheduledFor;

    await this.db
      .update(workOrders)
      .set(patch)
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, this.tenantId)));

    return this.getById(id);
  }

  async cancel(id: string, input: CancelWorkOrderInput, userId?: string): Promise<WorkOrderWithDetail> {
    void userId;
    const existing = await this.getById(id);
    if (!PRE_CLOSE_STATUSES.includes(existing.status as typeof PRE_CLOSE_STATUSES[number])) {
      throw new ConflictError(`Work order cannot be cancelled from ${existing.status}`);
    }

    await this.db
      .update(workOrders)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledReason: input.reason ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, this.tenantId)));

    return this.getById(id);
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async nextWoNumber(scheduledFor: string): Promise<string> {
    // Format: WO-YYYYMMDD-NNNN (date-scoped per tenant per day)
    const datePart = scheduledFor.replace(/-/g, ''); // "2026-05-29" → "20260529"
    const prefix = `WO-${datePart}-`;
    const [row] = await this.db
      .select({
        maxN: sql<number | null>`MAX(
          CASE
            WHEN ${workOrders.woNumber} ~ ('^' || ${prefix} || '[0-9]+$')
            THEN substring(${workOrders.woNumber} from char_length(${prefix}) + 1)::int
            ELSE NULL
          END
        )`,
      })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.tenantId, this.tenantId),
          sql`${workOrders.woNumber} ILIKE ${prefix + '%'}`,
        ),
      );
    const next = (row?.maxN ?? 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  private buildWhere(filters: WorkOrderFilter) {
    const statusParts = filters.status
      ? filters.status.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    return and(
      eq(workOrders.tenantId, this.tenantId),
      statusParts.length === 1
        ? eq(workOrders.status, statusParts[0] as WorkOrderStatus)
        : statusParts.length > 1
          ? inArray(workOrders.status, statusParts as WorkOrderStatus[])
          : undefined,
      filters.bomId ? eq(workOrders.bomId, filters.bomId) : undefined,
      filters.warehouseId ? eq(workOrders.warehouseId, filters.warehouseId) : undefined,
      filters.scheduledFrom ? gte(workOrders.scheduledFor, filters.scheduledFrom) : undefined,
      filters.scheduledTo ? lte(workOrders.scheduledFor, filters.scheduledTo) : undefined,
      filters.search
        ? ilike(workOrders.woNumber, `%${filters.search}%`)
        : undefined,
    );
  }

  private toWO(row: typeof workOrders.$inferSelect) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      woNumber: row.woNumber,
      bomId: row.bomId,
      bomVersion: row.bomVersion,
      plannedQty: Number(row.plannedQty),
      warehouseId: row.warehouseId,
      shift: row.shift ?? null,
      scheduledFor: row.scheduledFor,
      status: row.status as WorkOrderStatus,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelledReason: row.cancelledReason ?? null,
      outputQty: Number(row.outputQty),
      consumedValue: Number(row.consumedValue),
      outputValue: Number(row.outputValue),
      yieldVariance: Number(row.yieldVariance),
      qcStatus: row.qcStatus ?? null,
      jeId: row.jeId ?? null,
      createdBy: row.createdBy ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
