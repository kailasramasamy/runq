import { and, eq } from 'drizzle-orm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { partnerApiKeys, type PartnerApiKeyRow } from '@runq/db';
import type { Db } from '@runq/db';

/** Grants a partner key can carry. One per published feed. */
export const PARTNER_SCOPES = ['mp:milk-quality:read'] as const;
export type PartnerScope = typeof PARTNER_SCOPES[number];

export interface MintedKey {
  id: string;
  slug: string;
  name: string;
  /** Shown once, at mint/rotate time — only the hash is stored. */
  apiKey: string;
  apiKeyPrefix: string;
}

function generateApiKey(slug: string): { plain: string; hash: string; prefix: string } {
  const random = randomBytes(24).toString('base64url');
  const safeSlug = slug.replace(/[^a-z0-9]/g, '').slice(0, 6) || 'ptnr';
  const plain = `pk_${safeSlug}_${random}`;
  return { plain, hash: sha256(plain), prefix: plain.slice(0, 12) };
}

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

export async function mintPartnerKey(
  db: Db,
  tenantId: string,
  input: { slug: string; name: string; scopes: PartnerScope[] },
): Promise<MintedKey> {
  const slug = input.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 64);
  const key = generateApiKey(slug);
  const [row] = await db.insert(partnerApiKeys).values({
    tenantId, slug, name: input.name, scopes: input.scopes,
    apiKeyHash: key.hash, apiKeyPrefix: key.prefix,
  }).returning();
  return { id: row!.id, slug: row!.slug, name: row!.name, apiKey: key.plain, apiKeyPrefix: key.prefix };
}

export async function rotatePartnerKey(db: Db, tenantId: string, slug: string): Promise<MintedKey> {
  const key = generateApiKey(slug);
  const [row] = await db.update(partnerApiKeys)
    .set({ apiKeyHash: key.hash, apiKeyPrefix: key.prefix, updatedAt: new Date() })
    .where(and(eq(partnerApiKeys.tenantId, tenantId), eq(partnerApiKeys.slug, slug)))
    .returning();
  if (!row) throw new Error(`No partner key with slug "${slug}" for this tenant`);
  return { id: row.id, slug: row.slug, name: row.name, apiKey: key.plain, apiKeyPrefix: key.prefix };
}

/**
 * Authenticate an inbound partner request without a tenant context — the
 * matched row IS the tenant context, exactly as bill-sync's push API works.
 * Slug is unique per tenant, but (slug, hash) is globally unique because the
 * key is 24 bytes of CSPRNG output.
 *
 * The hash is compared in SQL (indexed) and then re-checked with a constant-time
 * compare, so a row that came back on a partial/lucky match can't be accepted.
 * Returns null on any failure — bad slug, bad key, inactive, or missing scope.
 */
export async function authenticatePartner(
  db: Db, slug: string, apiKey: string, scope: PartnerScope,
): Promise<PartnerApiKeyRow | null> {
  if (!slug || !apiKey) return null;
  const hash = sha256(apiKey);
  const [row] = await db.select().from(partnerApiKeys)
    .where(and(
      eq(partnerApiKeys.slug, slug),
      eq(partnerApiKeys.apiKeyHash, hash),
      eq(partnerApiKeys.isActive, true),
    ))
    .limit(1);
  if (!row) return null;
  const a = Buffer.from(row.apiKeyHash);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (!row.scopes.includes(scope)) return null;
  return row;
}

/** Fire-and-forget usage stamp — a failed write must never fail the read. */
export async function touchPartnerKey(db: Db, id: string): Promise<void> {
  await db.update(partnerApiKeys).set({ lastUsedAt: new Date() }).where(eq(partnerApiKeys.id, id));
}
