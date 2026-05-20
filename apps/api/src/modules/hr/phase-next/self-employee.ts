import { and, eq, sql } from 'drizzle-orm';
import { employees, users } from '@runq/db';
import type { Db } from '@runq/db';
import { ForbiddenError, NotFoundError } from '../../../utils/errors';

// Resolve the logged-in user to their employee row in the tenant.
//
// Match strategy: phone number, normalised to bare digits (works for "+91…",
// "91…", "9876543210"). Email is intentionally NOT used — multiple users can
// share an email (older seed rows do), so email matches are ambiguous.
//
// If the user has no phone on file, the lookup fails — fix the user record
// rather than falling back to email.
export async function resolveSelfEmployee(
  db: Db,
  tenantId: string,
  userId: string,
): Promise<{ id: string; firstName: string; lastName: string | null }> {
  const [userRow] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) throw new NotFoundError('User');

  const phoneDigits = (userRow.phone ?? '').replace(/\D/g, '');
  if (!phoneDigits) {
    throw new ForbiddenError(
      'Your account has no phone number on file. Ask HR to update your profile so the helpdesk can identify you.',
    );
  }

  // Try the raw digits and a "91"-prefixed variant. Employees may be stored
  // with country code, the user without — or vice versa.
  const v1 = phoneDigits;
  const v2 = phoneDigits.startsWith('91') ? phoneDigits.slice(2) : `91${phoneDigits}`;

  const [emp] = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(employees)
    .where(
      and(
        eq(employees.tenantId, tenantId),
        sql`regexp_replace(coalesce(${employees.phone}, ''), '\\D', '', 'g') IN (${v1}, ${v2})`,
      ),
    )
    .limit(1);
  if (!emp) throw new ForbiddenError('No employee record linked to this phone number');
  return emp;
}
