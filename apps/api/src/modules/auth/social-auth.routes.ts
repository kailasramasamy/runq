import { FastifyPluginAsync } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { users, userTenants, tenants, employees } from '@runq/db';
import { socialLoginSchema, socialBindSchema, phoneDobLoginSchema } from '@runq/validators';
import { UnauthorizedError, NotFoundError, ForbiddenError, AppError } from '../../utils/errors';
import { getFirebaseAuth } from '../../utils/push/firebase-admin';
import { normalisePhone } from '../../utils/phone';
import { loadEnv } from '../../config/env';

const env = loadEnv();

// Failed DOB tries before the one-time bind locks (admin reset required).
const MAX_BIND_ATTEMPTS = 5;

// Verify the Firebase ID token. checkRevoked=true catches a stale token after
// admin disables or resets the Firebase user — important for the reset-login flow.
async function verifyIdToken(idToken: string): Promise<DecodedIdToken> {
  const auth = getFirebaseAuth();
  if (!auth) throw new AppError(503, 'Firebase auth not configured', 'ConfigError');
  try {
    return await auth.verifyIdToken(idToken, true);
  } catch {
    throw new UnauthorizedError('Invalid or expired sign-in token');
  }
}

// Which social provider minted this token. Bind/login only trust Google/Apple —
// never a bare phone or anonymous identity.
function readSocialProvider(t: DecodedIdToken): 'google' | 'apple' | null {
  const ids = (t.firebase?.identities ?? {}) as Record<string, unknown>;
  if (Array.isArray(ids['google.com'])) return 'google';
  if (Array.isArray(ids['apple.com'])) return 'apple';
  return null;
}

// Employee date_of_birth → DDMMYY, the format the mobile client submits. Returns
// null when no DOB is on file (caller blocks the bind and tells them to ask HR).
// drizzle's `date` column comes back as 'YYYY-MM-DD'; tolerate a Date too.
function dobToDDMMYY(dob: string | Date | null | undefined): string | null {
  if (!dob) return null;
  const iso = typeof dob === 'string' ? dob : dob.toISOString().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [, yyyy, mm, dd] = m;
  return `${dd}${mm}${yyyy.slice(2)}`;
}

// Tenant-context plugin gates every protected request on a user_tenants row.
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

// Resolve an employee by phone and verify their DOB (DDMMYY), applying the
// 5-try lockout. Shared by `/social/bind` (one-time bind) and `/phone-dob/login`
// (standalone login). Throws on no-match / no-DOB-on-file / locked / wrong DOB;
// returns the employee + normalised phone on success. The caller resets the
// attempt counter once the session is issued.
async function verifyEmployeeByDob(db: any, phoneRaw: string, dob: string) {
  const phone = normalisePhone(phoneRaw);
  if (phone.length < 10) throw new UnauthorizedError('Invalid phone');

  const emp = await resolveEmployeeByPhone(db, phone);
  if (!emp) throw new NotFoundError('Employee for this phone');
  if (emp.mobileBindAttempts >= MAX_BIND_ATTEMPTS) {
    throw new ForbiddenError('Too many attempts — ask your admin to reset your mobile login');
  }

  const expected = dobToDDMMYY(emp.dateOfBirth);
  if (!expected) {
    throw new ForbiddenError('Date of birth is not on file — ask your admin to add it');
  }
  if (dob !== expected) {
    const attempts = emp.mobileBindAttempts + 1;
    await db.update(employees).set({ mobileBindAttempts: attempts }).where(eq(employees.id, emp.id));
    const left = MAX_BIND_ATTEMPTS - attempts;
    throw new UnauthorizedError(
      left > 0
        ? `Incorrect date of birth — ${left} attempt${left === 1 ? '' : 's'} left`
        : 'Too many attempts — ask your admin to reset your mobile login',
    );
  }
  return { emp, phone };
}

// Final step shared by /login and /bind — issue the runq JWT + sanitised user.
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

export const socialAuthRoutes: FastifyPluginAsync = async (app) => {
  // Phase 2 — every login after binding. Token must already map to a runq user
  // via users.firebase_uid; otherwise return needsBinding so the app routes
  // into the one-time DOB bind below.
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

  // Phase 1 — one-time bind. The Google/Apple token proves the credential;
  // phone + DOB (DDMMYY) prove which employee it belongs to. No SMS — DOB is
  // the zero-cost ownership check, throttled to MAX_BIND_ATTEMPTS tries.
  app.post('/social/bind', async (request, reply) => {
    const { idToken, phone, dob } = socialBindSchema.parse(request.body);
    const decoded = await verifyIdToken(idToken);
    const social = readSocialProvider(decoded);
    if (!social) throw new UnauthorizedError('Sign in with Google or Apple to finish setup');

    const { emp, phone: normalised } = await verifyEmployeeByDob(app.db, phone, dob);
    const user = await resolveOrProvisionUser(app.db, emp, normalised);

    // Anti-hijack: refuse if this user is bound to a *different* Firebase uid,
    // or if this uid is already bound to another user.
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

    const patch: Record<string, unknown> = { firebaseUid: decoded.uid, authProvider: social };
    if (!user.phone) patch.phone = normalised;
    await app.db.update(users).set(patch).where(eq(users.id, user.id));
    // Clear the throttle on success so a later admin reset isn't needed.
    await app.db.update(employees).set({ mobileBindAttempts: 0 }).where(eq(employees.id, emp.id));

    return reply.send({
      data: await issueSession(app, { ...user, ...patch, isActive: user.isActive }),
    });
  });

  // Standalone phone + DOB login. For iOS users without a Google account (and
  // an Android fallback). No Firebase — the DOB check is the credential. Does
  // NOT touch firebase_uid, so a user can still bind Google later. Same 5-try
  // lockout as the bind, cleared via the admin reset.
  app.post('/phone-dob/login', async (request, reply) => {
    const { phone, dob } = phoneDobLoginSchema.parse(request.body);
    const { emp, phone: normalised } = await verifyEmployeeByDob(app.db, phone, dob);
    const user = await resolveOrProvisionUser(app.db, emp, normalised);
    if (!user.phone) {
      await app.db.update(users).set({ phone: normalised }).where(eq(users.id, user.id));
      user.phone = normalised;
    }
    await app.db.update(employees).set({ mobileBindAttempts: 0 }).where(eq(employees.id, emp.id));
    return reply.send({ data: await issueSession(app, user) });
  });
};
