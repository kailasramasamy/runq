import { eq, and, asc } from 'drizzle-orm';
import { designations, employees } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateDesignationInput, UpdateDesignationInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';

export class DesignationService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list() {
    return this.db
      .select()
      .from(designations)
      .where(eq(designations.tenantId, this.tenantId))
      .orderBy(asc(designations.level), asc(designations.name));
  }

  async create(input: CreateDesignationInput) {
    const [existing] = await this.db
      .select({ id: designations.id })
      .from(designations)
      .where(and(eq(designations.tenantId, this.tenantId), eq(designations.name, input.name)))
      .limit(1);
    if (existing) throw new ConflictError('Designation with this name already exists');

    const [row] = await this.db
      .insert(designations)
      .values({ tenantId: this.tenantId, ...input })
      .returning();
    return row;
  }

  async update(id: string, input: UpdateDesignationInput) {
    const [row] = await this.db
      .update(designations)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(designations.id, id), eq(designations.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Designation');
    return row;
  }

  async remove(id: string) {
    const [used] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.tenantId, this.tenantId), eq(employees.designationId, id)))
      .limit(1);
    if (used) throw new ConflictError('Designation is in use by employees');

    const [row] = await this.db
      .delete(designations)
      .where(and(eq(designations.id, id), eq(designations.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Designation');
    return row;
  }
}
