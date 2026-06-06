import { FastifyPluginAsync } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { users, userTenants, tenants, employees } from '@runq/db';
import {
  socialLoginSchema,
  socialBindSchema,
  phoneOtpRequestSchema,
  phoneOtpVerifySchema,
} from '@runq/validators';
import { UnauthorizedError, NotFoundError, AppError } from '../../utils/errors';
import { getFirebaseAuth } from '../../utils/push/firebase-admin';
import { loadEnv } from '../../config/env';

const env = loadEnv();

// Strip non-digits and drop an India country code prefix so `+91 98765 43210`,
// `9198765 43210`, and `9876543210` all resolve to the same canonical form.
function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}

// Verify the Firebase ID token. checkRevoked=true catches a stale token after
// admin disables or resets the Firebase user — important for the "reset login"
// flow we'll add later.
async function verifyIdToken(idToken: string): Promise<DecodedIdToken> {
  const auth = getFirebaseAuth();
  if (!auth) throw new AppError(503, 'Firebase auth not configured', 'ConfigError');
  try {
    return await auth.verifyIdToken(idToken, true);
  } catch {
    throw new UnauthorizedError('Invalid or expired sign-in token');
  }
}

// Pull (provider, phone) out of a decoded token. Phone is canonicalised the
// same way as the rest of the codebase. `provider` is one of google|apple|phone.
function readTokenProviders(t: DecodedIdToken): { phone: string | null; social: 'google' | 'apple' | null } {
  const ids = (t.firebase?.identities ?? {}) as Record<string, unknown>;
  const phoneRaw = t.phone_number || (Array.isArray(ids['phone']) ? String(ids['phone'][0] ?? '') : '');
  const phone = phoneRaw ? normalisePhone(phoneRaw) : null;
  const social = Array.isArray(ids['google.com']) ? 'google'
    : Array.isArray(ids['apple.com']) ? 'apple'
    : null;
  return { phone, social };
}

// Tenant-context plugin gates every protected request on a user_tenants row.
// Make sure one exists for this (user, tenant) pair — backfills users that
// pre-date the user_tenants insert added in mig 0084.
async function ensureMembership(
  db: any,
  userId: string,
  tenantId: string,
  role: 'owner' | 'accountant' | 'viewer' | 'client_owner' | 'hr',
): Promise<void> {
  const [existing] = await db
    .select({ id: userTenants.id })
    .from(userTenants)
    .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
    .limit(1);
  if (!existing) {
    await db.insert(userTenants).values({ userId, tenantId, role });
  }
}

// Resolve a runq user by phone — fast-path the users table, fall back to
// employees so a freshly-onboarded employee can sign in without a prior user
// row. Mirrors the logic the old phone-otp route had inline.
async function resolveUserByPhone(db: any, phone: string) {
  let [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  if (user) return user;

  // Match employees by digit-normalised phone — existing rows may be stored
  // with spaces, +91, or leading 91.
  const matchExpr = sql`regexp_replace(${employees.phone}, '\\D', '', 'g')`;
  const [emp] = await db
    .select()
    .from(employees)
    .where(sql`${matchExpr} = ${phone} OR ${matchExpr} = ${'91' + phone}`)
    .limit(1);
  if (!emp) throw new NotFoundError('Employee for this phone');

  // The employee may already have an email-login user (web invite or org-role
  // seed) whose phone column was never filled — reuse it. Minting a fresh
  // viewer here would silently demote an hr/accountant/owner.
  if (emp.email?.trim()) {
    [user] = await db
      .select()
      .from(users)
      .where(and(
        eq(users.tenantId, emp.tenantId),
        sql`lower(${users.email}) = lower(${emp.email})`,
      ))
      .limit(1);
    if (user) return user;
  }

  // Genuinely new — auto-provision a viewer-role user pinned to the
  // employee's tenant. Synthesise a non-routable .local email so the NOT-NULL
  // constraint stays intact; these addresses must never receive mail.
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

// Final step shared by /login and /bind — issue the runq JWT + sanitised user payload.
async function issueSession(app: any, user: any) {
  if (!user.isActive) throw new UnauthorizedError('Account is disabled');
  await ensureMembership(app.db, user.id, user.tenantId, user.role);

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
  return {
    token,
    user: {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    },
  };
}

// Hardcoded OTP until SMS infra is wired up. The mobile signin screen shows
// this as a hint so testers don't have to dig through code. The Firebase
// social-bind flow (below) replaces this longer-term, but mobile still ships
// the two-step phone+OTP screen.
const FIXED_OTP = '123456';

export const socialAuthRoutes: FastifyPluginAsync = async (app) => {
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

    const user = await resolveUserByPhone(app.db, normalised);
    // Backfill the phone column on a previously email-only user so future
    // logins fast-path through the users.phone lookup in resolveUserByPhone.
    if (!user.phone) {
      await app.db.update(users).set({ phone: normalised }).where(eq(users.id, user.id));
      user.phone = normalised;
    }
    return reply.send({ data: await issueSession(app, user) });
  });

  // Phase 2 — every login after binding. Token must already be linked to a
  // runq user via users.firebase_uid; otherwise we return needsBinding so the
  // app can route into the Phase-1 bind flow.
  app.post('/social/login', async (request, reply) => {
    const { idToken } = socialLoginSchema.parse(request.body);
    const decoded = await verifyIdToken(idToken);

    const [user] = await app.db
      .select()
      .from(users)
      .where(eq(users.firebaseUid, decoded.uid))
      .limit(1);
    if (!user) {
      return reply.send({ data: { needsBinding: true } });
    }
    return reply.send({ data: await issueSession(app, user) });
  });

  // Phase 1 — one-time bind. Client signs in with phone OTP then links
  // Google/Apple; we require the token to carry BOTH a phone identity (proof
  // of OTP) and one of google/apple (the credential we'll re-use to log in).
  app.post('/social/bind', async (request, reply) => {
    const { idToken } = socialBindSchema.parse(request.body);
    const decoded = await verifyIdToken(idToken);
    const { phone, social } = readTokenProviders(decoded);

    if (!phone || phone.length < 10) {
      throw new UnauthorizedError('Phone verification missing — re-enter the OTP');
    }
    if (!social) {
      throw new UnauthorizedError('Link a Google or Apple account to finish sign-in');
    }

    const user = await resolveUserByPhone(app.db, phone);

    // Anti-hijack: if this user is already bound to a *different* Firebase uid,
    // refuse — admin reset is required (deferred feature). Likewise refuse if
    // this Firebase uid is already bound elsewhere.
    if (user.firebaseUid && user.firebaseUid !== decoded.uid) {
      throw new UnauthorizedError('This account is already linked to another login. Contact your admin.');
    }
    const [conflict] = await app.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.firebaseUid, decoded.uid), sql`${users.id} <> ${user.id}`))
      .limit(1);
    if (conflict) {
      throw new UnauthorizedError('This Google/Apple account is already linked to another runq user.');
    }

    // Persist the binding + backfill phone if the user pre-dated mobile login.
    const patch: Record<string, unknown> = { firebaseUid: decoded.uid, authProvider: social };
    if (!user.phone) patch.phone = phone;
    await app.db.update(users).set(patch).where(eq(users.id, user.id));

    return reply.send({
      data: await issueSession(app, { ...user, ...patch, isActive: user.isActive }),
    });
  });
};
