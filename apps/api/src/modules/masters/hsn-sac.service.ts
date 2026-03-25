import { eq, ilike, or, and, sql } from 'drizzle-orm';
import { hsnSacCodes } from '@runq/db';
import type { Db } from '@runq/db';
import type { HsnSacCode } from '@runq/types';
import type { CreateHsnSacInput, UpdateHsnSacInput } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';

export class HsnSacService {
  constructor(private readonly db: Db) {}

  async search(q: string, type?: 'hsn' | 'sac', limit = 20): Promise<HsnSacCode[]> {
    const conditions = [
      or(
        ilike(hsnSacCodes.code, `${q}%`),
        ilike(hsnSacCodes.description, `%${q}%`),
      ),
    ];

    if (type) {
      conditions.push(eq(hsnSacCodes.type, type));
    }

    const rows = await this.db
      .select()
      .from(hsnSacCodes)
      .where(and(...conditions))
      .orderBy(sql`CASE WHEN ${hsnSacCodes.code} LIKE ${q + '%'} THEN 0 ELSE 1 END`, hsnSacCodes.code)
      .limit(limit);

    return rows.map(this.toHsnSacCode);
  }

  async getByCode(code: string): Promise<HsnSacCode> {
    const [row] = await this.db
      .select()
      .from(hsnSacCodes)
      .where(eq(hsnSacCodes.code, code))
      .limit(1);

    if (!row) throw new NotFoundError('HSN/SAC code');
    return this.toHsnSacCode(row);
  }

  async create(input: CreateHsnSacInput): Promise<HsnSacCode> {
    const [row] = await this.db
      .insert(hsnSacCodes)
      .values({
        code: input.code,
        type: input.type,
        description: input.description,
        gstRate: input.gstRate != null ? String(input.gstRate) : null,
      })
      .returning();

    return this.toHsnSacCode(row);
  }

  async update(code: string, input: UpdateHsnSacInput): Promise<HsnSacCode> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.code !== undefined) updateData.code = input.code;
    if (input.type !== undefined) updateData.type = input.type;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.gstRate !== undefined) updateData.gstRate = input.gstRate != null ? String(input.gstRate) : null;

    const [row] = await this.db
      .update(hsnSacCodes)
      .set(updateData)
      .where(eq(hsnSacCodes.code, code))
      .returning();

    if (!row) throw new NotFoundError('HSN/SAC code');
    return this.toHsnSacCode(row);
  }

  private toHsnSacCode(row: typeof hsnSacCodes.$inferSelect): HsnSacCode {
    return {
      id: row.id,
      code: row.code,
      type: row.type,
      description: row.description,
      gstRate: row.gstRate ? Number(row.gstRate) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
