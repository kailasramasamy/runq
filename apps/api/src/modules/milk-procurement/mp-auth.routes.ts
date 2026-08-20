import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import {
  mpCredentials, mpFarmers, mpNodeOperators, tenants, users, userTenants,
  type MpCredentialRow,
} from '@runq/db';
import { mpOtpRequestSchema, mpPhoneLoginSchema } from '@runq/validators';
import { loadEnv } from '../../config/env';
import { UnauthorizedError, NotFoundError } from '../../utils/errors';
import { normalisePhone } from '../../utils/phone';
import { dobToDDMMYY, ensureMembership, issueSession } from '../auth/auth-session';
import { sendMpOtp, verifyMpOtp } from './mp-otp.service';

// Independent Dhenu (milk-procurement) auth. Resolves identity against
// `mp_credentials` (farmers + field operators) — NEVER `employees`. Ownership is
// proved by a phone OTP (MSG91); phone is the sole account identity.

// Resolve an active credential by phone (digit-normalised so rows stored with
// spaces, +91, or a leading 91 still match). Login carries no tenant context
// yet, so the lookup is global — phone is expected unique enough across tenants.
async function findCredentialByPhone(db: FastifyInstance['db'], phone: string) {
  const matchExpr = sql`regexp_replace(${mpCredentials.phone}, '\\D', '', 'g')`;
  const [cred] = await db
    .select()
    .from(mpCredentials)
    .where(and(
      eq(mpCredentials.isActive, true),
      sql`${matchExpr} = ${phone} OR ${matchExpr} = ${'91' + phone}`,
    ))
    .limit(1);
  return cred ?? null;
}

// Resolve the credential for an OTP login, or throw. Shared by /social/bind and
// /phone/login — both normalise the phone the same way the OTP was keyed.
async function requireCredentialByPhone(db: FastifyInstance['db'], phoneRaw: string): Promise<MpCredentialRow> {
  const phone = normalisePhone(phoneRaw);
  if (phone.length < 10) throw new UnauthorizedError('Invalid phone');
  const cred = await findCredentialByPhone(db, phone);
  if (!cred) throw new NotFoundError('No Dhenu account for this phone');
  return cred;
}

const DEMO_TENANT_SLUG = 'runq-demo';

// App Store / Play review sign-in, driven entirely by seeded DB data (no env
// config): a credential in the reviewer demo tenant that carries a
// date_of_birth accepts that DOB's DDMMYY form as its code, and never triggers
// an SMS. Scoped to the demo tenant so the DOB lingering on pre-migration real
// credentials stays inert. Returns the expected code, or null for real logins.
async function demoOtpFor(db: FastifyInstance['db'], cred: MpCredentialRow): Promise<string | null> {
  if (!cred.dateOfBirth) return null;
  const [t] = await db.select({ slug: tenants.slug }).from(tenants)
    .where(eq(tenants.id, cred.tenantId)).limit(1);
  if (t?.slug !== DEMO_TENANT_SLUG) return null;
  return dobToDDMMYY(cred.dateOfBirth);
}

// The web role a credential implies, or null for an 'admin' credential — that
// one only says "may sign in to the app". The person behind it already holds an
// owner/accountant account (which maps to the app's admin persona), so writing
// the credential role onto `users` would demote them.
function webRoleFor(cred: MpCredentialRow): 'farmer' | 'field_operator' | null {
  return cred.role === 'admin' ? null : cred.role;
}

// Re-assert a linked credential's Dhenu role on the user + tenant membership on
// every login. An admin editing this person in Settings → Users can flip their
// tenant role to the web default 'viewer', which strips `milk_procurement` and
// silently breaks the operator/farmer app — and the first-login promotion below
// no longer runs once the credential is linked (cred.userId set). An ACTIVE
// credential proves they're a Dhenu user, so heal it here. Only promotes FROM
// 'viewer', leaving a deliberate owner/accountant grant intact.
async function healDhenuRole(db: FastifyInstance['db'], user: any, cred: MpCredentialRow) {
  const role = webRoleFor(cred);
  if (!role) return user;
  await db.update(userTenants).set({ role }).where(and(
    eq(userTenants.userId, user.id),
    eq(userTenants.tenantId, cred.tenantId),
    eq(userTenants.role, 'viewer'),
  ));
  if (user.role === 'viewer') {
    await db.update(users).set({ role }).where(eq(users.id, user.id));
    return { ...user, role };
  }
  return user;
}

