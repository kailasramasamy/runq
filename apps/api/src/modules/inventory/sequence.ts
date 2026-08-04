import { sql } from 'drizzle-orm';

/**
 * Tiny per-tenant document numbering helper. Uses an UPSERT-with-INCREMENT
 * pattern on `inventory_sequences` (bootstrapped on first call).
 *
 * Generates `<prefix>-<6-digit-counter>` (e.g. GRN-000123). Per-tenant
 * monotonic. Race-safe via the atomic UPDATE...RETURNING.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nextDocNo(
  tx: any,
  tenantId: string,
  prefix: 'GRN' | 'DN' | 'TRF' | 'ADJ' | 'ST' | 'RCL',
): Promise<string> {
  const key = `${prefix.toLowerCase()}`;
  // Bootstrap the row on first call.
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS inventory_sequences (
      tenant_id UUID NOT NULL,
      key TEXT NOT NULL,
      last_value BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (tenant_id, key)
    )
  `);
  const updated = await tx.execute(sql`
    INSERT INTO inventory_sequences (tenant_id, key, last_value)
    VALUES (${tenantId}, ${key}, 1)
    ON CONFLICT (tenant_id, key)
    DO UPDATE SET last_value = inventory_sequences.last_value + 1
    RETURNING last_value::text AS last_value
  `);
  const row = (updated as unknown as { rows: Array<{ last_value: string }> }).rows[0];
  const n = Number(row?.last_value ?? 1);
  return `${prefix}-${String(n).padStart(6, '0')}`;
}
