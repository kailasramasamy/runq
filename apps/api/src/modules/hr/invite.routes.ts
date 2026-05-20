// Invite an employee to the runq mobile/web app.
//
// Reuses the existing `tenant_invites` join_tenant flow — on accept, a
// `users` row + `user_tenants` link is created with role=`viewer`, matched
// to the employee record by email (see access-scope.ts → `self` scope).
//
// Why a thin HR wrapper instead of pointing the UI at /auth/invites:
//   - Caller doesn't need to know about invite types or roles.
//   - We validate against the employee record (active, has email, in scope).
//   - We make the call idempotent — repeated taps on "Send invite" should
//     resend the same pending link, not pile up new tokens.

import { FastifyPluginAsync } from 'fastify';
import { and, eq, desc, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { employees, tenantInvites, users, userTenants, tenants } from '@runq/db';
import { rbacHook } from '../../hooks/rbac';
import { resolveHrAccessScope, applyHrScope } from './access-scope';
import { uuidParamSchema } from '@runq/validators';
import { sendEmail } from '../../utils/email';
import { tenantInviteEmail } from '../../utils/email-templates';
import { NotFoundError, ConflictError, UnauthorizedError } from '../../utils/errors';

const INVITE_ROLES = ['owner', 'client_owner', 'accountant', 'hr'] as const;
const INVITE_TTL_DAYS = 14;

function buildInviteUrl(token: string): string {
  // Match the URL shape the existing auth invite flow uses so the web
  // accept page resolves either form (/signup/invite/:t or /finance/...).
  const origin = (process.env.CORS_ORIGIN || 'http://localhost:4003').replace(/\/$/, '');
  return `${origin}/finance/signup/invite/${token}`;
}

export const hrInviteRoutes: FastifyPluginAsync = async (app) => {
  // POST /hr/employees/:id/invite — create or refresh the employee's invite.
  app.post(
    '/employees/:id/invite',
    { preHandler: [rbacHook([...INVITE_ROLES])] },
    async (req, reply) => {
      if (!req.tenantId || !req.user?.userId) {
        throw new UnauthorizedError('Authentication required');
      }
      const { id } = uuidParamSchema.parse(req.params);

      // Honour the same scope rules the rest of HR uses — a manager
      // shouldn't be able to invite someone outside their subtree.
      const scope = await resolveHrAccessScope(req);
      const [emp] = await req.server.db
        .select({
          id: employees.id, email: employees.email,
          firstName: employees.firstName, lastName: employees.lastName,
          status: employees.status,
        })
        .from(employees)
        .where(applyHrScope(scope, employees.id, and(
          eq(employees.tenantId, req.tenantId),
          eq(employees.id, id),
        )))
        .limit(1);
      if (!emp) throw new NotFoundError('Employee');
      if (!emp.email) {
        throw new ConflictError('Employee has no email on file — add one before inviting');
      }
      if (emp.status !== 'active') {
        throw new ConflictError('Only active employees can be invited');
      }

      // If the email already has a user attached to this tenant, there's
      // nothing to invite — surface that to the caller as a clear conflict.
      const [linked] = await req.server.db
        .select({ id: users.id })
        .from(users)
        .innerJoin(userTenants, eq(userTenants.userId, users.id))
        .where(and(
          eq(userTenants.tenantId, req.tenantId),
          sql`lower(${users.email}) = lower(${emp.email})`,
        ))
        .limit(1);
      if (linked) throw new ConflictError('This employee already has an app account');

      // Idempotency — if a non-expired, unaccepted invite already exists
      // for this email in this tenant, return it rather than creating a
      // duplicate. Re-send the email so the caller can recover from "user
      // lost the link".
      const now = new Date();
      const [existing] = await req.server.db
        .select()
        .from(tenantInvites)
        .where(and(
          eq(tenantInvites.invitingTenantId, req.tenantId),
          sql`lower(${tenantInvites.email}) = lower(${emp.email})`,
          eq(tenantInvites.inviteType, 'join_tenant'),
          sql`${tenantInvites.acceptedAt} IS NULL`,
          sql`${tenantInvites.expiresAt} > ${now}`,
        ))
        .orderBy(desc(tenantInvites.createdAt))
        .limit(1);

      let invite = existing;
      if (!invite) {
        const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
        const token = randomBytes(24).toString('base64url');
        const [created] = await req.server.db.insert(tenantInvites).values({
          token,
          invitingUserId: req.user.userId,
          invitingTenantId: req.tenantId,
          inviteType: 'join_tenant',
          audience: 'employee',
          role: 'viewer',
          email: emp.email,
          // Note intentionally blank — the audience field tells the accept
          // page this is an employee invite, no need for free-text hints.
          expiresAt,
        }).returning();
        invite = created!;
      }

      const inviteUrl = buildInviteUrl(invite.token);

      // Best-effort email — failure doesn't fail the request; caller can
      // copy the link from the response.
      let emailDelivery: 'sent' | 'failed' = 'failed';
      try {
        const [tenantRow] = await req.server.db
          .select({ name: tenants.name })
          .from(tenants)
          .where(eq(tenants.id, req.tenantId))
          .limit(1);
        const [inviterRow] = await req.server.db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, req.user.userId))
          .limit(1);
        const tpl = tenantInviteEmail({
          inviteType: 'join_tenant',
          audience: 'employee',
          inviterName: inviterRow?.name ?? 'Your HR team',
          inviterTenantName: tenantRow?.name ?? 'runQ',
          role: 'viewer',
          inviteUrl,
          expiresAtIso: invite.expiresAt.toISOString(),
          note: invite.note,
        });
        await sendEmail({
          to: emp.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          fromName: tenantRow?.name ?? 'runQ',
        });
        emailDelivery = 'sent';
      } catch (err) {
        app.log.warn({ err, email: emp.email }, 'Failed to send employee invite email');
      }

      return reply.status(existing ? 200 : 201).send({
        data: {
          token: invite.token,
          inviteUrl,
          email: invite.email,
          expiresAt: invite.expiresAt.toISOString(),
          emailDelivery,
          reused: !!existing,
        },
      });
    },
  );

  // GET /hr/employees/:id/invite-status — for the UI's chip + button label.
  app.get(
    '/employees/:id/invite-status',
    { preHandler: [rbacHook(['owner', 'client_owner', 'accountant', 'hr', 'viewer'])] },
    async (req) => {
      if (!req.tenantId) throw new UnauthorizedError('Authentication required');
      const { id } = uuidParamSchema.parse(req.params);
      const scope = await resolveHrAccessScope(req);

      const [emp] = await req.server.db
        .select({ id: employees.id, email: employees.email })
        .from(employees)
        .where(applyHrScope(scope, employees.id, and(
          eq(employees.tenantId, req.tenantId),
          eq(employees.id, id),
        )))
        .limit(1);
      if (!emp) throw new NotFoundError('Employee');

      if (!emp.email) {
        return { data: { status: 'no_email' as const, accountActive: false, latestInvite: null } };
      }

      // Existing app account in this tenant?
      const [linked] = await req.server.db
        .select({ id: users.id, isActive: users.isActive })
        .from(users)
        .innerJoin(userTenants, eq(userTenants.userId, users.id))
        .where(and(
          eq(userTenants.tenantId, req.tenantId),
          sql`lower(${users.email}) = lower(${emp.email})`,
        ))
        .limit(1);
      if (linked) {
        return {
          data: {
            status: linked.isActive ? ('active' as const) : ('inactive' as const),
            accountActive: !!linked.isActive,
            latestInvite: null,
          },
        };
      }

      // Latest invite (any state)
      const [latest] = await req.server.db
        .select()
        .from(tenantInvites)
        .where(and(
          eq(tenantInvites.invitingTenantId, req.tenantId),
          sql`lower(${tenantInvites.email}) = lower(${emp.email})`,
          eq(tenantInvites.inviteType, 'join_tenant'),
        ))
        .orderBy(desc(tenantInvites.createdAt))
        .limit(1);

      if (!latest) {
        return { data: { status: 'not_invited' as const, accountActive: false, latestInvite: null } };
      }

      const expired = latest.expiresAt.getTime() < Date.now();
      const accepted = !!latest.acceptedAt;
      const status = accepted ? ('accepted' as const)
        : expired ? ('expired' as const)
        : ('pending' as const);

      return {
        data: {
          status,
          accountActive: false,
          latestInvite: {
            token: latest.token,
            inviteUrl: buildInviteUrl(latest.token),
            expiresAt: latest.expiresAt.toISOString(),
            acceptedAt: latest.acceptedAt?.toISOString() ?? null,
            createdAt: latest.createdAt.toISOString(),
          },
        },
      };
    },
  );
};
