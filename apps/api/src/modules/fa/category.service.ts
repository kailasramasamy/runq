import { eq, and } from 'drizzle-orm';
import { assetCategories } from '@runq/db';
import type { Db } from '@runq/db';
import type { AssetCategory } from '@runq/types';
import type { CreateAssetCategoryInput, UpdateAssetCategoryInput } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';

export class AssetCategoryService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(): Promise<AssetCategory[]> {
    const rows = await this.db
      .select()
      .from(assetCategories)
      .where(eq(assetCategories.tenantId, this.tenantId))
      .orderBy(assetCategories.name);
    return rows.map(this.toCategory);
  }

  async getById(id: string): Promise<AssetCategory> {
    const [row] = await this.db
      .select()
      .from(assetCategories)
      .where(and(eq(assetCategories.id, id), eq(assetCategories.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Asset category');
    return this.toCategory(row);
  }

  async create(input: CreateAssetCategoryInput): Promise<AssetCategory> {
    const [row] = await this.db
      .insert(assetCategories)
      .values({
        tenantId: this.tenantId,
        name: input.name,
        parentId: input.parentId ?? null,
        depMethodCompaniesAct: input.depMethodCompaniesAct,
        depRateCompaniesAct: String(input.depRateCompaniesAct),
        usefulLifeYears: input.usefulLifeYears ?? null,
        depMethodItAct: input.depMethodItAct,
        depRateItAct: String(input.depRateItAct),
        assetAccountCode: input.assetAccountCode,
        depExpenseAccountCode: input.depExpenseAccountCode,
        accumDepAccountCode: input.accumDepAccountCode,
      })
      .returning();
    return this.toCategory(row!);
  }

  async update(id: string, input: UpdateAssetCategoryInput): Promise<AssetCategory> {
    const existing = await this.getById(id);
    if (!existing) throw new NotFoundError('Asset category');

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) values.name = input.name;
    if (input.parentId !== undefined) values.parentId = input.parentId ?? null;
    if (input.depMethodCompaniesAct !== undefined) values.depMethodCompaniesAct = input.depMethodCompaniesAct;
    if (input.depRateCompaniesAct !== undefined) values.depRateCompaniesAct = String(input.depRateCompaniesAct);
    if (input.usefulLifeYears !== undefined) values.usefulLifeYears = input.usefulLifeYears ?? null;
    if (input.depMethodItAct !== undefined) values.depMethodItAct = input.depMethodItAct;
    if (input.depRateItAct !== undefined) values.depRateItAct = String(input.depRateItAct);
    if (input.assetAccountCode !== undefined) values.assetAccountCode = input.assetAccountCode;
    if (input.depExpenseAccountCode !== undefined) values.depExpenseAccountCode = input.depExpenseAccountCode;
    if (input.accumDepAccountCode !== undefined) values.accumDepAccountCode = input.accumDepAccountCode;

    const [row] = await this.db
      .update(assetCategories)
      .set(values)
      .where(and(eq(assetCategories.id, id), eq(assetCategories.tenantId, this.tenantId)))
      .returning();
    return this.toCategory(row!);
  }

  private toCategory(row: typeof assetCategories.$inferSelect): AssetCategory {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      parentId: row.parentId ?? null,
      depMethodCompaniesAct: row.depMethodCompaniesAct,
      depRateCompaniesAct: toNumber(row.depRateCompaniesAct),
      usefulLifeYears: row.usefulLifeYears,
      depMethodItAct: row.depMethodItAct,
      depRateItAct: toNumber(row.depRateItAct),
      assetAccountCode: row.assetAccountCode,
      depExpenseAccountCode: row.depExpenseAccountCode,
      accumDepAccountCode: row.accumDepAccountCode,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
