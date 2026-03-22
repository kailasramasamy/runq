import type { Db } from '../src/client';
import { accounts } from '../src/schema/gl/accounts';
import { eq, and } from 'drizzle-orm';

type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

interface CoaEntry {
  code: string;
  name: string;
  type: AccountType;
  parent: string | null;
}

export const INDIAN_COA: CoaEntry[] = [
  // ASSETS (1xxx)
  { code: '1000', name: 'Assets', type: 'asset', parent: null },
  { code: '1100', name: 'Current Assets', type: 'asset', parent: '1000' },
  { code: '1101', name: 'Cash at Bank', type: 'asset', parent: '1100' },
  { code: '1102', name: 'Petty Cash', type: 'asset', parent: '1100' },
  { code: '1103', name: 'Accounts Receivable', type: 'asset', parent: '1100' },
  { code: '1104', name: 'Advance to Suppliers', type: 'asset', parent: '1100' },
  { code: '1200', name: 'Fixed Assets', type: 'asset', parent: '1000' },

  // LIABILITIES (2xxx)
  { code: '2000', name: 'Liabilities', type: 'liability', parent: null },
  { code: '2100', name: 'Current Liabilities', type: 'liability', parent: '2000' },
  { code: '2101', name: 'Accounts Payable', type: 'liability', parent: '2100' },
  { code: '2102', name: 'Advance from Customers', type: 'liability', parent: '2100' },
  { code: '2103', name: 'GST Payable', type: 'liability', parent: '2100' },
  { code: '2104', name: 'TDS Payable', type: 'liability', parent: '2100' },

  // EQUITY (3xxx)
  { code: '3000', name: 'Equity', type: 'equity', parent: null },
  { code: '3001', name: 'Share Capital', type: 'equity', parent: '3000' },
  { code: '3002', name: 'Retained Earnings', type: 'equity', parent: '3000' },

  // REVENUE (4xxx)
  { code: '4000', name: 'Revenue', type: 'revenue', parent: null },
  { code: '4001', name: 'Sales Revenue', type: 'revenue', parent: '4000' },
  { code: '4002', name: 'Other Income', type: 'revenue', parent: '4000' },

  // EXPENSES (5xxx)
  { code: '5000', name: 'Expenses', type: 'expense', parent: null },
  { code: '5001', name: 'Cost of Goods Sold', type: 'expense', parent: '5000' },
  { code: '5002', name: 'Purchase Expenses', type: 'expense', parent: '5000' },
  { code: '5003', name: 'Salary Expense', type: 'expense', parent: '5000' },
  { code: '5004', name: 'Rent Expense', type: 'expense', parent: '5000' },
  { code: '5005', name: 'Utilities Expense', type: 'expense', parent: '5000' },
  { code: '5006', name: 'Transport Expense', type: 'expense', parent: '5000' },
  { code: '5007', name: 'Bank Charges', type: 'expense', parent: '5000' },
  { code: '5008', name: 'Petty Cash Expense', type: 'expense', parent: '5000' },
  { code: '5009', name: 'Miscellaneous Expense', type: 'expense', parent: '5000' },
];

export async function seedChartOfAccounts(db: Db, tenantId: string): Promise<void> {
  console.log('Seeding chart of accounts...');

  // Insert in two passes: parents first, then children (to resolve parentId)
  const idByCode = new Map<string, string>();

  // Pass 1: top-level accounts (no parent)
  const topLevel = INDIAN_COA.filter((a) => a.parent === null);
  for (const entry of topLevel) {
    const [row] = await db
      .insert(accounts)
      .values({ tenantId, code: entry.code, name: entry.name, type: entry.type, isSystemAccount: true })
      .onConflictDoNothing()
      .returning();
    if (row) idByCode.set(entry.code, row.id);
  }

  // Reload existing top-level to handle conflict case
  await reloadExisting(db, tenantId, topLevel.map((a) => a.code), idByCode);

  // Pass 2: children in order (single level deep is sufficient for current COA)
  const children = INDIAN_COA.filter((a) => a.parent !== null);
  for (const entry of children) {
    const parentId = idByCode.get(entry.parent!) ?? null;
    const [row] = await db
      .insert(accounts)
      .values({ tenantId, code: entry.code, name: entry.name, type: entry.type, parentId, isSystemAccount: true })
      .onConflictDoNothing()
      .returning();
    if (row) idByCode.set(entry.code, row.id);
  }

  console.log(`Seeded ${INDIAN_COA.length} accounts for tenant ${tenantId}`);
}

async function reloadExisting(db: Db, tenantId: string, codes: string[], idByCode: Map<string, string>): Promise<void> {
  const rows = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId)));
  for (const row of rows) {
    if (codes.includes(row.code)) {
      idByCode.set(row.code, row.id);
    }
  }
}

// Standalone runner
if (process.argv[1]?.endsWith('chart-of-accounts.ts')) {
  import('../src/client').then(async ({ createDb }) => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

    const { db, pool } = createDb(dbUrl);

    // Get first tenant id for demo seed
    const { tenants } = await import('../src/schema/tenant');
    const [tenant] = await db.select({ id: tenants.id }).from(tenants).limit(1);
    if (!tenant) { console.error('No tenant found — run the main seed first'); process.exit(1); }

    await seedChartOfAccounts(db, tenant.id);
    await pool.end();
  }).catch((err) => { console.error(err); process.exit(1); });
}
