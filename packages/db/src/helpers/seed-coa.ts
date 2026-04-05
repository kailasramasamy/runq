import { eq } from 'drizzle-orm';
import { accounts } from '../schema/gl/accounts';
import type { Db } from '../client';

type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

interface CoaEntry {
  code: string;
  name: string;
  type: AccountType;
  parent: string | null;
  system?: boolean;
}

// Comprehensive Indian SME chart of accounts (132 accounts)
// Full list lives in seeds/standard-chart-of-accounts.ts
// This imports dynamically to avoid bundling seed data into the API

export async function seedCoaForTenant(db: Db, tenantId: string): Promise<number> {
  const { STANDARD_COA } = await import('../../seeds/standard-chart-of-accounts');

  const idByCode = new Map<string, string>();
  let inserted = 0;

  const existing = await db.select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(eq(accounts.tenantId, tenantId));
  for (const row of existing) idByCode.set(row.code, row.id);

  const sorted = [...STANDARD_COA].sort((a, b) => {
    if (a.parent === null && b.parent !== null) return -1;
    if (a.parent !== null && b.parent === null) return 1;
    return a.code.localeCompare(b.code);
  });

  for (const entry of sorted) {
    if (idByCode.has(entry.code)) continue;

    const parentId = entry.parent ? idByCode.get(entry.parent) ?? null : null;
    const [row] = await db
      .insert(accounts)
      .values({
        tenantId,
        code: entry.code,
        name: entry.name,
        type: entry.type,
        parentId,
        isSystemAccount: entry.system ?? false,
      })
      .onConflictDoNothing()
      .returning();

    if (row) {
      idByCode.set(entry.code, row.id);
      inserted++;
    }
  }

  return inserted;
}
