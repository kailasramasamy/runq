import { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { users, tenants, seedCoaForTenant } from '@runq/db';
import { loginSchema, registerSchema } from '@runq/validators';
import argon2 from 'argon2';
import { UnauthorizedError, ConflictError } from '../../utils/errors';
import { sendEmail } from '../../utils/email';

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
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' },
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

    // Seed standard chart of accounts
    await seedCoaForTenant(app.db, tenant!.id);

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
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' },
    );

    return reply.status(201).send({
      data: {
        token,
        user: { id: user!.id, tenantId: tenant!.id, email: user!.email, name: user!.name, role: user!.role, isActive: true },
        tenant: { id: tenant!.id, name: tenant!.name, slug: tenant!.slug },
      },
    });
  });

  app.post('/logout', { preHandler: [app.authenticate] }, async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      await request.server.redis.set(`bl:${token}`, '1', 'EX', 86400);
    }
    return reply.send({ data: { success: true } });
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const [user] = await app.db
      .select({ id: users.id, tenantId: users.tenantId, email: users.email, name: users.name, role: users.role, isActive: users.isActive, createdAt: users.createdAt, updatedAt: users.updatedAt })
      .from(users)
      .where(and(eq(users.id, request.user.userId), eq(users.tenantId, request.user.tenantId)))
      .limit(1);

    const [tenant] = await app.db
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug, settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, request.user.tenantId))
      .limit(1);

    return {
      data: {
        user: user ? { ...user, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() } : null,
        tenant: tenant ?? null,
      },
    };
  });
};
