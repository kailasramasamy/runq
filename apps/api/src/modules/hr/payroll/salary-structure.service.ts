import { eq, and, asc } from 'drizzle-orm';
import { salaryStructures, salaryStructureComponents, salaryComponents } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateSalaryStructureInput, UpdateSalaryStructureInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../../utils/errors';

export class SalaryStructureService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list() {
    return this.db
      .select()
      .from(salaryStructures)
      .where(eq(salaryStructures.tenantId, this.tenantId))
      .orderBy(asc(salaryStructures.name));
  }

  async getById(id: string) {
    const [structure] = await this.db
      .select()
      .from(salaryStructures)
      .where(and(eq(salaryStructures.id, id), eq(salaryStructures.tenantId, this.tenantId)))
      .limit(1);
    if (!structure) throw new NotFoundError('Salary structure');

    const comps = await this.db
      .select({
        line: salaryStructureComponents,
        code: salaryComponents.code,
        name: salaryComponents.name,
        type: salaryComponents.type,
        displayOrder: salaryComponents.displayOrder,
      })
      .from(salaryStructureComponents)
      .innerJoin(salaryComponents, eq(salaryComponents.id, salaryStructureComponents.salaryComponentId))
      .where(eq(salaryStructureComponents.salaryStructureId, id))
      .orderBy(asc(salaryComponents.displayOrder));

    return { ...structure, components: comps.map((c) => ({ ...c.line, code: c.code, name: c.name, type: c.type })) };
  }

  async create(input: CreateSalaryStructureInput) {
    const [dup] = await this.db
      .select({ id: salaryStructures.id })
      .from(salaryStructures)
      .where(and(eq(salaryStructures.tenantId, this.tenantId), eq(salaryStructures.name, input.name)))
      .limit(1);
    if (dup) throw new ConflictError('Structure with this name already exists');

    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(salaryStructures)
        .values({ tenantId: this.tenantId, name: input.name, description: input.description ?? null })
        .returning();
      for (const c of input.components) {
        await tx.insert(salaryStructureComponents).values({
          tenantId: this.tenantId,
          salaryStructureId: row.id,
          salaryComponentId: c.salaryComponentId,
          value: String(c.value),
          calcType: c.calcType as any,
        });
      }
      return row;
    });
  }

  async update(id: string, input: UpdateSalaryStructureInput) {
    return this.db.transaction(async (tx) => {
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (input.name != null) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;

      const [row] = await tx
        .update(salaryStructures)
        .set(updates)
        .where(and(eq(salaryStructures.id, id), eq(salaryStructures.tenantId, this.tenantId)))
        .returning();
      if (!row) throw new NotFoundError('Salary structure');

      if (input.components) {
        await tx
          .delete(salaryStructureComponents)
          .where(and(
            eq(salaryStructureComponents.tenantId, this.tenantId),
            eq(salaryStructureComponents.salaryStructureId, id),
          ));
        for (const c of input.components) {
          await tx.insert(salaryStructureComponents).values({
            tenantId: this.tenantId,
            salaryStructureId: id,
            salaryComponentId: c.salaryComponentId,
            value: String(c.value),
            calcType: c.calcType as any,
          });
        }
      }
      return row;
    });
  }

  async remove(id: string) {
    const [row] = await this.db
      .delete(salaryStructures)
      .where(and(eq(salaryStructures.id, id), eq(salaryStructures.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Salary structure');
    return row;
  }
}
