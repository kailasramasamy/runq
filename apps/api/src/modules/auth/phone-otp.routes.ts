import { FastifyPluginAsync } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { users, userTenants, tenants, employees } from '@runq/db';
import { phoneOtpRequestSchema, phoneOtpVerifySchema } from '@runq/validators';
import { UnauthorizedError, NotFoundError } from '../../utils/errors';
import { loadEnv } from '../../config/env';

const env = loadEnv();

// Hardcoded OTP until SMS infra is wired up. The mobile signin screen shows
// this as a hint so testers don't have to dig through code.
const FIXED_OTP = '123456';

// Strip non-digits and drop an India country code prefix so `+91 98765 43210`,
// `9198765 43210`, and `9876543210` all resolve to the same canonical form.
function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}

export const phoneOtpRoutes: FastifyPluginAsync = async (app) => {
  // Always 200 — never leak whether the phone is registered. Real SMS dispatch
  // will hook in here later; for now this is effectively a no-op the mobile
  // client uses to gate the OTP-entry screen.
  app.post('/phone-otp/request', async (request, reply) => {
    phoneOtpRequestSchema.parse(request.body);
    return reply.send({ data: { ok: true } });
  });

  app.post('/phone-otp/verify', async (request, reply) => {
    const { phone, otp } = phoneOtpVerifySchema.parse(request.body);
    if (otp !== FIXED_OTP) throw new UnauthorizedError('Invalid OTP');

    const normalised = normalisePhone(phone);
    if (normalised.length < 10) throw new UnauthorizedError('Invalid phone');

    // 1. Existing user with this phone — fastest path.
    let user = (await app.db.select().from(users).where(eq(users.phone, normalised)).limit(1))[0];

    // 2. No user yet — match an employee by phone (digit-normalised on the fly
    //    so existing rows in any format still resolve).
    if (!user) {
      const matchExpr = sql`regexp_replace(${employees.phone}, '\\D', '', 'g')`;
      const [emp] = await app.db
        .select()
        .from(employees)
        .where(sql`${matchExpr} = ${normalised} OR ${matchExpr} = ${'91' + normalised}`)
        .limit(1);
      if (!emp) throw new NotFoundError('No account found for this phone');

      // 2a. The employee may already have an email-login user (web invite
      //     or the org-role seed) whose `phone` column was never filled —
      //     reuse that account. Minting a fresh user here would create a
      //     duplicate AND silently drop an hr/accountant/owner back to
      //     `viewer`, since auto-provisioned users are always `viewer`.
      if (emp.email?.trim()) {
        [user] = await app.db
          .select()
          .from(users)
          .where(and(
            eq(users.tenantId, emp.tenantId),
            sql`lower(${users.email}) = lower(${emp.email})`,
          ))
          .limit(1);
      }

      // 2b. Genuinely new — auto-provision a viewer-role user pinned to
      //     the employee's tenant.
      if (!user) {
        const fullName = [emp.firstName, emp.lastName].filter(Boolean).join(' ').trim() || 'Employee';
        // Synthesise a placeholder email so the NOT-NULL constraint stays
        // intact. We use a non-routable .local domain on purpose — these
        // addresses must never receive mail.
        const synthEmail = emp.email?.trim() || `phone-${normalised}@runq.local`;
        const randomHash = await argon2.hash(randomBytes(32).toString('hex'));

        [user] = await app.db
          .insert(users)
          .values({
            tenantId: emp.tenantId,
            email: synthEmail,
            name: fullName,
            phone: normalised,
            role: 'viewer',
            passwordHash: randomHash,
          })
          .returning();

        // The tenant-context plugin gates every request on a user_tenants row
        // (the JWT's tenantId is not trusted on its own). Without this insert,
        // every subsequent API call would throw "No tenant membership for this
        // session" despite the JWT being valid.
        await app.db.insert(userTenants).values({
          userId: user.id,
          tenantId: emp.tenantId,
          role: 'viewer',
        });
      }
    }

    // Backfill membership for users that pre-date this route (e.g. an
    // employee created via web invite, or anyone provisioned before the
    // user_tenants insert above was added).
    const [existingMembership] = await app.db
      .select({ id: userTenants.id })
      .from(userTenants)
      .where(and(eq(userTenants.userId, user.id), eq(userTenants.tenantId, user.tenantId)))
      .limit(1);
    if (!existingMembership) {
      await app.db.insert(userTenants).values({
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
      });
    }

    if (!user.isActive) throw new UnauthorizedError('Account is disabled');

    // Backfill phone on existing email-login users so the next OTP login
    // hits the fast path instead of re-scanning employees.
    if (!user.phone) {
      await app.db.update(users).set({ phone: normalised }).where(eq(users.id, user.id));
    }

    const [tenant] = await app.db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);
    if (!tenant) throw new UnauthorizedError('Tenant not found');

    const token = app.jwt.sign(
      { userId: user.id, tenantId: tenant.id, role: user.role },
      { expiresIn: env.JWT_EXPIRES_IN },
    );

    return reply.send({
      data: {
        token,
        user: {
          id: user.id,
          tenantId: user.tenantId,
          email: user.email,
          name: user.name,
          role: user.role,
          isActive: user.isActive,
        },
      },
    });
  });
};
