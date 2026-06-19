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
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  users, mpNodeOperators, mpFarmers, mpFarmerMemberships, mpNodes, mpPours, mpConsignments,
} from '@runq/db';
import type { Db } from '@runq/db';
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
    // Match operator rows by user_id OR phone: rows created via the web admin
    // carry the phone (the login handle) but link user_id only on/after first
    // login, so phone is the reliable join until then.
    const [u] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
    const phone = (u?.phone ?? '').replace(/\D/g, '');
    const rows = await db.select({ nodeId: mpNodeOperators.nodeId }).from(mpNodeOperators)
      .where(and(
        eq(mpNodeOperators.tenantId, tenantId),
        eq(mpNodeOperators.isActive, true),
        or(
          eq(mpNodeOperators.userId, userId),
          phone
            ? sql`regexp_replace(coalesce(${mpNodeOperators.phone}, ''), '\\D', '', 'g') IN (${phone}, ${'91' + phone})`
            : sql`false`,
        ),
      ));
    const nodeIds = await expandWithDescendants(db, tenantId, rows.map((r) => r.nodeId));
    return { kind: 'operator', nodeIds };
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

/**
 * A manager node acts on its whole subtree, not just itself: a CC pays the
 * farmers & operators of its child VMCCs, a PP oversees its CCs. Expand the
 * assigned set to include every descendant via the parent_node_id tree. Leaf
 * VMCC operators add nothing. The tree is shallow (vmcc→cc→pp), so this settles
 * in a couple of passes.
 */
async function expandWithDescendants(
  db: Db, tenantId: string, assigned: string[],
): Promise<Set<string>> {
  const all = new Set(assigned);
  let frontier = assigned;
  while (frontier.length) {
    const children = await db.select({ id: mpNodes.id }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, tenantId), inArray(mpNodes.parentNodeId, frontier)));
    frontier = children.map((c) => c.id).filter((id) => !all.has(id));
    for (const id of frontier) all.add(id);
  }
  return all;
}

/** Guard a write at a specific node: operators must own it; others (besides 'all') denied. */
export function assertNodeAccess(p: MpPrincipal, nodeId: string): void {
  if (p.kind === 'all') return;
  if (p.kind === 'operator' && p.nodeIds.has(nodeId)) return;
  throw new ForbiddenError('Not allowed for this node');
}

/**
 * Operator-only guard: the farmer must have an active membership at one of the
 * operator's nodes. Used by ledger writes/reads so a VMCC operator can only
 * touch advances/loans for farmers at their own VMCC. 'all' passes through.
 */
export async function assertFarmerAtNode(
  db: Db, tenantId: string, p: MpPrincipal, farmerId: string,
): Promise<void> {
  if (p.kind === 'all') return;
  if (p.kind !== 'operator' || !p.nodeIds.size) throw new ForbiddenError('Not allowed for this farmer');
  const [row] = await db.select({ id: mpFarmerMemberships.id }).from(mpFarmerMemberships)
    .where(and(
      eq(mpFarmerMemberships.tenantId, tenantId),
      eq(mpFarmerMemberships.farmerId, farmerId),
      isNull(mpFarmerMemberships.leftOn),
      inArray(mpFarmerMemberships.nodeId, [...p.nodeIds]),
    )).limit(1);
  if (!row) throw new ForbiddenError('Not allowed for this farmer');
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
