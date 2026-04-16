import { eq, and, sql, lte, gte, sum } from 'drizzle-orm';
import { fixedAssets, assetCategories, depreciationEntries } from '@runq/db';
import type { Db } from '@runq/db';
import type { DepreciationPreviewLine, DepreciationRunResult, DepreciationType, BlockOfAssetsRow } from '@runq/types';
import { toNumber } from '../../utils/decimal';
import { GLService } from '../gl/gl.service';

export class DepreciationService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async preview(periodEnd: string, depType: DepreciationType): Promise<DepreciationPreviewLine[]> {
    const assets = await this.getActiveAssets(periodEnd);
    const lines: DepreciationPreviewLine[] = [];

    for (const a of assets) {
      const already = await this.hasEntryForPeriod(a.asset.id, periodEnd, depType);
      if (already) continue;

      const openingWdv = await this.computeOpeningWdv(a.asset.id, a.asset.acquisitionCost, depType);
      if (openingWdv <= 0) continue;

      const rate = depType === 'companies_act'
        ? toNumber(a.category.depRateCompaniesAct)
        : toNumber(a.category.depRateItAct);
      const method = depType === 'companies_act'
        ? a.category.depMethodCompaniesAct
        : a.category.depMethodItAct;

      const dep = this.calculateDepreciation({
        method,
        rate,
        openingWdv,
        acquisitionCost: toNumber(a.asset.acquisitionCost),
        residualValue: toNumber(a.asset.residualValue),
        usefulLifeYears: a.category.usefulLifeYears,
        putToUseDate: a.asset.putToUseDate ?? a.asset.acquisitionDate,
        periodEnd,
      });

      if (dep <= 0) continue;

      lines.push({
        assetId: a.asset.id,
        assetCode: a.asset.assetCode,
        assetName: a.asset.name,
        categoryName: a.category.name,
        openingWdv,
        rate,
        method,
        depreciationAmount: Math.round(dep * 100) / 100,
        closingWdv: Math.round((openingWdv - dep) * 100) / 100,
      });
    }

