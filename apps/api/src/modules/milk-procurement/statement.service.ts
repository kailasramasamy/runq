import { and, eq, gte, isNull, lte, ne } from 'drizzle-orm';
import {
  tenants, items, mpFarmerLedger, mpFarmerSales, mpPayoutCycles, mpPayoutDeductions, mpPayoutLines,
  mpRejections, mpRejectionCharges,
} from '@runq/db';
import type { Db } from '@runq/db';
import { FarmerService } from './farmer.service';
import { PourService } from './pour.service';
import { DEDUCTION_TYPES, foldOutstanding, waterfall } from './farmer-ledger';
import type { MpPrincipal } from './access-scope';
import type {
  PourStatementData, StatementPour, StatementDeduction, StatementSettlement,
  StatementRejection,
} from './statement-template';

const r2 = (n: number): number => Math.round(n * 100) / 100;
const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Weighted (by litres) totals + AM/PM split for a farmer's cycle pours. */
function computeTotals(pours: StatementPour[]): PourStatementData['totals'] {
  let litres = 0, amount = 0, am = 0, pm = 0, fatSum = 0, fatL = 0, snfSum = 0, snfL = 0, waterSum = 0, waterL = 0;
  for (const p of pours) {
    litres += p.qtyLitres;
    amount += p.lineAmount;
    if (p.shift === 'am') am += p.qtyLitres; else pm += p.qtyLitres;
    if (p.fat != null) { fatSum += p.fat * p.qtyLitres; fatL += p.qtyLitres; }
    if (p.snf != null) { snfSum += p.snf * p.qtyLitres; snfL += p.qtyLitres; }
    if (p.water != null) { waterSum += p.water * p.qtyLitres; waterL += p.qtyLitres; }
  }
  return {
    litres: r2(litres), amount: r2(amount), count: pours.length,
    amLitres: r2(am), pmLitres: r2(pm),
    avgFat: fatL ? r1(fatSum / fatL) : null, avgSnf: snfL ? r1(snfSum / snfL) : null,
    avgWater: waterL ? r1(waterSum / waterL) : null,
  };
}

/** Per-milk-type subtotals (litres-weighted quality), largest volume first. */
function computeByType(pours: StatementPour[]): PourStatementData['byType'] {
  const acc = new Map<string, {
    litres: number; amount: number; count: number;
    fatSum: number; fatL: number; snfSum: number; snfL: number;
  }>();
  for (const p of pours) {
    const g = acc.get(p.milkType)
      ?? { litres: 0, amount: 0, count: 0, fatSum: 0, fatL: 0, snfSum: 0, snfL: 0 };
    g.litres += p.qtyLitres;
    g.amount += p.lineAmount;
    g.count += 1;
    if (p.fat != null) { g.fatSum += p.fat * p.qtyLitres; g.fatL += p.qtyLitres; }
    if (p.snf != null) { g.snfSum += p.snf * p.qtyLitres; g.snfL += p.qtyLitres; }
    acc.set(p.milkType, g);
  }
  return [...acc.entries()]
    .map(([milkType, g]) => ({
      milkType, litres: r2(g.litres), amount: r2(g.amount), count: g.count,
      avgFat: g.fatL ? r1(g.fatSum / g.fatL) : null,
      avgSnf: g.snfL ? r1(g.snfSum / g.snfL) : null,
    }))
    .sort((a, b) => b.litres - a.litres);
}

