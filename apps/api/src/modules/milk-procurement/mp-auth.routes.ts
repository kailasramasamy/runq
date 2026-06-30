import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import {
  mpCredentials, mpCredentialIdentities, mpFarmers, mpNodeOperators, users, userTenants,
  type MpCredentialRow,
} from '@runq/db';
import { mpSocialLoginSchema, mpSocialBindSchema, mpPhoneDobLoginSchema } from '@runq/validators';
import { UnauthorizedError, NotFoundError, ForbiddenError } from '../../utils/errors';
import { normalisePhone } from '../../utils/phone';
import {
  verifyIdToken, readSocialProvider, dobToDDMMYY, ensureMembership, issueSession,
} from '../auth/auth-session';

// Independent Dhenu (milk-procurement) auth. Resolves identity against
// `mp_credentials` (farmers + field operators) — NEVER `employees`. Same UX as
// HR mobile login: one-time phone + DOB bind, then Google/Apple after.

// Failed DOB tries before the bind locks (admin reset required).
const MAX_BIND_ATTEMPTS = 5;

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

// Verify a credential by phone + DOB (DDMMYY), applying the 5-try lockout.
// Shared by /social/bind and /phone-dob/login. The caller resets the counter
// once a session is issued.
async function verifyCredentialByDob(
  db: FastifyInstance['db'],
  phoneRaw: string,
  dob: string,
  // What the DDMMYY code is called to the user: 'date of birth' on the one-time
  // social bind, 'secret code' on the standalone phone login.
  codeLabel = 'date of birth',
): Promise<MpCredentialRow> {
  const phone = normalisePhone(phoneRaw);
  if (phone.length < 10) throw new UnauthorizedError('Invalid phone');

  const cred = await findCredentialByPhone(db, phone);
  if (!cred) throw new NotFoundError('No Dhenu account for this phone');
  if (cred.bindAttempts >= MAX_BIND_ATTEMPTS) {
    throw new ForbiddenError('Too many attempts — ask your admin to reset your login');
  }

  const expected = dobToDDMMYY(cred.dateOfBirth);
  if (!expected || dob !== expected) {
    const attempts = cred.bindAttempts + 1;
    await db.update(mpCredentials).set({ bindAttempts: attempts }).where(eq(mpCredentials.id, cred.id));
    const left = MAX_BIND_ATTEMPTS - attempts;
    throw new UnauthorizedError(
      left > 0
        ? `Incorrect ${codeLabel} — ${left} attempt${left === 1 ? '' : 's'} left`
        : 'Too many attempts — ask your admin to reset your login',
    );
  }
  return cred;
}

// Find or mint the runq user backing a credential. The user carries the Dhenu
// role (farmer | field_operator); its tenant membership defaults to the
// milk_procurement module (see roleAllowedModules). Synthesises a non-routable
// .local email so the NOT-NULL constraint holds — these never receive mail.
async function resolveOrProvisionUser(app: FastifyInstance, cred: MpCredentialRow) {
  const db = app.db;
  const phone = normalisePhone(cred.phone);
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
      if (user.role === 'viewer') {
        await db.update(users).set({ role: cred.role }).where(eq(users.id, user.id));
        await db.update(userTenants).set({ role: cred.role }).where(and(
          eq(userTenants.userId, user.id),
          eq(userTenants.tenantId, cred.tenantId),
          eq(userTenants.role, 'viewer'),
        ));
        user = { ...user, role: cred.role };
      }
    } else {
      let name = cred.role === 'farmer' ? 'Farmer' : 'Field Operator';
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
          role: cred.role,
          passwordHash: randomHash,
        })
        .returning();
    }
    await db.update(mpCredentials).set({ userId: user.id }).where(eq(mpCredentials.id, cred.id));
    await ensureMembership(db, user.id, cred.tenantId, cred.role);
  }

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
  // Every login after binding. The social uid must map to a credential via a
  // linked identity (Google OR Apple); otherwise needsBinding routes the app
  // into the one-time DOB bind below.
  app.post('/mp/social/login', async (request, reply) => {
    const { idToken } = mpSocialLoginSchema.parse(request.body);
    const decoded = await verifyIdToken(idToken);

    const [row] = await app.db
      .select({ cred: mpCredentials })
      .from(mpCredentialIdentities)
      .innerJoin(mpCredentials, eq(mpCredentials.id, mpCredentialIdentities.credentialId))
      .where(and(eq(mpCredentialIdentities.firebaseUid, decoded.uid), eq(mpCredentials.isActive, true)))
      .limit(1);
    if (!row) return reply.send({ data: { needsBinding: true } });

    const user = await resolveOrProvisionUser(app, row.cred);
    return reply.send({ data: await issueSession(app, user) });
  });

  // One-time bind. The Google/Apple token proves the credential; phone + DOB
  // (DDMMYY) prove which mp_credentials row it belongs to. DOB is the zero-cost
  // ownership check, throttled to MAX_BIND_ATTEMPTS tries.
  app.post('/mp/social/bind', async (request, reply) => {
    const { idToken, phone, dob } = mpSocialBindSchema.parse(request.body);
    const decoded = await verifyIdToken(idToken);
    const social = readSocialProvider(decoded);
    if (!social) throw new UnauthorizedError('Sign in with Google or Apple to finish setup');

    const cred = await verifyCredentialByDob(app.db, phone, dob);

    // Anti-hijack: a social identity belongs to exactly one account. If this uid
    // is already linked elsewhere, refuse; if it's already on THIS account, the
    // bind is idempotent. A *new* uid links as an additional provider — so the
    // same farmer can use both Google and Apple.
    const [existing] = await app.db
      .select({ credentialId: mpCredentialIdentities.credentialId })
      .from(mpCredentialIdentities)
      .where(eq(mpCredentialIdentities.firebaseUid, decoded.uid))
      .limit(1);
    if (existing && existing.credentialId !== cred.id) {
      throw new UnauthorizedError('This Google/Apple account is already linked to another Dhenu user.');
    }
    if (!existing) {
      // Link the identity; re-linking the same provider (e.g. a recreated Google
      // account) updates the uid in place.
      await app.db.insert(mpCredentialIdentities)
        .values({ tenantId: cred.tenantId, credentialId: cred.id, firebaseUid: decoded.uid, provider: social })
        .onConflictDoUpdate({
          target: [mpCredentialIdentities.credentialId, mpCredentialIdentities.provider],
          set: { firebaseUid: decoded.uid },
        });
    }

    // Keep the credential's columns as the most-recently-linked provider (audit).
    await app.db.update(mpCredentials)
      .set({ firebaseUid: decoded.uid, authProvider: social, bindAttempts: 0 })
      .where(eq(mpCredentials.id, cred.id));

    const user = await resolveOrProvisionUser(app, cred);
    await app.db.update(users)
      .set({ firebaseUid: decoded.uid, authProvider: social })
      .where(eq(users.id, user.id));
    return reply.send({ data: await issueSession(app, user) });
  });

  // Standalone phone + DOB login (no Firebase) — for users without a Google
  // account and for tests. Does not touch firebase_uid, so the user can still
  // bind Google later. Same 5-try lockout as the bind.
  app.post('/mp/phone-dob/login', async (request, reply) => {
    const { phone, dob } = mpPhoneDobLoginSchema.parse(request.body);
    const cred = await verifyCredentialByDob(app.db, phone, dob, 'secret code');
    const user = await resolveOrProvisionUser(app, cred);
    await app.db.update(mpCredentials).set({ bindAttempts: 0 }).where(eq(mpCredentials.id, cred.id));
    return reply.send({ data: await issueSession(app, user) });
  });
};
