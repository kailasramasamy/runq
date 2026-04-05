/**
 * Standard Indian Chart of Accounts for SMEs
 *
 * Based on Schedule III of the Companies Act, 2013 + practical needs
 * of Indian SMEs (GST, TDS, banking, manufacturing, trading, services).
 *
 * Usage:
 *   npx tsx --env-file=../../.env seeds/standard-chart-of-accounts.ts
 *
 * Safe to run multiple times — uses onConflictDoNothing on (tenantId, code).
 * Designed for production: seeds all tenants that don't yet have accounts.
 */

import { eq, and, sql } from 'drizzle-orm';
import { createDb } from '../src/client';
import { accounts } from '../src/schema/gl/accounts';
import { tenants } from '../src/schema/tenant';

type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

interface CoaEntry {
  code: string;
  name: string;
  type: AccountType;
  parent: string | null;
  system?: boolean; // true = used by auto-posting, cannot be deactivated
}

// ─── CHART OF ACCOUNTS ────────────────────────────────────────────────
// Codes follow Indian convention:
//   1xxx = Assets, 2xxx = Liabilities, 3xxx = Equity
//   4xxx = Revenue, 5xxx = Expenses

const STANDARD_COA: CoaEntry[] = [
  // ═══════════════════════════════════════════════════════════════════
  // ASSETS (1xxx)
  // ═══════════════════════════════════════════════════════════════════
  { code: '1000', name: 'Assets', type: 'asset', parent: null },

  // Current Assets
  { code: '1100', name: 'Current Assets', type: 'asset', parent: '1000' },
  { code: '1101', name: 'Cash at Bank', type: 'asset', parent: '1100', system: true },
  { code: '1102', name: 'Petty Cash', type: 'asset', parent: '1100', system: true },
  { code: '1103', name: 'Accounts Receivable', type: 'asset', parent: '1100', system: true },
  { code: '1104', name: 'Advance to Suppliers', type: 'asset', parent: '1100', system: true },
  { code: '1105', name: 'Input GST (CGST)', type: 'asset', parent: '1100' },
  { code: '1106', name: 'Input GST (SGST)', type: 'asset', parent: '1100' },
  { code: '1107', name: 'Input GST (IGST)', type: 'asset', parent: '1100' },
  { code: '1108', name: 'TDS Receivable', type: 'asset', parent: '1100' },
  { code: '1109', name: 'Prepaid Expenses', type: 'asset', parent: '1100' },
  { code: '1110', name: 'Security Deposits', type: 'asset', parent: '1100' },
  { code: '1111', name: 'Inventory — Raw Materials', type: 'asset', parent: '1100' },
  { code: '1112', name: 'Inventory — Finished Goods', type: 'asset', parent: '1100' },
  { code: '1113', name: 'Inventory — Packing Material', type: 'asset', parent: '1100' },
  { code: '1114', name: 'Short-Term Investments', type: 'asset', parent: '1100' },
  { code: '1115', name: 'Accrued Revenue', type: 'asset', parent: '1100' },

  // Fixed Assets
  { code: '1200', name: 'Fixed Assets', type: 'asset', parent: '1000' },
  { code: '1201', name: 'Plant & Machinery', type: 'asset', parent: '1200' },
  { code: '1202', name: 'Furniture & Fixtures', type: 'asset', parent: '1200' },
  { code: '1203', name: 'Office Equipment', type: 'asset', parent: '1200' },
  { code: '1204', name: 'Computer & IT Equipment', type: 'asset', parent: '1200' },
  { code: '1205', name: 'Vehicles', type: 'asset', parent: '1200' },
  { code: '1206', name: 'Leasehold Improvements', type: 'asset', parent: '1200' },
  { code: '1207', name: 'Accumulated Depreciation', type: 'asset', parent: '1200' },

  // Intangible Assets
  { code: '1300', name: 'Intangible Assets', type: 'asset', parent: '1000' },
  { code: '1301', name: 'Software & Licenses', type: 'asset', parent: '1300' },
  { code: '1302', name: 'Goodwill', type: 'asset', parent: '1300' },
  { code: '1303', name: 'Trademarks & Patents', type: 'asset', parent: '1300' },

  // ═══════════════════════════════════════════════════════════════════
  // LIABILITIES (2xxx)
  // ═══════════════════════════════════════════════════════════════════
  { code: '2000', name: 'Liabilities', type: 'liability', parent: null },

  // Current Liabilities
  { code: '2100', name: 'Current Liabilities', type: 'liability', parent: '2000' },
  { code: '2101', name: 'Accounts Payable', type: 'liability', parent: '2100', system: true },
  { code: '2102', name: 'Advance from Customers', type: 'liability', parent: '2100', system: true },
  { code: '2103', name: 'GST Payable (Output CGST)', type: 'liability', parent: '2100', system: true },
  { code: '2104', name: 'TDS Payable', type: 'liability', parent: '2100', system: true },
  { code: '2105', name: 'GST Payable (Output SGST)', type: 'liability', parent: '2100' },
  { code: '2106', name: 'GST Payable (Output IGST)', type: 'liability', parent: '2100' },
  { code: '2107', name: 'PF Payable', type: 'liability', parent: '2100' },
  { code: '2108', name: 'ESI Payable', type: 'liability', parent: '2100' },
  { code: '2109', name: 'Professional Tax Payable', type: 'liability', parent: '2100' },
  { code: '2110', name: 'Salary Payable', type: 'liability', parent: '2100' },
  { code: '2111', name: 'Accrued Expenses', type: 'liability', parent: '2100' },
  { code: '2112', name: 'Provision for Income Tax', type: 'liability', parent: '2100' },
  { code: '2113', name: 'Other Current Liabilities', type: 'liability', parent: '2100' },

  // Long-Term Liabilities
  { code: '2200', name: 'Long-Term Liabilities', type: 'liability', parent: '2000' },
  { code: '2201', name: 'Term Loans', type: 'liability', parent: '2200' },
  { code: '2202', name: 'Vehicle Loans', type: 'liability', parent: '2200' },
  { code: '2203', name: 'Unsecured Loans (Directors)', type: 'liability', parent: '2200' },
  { code: '2204', name: 'Security Deposits Received', type: 'liability', parent: '2200' },

  // ═══════════════════════════════════════════════════════════════════
  // EQUITY (3xxx)
  // ═══════════════════════════════════════════════════════════════════
  { code: '3000', name: 'Equity', type: 'equity', parent: null },
  { code: '3001', name: 'Share Capital', type: 'equity', parent: '3000' },
  { code: '3002', name: 'Retained Earnings', type: 'equity', parent: '3000' },
  { code: '3003', name: 'Reserves & Surplus', type: 'equity', parent: '3000' },
  { code: '3004', name: "Owner's Drawings", type: 'equity', parent: '3000' },
  { code: '3005', name: "Owner's Capital", type: 'equity', parent: '3000' },

  // ═══════════════════════════════════════════════════════════════════
  // REVENUE (4xxx)
  // ═══════════════════════════════════════════════════════════════════
  { code: '4000', name: 'Revenue', type: 'revenue', parent: null },

  // Operating Revenue
  { code: '4100', name: 'Operating Revenue', type: 'revenue', parent: '4000' },
  { code: '4001', name: 'Sales Revenue', type: 'revenue', parent: '4100', system: true },
  { code: '4002', name: 'Service Revenue', type: 'revenue', parent: '4100' },
  { code: '4003', name: 'Export Revenue', type: 'revenue', parent: '4100' },
  { code: '4004', name: 'Sales Returns & Allowances', type: 'revenue', parent: '4100' },
  { code: '4005', name: 'Trade Discounts Given', type: 'revenue', parent: '4100' },

  // Other Income
  { code: '4200', name: 'Other Income', type: 'revenue', parent: '4000' },
  { code: '4201', name: 'Interest Income', type: 'revenue', parent: '4200' },
  { code: '4202', name: 'Rental Income', type: 'revenue', parent: '4200' },
  { code: '4203', name: 'Commission Received', type: 'revenue', parent: '4200' },
  { code: '4204', name: 'Profit on Sale of Assets', type: 'revenue', parent: '4200' },
  { code: '4205', name: 'Foreign Exchange Gain', type: 'revenue', parent: '4200' },
  { code: '4206', name: 'Miscellaneous Income', type: 'revenue', parent: '4200' },

  // ═══════════════════════════════════════════════════════════════════
  // EXPENSES (5xxx)
  // ═══════════════════════════════════════════════════════════════════
  { code: '5000', name: 'Expenses', type: 'expense', parent: null },

  // Cost of Goods Sold / Direct Costs
  { code: '5100', name: 'Cost of Goods Sold', type: 'expense', parent: '5000' },
  { code: '5001', name: 'Raw Material Purchases', type: 'expense', parent: '5100', system: true },
  { code: '5002', name: 'Purchase Expenses', type: 'expense', parent: '5100', system: true },
  { code: '5003', name: 'Freight Inward', type: 'expense', parent: '5100' },
  { code: '5004', name: 'Manufacturing Expense', type: 'expense', parent: '5100' },
  { code: '5005', name: 'Packing & Forwarding', type: 'expense', parent: '5100' },
  { code: '5006', name: 'Purchase Returns', type: 'expense', parent: '5100' },

  // Employee Costs
  { code: '5200', name: 'Employee Costs', type: 'expense', parent: '5000' },
  { code: '5201', name: 'Salary & Wages', type: 'expense', parent: '5200' },
  { code: '5202', name: 'Director Remuneration', type: 'expense', parent: '5200' },
  { code: '5203', name: 'PF Contribution (Employer)', type: 'expense', parent: '5200' },
  { code: '5204', name: 'ESI Contribution (Employer)', type: 'expense', parent: '5200' },
  { code: '5205', name: 'Bonus & Incentives', type: 'expense', parent: '5200' },
  { code: '5206', name: 'Staff Welfare', type: 'expense', parent: '5200' },
  { code: '5207', name: 'Contract Labour', type: 'expense', parent: '5200' },

  // Operating Expenses
  { code: '5300', name: 'Operating Expenses', type: 'expense', parent: '5000' },
  { code: '5301', name: 'Rent Expense', type: 'expense', parent: '5300' },
  { code: '5302', name: 'Electricity & Water', type: 'expense', parent: '5300' },
  { code: '5303', name: 'Telephone & Internet', type: 'expense', parent: '5300' },
  { code: '5304', name: 'Office Supplies & Stationery', type: 'expense', parent: '5300' },
  { code: '5305', name: 'Repairs & Maintenance', type: 'expense', parent: '5300' },
  { code: '5306', name: 'Insurance', type: 'expense', parent: '5300' },
  { code: '5307', name: 'Travel & Conveyance', type: 'expense', parent: '5300' },
  { code: '5308', name: 'Vehicle Running Expenses', type: 'expense', parent: '5300' },
  { code: '5309', name: 'Printing & Stationery', type: 'expense', parent: '5300' },
  { code: '5310', name: 'Courier & Postage', type: 'expense', parent: '5300' },
  { code: '5311', name: 'Housekeeping & Cleaning', type: 'expense', parent: '5300' },
  { code: '5312', name: 'Security Expenses', type: 'expense', parent: '5300' },

  // Professional & Administrative
  { code: '5400', name: 'Professional & Admin Expenses', type: 'expense', parent: '5000' },
  { code: '5401', name: 'Legal & Professional Fees', type: 'expense', parent: '5400' },
  { code: '5402', name: 'Audit Fees', type: 'expense', parent: '5400' },
  { code: '5403', name: 'Consultancy Charges', type: 'expense', parent: '5400' },
  { code: '5404', name: 'Software & Subscription', type: 'expense', parent: '5400' },
  { code: '5405', name: 'ROC Filing & Compliance', type: 'expense', parent: '5400' },

  // Marketing & Sales
  { code: '5500', name: 'Marketing & Sales Expenses', type: 'expense', parent: '5000' },
  { code: '5501', name: 'Advertising & Promotion', type: 'expense', parent: '5500' },
  { code: '5502', name: 'Digital Marketing', type: 'expense', parent: '5500' },
  { code: '5503', name: 'Sales Commission', type: 'expense', parent: '5500' },
  { code: '5504', name: 'Exhibition & Events', type: 'expense', parent: '5500' },
  { code: '5505', name: 'Business Development', type: 'expense', parent: '5500' },

  // Financial Costs
  { code: '5600', name: 'Financial Costs', type: 'expense', parent: '5000' },
  { code: '5601', name: 'Bank Charges', type: 'expense', parent: '5600' },
  { code: '5602', name: 'Interest on Loans', type: 'expense', parent: '5600' },
  { code: '5603', name: 'Payment Gateway Charges', type: 'expense', parent: '5600' },
  { code: '5604', name: 'Foreign Exchange Loss', type: 'expense', parent: '5600' },
  { code: '5605', name: 'Late Payment Interest', type: 'expense', parent: '5600' },

  // Transport & Logistics
  { code: '5700', name: 'Transport & Logistics', type: 'expense', parent: '5000' },
  { code: '5701', name: 'Freight Outward', type: 'expense', parent: '5700' },
  { code: '5702', name: 'Local Transport', type: 'expense', parent: '5700' },
  { code: '5703', name: 'Warehousing Charges', type: 'expense', parent: '5700' },

  // Depreciation & Amortization
  { code: '5800', name: 'Depreciation & Amortization', type: 'expense', parent: '5000' },
  { code: '5801', name: 'Depreciation — Plant & Machinery', type: 'expense', parent: '5800' },
  { code: '5802', name: 'Depreciation — Furniture', type: 'expense', parent: '5800' },
  { code: '5803', name: 'Depreciation — Vehicles', type: 'expense', parent: '5800' },
  { code: '5804', name: 'Depreciation — IT Equipment', type: 'expense', parent: '5800' },
  { code: '5805', name: 'Amortization — Software', type: 'expense', parent: '5800' },

  // Taxes & Duties (non-GST)
  { code: '5900', name: 'Taxes & Duties', type: 'expense', parent: '5000' },
  { code: '5901', name: 'Income Tax Expense', type: 'expense', parent: '5900' },
  { code: '5902', name: 'Property Tax', type: 'expense', parent: '5900' },
  { code: '5903', name: 'Stamp Duty & Registration', type: 'expense', parent: '5900' },
  { code: '5904', name: 'GST on Reverse Charge', type: 'expense', parent: '5900' },
  { code: '5999', name: 'Miscellaneous Expense', type: 'expense', parent: '5000' },
];

