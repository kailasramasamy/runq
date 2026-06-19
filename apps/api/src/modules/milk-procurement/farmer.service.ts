import { and, eq, desc, sql, or, ilike, getTableColumns } from 'drizzle-orm';
import { mpFarmers, mpFarmerMemberships, mpNodes, vendors } from '@runq/db';
import type { Db, MpFarmerRow } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type {
  CreateFarmerInput, UpdateFarmerInput, FarmerFilter, FarmerDocumentKindInput,
} from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { MpPrincipal, scopeFarmers } from './access-scope';
import { upsertCredential } from './credentials.service';

export type FarmerWithNode = MpFarmerRow & {
  primaryNodeId: string | null;
  primaryNodeName: string | null;
  // Payout identity surfaced from the linked vendor row (read-only mirror).
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  upiId: string | null;
};

export interface FarmerListResult {
  data: FarmerWithNode[];
  meta: PaginationMeta;
}

// Correlated subqueries for the farmer's current primary VMCC (or null).
// Drizzle renders columns unqualified inside SELECT-position sql fragments, so
// the inner membership table is aliased (pm/pn) and the outer correlated farmer
// id is table-qualified — otherwise the bare "id" is ambiguous (both
// mp_farmers and mp_farmer_memberships expose `id`).
const PRIMARY_NODE_ID = sql<string | null>`(
  SELECT pm.node_id FROM ${mpFarmerMemberships} pm
  WHERE pm.farmer_id = ${mpFarmers}."id"
    AND pm.is_primary = true AND pm.left_on IS NULL
  LIMIT 1)`;
const PRIMARY_NODE_NAME = sql<string | null>`(
  SELECT pn.name FROM ${mpFarmerMemberships} pm
  JOIN ${mpNodes} pn ON pn.id = pm.node_id
  WHERE pm.farmer_id = ${mpFarmers}."id"
    AND pm.is_primary = true AND pm.left_on IS NULL
  LIMIT 1)`;

// Bank/UPI columns pulled from the joined vendor row (farmer reads mirror them).
const VENDOR_BANK = {
  bankAccountName: vendors.bankAccountName,
  bankAccountNumber: vendors.bankAccountNumber,
  bankIfsc: vendors.bankIfsc,
  bankName: vendors.bankName,
  upiId: vendors.upiId,
};

/** Sum of per-breed head counts, or the explicit total, or null. */
function totalCattle(input: CreateFarmerInput): number | null {
  if (input.cattleBreeds?.length) return input.cattleBreeds.reduce((s, b) => s + b.count, 0);
  return input.cattleCount ?? null;
}

/** Build the mp_farmers insert row from validated create input. */
function farmerInsertValues(
  tenantId: string, input: CreateFarmerInput, vendorId: string, code: string,
): typeof mpFarmers.$inferInsert {
  return {
    tenantId, vendorId, code,
    name: input.name,
    phone: input.phone ?? null,
    village: input.village ?? null,
    address: input.address ?? null,
    aadhaar: input.aadhaar ?? null,
    isSociety: input.isSociety,
    defaultMilkType: input.defaultMilkType,
    cattleBreeds: input.cattleBreeds ?? null,
    cattleCount: totalCattle(input),
    inMilkCount: input.inMilkCount ?? null,
    lat: input.lat != null ? String(input.lat) : null,
    lng: input.lng != null ? String(input.lng) : null,
    kycDocId: input.kycDocId ?? null,
    photoDocId: input.photoDocId ?? null,
  };
}

/** Build a sparse mp_farmers patch — only keys present in the update input. */
function farmerUpdatePatch(input: UpdateFarmerInput): Partial<typeof mpFarmers.$inferInsert> {
  const patch: Partial<typeof mpFarmers.$inferInsert> = { updatedAt: new Date() };
  const scalar = {
    name: input.name, phone: input.phone, village: input.village, address: input.address,
    aadhaar: input.aadhaar, isSociety: input.isSociety, defaultMilkType: input.defaultMilkType,
    inMilkCount: input.inMilkCount, kycDocId: input.kycDocId, photoDocId: input.photoDocId,
  };
  for (const [k, v] of Object.entries(scalar)) {
    if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
  }
  if (input.cattleBreeds !== undefined) {
    patch.cattleBreeds = input.cattleBreeds ?? null;
    patch.cattleCount = totalCattle(input as CreateFarmerInput);
  } else if (input.cattleCount !== undefined) {
    patch.cattleCount = input.cattleCount;
  }
  if (input.lat !== undefined) patch.lat = input.lat != null ? String(input.lat) : null;
  if (input.lng !== undefined) patch.lng = input.lng != null ? String(input.lng) : null;
  return patch;
}

