import { eq } from 'drizzle-orm';
import { tenants } from '@runq/db';
import type { Db } from '@runq/db';
import type { ModuleCode, TenantSettings, UserRole } from '@runq/types';
import { financeItems } from './sources/finance';
import { salaryItems, statutoryItems } from './sources/payroll';
import { milkItems } from './sources/milk';
import { claimItems } from './sources/claims';
import { addDays, todayIst } from './due-dates';
import { CATEGORY_LABEL, type ToPayCategory, type ToPayItem, type ToPayScope } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;
const ORDER: ToPayCategory[] = ['salaries', 'statutory', 'milk', 'rent_transport', 'bills', 'claims'];

/** Who may see what: the module must be on for this user, and the role must
 *  already see that data on its own screens. */
const OWNERS: UserRole[] = ['owner', 'client_owner'];
const canFinance = (r: UserRole) => [...OWNERS, 'accountant', 'viewer'].includes(r);
const canPayroll = (r: UserRole) => [...OWNERS, 'accountant', 'hr'].includes(r);
const canMilk = (r: UserRole) => [...OWNERS, 'accountant'].includes(r);

export interface ToPayAccess { modules: ModuleCode[]; role: UserRole }

/**
 * What the business pays, across modules. `outstanding` = everything still
 * owed from any month; `month` = every payment belonging to that month, paid
 * or not. Read-only: each item links to the screen where it is paid.
 */
export async function toPayOverview(
  db: Db, tenantId: string, access: ToPayAccess, scope: ToPayScope, today = todayIst(),
) {
  const settings = await tenantSettings(db, tenantId);
  const has = (m: ModuleCode) => access.modules.includes(m);
  const jobs: Promise<ToPayItem[]>[] = [];
  if (has('finance') && canFinance(access.role)) jobs.push(financeItems(db, tenantId, scope));
  if (has('hr') && canPayroll(access.role)) {
    jobs.push(
      salaryItems(db, tenantId, settings, scope),
      statutoryItems(db, tenantId, settings, scope),
      claimItems(db, tenantId, scope),
    );
  }
  if (has('milk_procurement') && canMilk(access.role)) jobs.push(milkItems(db, tenantId, scope));
  const items = (await Promise.all(jobs)).flat()
    .filter((i) => i.amount > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.amount - a.amount);
  return { scope: scope.kind, month: scope.kind === 'month' ? scope.month : null, ...summarize(items, today) };
}

/**
 * Totals: `amount` / `paid` / `balance` across everything listed, and the
 * still-owed balance split by when it falls due (overdue / next 7 days /
 * later). The same per category.
 */
export function summarize(items: ToPayItem[], today: string) {
  const weekEnd = addDays(today, 6);
  const sum = (xs: ToPayItem[], f: (i: ToPayItem) => number) => r2(xs.reduce((s, i) => s + f(i), 0));
  const owed = items.filter((i) => i.balance > 0);
  const overdue = owed.filter((i) => i.dueDate < today);
  const thisWeek = owed.filter((i) => i.dueDate >= today && i.dueDate <= weekEnd);
  const bal = (i: ToPayItem) => i.balance;
  const categories = ORDER
    .map((key) => {
      const xs = items.filter((i) => i.category === key);
      return {
        key, label: CATEGORY_LABEL[key], count: xs.length,
        paidCount: xs.filter((i) => i.status === 'paid').length,
        total: sum(xs, (i) => i.amount), paid: sum(xs, (i) => i.paid), balance: sum(xs, bal),
        overdue: sum(xs.filter((i) => i.balance > 0 && i.dueDate < today), bal),
      };
    })
    .filter((c) => c.count > 0);
  return {
    asOf: today,
    total: sum(items, (i) => i.amount),
    paid: sum(items, (i) => i.paid),
    balance: sum(owed, bal),
    overdue: sum(overdue, bal),
    overdueCount: overdue.length,
    thisWeek: sum(thisWeek, bal),
    thisWeekCount: thisWeek.length,
    later: r2(sum(owed, bal) - sum(overdue, bal) - sum(thisWeek, bal)),
    categories,
    items,
  };
}

async function tenantSettings(db: Db, tenantId: string): Promise<Partial<TenantSettings>> {
  const [t] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId));
  return (t?.settings ?? {}) as Partial<TenantSettings>;
}
