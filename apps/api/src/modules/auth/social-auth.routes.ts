import { FastifyPluginAsync } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { users, employees } from '@runq/db';
import { socialLoginSchema, socialBindSchema, phoneDobLoginSchema } from '@runq/validators';
import { UnauthorizedError, NotFoundError, ForbiddenError } from '../../utils/errors';
import { normalisePhone } from '../../utils/phone';
import {
  verifyIdToken, readSocialProvider, dobToDDMMYY, ensureMembership, issueSession,
} from './auth-session';

// Failed DOB tries before the one-time bind locks (admin reset required).
const MAX_BIND_ATTEMPTS = 5;

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
