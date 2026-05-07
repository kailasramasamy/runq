import { eq, and, desc } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { billSyncSources, billSyncLogs } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';

export interface CreateSourceInput {
  slug: string;
  name: string;
  mode?: 'api' | 'csv' | 'both';
}

export interface SourceWithKey {
  id: string;
  slug: string;
  name: string;
  apiKey: string;
  apiKeyPrefix: string;
}

function generateApiKey(slug: string): { plain: string; hash: string; prefix: string } {
  const random = randomBytes(24).toString('base64url');
  const safeSlug = slug.replace(/[^a-z0-9]/g, '').slice(0, 6) || 'src';
  const plain = `bs_${safeSlug}_${random}`;
  const hash = createHash('sha256').update(plain).digest('hex');
  return { plain, hash, prefix: plain.slice(0, 12) };
}

export class BillSyncSourceService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list() {
    return this.db.select({
      id: billSyncSources.id,
      slug: billSyncSources.slug,
      name: billSyncSources.name,
      apiKeyPrefix: billSyncSources.apiKeyPrefix,
      mode: billSyncSources.mode,
      isActive: billSyncSources.isActive,
      lastSyncAt: billSyncSources.lastSyncAt,
      columnMapping: billSyncSources.columnMapping,
      createdAt: billSyncSources.createdAt,
    }).from(billSyncSources)
      .where(eq(billSyncSources.tenantId, this.tenantId))
      .orderBy(desc(billSyncSources.createdAt));
  }

  async getById(id: string) {
    const [row] = await this.db.select().from(billSyncSources)
      .where(and(eq(billSyncSources.id, id), eq(billSyncSources.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('BillSyncSource');
    return row;
  }

  async create(input: CreateSourceInput): Promise<SourceWithKey> {
    const slug = input.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 64);
    if (!slug) throw new ConflictError('Slug is required');

    const existing = await this.db.select({ id: billSyncSources.id }).from(billSyncSources)
      .where(and(eq(billSyncSources.tenantId, this.tenantId), eq(billSyncSources.slug, slug)))
      .limit(1);
    if (existing.length) throw new ConflictError(`Source slug "${slug}" already exists`);

    const key = generateApiKey(slug);
    const [row] = await this.db.insert(billSyncSources).values({
      tenantId: this.tenantId,
      slug,
      name: input.name,
      apiKeyHash: key.hash,
      apiKeyPrefix: key.prefix,
      mode: input.mode ?? 'api',
    }).returning();
    return { id: row!.id, slug: row!.slug, name: row!.name, apiKey: key.plain, apiKeyPrefix: key.prefix };
  }

  async rotateKey(id: string): Promise<SourceWithKey> {
    const source = await this.getById(id);
    const key = generateApiKey(source.slug);
    const [row] = await this.db.update(billSyncSources)
      .set({ apiKeyHash: key.hash, apiKeyPrefix: key.prefix, updatedAt: new Date() })
      .where(eq(billSyncSources.id, id))
      .returning();
    return { id: row!.id, slug: row!.slug, name: row!.name, apiKey: key.plain, apiKeyPrefix: key.prefix };
  }

  async setActive(id: string, isActive: boolean) {
    await this.getById(id);
    await this.db.update(billSyncSources)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(billSyncSources.id, id));
  }

  async saveMapping(id: string, columnMapping: Record<string, string>, dateFormat?: string, amountFormat?: string) {
    await this.getById(id);
    await this.db.update(billSyncSources)
      .set({ columnMapping, dateFormat: dateFormat ?? null, amountFormat: amountFormat ?? null, updatedAt: new Date() })
      .where(eq(billSyncSources.id, id));
  }

  async logs(id: string, limit = 100) {
    return this.db.select().from(billSyncLogs)
      .where(and(eq(billSyncLogs.tenantId, this.tenantId), eq(billSyncLogs.sourceId, id)))
      .orderBy(desc(billSyncLogs.createdAt))
      .limit(limit);
  }

  async touchLastSync(id: string) {
    await this.db.update(billSyncSources)
      .set({ lastSyncAt: new Date() })
      .where(eq(billSyncSources.id, id));
  }
}

/**
 * Authenticate an inbound push request without requiring a tenant context.
 * Slug uniqueness is per-tenant but (slug, apiKeyHash) is globally unique
 * because the hash is generated from cryptographic randomness. Returns the
 * source row on success, null otherwise.
 */
export async function authenticateBillSyncSource(db: Db, slug: string, apiKey: string) {
  if (!slug || !apiKey) return null;
  const hash = createHash('sha256').update(apiKey).digest('hex');
  const [row] = await db.select().from(billSyncSources)
    .where(and(
      eq(billSyncSources.slug, slug),
      eq(billSyncSources.apiKeyHash, hash),
      eq(billSyncSources.isActive, true),
    ))
    .limit(1);
  return row ?? null;
}