// ─── MIGRATION LOGIC ────────────────────────────────────────────────

type Db = ReturnType<typeof createDb>['db'];

async function seedCoaForTenant(db: Db, tenantId: string): Promise<number> {
  const idByCode = new Map<string, string>();
  let inserted = 0;

  // Load any existing accounts for this tenant
  const existing = await db.select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(eq(accounts.tenantId, tenantId));
  for (const row of existing) idByCode.set(row.code, row.id);

  // Sort: parents before children (null parent first, then by code length)
  const sorted = [...STANDARD_COA].sort((a, b) => {
    if (a.parent === null && b.parent !== null) return -1;
    if (a.parent !== null && b.parent === null) return 1;
    return a.code.localeCompare(b.code);
  });

  for (const entry of sorted) {
    if (idByCode.has(entry.code)) continue; // already exists

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

// ─── MAIN ────────────────────────────────────────────────────────────

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const { db, pool } = createDb(dbUrl);

  // Seed for all tenants (or a specific one via --tenant=slug)
  const tenantSlug = process.argv.find((a) => a.startsWith('--tenant='))?.split('=')[1];

  let tenantRows;
  if (tenantSlug) {
    tenantRows = await db.select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug));
    if (tenantRows.length === 0) {
      console.error(`Tenant "${tenantSlug}" not found`);
      process.exit(1);
    }
  } else {
    tenantRows = await db.select({ id: tenants.id, name: tenants.name }).from(tenants);
  }

  console.log(`Seeding standard chart of accounts (${STANDARD_COA.length} accounts)...`);

  for (const tenant of tenantRows) {
    const count = await seedCoaForTenant(db, tenant.id);
    console.log(`  ${tenant.name}: ${count} new accounts added (${STANDARD_COA.length - count} already existed)`);
  }

  console.log('Done.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

export { STANDARD_COA, seedCoaForTenant };
