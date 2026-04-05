import { eq, and } from 'drizzle-orm';
import { fiscalPeriods } from '@runq/db';
import type { Db } from '@runq/db';
import type { FiscalPeriod } from '@runq/types';
import type { CreateFiscalPeriodInput, CloseFiscalPeriodInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';

export class FiscalService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async listPeriods(): Promise<FiscalPeriod[]> {
    const rows = await this.db
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.tenantId, this.tenantId))
      .orderBy(fiscalPeriods.startDate);
    return rows.map(this.toPeriod);
  }

  async createPeriod(data: CreateFiscalPeriodInput): Promise<FiscalPeriod> {
    const [row] = await this.db
      .insert(fiscalPeriods)
      .values({
        tenantId: this.tenantId,
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
      })
      .returning();
    return this.toPeriod(row!);
  }

  async closePeriod(id: string, data: CloseFiscalPeriodInput, userId: string): Promise<FiscalPeriod> {
    const [existing] = await this.db
      .select()
      .from(fiscalPeriods)
      .where(and(eq(fiscalPeriods.id, id), eq(fiscalPeriods.tenantId, this.tenantId)));

    if (!existing) throw new NotFoundError('FiscalPeriod');
    if (existing.status === 'locked') throw new ConflictError('Period is locked');

    const [row] = await this.db
      .update(fiscalPeriods)
      .set({
        status: data.status,
        closedBy: userId,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(fiscalPeriods.id, id), eq(fiscalPeriods.tenantId, this.tenantId)))
      .returning();
    return this.toPeriod(row!);
  }

  async lockPeriod(id: string, userId: string): Promise<FiscalPeriod> {
    const [existing] = await this.db
      .select()
      .from(fiscalPeriods)
      .where(and(eq(fiscalPeriods.id, id), eq(fiscalPeriods.tenantId, this.tenantId)));

    if (!existing) throw new NotFoundError('FiscalPeriod');
    if (existing.status === 'locked') throw new ConflictError('Period is already locked');
    if (existing.status === 'open') throw new ConflictError('Period must be closed before locking');

    const [row] = await this.db
      .update(fiscalPeriods)
      .set({ status: 'locked', closedBy: userId, closedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(fiscalPeriods.id, id), eq(fiscalPeriods.tenantId, this.tenantId)))
      .returning();
    return this.toPeriod(row!);
  }

  async unlockPeriod(id: string): Promise<FiscalPeriod> {
    const [existing] = await this.db
      .select()
      .from(fiscalPeriods)
      .where(and(eq(fiscalPeriods.id, id), eq(fiscalPeriods.tenantId, this.tenantId)));

    if (!existing) throw new NotFoundError('FiscalPeriod');
    if (existing.status !== 'locked') throw new ConflictError('Period is not locked');

    const [row] = await this.db
      .update(fiscalPeriods)
      .set({ status: 'closed', updatedAt: new Date() })
      .where(and(eq(fiscalPeriods.id, id), eq(fiscalPeriods.tenantId, this.tenantId)))
      .returning();
    return this.toPeriod(row!);
  }

  private toPeriod(row: typeof fiscalPeriods.$inferSelect): FiscalPeriod {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status,
      closedBy: row.closedBy,
      closedAt: row.closedAt?.toISOString() ?? null,
    };
  }
}
