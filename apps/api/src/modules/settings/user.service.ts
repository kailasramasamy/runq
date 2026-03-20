import { and, eq, sql } from 'drizzle-orm';
import { users } from '@runq/db';
import type { Db } from '@runq/db';
import type { User } from '@runq/types';
import argon2 from 'argon2';
import { NotFoundError, ConflictError, ForbiddenError } from '../../utils/errors';

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: 'owner' | 'accountant' | 'viewer';
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: 'owner' | 'accountant' | 'viewer';
  isActive?: boolean;
}

export class UserService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(): Promise<User[]> {
    const rows = await this.db.select().from(users).where(eq(users.tenantId, this.tenantId));
    return rows.map((r) => this.toUser(r));
  }

  async create(input: CreateUserInput): Promise<User> {
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, this.tenantId), eq(users.email, input.email)))
      .limit(1);

    if (existing) throw new ConflictError('User with this email already exists');

    const passwordHash = await argon2.hash(input.password);
    const [row] = await this.db
      .insert(users)
      .values({ tenantId: this.tenantId, email: input.email, name: input.name, role: input.role, passwordHash })
      .returning();

    return this.toUser(row!);
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    const [row] = await this.db
      .update(users)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('User');
    return this.toUser(row);
  }

  async delete(id: string, requestingUserId: string): Promise<void> {
    if (id === requestingUserId) {
      throw new ForbiddenError('Cannot delete your own account');
    }

    const [target] = await this.db
      .select({ role: users.role })
      .from(users)
      .where(and(eq(users.id, id), eq(users.tenantId, this.tenantId)))
      .limit(1);

    if (!target) throw new NotFoundError('User');

    if (target.role === 'owner') {
      const [ownerCount] = await this.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(users)
        .where(and(eq(users.tenantId, this.tenantId), eq(users.role, 'owner')));

      if ((ownerCount?.count ?? 0) <= 1) {
        throw new ConflictError('Cannot delete the last owner');
      }
    }

    await this.db.delete(users).where(and(eq(users.id, id), eq(users.tenantId, this.tenantId)));
  }

  private toUser(row: typeof users.$inferSelect): User {
    return {
      id: row.id,
      tenantId: row.tenantId,
      email: row.email,
      name: row.name,
      role: row.role,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