/** Assembles a farmer's per-cycle pour statement (data for the PDF template). */
export class StatementService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async forFarmer(
    farmerId: string, from: string, to: string, principal: MpPrincipal, label?: string,
  ): Promise<PourStatementData> {
    const farmer = await new FarmerService(this.db, this.tenantId).getById(farmerId);
    const { data: rows } = await new PourService(this.db, this.tenantId).list(
      { farmerId, from, to, status: 'recorded' }, { page: 1, limit: 1000 }, principal,
    );
    const pours: StatementPour[] = rows
      .map((r) => ({
        collectionDate: r.collectionDate,
        shift: r.shift,
        milkType: r.milkType,
        qtyLitres: Number(r.qtyLitres),
        fat: r.fat == null ? null : Number(r.fat),
        snf: r.snf == null ? null : Number(r.snf),
        water: r.water == null ? null : Number(r.water),
        ratePerLitre: Number(r.ratePerLitre),
        lineAmount: Number(r.lineAmount),
        receiptNo: r.receiptNo,
      }))
      .sort((a, b) => a.collectionDate.localeCompare(b.collectionDate));
    const totals = computeTotals(pours);
    const [t] = await this.db.select({ name: tenants.name }).from(tenants)
      .where(eq(tenants.id, this.tenantId)).limit(1);
    return {
      tenantName: t?.name ?? 'Dhenu',
      farmer: {
        name: farmer.name, code: farmer.code, village: farmer.village, phone: farmer.phone,
        nodeName: farmer.primaryNodeName, bankName: farmer.bankName,
        bankAccountNumber: farmer.bankAccountNumber, bankIfsc: farmer.bankIfsc, upiId: farmer.upiId,
      },
      period: { from, to, label: label ?? null },
      pours,
      byType: computeByType(pours),
      rejections: await this.rejections(farmerId, from, to),
      totals,
      settlement: await this.settlement(farmerId, from, to, totals.amount),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Milk this farmer brought that was refused, whichever tier caught it — the
   * gate rows have no pour behind them, the downstream ones are their share of
   * a rejected load. Listed so the deduction below has something to point at.
   */
  private async rejections(
    farmerId: string, from: string, to: string,
  ): Promise<StatementRejection[]> {
    const rows = await this.db.select({
      collectionDate: mpRejections.collectionDate,
      shift: mpRejections.shift,
      milkType: mpRejections.milkType,
      qty: mpRejectionCharges.qtyLitres,
      reason: mpRejections.reason,
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
        collectionDate: r.collectionDate, shift: r.shift, milkType: r.milkType,
        qtyLitres: Number(r.qty), reason: r.reason,
      }))
      .sort((a, b) => a.collectionDate.localeCompare(b.collectionDate));
  }

  /**
   * What the farmer is actually paid: milk value less whatever the cycle
   * recovers. Reads the generated payout line when there is one — those are the
   * settled figures — and falls back to a provisional run of the same waterfall
   * over the outstanding ledger, so a statement pulled mid-cycle still warns the
   * farmer what is coming off. Null when nothing is owed either way.
   */
  private async settlement(
    farmerId: string, from: string, to: string, gross: number,
  ): Promise<StatementSettlement | null> {
    const saleLines = await this.saleDetail(farmerId, from, to);
    const [line] = await this.db.select({
      id: mpPayoutLines.id, gross: mpPayoutLines.grossAmount,
      deducted: mpPayoutLines.deductionTotal, net: mpPayoutLines.netAmount,
    }).from(mpPayoutLines)
      .innerJoin(mpPayoutCycles, eq(mpPayoutLines.payoutCycleId, mpPayoutCycles.id))
      .where(and(
        eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.farmerId, farmerId),
        eq(mpPayoutCycles.periodStart, from), eq(mpPayoutCycles.periodEnd, to),
        ne(mpPayoutCycles.status, 'reversed'),
      )).limit(1);

    if (line) {
      const rows = await this.db.select({
        type: mpPayoutDeductions.deductionType, amount: mpPayoutDeductions.amount,
      }).from(mpPayoutDeductions).where(eq(mpPayoutDeductions.payoutLineId, line.id));
      const deductions = rows.map((r) => withDetail(
        { type: r.type, amount: Number(r.amount) }, saleLines));
      const totalDeductions = r2(Number(line.deducted));
      if (!totalDeductions) return null;
      return { gross: r2(Number(line.gross)), deductions, totalDeductions, net: r2(Number(line.net)), provisional: false };
    }

    const ledger = await this.db.select({
      entryType: mpFarmerLedger.entryType, refType: mpFarmerLedger.refType, amount: mpFarmerLedger.amount,
    }).from(mpFarmerLedger).where(and(
      eq(mpFarmerLedger.tenantId, this.tenantId), eq(mpFarmerLedger.farmerId, farmerId)));
    const taken = waterfall(foldOutstanding(ledger), gross);
    if (!taken.total) return null;
    const deductions = DEDUCTION_TYPES
      .map(([bucket, type]) => withDetail({ type, amount: taken[bucket] }, saleLines))
      .filter((d) => d.amount > 0);
    return {
      gross: r2(gross), deductions, totalDeductions: taken.total,
      net: r2(gross - taken.total), provisional: true,
    };
  }

  /** Per-sale detail lines, so 'purchased from us' can be checked, not just believed. */
  private async saleDetail(
    farmerId: string, from: string, to: string,
  ): Promise<StatementDeduction['lines']> {
    const rows = await this.db.select({
      date: mpFarmerSales.saleDate, qty: mpFarmerSales.qty, unit: mpFarmerSales.unit,
      rate: mpFarmerSales.ratePerUnit, amount: mpFarmerSales.amount,
      milkType: mpFarmerSales.milkType, itemName: items.name,
    }).from(mpFarmerSales)
      .leftJoin(items, eq(mpFarmerSales.itemId, items.id))
      .where(and(
      eq(mpFarmerSales.tenantId, this.tenantId), eq(mpFarmerSales.farmerId, farmerId),
      gte(mpFarmerSales.saleDate, from), lte(mpFarmerSales.saleDate, to),
      isNull(mpFarmerSales.reversedAt),
    )).orderBy(mpFarmerSales.saleDate);
    return rows.map((r) => ({
      date: r.date, itemName: r.itemName, milkType: r.milkType,
      qty: Number(r.qty), unit: r.unit, ratePerUnit: Number(r.rate),
      amount: Number(r.amount),
    }));
  }
}

/** Milk-sale deductions carry their per-sale lines; the rest stand alone. */
function withDetail(
  d: { type: string; amount: number }, saleLines: StatementDeduction['lines'],
): StatementDeduction {
  return d.type === 'farmer_sale' ? { ...d, lines: saleLines } : d;
}
