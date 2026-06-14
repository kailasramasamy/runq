import { and, eq, desc } from 'drizzle-orm';
import { mpGlSettings, mpSequences } from '@runq/db';
import type { Db } from '@runq/db';
import type { UpsertGlSettingsInput } from '@runq/validators';

type GlSettingsRow = typeof mpGlSettings.$inferSelect;
type SequenceRow = typeof mpSequences.$inferSelect;

/** Tenant Dhenu config — GL account mapping + default payout mode, sequences. */
export class ConfigService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async getSettings(): Promise<GlSettingsRow | null> {
    const [row] = await this.db.select().from(mpGlSettings)
      .where(eq(mpGlSettings.tenantId, this.tenantId));
    return row ?? null;
  }

  async upsertSettings(input: UpsertGlSettingsInput): Promise<GlSettingsRow> {
    const existing = await this.getSettings();
    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(input)) {
        if (v !== undefined) patch[k] = v;
      }
      const [row] = await this.db.update(mpGlSettings).set(patch)
        .where(and(eq(mpGlSettings.tenantId, this.tenantId), eq(mpGlSettings.id, existing.id))).returning();
      return row!;
    }
    const [row] = await this.db.insert(mpGlSettings).values({
      tenantId: this.tenantId,
      defaultPayoutMode: input.defaultPayoutMode ?? 'direct_to_farmer',
      milkPurchaseAccountId: input.milkPurchaseAccountId ?? null,
      farmerPayableAccountId: input.farmerPayableAccountId ?? null,
      qualityBonusAccountId: input.qualityBonusAccountId ?? null,
      advanceAccountId: input.advanceAccountId ?? null,
      feedLoanAccountId: input.feedLoanAccountId ?? null,
      rawMilkInventoryAccountId: input.rawMilkInventoryAccountId ?? null,
      varianceAccountId: input.varianceAccountId ?? null,
    }).returning();
    return row!;
  }

  async listSequences(): Promise<SequenceRow[]> {
    return this.db.select().from(mpSequences)
      .where(eq(mpSequences.tenantId, this.tenantId))
      .orderBy(desc(mpSequences.financialYear), mpSequences.docType);
  }
}
