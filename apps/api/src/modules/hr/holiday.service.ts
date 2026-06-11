import { eq, and, gte, lte, asc } from 'drizzle-orm';
import { holidays } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateHolidayInput, UpdateHolidayInput } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';

export class HolidayService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list(year?: number) {
    const conditions = [eq(holidays.tenantId, this.tenantId)];
    if (year) {
      conditions.push(gte(holidays.date, `${year}-01-01`));
      conditions.push(lte(holidays.date, `${year}-12-31`));
    }
    return this.db.select().from(holidays).where(and(...conditions)).orderBy(asc(holidays.date));
  }

  async create(input: CreateHolidayInput) {
    const [row] = await this.db
      .insert(holidays)
      .values({ tenantId: this.tenantId, ...input })
      .returning();
    return row;
  }

  /** Insert many at once, skipping any (date, name) the tenant already has. */
  async bulkCreate(items: CreateHolidayInput[]) {
    const existing = await this.db
      .select({ date: holidays.date, name: holidays.name })
      .from(holidays)
      .where(eq(holidays.tenantId, this.tenantId));
    const seen = new Set(existing.map((e) => `${e.date}|${e.name.toLowerCase()}`));

    const toInsert: Array<CreateHolidayInput & { tenantId: string }> = [];
    const skipped: string[] = [];
    for (const it of items) {
      const key = `${it.date}|${it.name.toLowerCase()}`;
      if (seen.has(key)) { skipped.push(it.name); continue; }
      seen.add(key);
      toInsert.push({ tenantId: this.tenantId, ...it });
    }

    const created = toInsert.length
      ? await this.db.insert(holidays).values(toInsert).returning()
      : [];
    return { created, createdCount: created.length, skipped };
  }

  async update(id: string, input: UpdateHolidayInput) {
    const [row] = await this.db
      .update(holidays)
      .set(input)
      .where(and(eq(holidays.id, id), eq(holidays.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Holiday');
    return row;
  }

  async remove(id: string) {
    const [row] = await this.db
      .delete(holidays)
      .where(and(eq(holidays.id, id), eq(holidays.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Holiday');
    return row;
  }
}
