import { eq, and, sql, ilike, desc } from 'drizzle-orm';
import { fixedAssets, assetCategories, assetSequences, depreciationEntries, vendors } from '@runq/db';
import type { Db } from '@runq/db';
import type { FixedAsset, FixedAssetWithDepreciation, DepreciationEntry, PaginationMeta } from '@runq/types';
import type { CreateFixedAssetInput, UpdateFixedAssetInput, FixedAssetFilter } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';

export class FixedAssetService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(filters: FixedAssetFilter, page = 1, limit = 25): Promise<{ data: FixedAsset[]; meta: PaginationMeta }> {
    const { offset } = applyPagination(page, limit);

    const conditions = [eq(fixedAssets.tenantId, this.tenantId)];
    if (filters.categoryId) conditions.push(eq(fixedAssets.categoryId, filters.categoryId));
    if (filters.status) conditions.push(eq(fixedAssets.status, filters.status));
    if (filters.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(sql`(${fixedAssets.name} ILIKE ${pattern} OR ${fixedAssets.assetCode} ILIKE ${pattern})`);
    }

    const where = and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          asset: fixedAssets,
          categoryName: assetCategories.name,
          vendorName: vendors.name,
        })
        .from(fixedAssets)
        .innerJoin(assetCategories, eq(fixedAssets.categoryId, assetCategories.id))
        .leftJoin(vendors, eq(fixedAssets.vendorId, vendors.id))
        .where(where)
        .orderBy(desc(fixedAssets.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(fixedAssets).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => ({ ...this.toAsset(r.asset), categoryName: r.categoryName, vendorName: r.vendorName })),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getById(id: string): Promise<FixedAssetWithDepreciation> {
    const [row] = await this.db
      .select({ asset: fixedAssets, categoryName: assetCategories.name, vendorName: vendors.name })
      .from(fixedAssets)
      .innerJoin(assetCategories, eq(fixedAssets.categoryId, assetCategories.id))
      .leftJoin(vendors, eq(fixedAssets.vendorId, vendors.id))
      .where(and(eq(fixedAssets.id, id), eq(fixedAssets.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Fixed asset');

    const depEntries = await this.db
      .select()
      .from(depreciationEntries)
      .where(and(eq(depreciationEntries.assetId, id), eq(depreciationEntries.tenantId, this.tenantId)))
      .orderBy(depreciationEntries.periodEnd);

    const accumDep = depEntries.reduce((sum, e) => sum + toNumber(e.depreciationAmount), 0);
    const currentWdv = toNumber(row.asset.acquisitionCost) - accumDep;

    return {
      ...this.toAsset(row.asset),
      categoryName: row.categoryName,
      vendorName: row.vendorName,
      depreciationEntries: depEntries.map(this.toDepEntry),
      accumulatedDepreciation: Math.round(accumDep * 100) / 100,
      currentWdv: Math.round(currentWdv * 100) / 100,
    };
  }

  async create(input: CreateFixedAssetInput, userId?: string): Promise<FixedAsset> {
    const assetCode = await this.nextAssetCode();

    const [row] = await this.db
      .insert(fixedAssets)
      .values({
        tenantId: this.tenantId,
        assetCode,
        name: input.name,
        description: input.description ?? null,
        categoryId: input.categoryId,
        acquisitionDate: input.acquisitionDate,
        acquisitionCost: String(input.acquisitionCost),
        residualValue: String(input.residualValue),
        putToUseDate: input.putToUseDate ?? null,
        location: input.location ?? null,
        serialNumber: input.serialNumber ?? null,
        purchaseInvoiceId: input.purchaseInvoiceId ?? null,
        vendorId: input.vendorId ?? null,
        gstCreditClaimed: input.gstCreditClaimed,
        gstAmount: String(input.gstAmount),
        createdBy: userId ?? null,
      })
      .returning();

    return this.toAsset(row!);
  }

  async update(id: string, input: UpdateFixedAssetInput): Promise<FixedAsset> {
    await this.getById(id); // validate exists

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) values.name = input.name;
    if (input.description !== undefined) values.description = input.description ?? null;
    if (input.categoryId !== undefined) values.categoryId = input.categoryId;
    if (input.acquisitionDate !== undefined) values.acquisitionDate = input.acquisitionDate;
    if (input.acquisitionCost !== undefined) values.acquisitionCost = String(input.acquisitionCost);
    if (input.residualValue !== undefined) values.residualValue = String(input.residualValue);
    if (input.putToUseDate !== undefined) values.putToUseDate = input.putToUseDate ?? null;
    if (input.location !== undefined) values.location = input.location ?? null;
    if (input.serialNumber !== undefined) values.serialNumber = input.serialNumber ?? null;
    if (input.purchaseInvoiceId !== undefined) values.purchaseInvoiceId = input.purchaseInvoiceId ?? null;
    if (input.vendorId !== undefined) values.vendorId = input.vendorId ?? null;
    if (input.gstCreditClaimed !== undefined) values.gstCreditClaimed = input.gstCreditClaimed;
    if (input.gstAmount !== undefined) values.gstAmount = String(input.gstAmount);

    const [row] = await this.db
      .update(fixedAssets)
      .set(values)
      .where(and(eq(fixedAssets.id, id), eq(fixedAssets.tenantId, this.tenantId)))
      .returning();

    return this.toAsset(row!);
  }

  private async nextAssetCode(): Promise<string> {
    const fy = this.getCurrentFY();
    const [seqRow] = await this.db
      .insert(assetSequences)
      .values({ tenantId: this.tenantId, financialYear: fy, lastSequence: 1 })
      .onConflictDoUpdate({
        target: [assetSequences.tenantId, assetSequences.financialYear],
        set: { lastSequence: sql`${assetSequences.lastSequence} + 1`, updatedAt: new Date() },
      })
      .returning();

    const seq = String(seqRow!.lastSequence).padStart(4, '0');
    return `FA-${fy}-${seq}`;
  }

  private getCurrentFY(): string {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const fyStart = month >= 4 ? year : year - 1;
    const fyEnd = fyStart + 1;
    return `${String(fyStart).slice(-2)}${String(fyEnd).slice(-2)}`;
  }

  private toAsset(row: typeof fixedAssets.$inferSelect): FixedAsset {
    return {
      id: row.id,
      tenantId: row.tenantId,
      assetCode: row.assetCode,
      name: row.name,
      description: row.description,
      categoryId: row.categoryId,
      acquisitionDate: row.acquisitionDate,
      acquisitionCost: toNumber(row.acquisitionCost),
      residualValue: toNumber(row.residualValue),
      putToUseDate: row.putToUseDate,
      location: row.location,
      serialNumber: row.serialNumber,
      status: row.status,
      purchaseInvoiceId: row.purchaseInvoiceId,
      vendorId: row.vendorId,
      gstCreditClaimed: row.gstCreditClaimed,
      gstAmount: toNumber(row.gstAmount),
      disposalDate: row.disposalDate,
      disposalAmount: row.disposalAmount ? toNumber(row.disposalAmount) : null,
      disposalNotes: row.disposalNotes,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDepEntry(row: typeof depreciationEntries.$inferSelect): DepreciationEntry {
    return {
      id: row.id,
      tenantId: row.tenantId,
      assetId: row.assetId,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      depreciationType: row.depreciationType,
      method: row.method,
      rate: toNumber(row.rate),
      openingWdv: toNumber(row.openingWdv),
      depreciationAmount: toNumber(row.depreciationAmount),
      closingWdv: toNumber(row.closingWdv),
      journalEntryId: row.journalEntryId,
      isPosted: row.isPosted,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
