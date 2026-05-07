import { eq, and, sql, desc, ilike } from 'drizzle-orm';
import { vendors, billSyncLogs, billSyncSources } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError } from '../../utils/errors';

export interface UnmappedAttempt {
  externalRef: string;
  externalName: string | null;
  attempts: number;
  lastAttemptAt: string;
  suggestion: { id: string; name: string; matchType: 'exact' | 'ilike' | 'firstword' } | null;
  candidates: Array<{ id: string; name: string }>;
}

export interface MappingRow {
  vendorId: string;
  vendorName: string;
  externalRef: string;
}

/**
 * Vendor mapping admin operations for a bill sync source. Reads unmapped
 * sync attempts from bill_sync_logs (status='rejected', reason='vendor_not_found'),
 * suggests fuzzy matches against existing runq vendors, and writes the
 * accepted mapping into vendors.external_refs[<source slug>].
 */
export class BillSyncMappingService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  private async getSource(sourceId: string) {
    const [src] = await this.db.select().from(billSyncSources)
      .where(and(eq(billSyncSources.id, sourceId), eq(billSyncSources.tenantId, this.tenantId)))
      .limit(1);
    if (!src) throw new NotFoundError('BillSyncSource');
    return src;
  }

  /**
   * Group rejected vendor_not_found attempts by externalRef and return
   * each one with attempt count + last seen + suggested vendor match.
   */
  async listUnmapped(sourceId: string): Promise<UnmappedAttempt[]> {
    const src = await this.getSource(sourceId);

    const rows = await this.db
      .select({
        externalRef: sql<string>`(${billSyncLogs.payload}->'vendor'->>'externalRef')`,
        externalName: sql<string>`(${billSyncLogs.payload}->'vendor'->>'name')`,
        attempts: sql<number>`COUNT(*)::int`,
        lastAttemptAt: sql<string>`MAX(${billSyncLogs.createdAt})`,
      })
      .from(billSyncLogs)
      .where(and(
        eq(billSyncLogs.tenantId, this.tenantId),
        eq(billSyncLogs.sourceId, sourceId),
        eq(billSyncLogs.status, 'rejected'),
        eq(billSyncLogs.message, 'vendor_not_found'),
      ))
      .groupBy(sql`(${billSyncLogs.payload}->'vendor'->>'externalRef')`, sql`(${billSyncLogs.payload}->'vendor'->>'name')`)
      .orderBy(desc(sql`MAX(${billSyncLogs.createdAt})`));

    const alreadyMapped = await this.listMappings(sourceId);
    const mappedRefs = new Set(alreadyMapped.map((m) => m.externalRef));

    const out: UnmappedAttempt[] = [];
    for (const r of rows) {
      if (!r.externalRef || mappedRefs.has(r.externalRef)) continue;
      const { suggestion, candidates } = await this.suggestVendor(src.slug, r.externalName ?? '');
      out.push({
        externalRef: r.externalRef,
        externalName: r.externalName ?? null,
        attempts: r.attempts,
        lastAttemptAt: r.lastAttemptAt,
        suggestion,
        candidates,
      });
    }
    return out;
  }

  private async suggestVendor(sourceSlug: string, name: string): Promise<{
    suggestion: UnmappedAttempt['suggestion'];
    candidates: Array<{ id: string; name: string }>;
  }> {
    if (!name) return { suggestion: null, candidates: [] };

    const exact = await this.db.select({ id: vendors.id, name: vendors.name }).from(vendors)
      .where(and(eq(vendors.tenantId, this.tenantId), eq(vendors.name, name)))
      .limit(2);
    if (exact.length === 1) return { suggestion: { ...exact[0]!, matchType: 'exact' }, candidates: exact };

    const partial = await this.db.select({ id: vendors.id, name: vendors.name }).from(vendors)
      .where(and(eq(vendors.tenantId, this.tenantId), ilike(vendors.name, `%${name}%`)))
      .limit(5);
    if (partial.length === 1) return { suggestion: { ...partial[0]!, matchType: 'ilike' }, candidates: partial };
    if (partial.length > 1) return { suggestion: null, candidates: partial };

    const firstWord = name.split(/\s+/)[0];
    if (firstWord && firstWord.length >= 3) {
      const fw = await this.db.select({ id: vendors.id, name: vendors.name }).from(vendors)
        .where(and(eq(vendors.tenantId, this.tenantId), ilike(vendors.name, `${firstWord}%`)))
        .limit(5);
      if (fw.length === 1) return { suggestion: { ...fw[0]!, matchType: 'firstword' }, candidates: fw };
      if (fw.length > 1) return { suggestion: null, candidates: fw };
    }
    return { suggestion: null, candidates: [] };
  }

  async listMappings(sourceId: string): Promise<MappingRow[]> {
    const src = await this.getSource(sourceId);
    const rows = await this.db
      .select({
        vendorId: vendors.id,
        vendorName: vendors.name,
        externalRef: sql<string>`${vendors.externalRefs}->>${src.slug}`,
      })
      .from(vendors)
      .where(and(
        eq(vendors.tenantId, this.tenantId),
        sql`${vendors.externalRefs} ? ${src.slug}`,
      ))
      .orderBy(vendors.name);
    return rows.filter((r) => r.externalRef);
  }

  async mapVendor(sourceId: string, vendorId: string, externalRef: string) {
    const src = await this.getSource(sourceId);
    const ref = String(externalRef).trim();
    if (!ref) throw new Error('externalRef required');

    const [vendor] = await this.db.select({ id: vendors.id }).from(vendors)
      .where(and(eq(vendors.id, vendorId), eq(vendors.tenantId, this.tenantId)))
      .limit(1);
    if (!vendor) throw new NotFoundError('Vendor');

    await this.db.update(vendors)
      .set({
        externalRefs: sql`COALESCE(${vendors.externalRefs}, '{}'::jsonb) || jsonb_build_object(${src.slug}::text, ${ref}::text)`,
        updatedAt: new Date(),
      })
      .where(eq(vendors.id, vendorId));
    return { vendorId, externalRef: ref };
  }

  /**
   * Create a runq vendor and map it to externalRef in one transaction.
   * Used by the bill-sync admin UI when no existing vendor matches the
   * external system's entity — saves the user a trip to the vendors page.
   */
  async createAndMapVendor(sourceId: string, vendorName: string, externalRef: string, category?: string) {
    const src = await this.getSource(sourceId);
    const ref = String(externalRef).trim();
    const name = String(vendorName).trim();
    if (!ref) throw new Error('externalRef required');
    if (!name) throw new Error('vendorName required');

    return this.db.transaction(async (tx) => {
      const [vendor] = await tx.insert(vendors).values({
        tenantId: this.tenantId,
        name,
        category: category ?? null,
        externalRefs: { [src.slug]: ref },
      }).returning({ id: vendors.id, name: vendors.name });
      return { vendorId: vendor!.id, vendorName: vendor!.name, externalRef: ref };
    });
  }

  async unmapVendor(sourceId: string, vendorId: string) {
    const src = await this.getSource(sourceId);
    await this.db.update(vendors)
      .set({
        externalRefs: sql`${vendors.externalRefs} - ${src.slug}::text`,
        updatedAt: new Date(),
      })
      .where(and(eq(vendors.id, vendorId), eq(vendors.tenantId, this.tenantId)));
    return { vendorId };
  }
}
