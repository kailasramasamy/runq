/**
 * HrNotifier — single place to turn an HR domain event into an in-app +
 * mobile-push notification.
 *
 * HR entities reference `employees`; notifications target `users`. The two
 * are linked by a shared phone (mobile-app login material) or email, so this
 * helper centralises that resolution instead of every route re-implementing
 * the join. It also resolves the reporting manager and HR-admin recipients.
 *
 * Every send goes through NotificationsService.create, which writes the inbox
 * row and fires FCM push fire-and-forget.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { employees, users } from '@runq/db';
import { NotificationsService } from '../dashboard/notifications.service';

/** Notification `source` tag — drives the icon/colour in the mobile inbox. */
export type HrNotificationSource =
  | 'hr_leave'
  | 'hr_payroll'
  | 'hr_attendance'
  | 'hr_expense'
  | 'hr_reward'
  | 'hr_loan'
  | 'hr_tax'
  | 'hr_helpdesk'
  | 'hr_announcement'
  | 'hr_onboarding'
  | 'hr_lifecycle'
  | 'hr_performance';

export interface HrNotice {
  type?: 'info' | 'ok' | 'warn';
  source: HrNotificationSource;
  title: string;
  body?: string;
  targetUrl?: string;
}

/** Roles that should receive "action needed" / admin HR notifications. */
const HR_ADMIN_ROLES = ['owner', 'accountant', 'hr', 'client_owner'] as const;

export class HrNotifier {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /**
   * Resolve a set of employees to their user accounts in one query.
   * Phone-match first, email as fallback. Phone comparison is on the last
   * 10 digits: mobile-OTP logins strip the `91` country code (see
   * normalisePhone) while `employees.phone` is often stored with a `+91`
   * prefix — a plain digit equality would miss that. Returns an
   * employeeId → userId map; unmatched employees are absent.
   */
  private async usersForEmployees(employeeIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(employeeIds)].filter(Boolean);
    if (ids.length === 0) return new Map();

    const rows = await this.db
      .select({ employeeId: employees.id, userId: users.id })
      .from(employees)
      .innerJoin(
        users,
        and(
          eq(users.tenantId, employees.tenantId),
          eq(users.isActive, true),
          sql`(
            (coalesce(${users.phone}, '') <> ''
              AND right(regexp_replace(coalesce(${employees.phone}, ''), '\\D', '', 'g'), 10)
                = right(regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g'), 10))
            OR (coalesce(${employees.email}, '') <> ''
              AND lower(${users.email}) = lower(${employees.email}))
          )`,
        ),
      )
      .where(and(eq(employees.tenantId, this.tenantId), inArray(employees.id, ids)));

    const map = new Map<string, string>();
    for (const r of rows) if (!map.has(r.employeeId)) map.set(r.employeeId, r.userId);
    return map;
  }

  /** Resolve a single employee to its user id, or null if unmatched. */
  async userIdForEmployee(employeeId: string): Promise<string | null> {
    return (await this.usersForEmployees([employeeId])).get(employeeId) ?? null;
  }

  /** Deduplicate, drop excluded, and send the notice to each user. */
  private async dispatch(userIds: string[], notice: HrNotice, exclude?: string): Promise<number> {
    const targets = [...new Set(userIds)].filter((id) => Boolean(id) && id !== exclude);
    for (const userId of targets) {
      await new NotificationsService(this.db, this.tenantId, userId).create(notice);
    }
    return targets.length;
  }

  /** Send to one known user id. */
  async notifyUser(userId: string, notice: HrNotice): Promise<void> {
    await this.dispatch([userId], notice);
  }

  /**
   * Send to the employee who is the subject of the event.
   * Returns false (no-op) when the employee has no linked user account.
   */
  async notifyEmployee(employeeId: string, notice: HrNotice): Promise<boolean> {
    const userId = await this.userIdForEmployee(employeeId);
    if (!userId) return false;
    await this.notifyUser(userId, notice);
    return true;
  }

  /** Fan-out to many employees. Returns the number of users actually notified. */
  async notifyEmployees(employeeIds: string[], notice: HrNotice, exclude?: string): Promise<number> {
    const map = await this.usersForEmployees(employeeIds);
    return this.dispatch([...map.values()], notice, exclude);
  }

  /**
   * Send to the employee's reporting manager. Falls back to HR admins when the
   * employee has no manager, or the manager has no linked user account — an
   * approval request must never be silently dropped.
   */
  async notifyManagerOf(employeeId: string, notice: HrNotice): Promise<void> {
    const [emp] = await this.db
      .select({ reportingToId: employees.reportingToId })
      .from(employees)
      .where(and(eq(employees.tenantId, this.tenantId), eq(employees.id, employeeId)))
      .limit(1);

    if (emp?.reportingToId) {
      const delivered = await this.notifyEmployee(emp.reportingToId, notice);
      if (delivered) return;
    }
    await this.notifyHrAdmins(notice);
  }

  /** Send to every active owner / accountant / hr / client_owner user. */
  async notifyHrAdmins(notice: HrNotice, exclude?: string): Promise<number> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(
        eq(users.tenantId, this.tenantId),
        eq(users.isActive, true),
        inArray(users.role, [...HR_ADMIN_ROLES]),
      ));
    return this.dispatch(rows.map((r) => r.id), notice, exclude);
  }

  /**
   * Announcement fan-out. `departmentId` null = whole org; `audience`
   * 'managers' restricts to employees who have at least one direct report.
   */
  async notifyAudience(
    opts: { departmentId: string | null; audience: 'all' | 'managers' },
    notice: HrNotice,
    exclude?: string,
  ): Promise<number> {
    const conds = [
      eq(employees.tenantId, this.tenantId),
      eq(employees.status, 'active'),
    ];
    if (opts.departmentId) conds.push(eq(employees.departmentId, opts.departmentId));
    if (opts.audience === 'managers') {
      conds.push(sql`${employees.id} IN (
        SELECT DISTINCT reporting_to_id FROM employees
        WHERE reporting_to_id IS NOT NULL AND tenant_id = ${this.tenantId}
      )`);
    }
    const rows = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(...conds));
    return this.notifyEmployees(rows.map((r) => r.id), notice, exclude);
  }
}
