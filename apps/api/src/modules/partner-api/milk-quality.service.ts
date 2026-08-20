import { and, eq, gte, lte, isNotNull, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { mpConsignments, mpQcTests, mpPours, mpFarmers } from '@runq/db';
import type { Db } from '@runq/db';
import { QualityBandService, gradeFromBands } from '../milk-procurement/quality-band.service';

/** Levels the feed publishes. Partners choose their own customer-facing words. */
export type PublishedGrade = 'good' | 'watch' | 'low';

export interface PublishedTest {
  code: string;
  verdict: 'pass' | 'fail' | 'conditional';
}

export interface MilkQualityDay {
  collectionDate: string;
  milkType: string;
  fat: number | null;
  snf: number | null;
  addedWater: number | null;
  grade: PublishedGrade | null;
  tests: PublishedTest[];
  sourcing: { farmers: number; villages: number };
  updatedAt: string | null;
}

type Timestamp = Date | string;

const GRADE_LEVEL: Record<'a' | 'b' | 'c', PublishedGrade> = { a: 'good', b: 'watch', c: 'low' };

/** A tanker with no declared milk type carries a mixed load. */
const MILK_TYPE = sql<string>`coalesce(${mpConsignments.milkType}::text, 'mixed')`;

const num = (v: string | null | undefined): number | null => (v == null ? null : Number(v));

/** Newest of a set of timestamps as ISO, or null if none. An aggregate comes
 *  back from pg as a string, not a Date, so both shapes have to be accepted. */
function latest(values: (Timestamp | null | undefined)[]): string | null {
  const times = values
    .filter((v): v is Timestamp => v != null)
    .map((v) => (v instanceof Date ? v.getTime() : Date.parse(v)))
    .filter((t) => !Number.isNaN(t));
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

/**
 * The curated, plant-level quality feed published to partners.
 *
 * Deliberately NOT the farmer pour ledger: a pour is procurement-grade data
 * carrying farmer identity and the rate we paid. What a consumer can be told
 * about is the milk that actually entered the plant — the received `cc_to_pp`
 * tankers for a collection date, quantity-weighted per milk type, which is the
 * batch their bottle came out of.
 *
 * Litres, rates and amounts are never published. Volume is competitive intel
 * and means nothing to a consumer; the numbers here are quality only.
 */
export class PartnerMilkQualityService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async daily(from: string, to: string): Promise<MilkQualityDay[]> {
    const [rollups, tests, sourcing, bands] = await Promise.all([
      this.rollups(from, to),
      this.tests(from, to),
      this.sourcing(from, to),
      new QualityBandService(this.db, this.tenantId).resolveAll(null),
    ]);

    return rollups.map((r) => {
      const key = `${r.date}|${r.milkType}`;
      const fat = num(r.fat);
      const snf = num(r.snf);
      const grade = gradeFromBands(bands[r.milkType] ?? {}, { fat, snf });
      const dayTests = tests.get(key) ?? [];
      // A late QC correction has to move the timestamp, or a partner that polls
      // on updatedAt would never re-pull the corrected day.
      const updatedAt = latest([r.updatedAt, ...dayTests.map((t) => t.at)]);
      return {
        collectionDate: r.date,
        milkType: r.milkType,
        fat,
        snf,
        addedWater: num(r.water),
        grade: grade ? GRADE_LEVEL[grade] : null,
        tests: dayTests.map((t) => ({ code: t.code, verdict: t.verdict })),
        // A mixed-load bucket has no single pour type to match, so it falls
        // back to the whole day's distinct counts.
        sourcing: sourcing.get(key) ?? sourcing.get(`${r.date}|*`) ?? { farmers: 0, villages: 0 },
        updatedAt,
      };
    });
  }

  /** Quantity-weighted receipt QC per (collection date, milk type). */
  private async rollups(from: string, to: string) {
    const wq = (col: AnyPgColumn) =>
      sql<string | null>`round(sum(${mpConsignments.receiptQty} * ${col}) / nullif(sum(${mpConsignments.receiptQty}) filter (where ${col} is not null), 0), 2)`;
    return this.db.select({
      date: mpConsignments.collectionDate,
      milkType: MILK_TYPE,
      fat: wq(mpConsignments.receiptFat),
      snf: wq(mpConsignments.receiptSnf),
      water: wq(mpConsignments.receiptWater),
      updatedAt: sql<Timestamp | null>`max(${mpConsignments.updatedAt})`,
    }).from(mpConsignments).where(and(
      eq(mpConsignments.tenantId, this.tenantId),
      eq(mpConsignments.kind, 'cc_to_pp'),
      eq(mpConsignments.status, 'received'),
      gte(mpConsignments.collectionDate, from),
      lte(mpConsignments.collectionDate, to),
    )).groupBy(mpConsignments.collectionDate, MILK_TYPE)
      .orderBy(sql`${mpConsignments.collectionDate} desc`);
  }

  /**
   * Lab verdicts for those same tankers, collapsed per test code: any fail
   * fails the day, any conditional downgrades it. One bad tanker must not be
   * averaged away by good ones.
   */
  private async tests(from: string, to: string) {
    const rows = await this.db.select({
      date: mpConsignments.collectionDate,
      milkType: MILK_TYPE,
      code: mpQcTests.testCode,
      verdict: sql<'pass' | 'fail' | 'conditional'>`case
        when bool_or(${mpQcTests.verdict} = 'fail') then 'fail'
        when bool_or(${mpQcTests.verdict} = 'conditional') then 'conditional'
        else 'pass' end`,
      at: sql<Timestamp | null>`max(${mpQcTests.createdAt})`,
    }).from(mpQcTests)
      .innerJoin(mpConsignments, eq(mpConsignments.id, mpQcTests.subjectId))
      .where(and(
        eq(mpQcTests.tenantId, this.tenantId),
        eq(mpQcTests.subjectType, 'consignment'),
        isNotNull(mpQcTests.verdict),
        eq(mpConsignments.kind, 'cc_to_pp'),
        eq(mpConsignments.status, 'received'),
        gte(mpConsignments.collectionDate, from),
        lte(mpConsignments.collectionDate, to),
      ))
      .groupBy(mpConsignments.collectionDate, MILK_TYPE, mpQcTests.testCode);

    const out = new Map<string, { code: string; verdict: PublishedTest['verdict']; at: Timestamp | null }[]>();
    for (const r of rows) {
      const key = `${r.date}|${r.milkType}`;
      const list = out.get(key) ?? [];
      list.push({ code: r.code, verdict: r.verdict, at: r.at });
      out.set(key, list);
    }
    return out;
  }

  /**
   * How many farmers and villages fed that day's milk — the provenance line.
   * Counted from pours, so a VMCC that logs no farmer pours (direct-receive
   * only) contributes nothing here. Under-counting is the safe direction: it
   * is a "milk from at least N farmers" claim, never an inflated one.
   */
  private async sourcing(from: string, to: string) {
    const conds = and(
      eq(mpPours.tenantId, this.tenantId),
      eq(mpPours.status, 'recorded'),
      gte(mpPours.collectionDate, from),
      lte(mpPours.collectionDate, to),
    );
    const cols = {
      farmers: sql<number>`count(distinct ${mpPours.farmerId})::int`,
      villages: sql<number>`count(distinct ${mpFarmers.village})::int`,
    };
    const [byType, byDate] = await Promise.all([
      this.db.select({
        date: mpPours.collectionDate, milkType: sql<string>`${mpPours.milkType}::text`, ...cols,
      }).from(mpPours).innerJoin(mpFarmers, eq(mpFarmers.id, mpPours.farmerId))
        .where(conds).groupBy(mpPours.collectionDate, mpPours.milkType),
      this.db.select({ date: mpPours.collectionDate, ...cols })
        .from(mpPours).innerJoin(mpFarmers, eq(mpFarmers.id, mpPours.farmerId))
        .where(conds).groupBy(mpPours.collectionDate),
    ]);
    const out = new Map<string, { farmers: number; villages: number }>();
    for (const r of byDate) out.set(`${r.date}|*`, { farmers: r.farmers ?? 0, villages: r.villages ?? 0 });
    for (const r of byType) {
      out.set(`${r.date}|${r.milkType}`, { farmers: r.farmers ?? 0, villages: r.villages ?? 0 });
    }
    return out;
  }
}
