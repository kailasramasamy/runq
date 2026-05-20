import { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { users, tenants, platformUsers, userTenants, tenantInvites, seedCoaForTenant, auditLog } from '@runq/db';
import { loginSchema, registerSchema, createInviteSchema, acceptInviteSchema, acceptJoinInviteSchema, changePasswordSchema } from '@runq/validators';
import argon2 from 'argon2';
import { UnauthorizedError, ConflictError, NotFoundError } from '../../utils/errors';
import { sendEmail } from '../../utils/email';
import { tenantInviteEmail } from '../../utils/email-templates';
import { loadEnv } from '../../config/env';
import { seedDefaultLetterTemplates } from '../hr/phase-next/letter-template-seeds';

const env = loadEnv();

const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';

function welcomeEmailHtml(name: string, companyName: string): string {
  const firstName = name.split(' ')[0];
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root { color-scheme: light dark; }
  @media (prefers-color-scheme: dark) {
    .email-bg { background-color: #09090b !important; }
    .card-bg { background-color: #18181b !important; }
    .heading-text { color: #fafafa !important; }
    .body-text { color: #a1a1aa !important; }
    .muted-text { color: #71717a !important; }
    .feature-bg { background-color: #27272a !important; }
    .feature-icon-bg { background-color: #3f3f46 !important; }
    .divider { border-color: #27272a !important; }
    .btn-primary { background-color: #6366f1 !important; }
    .footer-text { color: #52525b !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" class="email-bg" style="background-color:#f4f4f5;padding:40px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

  <!-- Logo -->
  <tr><td align="center" style="padding:0 0 32px">
    <span style="font-size:28px;font-weight:800;letter-spacing:-0.5px" class="heading-text">
      <span style="color:#18181b">run</span><span style="color:#6366f1">Q</span>
    </span>
  </td></tr>

  <!-- Card -->
  <tr><td>
  <table width="100%" cellpadding="0" cellspacing="0" class="card-bg" style="background-color:#ffffff;border-radius:16px;overflow:hidden">

    <!-- Header gradient -->
    <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:40px 32px 32px">
      <p style="margin:0;color:#ffffff;font-size:28px;font-weight:700;line-height:1.2">
        Welcome aboard, ${firstName}! 🎉
      </p>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:15px;line-height:1.5">
        ${companyName} is all set up on runQ. Let's get your finances sorted.
      </p>
    </td></tr>

    <!-- Body -->
    <tr><td style="padding:32px">

      <!-- Quick start steps -->
      <p class="heading-text" style="margin:0 0 20px;font-size:16px;font-weight:600;color:#18181b">
        Here's how to get started:
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
        <tr><td class="feature-bg" style="background-color:#f4f4f5;border-radius:12px;padding:16px;margin-bottom:8px">
          <table cellpadding="0" cellspacing="0"><tr>
            <td class="feature-icon-bg" style="background-color:#e4e4e7;border-radius:8px;width:36px;height:36px;text-align:center;vertical-align:middle;font-size:16px">1</td>
            <td style="padding-left:12px">
              <p class="heading-text" style="margin:0;font-size:14px;font-weight:600;color:#18181b">Add your company details</p>
              <p class="body-text" style="margin:2px 0 0;font-size:13px;color:#71717a">GSTIN, state, address — for GST-compliant invoices</p>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="height:8px"></td></tr>
        <tr><td class="feature-bg" style="background-color:#f4f4f5;border-radius:12px;padding:16px">
          <table cellpadding="0" cellspacing="0"><tr>
            <td class="feature-icon-bg" style="background-color:#e4e4e7;border-radius:8px;width:36px;height:36px;text-align:center;vertical-align:middle;font-size:16px">2</td>
            <td style="padding-left:12px">
              <p class="heading-text" style="margin:0;font-size:14px;font-weight:600;color:#18181b">Create your first invoice</p>
              <p class="body-text" style="margin:2px 0 0;font-size:13px;color:#71717a">GST auto-calculated, PDF ready, share via WhatsApp</p>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="height:8px"></td></tr>
        <tr><td class="feature-bg" style="background-color:#f4f4f5;border-radius:12px;padding:16px">
          <table cellpadding="0" cellspacing="0"><tr>
            <td class="feature-icon-bg" style="background-color:#e4e4e7;border-radius:8px;width:36px;height:36px;text-align:center;vertical-align:middle;font-size:16px">3</td>
            <td style="padding-left:12px">
              <p class="heading-text" style="margin:0;font-size:14px;font-weight:600;color:#18181b">Connect your bank account</p>
              <p class="body-text" style="margin:2px 0 0;font-size:13px;color:#71717a">Import statements and reconcile in minutes</p>
            </td>
          </tr></table>
        </td></tr>
      </table>

      <!-- CTA -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding:8px 0 24px">
          <a href="https://runq.in/finance" class="btn-primary" style="display:inline-block;background-color:#4f46e5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:10px">
            Open your dashboard →
          </a>
        </td></tr>
      </table>

      <hr class="divider" style="border:none;border-top:1px solid #e4e4e7;margin:0 0 24px">

      <!-- Help note -->
      <p class="body-text" style="margin:0;font-size:13px;color:#71717a;line-height:1.6;text-align:center">
        Questions? Just reply to this email — a real human will get back to you.<br>
        Or reach us at <a href="mailto:hello@quartex.in" style="color:#6366f1;text-decoration:none">hello@quartex.in</a>
      </p>

    </td></tr>
  </table>
  </td></tr>

  <!-- Footer -->
  <tr><td align="center" style="padding:24px 0 0">
    <p class="footer-text" style="margin:0;font-size:12px;color:#a1a1aa">
      Quartex Technologies · Bangalore, India
    </p>
    <p class="footer-text" style="margin:4px 0 0;font-size:11px;color:#a1a1aa">
      You're receiving this because you signed up for runQ.
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function welcomeEmailText(name: string, companyName: string): string {
  const firstName = name.split(' ')[0];
  return `Welcome to runQ, ${firstName}!

${companyName} is all set up. Here's how to get started:

1. Add your company details (GSTIN, state, address)
2. Create your first invoice (GST auto-calculated)
3. Connect your bank account (import & reconcile)

Open your dashboard: https://runq.in/finance

Questions? Reply to this email or reach us at hello@quartex.in

— Team runQ
Quartex Technologies, Bangalore, India`;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/login', async (request, reply) => {
    const { email, password, tenant: tenantSlug } = loginSchema.parse(request.body);

    // First try platform user (no tenant slug, no tenant context).
    // Platform users have unique emails across the platform.
    if (!tenantSlug) {
      const [pUser] = await app.db.select().from(platformUsers).where(eq(platformUsers.email, email)).limit(1);
      if (pUser && pUser.isActive) {
        const valid = await argon2.verify(pUser.passwordHash, password);
        if (valid) {
          await app.db.update(platformUsers).set({ lastLoginAt: new Date() }).where(eq(platformUsers.id, pUser.id));
          const token = app.jwt.sign(
            {
              userId: pUser.id,
              tenantId: '00000000-0000-0000-0000-000000000000',
              role: 'owner' as const,
              platformUserId: pUser.id,
              platformRole: pUser.role,
            },
            { expiresIn: env.JWT_EXPIRES_IN },
          );
          return reply.send({
            data: {
              token,
              user: { id: pUser.id, tenantId: null, email: pUser.email, name: pUser.name, role: pUser.role, isActive: pUser.isActive },
              platform: true,
            },
          });
        }
      }
    }

    let tenant: { id: string; name: string } | undefined;
    let user: typeof users.$inferSelect | undefined;

    if (tenantSlug) {
      // Explicit tenant slug provided
      [tenant] = await app.db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);
      if (!tenant) throw new UnauthorizedError('Invalid credentials');
      [user] = await app.db.select().from(users).where(and(eq(users.email, email), eq(users.tenantId, tenant.id))).limit(1);
    } else {
      // Resolve tenant from email
      [user] = await app.db.select().from(users).where(eq(users.email, email)).limit(1);
      if (user) {
        [tenant] = await app.db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.id, user.tenantId)).limit(1);
      }
    }

    if (!user || !user.isActive || !tenant) {
      await argon2.verify(DUMMY_HASH, password);
      throw new UnauthorizedError('Invalid credentials');
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) throw new UnauthorizedError('Invalid credentials');

    const token = app.jwt.sign(
      { userId: user.id, tenantId: tenant.id, role: user.role },
      { expiresIn: env.JWT_EXPIRES_IN },
    );

    return reply.send({
      data: {
        token,
        user: { id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, role: user.role, isActive: user.isActive },
      },
    });
  });

  app.post('/register', async (request, reply) => {
    const input = registerSchema.parse(request.body);

    // Verify email was OTP-verified
    const emailVerified = await app.redis.get(`otp:verified:${input.email.toLowerCase().trim()}`);
    if (!emailVerified) {
      return reply.status(403).send({ message: 'Email not verified. Please complete OTP verification first.' });
    }
    // Clean up verification token
    await app.redis.del(`otp:verified:${input.email.toLowerCase().trim()}`);

    // Check slug uniqueness
    const [existing] = await app.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, input.slug))
      .limit(1);
    if (existing) throw new ConflictError('Company slug already taken');

    // Mark company step as auto-completed if user provided GSTIN + state at signup
    const onboardingSteps: Record<string, boolean> = {};
    if (input.gstin && input.stateCode) {
      onboardingSteps.company = true;
    }

    // Create tenant — preserve fields captured during signup
    const [tenant] = await app.db.insert(tenants).values({
      name: input.companyName,
      slug: input.slug,
      settings: {
        invoicePrefix: 'INV',
        invoiceFormat: '{prefix}-{fy}-{seq}',
        financialYearStartMonth: 4,
        defaultPaymentTermsDays: 30,
        currency: 'INR',
        legalName: input.companyName,
        gstin: input.gstin || null,
        state: input.state || null,
        stateCode: input.stateCode || null,
        industry: input.industry || null,
        onboardingSteps,
      },
    }).returning();

    // Create admin user
    const passwordHash = await argon2.hash(input.password);
    const [user] = await app.db.insert(users).values({
      tenantId: tenant!.id,
      email: input.email,
      name: input.name,
      role: 'owner',
      passwordHash,
    }).returning();

    // Create user_tenants membership row (Phase 1 multi-tenant)
    await app.db.insert(userTenants).values({
      userId: user!.id,
      tenantId: tenant!.id,
      role: 'owner',
    });

    // Seed standard chart of accounts + HR letter templates
    await seedCoaForTenant(app.db, tenant!.id);
    await seedDefaultLetterTemplates(app.db, tenant!.id);

    // Send welcome email (non-blocking — don't fail registration if email fails)
    sendEmail({
      to: input.email,
      subject: `Welcome to runQ, ${input.name.split(' ')[0]}! 🎉`,
      html: welcomeEmailHtml(input.name, input.companyName),
      text: welcomeEmailText(input.name, input.companyName),
      fromName: 'runQ',
    }).catch((err) => app.log.warn({ err, email: input.email }, 'Failed to send welcome email'));

    const token = app.jwt.sign(
      { userId: user!.id, tenantId: tenant!.id, role: 'owner' },
      { expiresIn: env.JWT_EXPIRES_IN },
    );

    return reply.status(201).send({
      data: {
        token,
        user: { id: user!.id, tenantId: tenant!.id, email: user!.email, name: user!.name, role: user!.role, isActive: true },
        tenant: { id: tenant!.id, name: tenant!.name, slug: tenant!.slug },
      },
    });
  });

  // --- CA invite flow (Phase 1 multi-tenant) ---

  // Create an invite. Two flows:
  //   inviteType=new_tenant  — caller (CA) invites a prospect; on accept,
  //     a new tenant is created and the CA is attached as accountant.
  //   inviteType=join_tenant — caller (tenant owner) invites someone (typically
  //     their CA) to join the caller's existing tenant. On accept, the invitee's
  //     user is attached as the role on the invite (accountant or viewer); no
  //     new tenant is created. Restricted to caller having an owner-equivalent
  //     role in the inviting tenant.
  app.post(
    '/invites',
    { preHandler: [app.authenticate, app.resolveTenantContext], config: { rateLimit: false } },
    async (request, reply) => {
      if (!request.user.userId || !request.tenantId) {
        throw new UnauthorizedError('Authentication required');
      }
      const input = createInviteSchema.parse(request.body);
      const inviteType = input.inviteType;

      // join_tenant: only owners of the inviting tenant can attach others to it.
      if (inviteType === 'join_tenant') {
        if (request.activeRole !== 'owner' && request.activeRole !== 'client_owner') {
          throw new UnauthorizedError('Only the tenant owner can invite users to join');
        }
      }

      // Default invitee role:
      //   new_tenant  → accountant (the CA's role in the new client tenant)
      //   join_tenant → caller picks accountant (default) or viewer
      const role = input.role ?? (inviteType === 'new_tenant' ? 'accountant' : 'accountant');

      const days = input.expiresInDays ?? 7;
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const token = randomBytes(24).toString('base64url');

      const [invite] = await app.db.insert(tenantInvites).values({
        token,
        invitingUserId: request.user.userId,
        invitingTenantId: request.tenantId,
        inviteType,
        role,
        email: input.email ?? null,
        // companyName only meaningful for new_tenant; clear for join_tenant.
        companyName: inviteType === 'new_tenant' ? (input.companyName ?? null) : null,
        note: input.note ?? null,
        expiresAt,
      }).returning();

      // Optionally send the invite link by email. Caller must supply both an
      // email AND `sendEmail: true` to opt in. Best-effort — if SMTP fails,
      // we still return the invite (caller can copy the link manually).
      let emailDelivery: 'sent' | 'failed' | 'skipped' = 'skipped';
      if (input.sendEmail && input.email) {
        try {
          const [tenantRow] = await app.db
            .select({ name: tenants.name })
            .from(tenants)
            .where(eq(tenants.id, request.tenantId))
            .limit(1);
          const [inviterRow] = await app.db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, request.user.userId))
            .limit(1);

          const origin = (process.env.CORS_ORIGIN || 'http://localhost:4003').replace(/\/$/, '');
          const inviteUrl = `${origin}/finance/signup/invite/${invite!.token}`;

          const tpl = tenantInviteEmail({
            inviteType: invite!.inviteType,
            inviterName: inviterRow?.name ?? 'A runQ user',
            inviterTenantName: tenantRow?.name ?? 'runQ',
            role: invite!.role,
            inviteUrl,
            expiresAtIso: invite!.expiresAt.toISOString(),
            note: invite!.note,
            prospectCompanyName: invite!.companyName,
          });

          await sendEmail({
            to: input.email,
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
            fromName: tenantRow?.name ?? 'runQ',
          });
          emailDelivery = 'sent';
        } catch (err) {
          app.log.warn({ err, email: input.email }, 'Failed to send invite email');
          emailDelivery = 'failed';
        }
      }

      return reply.status(201).send({
        data: {
          token: invite!.token,
          inviteType: invite!.inviteType,
          role: invite!.role,
          expiresAt: invite!.expiresAt.toISOString(),
          email: invite!.email,
          companyName: invite!.companyName,
          note: invite!.note,
          emailDelivery,
        },
      });
    },
  );

  // List invitations the caller has SENT from the active tenant. Mental model:
  // "my outgoing invites." Owners want the broader view (everything sent from
  // the tenant), so we widen the scope when the caller is owner-equivalent.
  app.get(
    '/invites',
    { preHandler: [app.authenticate, app.resolveTenantContext], config: { rateLimit: false } },
    async (request) => {
      if (!request.tenantId || !request.user.userId) throw new UnauthorizedError('Authentication required');

      const isOwner = request.activeRole === 'owner' || request.activeRole === 'client_owner';
      const where = isOwner
        ? eq(tenantInvites.invitingTenantId, request.tenantId)
        : and(
            eq(tenantInvites.invitingTenantId, request.tenantId),
            eq(tenantInvites.invitingUserId, request.user.userId),
          );

      const rows = await app.db
        .select({
          id: tenantInvites.id,
          token: tenantInvites.token,
          inviteType: tenantInvites.inviteType,
          role: tenantInvites.role,
          email: tenantInvites.email,
          companyName: tenantInvites.companyName,
          note: tenantInvites.note,
          expiresAt: tenantInvites.expiresAt,
          acceptedAt: tenantInvites.acceptedAt,
          acceptedTenantId: tenantInvites.acceptedTenantId,
          createdAt: tenantInvites.createdAt,
          invitingUserName: users.name,
        })
        .from(tenantInvites)
        .innerJoin(users, eq(users.id, tenantInvites.invitingUserId))
        .where(where)
        .orderBy(tenantInvites.createdAt);

      const now = Date.now();
      const data = rows
        .map((r) => ({
          id: r.id,
          token: r.token,
          inviteType: r.inviteType,
          role: r.role,
          email: r.email,
          companyName: r.companyName,
          note: r.note,
          expiresAt: r.expiresAt.toISOString(),
          acceptedAt: r.acceptedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
          invitingUserName: r.invitingUserName,
          status: r.acceptedAt
            ? 'accepted'
            : r.expiresAt.getTime() < now
              ? 'expired'
              : 'pending',
        }))
        .reverse();
      return { data };
    },
  );

  // Revoke an invite. Hard-deletes; if it had been accepted, the membership
  // it created remains (revocation only kills the link).
  // Permission model:
  //   - owner / client_owner can revoke any invite from the tenant
  //   - accountant can revoke only invites they themselves created
  //   - viewer cannot revoke
  app.delete(
    '/invites/:id',
    { preHandler: [app.authenticate, app.resolveTenantContext], config: { rateLimit: false } },
    async (request, reply) => {
      if (!request.tenantId || !request.user.userId) throw new UnauthorizedError('Authentication required');
      const role = request.activeRole;
      if (role !== 'owner' && role !== 'client_owner' && role !== 'accountant') {
        throw new UnauthorizedError('Insufficient permissions to revoke invites');
      }
      const { id } = request.params as { id: string };

      const isOwner = role === 'owner' || role === 'client_owner';
      const where = isOwner
        ? and(eq(tenantInvites.id, id), eq(tenantInvites.invitingTenantId, request.tenantId))
        : and(
            eq(tenantInvites.id, id),
            eq(tenantInvites.invitingTenantId, request.tenantId),
            eq(tenantInvites.invitingUserId, request.user.userId),
          );

      const result = await app.db.delete(tenantInvites).where(where).returning({ id: tenantInvites.id });
      if (result.length === 0) throw new NotFoundError('Invite');
      return reply.status(204).send();
    },
  );

  // Public: lookup an invite by token. Used by the signup-via-invite page to
  // verify the token before showing the form, and to display "X invited you".
  app.get('/invites/:token', async (request) => {
    const params = request.params as { token: string };
    const [row] = await app.db
      .select({
        id: tenantInvites.id,
        token: tenantInvites.token,
        inviteType: tenantInvites.inviteType,
        audience: tenantInvites.audience,
        role: tenantInvites.role,
        email: tenantInvites.email,
        companyName: tenantInvites.companyName,
        note: tenantInvites.note,
        expiresAt: tenantInvites.expiresAt,
        acceptedAt: tenantInvites.acceptedAt,
        invitingUserName: users.name,
        invitingUserEmail: users.email,
        invitingTenantName: tenants.name,
      })
      .from(tenantInvites)
      .innerJoin(users, eq(users.id, tenantInvites.invitingUserId))
      .innerJoin(tenants, eq(tenants.id, tenantInvites.invitingTenantId))
      .where(eq(tenantInvites.token, params.token))
      .limit(1);

    if (!row) throw new NotFoundError('Invite');
    const expired = row.expiresAt.getTime() < Date.now();
    const used = !!row.acceptedAt;
    return {
      data: {
        token: row.token,
        inviteType: row.inviteType,
        audience: row.audience,
        role: row.role,
        email: row.email,
        companyName: row.companyName,
        note: row.note,
        expiresAt: row.expiresAt.toISOString(),
        valid: !expired && !used,
        expired,
        used,
        invitingUser: { name: row.invitingUserName, email: row.invitingUserEmail },
        invitingTenantName: row.invitingTenantName,
      },
    };
  });

  // Public: accept an invite. Creates new tenant + new owner user, attaches
  // the inviting CA to the new tenant as `accountant`. Skips OTP — the invite
  // token IS the verification (sent out-of-band by the CA).
  app.post('/invites/accept', async (request, reply) => {
    const input = acceptInviteSchema.parse(request.body);

    const [invite] = await app.db
      .select()
      .from(tenantInvites)
      .where(eq(tenantInvites.token, input.token))
      .limit(1);

    if (!invite) throw new NotFoundError('Invite');
    if (invite.acceptedAt) throw new ConflictError('Invite already used');
    if (invite.expiresAt.getTime() < Date.now()) throw new ConflictError('Invite expired');

    // Slug must be unique
    const [slugTaken] = await app.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, input.slug))
      .limit(1);
    if (slugTaken) throw new ConflictError('Company slug already taken');

    const onboardingSteps: Record<string, boolean> = {};
    if (input.gstin && input.stateCode) onboardingSteps.company = true;

    const [tenant] = await app.db.insert(tenants).values({
      name: input.companyName,
      slug: input.slug,
      settings: {
        invoicePrefix: 'INV',
        invoiceFormat: '{prefix}-{fy}-{seq}',
        financialYearStartMonth: 4,
        defaultPaymentTermsDays: 30,
        currency: 'INR',
        legalName: input.companyName,
        gstin: input.gstin || null,
        state: input.state || null,
        stateCode: input.stateCode || null,
        industry: input.industry || null,
        onboardingSteps,
      },
    }).returning();

    const passwordHash = await argon2.hash(input.password);
    const [user] = await app.db.insert(users).values({
      tenantId: tenant!.id,
      email: input.email,
      name: input.name,
      role: 'client_owner',
      passwordHash,
    }).returning();

    // New client owner — membership of their own tenant.
    await app.db.insert(userTenants).values({
      userId: user!.id,
      tenantId: tenant!.id,
      role: 'client_owner',
    });

    // Inviting CA — auto-attached to new tenant with the invite's role.
    await app.db.insert(userTenants).values({
      userId: invite.invitingUserId,
      tenantId: tenant!.id,
      role: invite.role,
    }).onConflictDoNothing();

    await seedCoaForTenant(app.db, tenant!.id);

    await app.db
      .update(tenantInvites)
      .set({ acceptedAt: new Date(), acceptedTenantId: tenant!.id })
      .where(eq(tenantInvites.id, invite.id));

    sendEmail({
      to: input.email,
      subject: `Welcome to runQ, ${input.name.split(' ')[0]}! 🎉`,
      html: welcomeEmailHtml(input.name, input.companyName),
      text: welcomeEmailText(input.name, input.companyName),
      fromName: 'runQ',
    }).catch((err) => app.log.warn({ err, email: input.email }, 'Failed to send welcome email'));

    const token = app.jwt.sign(
      { userId: user!.id, tenantId: tenant!.id, role: 'client_owner' },
      { expiresIn: env.JWT_EXPIRES_IN },
    );

    return reply.status(201).send({
      data: {
        token,
        user: { id: user!.id, tenantId: tenant!.id, email: user!.email, name: user!.name, role: user!.role, isActive: true },
        tenant: { id: tenant!.id, name: tenant!.name, slug: tenant!.slug },
      },
    });
  });

  // Public: accept a join_tenant invite. Three sub-flows the caller can take:
  //   (a) Already logged in (Authorization header present) → just attach
  //       request.user.userId to the inviting tenant. No password required.
  //   (b) Not logged in, email already exists in users → require password,
  //       verify, then attach.
  //   (c) Not logged in, email is new → require name+email+password, register
  //       a new user record (with the inviting tenant as their home tenant),
  //       then attach.
  // Idempotent: re-accepting after attachment returns success without error.
  app.post('/invites/accept-join', async (request, reply) => {
    const input = acceptJoinInviteSchema.parse(request.body);

    const [invite] = await app.db.select().from(tenantInvites).where(eq(tenantInvites.token, input.token)).limit(1);
    if (!invite) throw new NotFoundError('Invite');
    if (invite.inviteType !== 'join_tenant') throw new ConflictError('Wrong invite type for this endpoint');
    if (invite.expiresAt.getTime() < Date.now()) throw new ConflictError('Invite expired');

    // Optional auth: parse JWT if present, but don't require it.
    let authUserId: string | undefined;
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = await app.jwt.verify<{ userId: string }>(authHeader.slice(7));
        authUserId = decoded.userId;
      } catch {
        // Ignore — caller will go through the email/password sub-flow.
      }
    }

    let userId: string;
    let userEmail: string;
    let userName: string;

    if (authUserId) {
      // Sub-flow (a): logged-in user accepts with one click.
      const [u] = await app.db.select().from(users).where(eq(users.id, authUserId)).limit(1);
      if (!u || !u.isActive) throw new UnauthorizedError('User not found or inactive');
      userId = u.id;
      userEmail = u.email;
      userName = u.name;
    } else {
      // Unauthenticated sub-flows (b) or (c) — must supply email+password.
      if (!input.email || !input.password) {
        throw new UnauthorizedError('Login required to accept this invite');
      }
      const [existing] = await app.db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (existing) {
        // Sub-flow (b): existing user logs in and accepts.
        if (!existing.isActive) throw new UnauthorizedError('User inactive');
        const valid = await argon2.verify(existing.passwordHash, input.password);
        if (!valid) throw new UnauthorizedError('Invalid credentials');
        userId = existing.id;
        userEmail = existing.email;
        userName = existing.name;
      } else {
        // Sub-flow (c): brand-new user registers via the invite.
        if (!input.name) throw new UnauthorizedError('Name required to register');
        const passwordHash = await argon2.hash(input.password);
        const [created] = await app.db.insert(users).values({
          // The new user's "home" tenant is the inviting tenant. They have no
          // other tenant of their own yet (that's fine for a CA who is invited
          // to manage a client's books).
          tenantId: invite.invitingTenantId,
          email: input.email,
          name: input.name,
          role: invite.role,
          passwordHash,
        }).returning();
        userId = created!.id;
        userEmail = created!.email;
        userName = created!.name;
      }
    }

    // Attach (idempotent — onConflictDoNothing).
    await app.db.insert(userTenants).values({
      userId,
      tenantId: invite.invitingTenantId,
      role: invite.role,
    }).onConflictDoNothing();

    // Mark accepted (only the first acceptance; subsequent attempts are no-ops
    // since the unique constraint above prevents duplicates).
    if (!invite.acceptedAt) {
      await app.db
        .update(tenantInvites)
        .set({ acceptedAt: new Date(), acceptedTenantId: invite.invitingTenantId })
        .where(eq(tenantInvites.id, invite.id));
    }

    const [tenantRow] = await app.db
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, invite.invitingTenantId))
      .limit(1);

    // Issue a JWT scoped to the joined tenant so the client can use the
    // tenant immediately (Cmd-K will already show it).
    const token = app.jwt.sign(
      { userId, tenantId: invite.invitingTenantId, role: invite.role },
      { expiresIn: env.JWT_EXPIRES_IN },
    );

    return reply.status(201).send({
      data: {
        token,
        user: { id: userId, email: userEmail, name: userName, role: invite.role, tenantId: invite.invitingTenantId },
        tenant: tenantRow ?? null,
      },
    });
  });

  // Record a tenant-switch event on the active tenant's audit log.
  // Called by the frontend after the active tenant changes; not safety-critical
  // (the membership check already happens on every request) but useful for
  // compliance ("who saw client X's books and when?").
  app.post(
    '/log-switch',
    { preHandler: [app.authenticate, app.resolveTenantContext], config: { rateLimit: false } },
    async (request, reply) => {
      if (!request.user.userId || !request.tenantId) {
        throw new UnauthorizedError('Authentication required');
      }
      await app.db.insert(auditLog).values({
        tenantId: request.tenantId,
        userId: request.user.userId,
        action: 'tenant.switch_in',
        entityType: 'tenant',
        entityId: request.tenantId,
        ipAddress: request.ip,
        metadata: {
          activeRole: request.activeRole,
          ua: request.headers['user-agent'] ?? null,
        },
      });
      return reply.status(204).send();
    },
  );

  app.post('/logout', { preHandler: [app.authenticate, app.resolveTenantContext], config: { rateLimit: false } }, async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      await request.server.redis.set(`bl:${token}`, '1', 'EX', 86400);
    }
    return reply.send({ data: { success: true } });
  });

  app.get('/me', { preHandler: [app.authenticate, app.resolveTenantContext], config: { rateLimit: false } }, async (request) => {
    // Platform user (no tenant context)
    if (request.user.platformUserId && !request.user.impersonatedBy) {
      const [pUser] = await app.db
        .select({ id: platformUsers.id, email: platformUsers.email, name: platformUsers.name, role: platformUsers.role, isActive: platformUsers.isActive })
        .from(platformUsers)
        .where(eq(platformUsers.id, request.user.platformUserId))
        .limit(1);
      return {
        data: {
          user: pUser ? { ...pUser, tenantId: null, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() } : null,
          tenant: null,
          platform: true,
        },
      };
    }

    const userId = request.user.userId;
    const activeTenantId = request.tenantId || request.user.tenantId;

    const [user] = await app.db
      .select({ id: users.id, tenantId: users.tenantId, email: users.email, name: users.name, role: users.role, isActive: users.isActive, createdAt: users.createdAt, updatedAt: users.updatedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // All tenants this user is a member of (Phase 1 multi-tenant).
    const memberships = await app.db
      .select({
        tenantId: userTenants.tenantId,
        role: userTenants.role,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
      })
      .from(userTenants)
      .innerJoin(tenants, eq(tenants.id, userTenants.tenantId))
      .where(eq(userTenants.userId, userId));

    // Shape matches @runq/types TenantMembership.
    const accessibleTenants = memberships.map((m) => ({
      tenantId: m.tenantId,
      tenantName: m.tenantName,
      tenantSlug: m.tenantSlug,
      role: m.role,
    }));

    // Active tenant: the one resolved by tenant-context (header or JWT fallback).
    // If user has memberships but none matched, fall back to first.
    const resolvedActiveId = activeTenantId && accessibleTenants.some((t) => t.tenantId === activeTenantId)
      ? activeTenantId
      : accessibleTenants[0]?.tenantId ?? null;

    const [tenant] = resolvedActiveId
      ? await app.db
          .select({ id: tenants.id, name: tenants.name, slug: tenants.slug, settings: tenants.settings })
          .from(tenants)
          .where(eq(tenants.id, resolvedActiveId))
          .limit(1)
      : [];

    // Override the user's role to reflect the active tenant's role.
    const activeMembership = accessibleTenants.find((t) => t.tenantId === resolvedActiveId);
    const userPayload = user
      ? {
          ...user,
          tenantId: resolvedActiveId,
          role: activeMembership?.role ?? user.role,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        }
      : null;

    return {
      data: {
        user: userPayload,
        tenant: tenant ?? null,
        tenants: accessibleTenants,
        impersonatedBy: request.user.impersonatedBy ?? null,
      },
    };
  });

  // Change password for the logged-in user. Verifies the current password
  // before setting the new one — this is not a forgot-password reset.
  app.post(
    '/change-password',
    { preHandler: [app.authenticate], config: { rateLimit: false } },
    async (request, reply) => {
      const userId = request.user.userId;
      if (!userId) throw new UnauthorizedError('Authentication required');
      const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);

      const [user] = await app.db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) throw new NotFoundError('User');

      const valid = await argon2.verify(user.passwordHash, currentPassword);
      if (!valid) throw new UnauthorizedError('Current password is incorrect');

      const passwordHash = await argon2.hash(newPassword);
      await app.db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, userId));

      return reply.send({ data: { success: true } });
    },
  );
};
