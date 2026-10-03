import { and, eq, inArray, sql } from 'drizzle-orm';
import { expenseClaims, employeeRewards, employees } from '@runq/db';
import type { Db } from '@runq/db';
import { inScope, money, monthOf, WHOLE_MONTH, type ToPayItem, type ToPayScope } from '../types';

const name = (f: string | null, l: string | null) => [f, l].filter(Boolean).join(' ') || 'Employee';

/**
 * Money owed to employees outside payroll: expense claims (approved = owed,
 * reimbursed = paid) and monetary rewards (posted = owed, paid). Neither has a
 * due date, so the approval / award date stands in and sets the month.
 */
export async function claimItems(db: Db, tenantId: string, scope: ToPayScope): Promise<ToPayItem[]> {
  const month = scope.kind === 'month';
  const [claims, rewards] = await Promise.all([
    db.select({
      id: expenseClaims.id, number: expenseClaims.claimNumber, amount: expenseClaims.totalAmount,
      status: expenseClaims.status, claimDate: expenseClaims.claimDate, approvedAt: expenseClaims.approvedAt,
      first: employees.firstName, last: employees.lastName,
    })
      .from(expenseClaims)
      .leftJoin(employees, eq(employees.id, expenseClaims.employeeId))
      .where(and(
        eq(expenseClaims.tenantId, tenantId),
        month ? inArray(expenseClaims.status, ['approved', 'reimbursed']) : eq(expenseClaims.status, 'approved'),
        month ? sql`date_trunc('month', coalesce(${expenseClaims.approvedAt}::date, ${expenseClaims.claimDate}::date))::date = ${scope.month}` : undefined,
      )),
    db.select({
      id: employeeRewards.id, title: employeeRewards.title, amount: employeeRewards.amount,
      status: employeeRewards.status, awardDate: employeeRewards.awardDate,
      first: employees.firstName, last: employees.lastName,
    })
      .from(employeeRewards)
      .innerJoin(employees, eq(employees.id, employeeRewards.employeeId))
      .where(and(
        eq(employeeRewards.tenantId, tenantId),
        eq(employeeRewards.kind, 'monetary'),
        month ? inArray(employeeRewards.status, ['posted', 'paid']) : eq(employeeRewards.status, 'posted'),
        month ? sql`date_trunc('month', ${employeeRewards.awardDate})::date = ${scope.month}` : undefined,
      )),
  ]);
  return [
    ...claims.map((c): ToPayItem => {
      const date = c.approvedAt ? c.approvedAt.toISOString().slice(0, 10) : c.claimDate;
      return {
        id: c.id, category: 'claims', title: name(c.first, c.last), subtitle: `Expense claim ${c.number}`,
        period: monthOf(date), ...WHOLE_MONTH, ...money(Number(c.amount), c.status === 'reimbursed' ? Number(c.amount) : 0),
        dueDate: date, webLink: '/hr/expense-claims', mobileLink: `/hr/expense-claims/${c.id}`,
      };
    }),
    ...rewards.map((r): ToPayItem => ({
      id: r.id, category: 'claims', title: name(r.first, r.last), subtitle: `Reward · ${r.title}`,
      period: monthOf(r.awardDate), ...WHOLE_MONTH, ...money(Number(r.amount), r.status === 'paid' ? Number(r.amount) : 0),
      dueDate: r.awardDate, webLink: '/hr/rewards', mobileLink: '/hr/rewards',
    })),
  ].filter((i) => inScope(scope, i));
}
