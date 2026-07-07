import { FastifyPluginAsync } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { users, employees } from '@runq/db';
import { otpRequestSchema, phoneLoginSchema } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';
import { normalisePhone } from '../../utils/phone';
import { sendPhoneOtp, verifyPhoneOtp } from '../../utils/otp/phone-otp.service';
import { ensureMembership, issueSession } from './auth-session';
import { loadEnv } from '../../config/env';

// Isolate the HR/runq OTP Redis keys from Dhenu's ('mp').
const HR_OTP = { namespace: 'hr', label: 'runq' } as const;

// Match an employee by phone — digit-normalised so rows stored with spaces,
// +91, or a leading 91 still resolve. Returns null when no employee matches.
async function resolveEmployeeByPhone(db: any, phone: string) {
  const matchExpr = sql`regexp_replace(${employees.phone}, '\\D', '', 'g')`;
  const [emp] = await db
    .select()
    .from(employees)
    .where(sql`${matchExpr} = ${phone} OR ${matchExpr} = ${'91' + phone}`)
    .limit(1);
  return emp ?? null;
}

// Find or auto-provision the runq user that backs an employee. Reuses an
// existing email-login user (so we never demote an hr/accountant/owner to a
// fresh viewer), else mints a viewer pinned to the employee's tenant.
async function resolveOrProvisionUser(db: any, emp: any, phone: string) {
  let [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  if (user) return user;

  if (emp.email?.trim()) {
    [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, emp.tenantId), sql`lower(${users.email}) = lower(${emp.email})`))
      .limit(1);
    if (user) return user;
  }

  // Synthesise a non-routable .local email so the NOT-NULL constraint holds;
  // these addresses must never receive mail.
  const fullName = [emp.firstName, emp.lastName].filter(Boolean).join(' ').trim() || 'Employee';
  const synthEmail = emp.email?.trim() || `phone-${phone}@runq.local`;
  const randomHash = await argon2.hash(randomBytes(32).toString('hex'));
  [user] = await db
    .insert(users)
    .values({
      tenantId: emp.tenantId,
      email: synthEmail,
      name: fullName,
      phone,
      role: 'viewer',
      passwordHash: randomHash,
    })
    .returning();
  await ensureMembership(db, user.id, emp.tenantId, 'viewer');
  return user;
}

// Reject an OTP request for a phone with no employee, so we never text a
// stranger. Returns the normalised phone + the matched employee.
async function requireEmployeePhone(app: any, phoneRaw: string): Promise<{ phone: string; emp: any }> {
  const phone = normalisePhone(phoneRaw);
  const emp = await resolveEmployeeByPhone(app.db, phone);
  if (!emp) throw new NotFoundError('Employee for this phone');
  return { phone, emp };
}

export const phoneAuthRoutes: FastifyPluginAsync = async (app) => {
  // Step 1 — send the SMS code. Gated on an existing employee (no self-signup),
  // then handed to the shared Redis+MSG91 OTP service. `devCode` is returned
  // outside production so headless e2e scripts can complete without SMS.
  app.post('/otp/request', async (request, reply) => {
    const { phone } = otpRequestSchema.parse(request.body);
    const { phone: normalised } = await requireEmployeePhone(app, phone);
    const devCode = await sendPhoneOtp(app, normalised, HR_OTP);
    const isProd = loadEnv().NODE_ENV === 'production';
    return reply.send({ data: { sent: true, ...(isProd ? {} : { devCode }) } });
  });

  // Step 2 — verify the code and issue the runq session. The verified OTP is
  // the ownership proof: match the employee by phone, provision/reuse the user,
  // and mint the runq JWT. No Firebase, no DOB.
  app.post('/phone/login', async (request, reply) => {
    const { phone, otp } = phoneLoginSchema.parse(request.body);
    const { phone: normalised, emp } = await requireEmployeePhone(app, phone);
    await verifyPhoneOtp(app, normalised, otp, HR_OTP);

    const user = await resolveOrProvisionUser(app.db, emp, normalised);
    if (user.authProvider !== 'phone' || !user.phone) {
      await app.db
        .update(users)
        .set({ authProvider: 'phone', phone: user.phone ?? normalised })
        .where(eq(users.id, user.id));
    }

    return reply.send({ data: await issueSession(app, user) });
  });
};
