import { eq } from 'drizzle-orm';
import { tenants } from '@runq/db';
import type { Db } from '@runq/db';
import { FarmerService } from './farmer.service';
import { PourService } from './pour.service';
import type { MpPrincipal } from './access-scope';
import type { PourStatementData, StatementPour } from './statement-template';

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
      totals: computeTotals(pours),
      generatedAt: new Date().toISOString(),
    };
  }
}
