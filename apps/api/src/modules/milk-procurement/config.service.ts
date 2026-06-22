import { and, eq, desc } from 'drizzle-orm';
import { mpGlSettings, mpSequences, mpRawMilkItems } from '@runq/db';
import type { Db } from '@runq/db';
import type { UpsertGlSettingsInput, UpsertRawMilkItemsInput } from '@runq/validators';

type GlSettingsRow = typeof mpGlSettings.$inferSelect;
type SequenceRow = typeof mpSequences.$inferSelect;
type RawMilkItemRow = typeof mpRawMilkItems.$inferSelect;

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

  /** Cycle cadence only — safe to expose to farmer/operator personas. */
  async getCycleConfig(): Promise<{
    cycleDays: number | null; cycleAnchorDate: string | null; autoGenerateCycle: boolean;
  }> {
    const s = await this.getSettings();
    return {
      cycleDays: s?.cycleDays ?? null,
      cycleAnchorDate: s?.cycleAnchorDate ?? null,
      autoGenerateCycle: s?.autoGenerateCycle ?? false,
    };
  }

  /** Support contacts only — safe to expose to every persona. */
  async getSupportConfig(): Promise<{
    supportPhone: string | null; supportEmail: string | null; supportWhatsapp: string | null;
  }> {
    const s = await this.getSettings();
    return {
      supportPhone: s?.supportPhone ?? null,
      supportEmail: s?.supportEmail ?? null,
      supportWhatsapp: s?.supportWhatsapp ?? null,
    };
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
      cycleDays: input.cycleDays ?? null,
      cycleAnchorDate: input.cycleAnchorDate ?? null,
      autoGenerateCycle: input.autoGenerateCycle ?? false,
      supportPhone: input.supportPhone ?? null,
      supportEmail: input.supportEmail ?? null,
      supportWhatsapp: input.supportWhatsapp ?? null,
      milkPurchaseAccountId: input.milkPurchaseAccountId ?? null,
      farmerPayableAccountId: input.farmerPayableAccountId ?? null,
      qualityBonusAccountId: input.qualityBonusAccountId ?? null,
      advanceAccountId: input.advanceAccountId ?? null,
      feedLoanAccountId: input.feedLoanAccountId ?? null,
      rawMilkInventoryAccountId: input.rawMilkInventoryAccountId ?? null,
      rawMilkWarehouseId: input.rawMilkWarehouseId ?? null,
      varianceAccountId: input.varianceAccountId ?? null,
    }).returning();
    return row!;
  }

  /** Per-milk-type → inventory item map for PP raw-milk receipts (P1.2). */
  async getRawMilkItems(): Promise<RawMilkItemRow[]> {
    return this.db.select().from(mpRawMilkItems)
      .where(eq(mpRawMilkItems.tenantId, this.tenantId))
      .orderBy(mpRawMilkItems.milkType);
  }

  /** Replace the whole map (delete-then-insert) inside one transaction. */
  async upsertRawMilkItems(input: UpsertRawMilkItemsInput): Promise<RawMilkItemRow[]> {
    return this.db.transaction(async (tx) => {
      await tx.delete(mpRawMilkItems).where(eq(mpRawMilkItems.tenantId, this.tenantId));
      if (input.mappings.length === 0) return [];
      return tx.insert(mpRawMilkItems).values(
        input.mappings.map((m) => ({
          tenantId: this.tenantId, milkType: m.milkType, itemId: m.itemId,
        })),
      ).returning();
    });
  }

  async listSequences(): Promise<SequenceRow[]> {
    return this.db.select().from(mpSequences)
      .where(eq(mpSequences.tenantId, this.tenantId))
      .orderBy(desc(mpSequences.financialYear), mpSequences.docType);
  }
}
