import { eq, and, asc } from 'drizzle-orm';
import { rewardTypes, employeeRewards } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateRewardTypeInput, UpdateRewardTypeInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';

/** Seeded for a tenant that has never configured the catalogue. */
const DEFAULT_TYPES = [
  { name: 'Spot Bonus', code: 'SPOT', kind: 'monetary' as const, displayOrder: 1 },
  { name: 'Performance Award', code: 'PERF', kind: 'monetary' as const, displayOrder: 2 },
  { name: 'Referral Bonus', code: 'REFERRAL', kind: 'monetary' as const, displayOrder: 3 },
  { name: 'Festival Bonus', code: 'FESTIVAL', kind: 'monetary' as const, displayOrder: 4 },
  { name: 'Kudos', code: 'KUDOS', kind: 'recognition' as const, displayOrder: 5 },
];

/** CRUD for the HR-configured reward type catalogue. */
export class RewardTypeService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list(opts: { activeOnly?: boolean } = {}) {
    const conds = [eq(rewardTypes.tenantId, this.tenantId)];
    if (opts.activeOnly) conds.push(eq(rewardTypes.isActive, true));
    return this.db
      .select()
      .from(rewardTypes)
      .where(and(...conds))
      .orderBy(asc(rewardTypes.displayOrder), asc(rewardTypes.name));
  }

  async create(input: CreateRewardTypeInput) {
    await this.requireUniqueCode(input.code);
    const [row] = await this.db
      .insert(rewardTypes)
      .values({
        tenantId: this.tenantId,
        name: input.name,
        code: input.code,
        kind: input.kind,
        glAccountCode: input.glAccountCode,
        displayOrder: input.displayOrder,
        isActive: input.isActive,
      })
      .returning();
    return row;
  }

  async update(id: string, input: UpdateRewardTypeInput) {
    if (input.code) await this.requireUniqueCode(input.code, id);
    const [row] = await this.db
      .update(rewardTypes)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(rewardTypes.id, id), eq(rewardTypes.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Reward type');
    return row;
  }

  async remove(id: string) {
    const [used] = await this.db
      .select({ id: employeeRewards.id })
      .from(employeeRewards)
      .where(and(
        eq(employeeRewards.tenantId, this.tenantId),
        eq(employeeRewards.rewardTypeId, id),
      ))
      .limit(1);
    if (used) throw new ConflictError('Reward type is in use — deactivate it instead');

    const [row] = await this.db
      .delete(rewardTypes)
      .where(and(eq(rewardTypes.id, id), eq(rewardTypes.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Reward type');
    return row;
  }

  /** Idempotent: seeds the default catalogue only when the tenant has none. */
  async seedDefaults() {
    const existing = await this.list();
    if (existing.length > 0) return { skipped: true, count: existing.length };
    for (const t of DEFAULT_TYPES) {
      await this.db.insert(rewardTypes).values({
        tenantId: this.tenantId,
        name: t.name,
        code: t.code,
        kind: t.kind,
        displayOrder: t.displayOrder,
      });
    }
    return { skipped: false, count: DEFAULT_TYPES.length };
  }

  private async requireUniqueCode(code: string, excludeId?: string) {
    const [dup] = await this.db
      .select({ id: rewardTypes.id })
      .from(rewardTypes)
      .where(and(eq(rewardTypes.tenantId, this.tenantId), eq(rewardTypes.code, code)))
      .limit(1);
    if (dup && dup.id !== excludeId) {
      throw new ConflictError('Reward type code already exists');
    }
  }
}