/** Farmer/society master. Financial identity = a `vendors` row. */
export class FarmerService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(
    filters: FarmerFilter,
    pagination: { page: number; limit: number },
    principal: MpPrincipal,
  ): Promise<FarmerListResult> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const where = this.buildWhere(filters, principal);
    const [rows, countResult] = await Promise.all([
      this.db.select({
        ...getTableColumns(mpFarmers),
        primaryNodeId: PRIMARY_NODE_ID, primaryNodeName: PRIMARY_NODE_NAME, ...VENDOR_BANK,
      })
        .from(mpFarmers)
        .leftJoin(vendors, eq(vendors.id, mpFarmers.vendorId))
        .where(where)
        .orderBy(desc(mpFarmers.createdAt)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(mpFarmers).where(where),
    ]);
    const total = countResult[0]?.count ?? 0;
    return { data: rows, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(id: string): Promise<FarmerWithNode> {
    const [row] = await this.db.select({
      ...getTableColumns(mpFarmers),
      primaryNodeId: PRIMARY_NODE_ID, primaryNodeName: PRIMARY_NODE_NAME, ...VENDOR_BANK,
    })
      .from(mpFarmers)
      .leftJoin(vendors, eq(vendors.id, mpFarmers.vendorId))
      .where(and(eq(mpFarmers.tenantId, this.tenantId), eq(mpFarmers.id, id)));
    if (!row || row.deletedAt) throw new NotFoundError('Farmer not found');
    return row;
  }

  async create(input: CreateFarmerInput): Promise<MpFarmerRow> {
    const code = input.code ?? (await this.generateCode(input.nodeId ?? null));
    await this.assertCodeFree(code);
    return this.db.transaction(async (tx) => {
      // financial identity: link an existing vendor, or auto-create one
      let vendorId = input.vendorId ?? null;
      if (!vendorId) {
        const [v] = await tx.insert(vendors).values({
          tenantId: this.tenantId,
          name: input.name,
          phone: input.phone ?? null,
          bankAccountName: input.bankAccountName ?? null,
          bankAccountNumber: input.bankAccountNumber ?? null,
          bankIfsc: input.bankIfsc ?? null,
          bankName: input.bankName ?? null,
          upiId: input.upiId ?? null,
          category: 'farmer',
        }).returning({ id: vendors.id });
        vendorId = v!.id;
      }
      const [farmer] = await tx.insert(mpFarmers)
        .values(farmerInsertValues(this.tenantId, input, vendorId, code)).returning();
      if (input.nodeId) {
        await tx.insert(mpFarmerMemberships).values({
          tenantId: this.tenantId, farmerId: farmer!.id, nodeId: input.nodeId, isPrimary: true,
        });
      }
      // Provision a Dhenu app login when phone + DOB are supplied.
      if (input.phone && input.dateOfBirth) {
        await upsertCredential(tx, {
          tenantId: this.tenantId, phone: input.phone, dateOfBirth: input.dateOfBirth,
          role: 'farmer', farmerId: farmer!.id,
        });
      }
      return farmer!;
    });
  }

  async update(id: string, input: UpdateFarmerInput): Promise<FarmerWithNode> {
    const existing = await this.getById(id);
    await this.db.update(mpFarmers).set(farmerUpdatePatch(input))
      .where(and(eq(mpFarmers.tenantId, this.tenantId), eq(mpFarmers.id, id)));
    await this.updateVendorBank(existing.vendorId, input);
    // Keep the Dhenu login in sync when DOB is (re)entered; honour a phone clear.
    const phone = input.phone !== undefined ? input.phone : existing.phone;
    if (input.dateOfBirth && phone) {
      await upsertCredential(this.db, {
        tenantId: this.tenantId, phone, dateOfBirth: input.dateOfBirth, role: 'farmer', farmerId: id,
      });
    }
    return this.getById(id);
  }

  /** Mirror any supplied bank/UPI fields back onto the linked vendor row. */
  private async updateVendorBank(vendorId: string, input: UpdateFarmerInput): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (input.bankAccountName !== undefined) patch.bankAccountName = input.bankAccountName ?? null;
    if (input.bankAccountNumber !== undefined) patch.bankAccountNumber = input.bankAccountNumber ?? null;
    if (input.bankIfsc !== undefined) patch.bankIfsc = input.bankIfsc ?? null;
    if (input.bankName !== undefined) patch.bankName = input.bankName ?? null;
    if (input.upiId !== undefined) patch.upiId = input.upiId ?? null;
    if (!Object.keys(patch).length) return;
    patch.updatedAt = new Date();
    await this.db.update(vendors).set(patch)
      .where(and(eq(vendors.tenantId, this.tenantId), eq(vendors.id, vendorId)));
  }

  async deactivate(id: string): Promise<MpFarmerRow> {
    await this.getById(id);
    const [row] = await this.db.update(mpFarmers)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(mpFarmers.tenantId, this.tenantId), eq(mpFarmers.id, id))).returning();
    return row!;
  }

  private buildWhere(filters: FarmerFilter, principal: MpPrincipal) {
    const conds = [eq(mpFarmers.tenantId, this.tenantId), sql`${mpFarmers.deletedAt} IS NULL`];
    if (filters.isActive !== undefined) conds.push(eq(mpFarmers.isActive, filters.isActive));
    if (filters.search) {
      conds.push(or(ilike(mpFarmers.name, `%${filters.search}%`), ilike(mpFarmers.code, `%${filters.search}%`))!);
    }
    if (filters.nodeId) {
      conds.push(sql`EXISTS (SELECT 1 FROM ${mpFarmerMemberships} m
        WHERE m.farmer_id = ${mpFarmers.id} AND m.node_id = ${filters.nodeId} AND m.left_on IS NULL)`);
    }
    const scope = scopeFarmers(principal);
    if (scope) conds.push(scope);
    return and(...conds);
  }

  /** Point a farmer at its uploaded profile photo / KYC scan (no-op for other kinds). */
  async attachDoc(id: string, kind: FarmerDocumentKindInput, docId: string): Promise<void> {
    const field = kind === 'profile_photo' ? 'photoDocId' : kind === 'kyc' ? 'kycDocId' : null;
    if (!field) return;
    await this.db.update(mpFarmers).set({ [field]: docId, updatedAt: new Date() })
      .where(and(eq(mpFarmers.tenantId, this.tenantId), eq(mpFarmers.id, id)));
  }

  /** Auto-code "<NODE>-NNNN" (or "F-NNNN") for operator-created farmers. */
  private async generateCode(nodeId: string | null): Promise<string> {
    let prefix = 'F';
    if (nodeId) {
      const [n] = await this.db.select({ code: mpNodes.code }).from(mpNodes)
        .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, nodeId))).limit(1);
      if (n?.code) prefix = n.code;
    }
    const [row] = await this.db.select({ count: sql<number>`count(*)::int` }).from(mpFarmers)
      .where(and(eq(mpFarmers.tenantId, this.tenantId), ilike(mpFarmers.code, `${prefix}-%`)));
    let seq = (row?.count ?? 0) + 1;
    // Skip collisions from manual codes / deleted-row gaps.
    while (await this.codeExists(`${prefix}-${String(seq).padStart(4, '0')}`)) seq += 1;
    return `${prefix}-${String(seq).padStart(4, '0')}`;
  }

  private async codeExists(code: string): Promise<boolean> {
    const [existing] = await this.db.select({ id: mpFarmers.id }).from(mpFarmers)
      .where(and(eq(mpFarmers.tenantId, this.tenantId), eq(mpFarmers.code, code)));
    return !!existing;
  }

  private async assertCodeFree(code: string): Promise<void> {
    if (await this.codeExists(code)) throw new ConflictError(`Farmer code "${code}" already exists`);
  }
}