// Find or mint the runq user backing a credential. The user carries the Dhenu
// role (farmer | field_operator); its tenant membership defaults to the
// milk_procurement module (see roleAllowedModules). Synthesises a non-routable
// .local email so the NOT-NULL constraint holds — these never receive mail.
async function resolveOrProvisionUser(app: FastifyInstance, cred: MpCredentialRow) {
  const db = app.db;
  const phone = normalisePhone(cred.phone);
  const credRole = webRoleFor(cred);
  let user;
  if (cred.userId) {
    [user] = await db.select().from(users).where(eq(users.id, cred.userId)).limit(1);
  }

  if (!user) {
    // A user may already exist for this phone — web Settings creates one (a
    // viewer) with the same number, and the global phone-unique index then
    // blocks minting a second ("A duplicate record already exists"). Reuse it.
    [user] = await db
      .select()
      .from(users)
      .where(sql`regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g') IN (${phone}, ${'91' + phone})`)
      .limit(1);

    if (user) {
      // Promote only the powerless default so the operator/farmer flow resolves
      // (role gates node access) — never downgrade a privileged web user.
      if (credRole && user.role === 'viewer') {
        await db.update(users).set({ role: credRole }).where(eq(users.id, user.id));
        await db.update(userTenants).set({ role: credRole }).where(and(
          eq(userTenants.userId, user.id),
          eq(userTenants.tenantId, cred.tenantId),
          eq(userTenants.role, 'viewer'),
        ));
        user = { ...user, role: credRole };
      }
    } else if (!credRole) {
      // An admin credential is granted FROM a web user, so its user must exist.
      // Minting one here would have to invent a web role — refuse instead of
      // guessing, and let the owner re-grant from Settings → Users.
      throw new UnauthorizedError('This Dhenu access is no longer linked to a user');
    } else {
      let name = credRole === 'farmer' ? 'Farmer' : 'Field Operator';
      if (cred.farmerId) {
        const [f] = await db.select({ name: mpFarmers.name }).from(mpFarmers)
          .where(eq(mpFarmers.id, cred.farmerId)).limit(1);
        if (f?.name) name = f.name;
      }
      const randomHash = await argon2.hash(randomBytes(32).toString('hex'));
      [user] = await db
        .insert(users)
        .values({
          tenantId: cred.tenantId,
          email: `mp-${phone}@dhenu.local`,
          name,
          phone,
          role: credRole,
          passwordHash: randomHash,
        })
        .returning();
    }
    await db.update(mpCredentials).set({ userId: user.id }).where(eq(mpCredentials.id, cred.id));
    await ensureMembership(db, user.id, cred.tenantId, credRole ?? user.role);
  }

  // Re-assert the credential's role on the tenant membership (see healDhenuRole)
  // — heals an operator/farmer an admin demoted to 'viewer' in Settings → Users,
  // which the first-login promotion no longer catches once the credential is linked.
  user = await healDhenuRole(db, user, cred);

  // Link any operator rows for this phone not yet bound to the user. Web-admin
  // created rows start with a null user_id; node access keys on user_id, so this
  // heals them on login (phone is the join until the link is set).
  if (cred.role === 'field_operator') {
    await db.update(mpNodeOperators).set({ userId: user.id }).where(and(
      eq(mpNodeOperators.tenantId, cred.tenantId),
      isNull(mpNodeOperators.userId),
      sql`regexp_replace(coalesce(${mpNodeOperators.phone}, ''), '\\D', '', 'g') IN (${phone}, ${'91' + phone})`,
    ));
  }
  return user;
}

export const mpAuthRoutes: FastifyPluginAsync = async (app) => {
  // Request a login OTP. The phone must belong to an active credential; the
  // server SMSes a 6-digit code via MSG91. `devCode` is only present outside
  // production (for e2e scripts). The demo/review account sends no SMS — the
  // reviewer signs in with its seeded DOB code.
  app.post('/mp/otp/request', async (request, reply) => {
    const { phone } = mpOtpRequestSchema.parse(request.body);
    const cred = await requireCredentialByPhone(app.db, phone);
    const demoCode = await demoOtpFor(app.db, cred);
    if (demoCode) {
      const isProd = loadEnv().NODE_ENV === 'production';
      return reply.send({ data: { sent: true, ...(isProd ? {} : { devCode: demoCode }) } });
    }
    const devCode = await sendMpOtp(app, normalisePhone(phone));
    return reply.send({ data: { sent: true, ...(devCode ? { devCode } : {}) } });
  });

  // Phone + OTP login — the sole Dhenu sign-in. Matches the credential by phone
  // and verifies the OTP (or the demo account's seeded DOB code), then issues
  // the session.
  app.post('/mp/phone/login', async (request, reply) => {
    const { phone, otp } = mpPhoneLoginSchema.parse(request.body);
    const cred = await requireCredentialByPhone(app.db, phone);
    const demoCode = await demoOtpFor(app.db, cred);
    if (demoCode) {
      if (otp !== demoCode) throw new UnauthorizedError('Invalid or expired code');
    } else {
      await verifyMpOtp(app, normalisePhone(phone), otp);
    }
    const user = await resolveOrProvisionUser(app, cred);
    const expiresIn = loadEnv().MP_JWT_EXPIRES_IN;
    return reply.send({ data: await issueSession(app, user, { expiresIn }) });
  });
};
