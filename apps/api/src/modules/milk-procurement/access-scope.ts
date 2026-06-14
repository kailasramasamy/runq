// Resolves what a milk-procurement request is allowed to see/do, by persona.
// Mirrors hr/access-scope.ts.
//
//   - { kind: 'all' }                — owner | accountant | client_owner |
//                                      viewer. Tenant-wide; no extra WHERE.
//   - { kind: 'operator', nodeIds }  — field_operator: the nodes they're
//                                      assigned to (mp_node_operators.user_id).
//                                      Writes/reads scoped to those nodes.
//   - { kind: 'farmer', farmerId }   — farmer matched by phone; reads own data.
//   - { kind: 'none' }               — persona role with no matching row.
//
// Scope helpers return a Drizzle SQL predicate (or undefined for 'all') to push
// into a service's WHERE conds — `and(...conds)` ignores undefined.

import { FastifyRequest } from 'fastify';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import {
  users, mpNodeOperators, mpFarmers, mpFarmerMemberships, mpNodes, mpPours, mpConsignments,
} from '@runq/db';
import { ForbiddenError } from '../../utils/errors';

export type MpPrincipal =
  | { kind: 'all' }
  | { kind: 'operator'; nodeIds: Set<string> }
  | { kind: 'farmer'; farmerId: string }
  | { kind: 'none' };

const ORG_WIDE = new Set(['owner', 'accountant', 'client_owner', 'viewer']);
const SCOPE_KEY = Symbol('mpPrincipal');

export async function resolveMpPrincipal(req: FastifyRequest): Promise<MpPrincipal> {
  const cached = (req as any)[SCOPE_KEY] as MpPrincipal | undefined;
  if (cached) return cached;
  const principal = await compute(req);
  (req as any)[SCOPE_KEY] = principal;
  return principal;
}

async function compute(req: FastifyRequest): Promise<MpPrincipal> {
  const role = req.activeRole || req.user?.role;
  if (role && ORG_WIDE.has(role)) return { kind: 'all' };
  const db = req.server.db;
  const tenantId = req.tenantId;
  const userId = req.user!.userId;

  if (role === 'field_operator') {
    const rows = await db.select({ nodeId: mpNodeOperators.nodeId }).from(mpNodeOperators)
      .where(and(
        eq(mpNodeOperators.tenantId, tenantId), eq(mpNodeOperators.userId, userId),
        eq(mpNodeOperators.isActive, true),
      ));
    return { kind: 'operator', nodeIds: new Set(rows.map((r) => r.nodeId)) };
  }

  if (role === 'farmer') {
    const [u] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
    const phone = u?.phone ?? '';
    if (!phone) return { kind: 'none' };
    const [f] = await db.select({ id: mpFarmers.id }).from(mpFarmers).where(and(
      eq(mpFarmers.tenantId, tenantId),
      sql`regexp_replace(coalesce(${mpFarmers.phone}, ''), '\\D', '', 'g') IN (${phone}, ${'91' + phone})`,
    )).limit(1);
    return f ? { kind: 'farmer', farmerId: f.id } : { kind: 'none' };
  }

  return { kind: 'none' };
}

/** Guard a write at a specific node: operators must own it; others (besides 'all') denied. */
export function assertNodeAccess(p: MpPrincipal, nodeId: string): void {
  if (p.kind === 'all') return;
  if (p.kind === 'operator' && p.nodeIds.has(nodeId)) return;
  throw new ForbiddenError('Not allowed for this node');
}

export function scopePours(p: MpPrincipal) {
  if (p.kind === 'all') return undefined;
  if (p.kind === 'operator') return p.nodeIds.size ? inArray(mpPours.nodeId, [...p.nodeIds]) : sql`false`;
  if (p.kind === 'farmer') return eq(mpPours.farmerId, p.farmerId);
  return sql`false`;
}

export function scopeNodes(p: MpPrincipal) {
  if (p.kind === 'all') return undefined;
  if (p.kind === 'operator') return p.nodeIds.size ? inArray(mpNodes.id, [...p.nodeIds]) : sql`false`;
  return sql`false`;
}

export function scopeConsignments(p: MpPrincipal) {
  if (p.kind === 'all') return undefined;
  if (p.kind === 'operator') {
    if (!p.nodeIds.size) return sql`false`;
    const ids = [...p.nodeIds];
    return or(inArray(mpConsignments.fromNodeId, ids), inArray(mpConsignments.toNodeId, ids));
  }
  return sql`false`;
}

export function scopeFarmers(p: MpPrincipal) {
  if (p.kind === 'all') return undefined;
  if (p.kind === 'farmer') return eq(mpFarmers.id, p.farmerId);
  if (p.kind === 'operator') {
    if (!p.nodeIds.size) return sql`false`;
    const ids = [...p.nodeIds];
    return sql`EXISTS (SELECT 1 FROM ${mpFarmerMemberships} m
      WHERE m.farmer_id = ${mpFarmers.id} AND m.left_on IS NULL
        AND m.node_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}))`;
  }
  return sql`false`;
}