    return lines;
  }

  async run(periodEnd: string, depType: DepreciationType, userId?: string): Promise<DepreciationRunResult> {
    const lines = await this.preview(periodEnd, depType);
    if (lines.length === 0) {
      return { periodStart: this.periodStart(periodEnd), periodEnd, depreciationType: depType, entriesCreated: 0, totalDepreciation: 0, journalEntryId: '' };
    }

    const totalDep = lines.reduce((s, l) => s + l.depreciationAmount, 0);
    const periodStart = this.periodStart(periodEnd);

    // Group by category for JE lines (debit each category's expense, credit each category's accum dep)
    const categoryMap = new Map<string, { expenseCode: string; accumCode: string; amount: number }>();
    const assets = await this.getActiveAssets(periodEnd);
    const catById = new Map(assets.map((a) => [a.asset.id, a.category]));

    for (const line of lines) {
      const cat = catById.get(line.assetId);
      if (!cat) continue;
      const existing = categoryMap.get(cat.id);
      if (existing) {
        existing.amount += line.depreciationAmount;
      } else {
        categoryMap.set(cat.id, {
          expenseCode: cat.depExpenseAccountCode,
          accumCode: cat.accumDepAccountCode,
          amount: line.depreciationAmount,
        });
      }
    }

    // Create one consolidated JE for all depreciation
    const glService = new GLService(this.db, this.tenantId);
    const jeLines: { accountCode: string; debit?: number; credit?: number; description?: string }[] = [];
    for (const [, cat] of categoryMap) {
      jeLines.push({ accountCode: cat.expenseCode, debit: Math.round(cat.amount * 100) / 100 });
      jeLines.push({ accountCode: cat.accumCode, credit: Math.round(cat.amount * 100) / 100 });
    }

    const je = await glService.createJournalEntry({
      date: periodEnd,
      description: `Depreciation for period ending ${periodEnd} (${depType === 'companies_act' ? 'Companies Act' : 'IT Act'})`,
      sourceType: 'depreciation',
      lines: jeLines,
      createdBy: userId,
    });

    // Insert depreciation entries
    for (const line of lines) {
      await this.db.insert(depreciationEntries).values({
        tenantId: this.tenantId,
        assetId: line.assetId,
        periodStart,
        periodEnd,
        depreciationType: depType,
        method: line.method,
        rate: String(line.rate),
        openingWdv: String(line.openingWdv),
        depreciationAmount: String(line.depreciationAmount),
        closingWdv: String(line.closingWdv),
        journalEntryId: je.id,
        isPosted: true,
      });
    }

    return {
      periodStart,
      periodEnd,
      depreciationType: depType,
      entriesCreated: lines.length,
      totalDepreciation: Math.round(totalDep * 100) / 100,
      journalEntryId: je.id,
    };
  }

  /**
   * Block of Assets report (IT Act concept).
   * Groups assets by category, shows opening WDV, additions, disposals,
   * depreciation, and closing WDV for a financial year.
   */
  async blockOfAssets(financialYear: string): Promise<BlockOfAssetsRow[]> {
    // Parse FY: "2627" → start 2026-04-01, end 2027-03-31
    const fyStart = 2000 + parseInt(financialYear.slice(0, 2), 10);
    const fyStartDate = `${fyStart}-04-01`;
    const fyEndDate = `${fyStart + 1}-03-31`;

    // Get all categories
    const categories = await this.db.select().from(assetCategories)
      .where(eq(assetCategories.tenantId, this.tenantId));

    const rows: BlockOfAssetsRow[] = [];

    for (const cat of categories) {
      // Assets that existed before FY start (opening)
      const allAssets = await this.db.select().from(fixedAssets)
        .where(and(
          eq(fixedAssets.tenantId, this.tenantId),
          eq(fixedAssets.categoryId, cat.id),
          lte(fixedAssets.acquisitionDate, fyEndDate),
        ));

      if (allAssets.length === 0) continue;

      // Opening WDV: acquisition cost - depreciation before FY start
      let openingWdv = 0;
      let additions = 0;
      let disposals = 0;

      for (const asset of allAssets) {
        const cost = toNumber(asset.acquisitionCost);
        const acquiredBeforeFy = asset.acquisitionDate < fyStartDate;

        if (acquiredBeforeFy) {
          // Get accumulated depreciation before FY start
          const [depBefore] = await this.db
            .select({ total: sum(depreciationEntries.depreciationAmount) })
            .from(depreciationEntries)
            .where(and(
              eq(depreciationEntries.assetId, asset.id),
              eq(depreciationEntries.depreciationType, 'it_act'),
              sql`${depreciationEntries.periodEnd} < ${fyStartDate}`,
            ));
          const accumBefore = toNumber(depBefore?.total ?? '0');
          openingWdv += cost - accumBefore;
        } else {
          additions += cost;
        }

        if (asset.status === 'disposed' && asset.disposalDate && asset.disposalDate >= fyStartDate && asset.disposalDate <= fyEndDate) {
          disposals += toNumber(asset.disposalAmount ?? '0');
        }
      }

      // Depreciation during FY
      const [depDuring] = await this.db
        .select({ total: sum(depreciationEntries.depreciationAmount) })
        .from(depreciationEntries)
        .innerJoin(fixedAssets, eq(depreciationEntries.assetId, fixedAssets.id))
        .where(and(
          eq(depreciationEntries.tenantId, this.tenantId),
          eq(fixedAssets.categoryId, cat.id),
          eq(depreciationEntries.depreciationType, 'it_act'),
          gte(depreciationEntries.periodEnd, fyStartDate),
          lte(depreciationEntries.periodEnd, fyEndDate),
        ));

      const depAmount = toNumber(depDuring?.total ?? '0');
      const closingWdv = openingWdv + additions - disposals - depAmount;

      rows.push({
        categoryId: cat.id,
        categoryName: cat.name,
        itActRate: toNumber(cat.depRateItAct),
        openingWdv: Math.round(openingWdv * 100) / 100,
        additions: Math.round(additions * 100) / 100,
        disposals: Math.round(disposals * 100) / 100,
        depreciationAmount: Math.round(depAmount * 100) / 100,
        closingWdv: Math.round(closingWdv * 100) / 100,
        assetCount: allAssets.length,
      });
    }

    return rows;
  }

  private calculateDepreciation(params: {
    method: string;
    rate: number;
    openingWdv: number;
    acquisitionCost: number;
    residualValue: number;
    usefulLifeYears: number | null;
    putToUseDate: string;
    periodEnd: string;
  }): number {
    const { method, rate, openingWdv, acquisitionCost, residualValue, usefulLifeYears, putToUseDate, periodEnd } = params;

    // Don't depreciate below residual value
    const maxDep = openingWdv - residualValue;
    if (maxDep <= 0) return 0;

    let annualDep: number;
    if (method === 'slm' && usefulLifeYears && usefulLifeYears > 0) {
      annualDep = (acquisitionCost - residualValue) / usefulLifeYears;
    } else {
      annualDep = openingWdv * rate / 100;
    }

    // Monthly depreciation (assuming monthly run)
    let monthlyDep = annualDep / 12;

    // Indian half-year convention: if put to use for < 180 days in the
    // first year, depreciation is 50% of annual amount
    const putDate = new Date(putToUseDate + 'T00:00:00Z');
    const periodEndDate = new Date(periodEnd + 'T00:00:00Z');
    const fyStartMonth = 3; // April = index 3
    const fyStartYear = periodEndDate.getMonth() >= fyStartMonth
      ? periodEndDate.getFullYear()
      : periodEndDate.getFullYear() - 1;
    const fyStart = new Date(Date.UTC(fyStartYear, fyStartMonth, 1));

    if (putDate >= fyStart) {
      const daysInFy = Math.floor((periodEndDate.getTime() - putDate.getTime()) / 86400000);
      if (daysInFy < 180) {
        monthlyDep = (annualDep * 0.5) / 12;
      }
    }

    return Math.min(monthlyDep, maxDep);
  }

  private async getActiveAssets(periodEnd: string) {
    return this.db
      .select({ asset: fixedAssets, category: assetCategories })
      .from(fixedAssets)
      .innerJoin(assetCategories, eq(fixedAssets.categoryId, assetCategories.id))
      .where(
        and(
          eq(fixedAssets.tenantId, this.tenantId),
          eq(fixedAssets.status, 'active'),
          lte(fixedAssets.acquisitionDate, periodEnd),
        ),
      );
  }

  private async hasEntryForPeriod(assetId: string, periodEnd: string, depType: DepreciationType): Promise<boolean> {
    const [row] = await this.db
      .select({ id: depreciationEntries.id })
      .from(depreciationEntries)
      .where(
        and(
          eq(depreciationEntries.tenantId, this.tenantId),
          eq(depreciationEntries.assetId, assetId),
          eq(depreciationEntries.periodEnd, periodEnd),
          eq(depreciationEntries.depreciationType, depType),
        ),
      )
      .limit(1);
    return !!row;
  }

  private async computeOpeningWdv(assetId: string, acquisitionCost: string, depType: DepreciationType): Promise<number> {
    const [lastEntry] = await this.db
      .select({ closingWdv: depreciationEntries.closingWdv })
      .from(depreciationEntries)
      .where(
        and(
          eq(depreciationEntries.tenantId, this.tenantId),
          eq(depreciationEntries.assetId, assetId),
          eq(depreciationEntries.depreciationType, depType),
        ),
      )
      .orderBy(sql`${depreciationEntries.periodEnd} desc`)
      .limit(1);

    return lastEntry ? toNumber(lastEntry.closingWdv) : toNumber(acquisitionCost);
  }

  private periodStart(periodEnd: string): string {
    const d = new Date(periodEnd + 'T00:00:00Z');
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }
}
