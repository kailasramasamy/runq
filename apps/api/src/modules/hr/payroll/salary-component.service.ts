import { eq, and, asc } from 'drizzle-orm';
import { salaryComponents } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateSalaryComponentInput, UpdateSalaryComponentInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../../utils/errors';

const DEFAULTS = [
  { code: 'BASIC', name: 'Basic', type: 'earning', calcType: 'percent_of_ctc', defaultValue: 40, isPfApplicable: true, isEsiApplicable: true, isTaxable: true, displayOrder: 1 },
  { code: 'HRA', name: 'HRA', type: 'earning', calcType: 'percent_of_basic', defaultValue: 40, isTaxable: true, displayOrder: 2 },
  { code: 'DA', name: 'DA', type: 'earning', calcType: 'percent_of_basic', defaultValue: 0, isPfApplicable: true, isEsiApplicable: true, isTaxable: true, displayOrder: 3 },
  { code: 'CONV', name: 'Conveyance', type: 'earning', calcType: 'fixed', defaultValue: 1600, isEsiApplicable: true, isTaxable: true, displayOrder: 4 },
  { code: 'SPECIAL', name: 'Special Allowance', type: 'earning', calcType: 'fixed', defaultValue: 0, isEsiApplicable: true, isTaxable: true, displayOrder: 5 },
  { code: 'PF_EE', name: 'Provident Fund', type: 'statutory', calcType: 'fixed', defaultValue: 0, displayOrder: 50 },
  { code: 'ESI_EE', name: 'ESI', type: 'statutory', calcType: 'fixed', defaultValue: 0, displayOrder: 51 },
  { code: 'PT', name: 'Professional Tax', type: 'statutory', calcType: 'fixed', defaultValue: 0, displayOrder: 52 },
  { code: 'TDS', name: 'TDS', type: 'statutory', calcType: 'fixed', defaultValue: 0, displayOrder: 53 },
  { code: 'LOP', name: 'Loss of Pay', type: 'deduction', calcType: 'fixed', defaultValue: 0, displayOrder: 60 },
];

export class SalaryComponentService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list() {
    return this.db
      .select()
      .from(salaryComponents)
      .where(eq(salaryComponents.tenantId, this.tenantId))
      .orderBy(asc(salaryComponents.displayOrder), asc(salaryComponents.code));
  }

  async create(input: CreateSalaryComponentInput) {
    const [dup] = await this.db
      .select({ id: salaryComponents.id })
      .from(salaryComponents)
      .where(and(eq(salaryComponents.tenantId, this.tenantId), eq(salaryComponents.code, input.code)))
      .limit(1);
    if (dup) throw new ConflictError('Component code already exists');

    const [row] = await this.db
      .insert(salaryComponents)
      .values({ tenantId: this.tenantId, ...this.serialize(input) } as any)
      .returning();
    return row;
  }

  async update(id: string, input: UpdateSalaryComponentInput) {
    const [row] = await this.db
      .update(salaryComponents)
      .set({ ...this.serialize(input), updatedAt: new Date() } as any)
      .where(and(eq(salaryComponents.id, id), eq(salaryComponents.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Salary component');
    return row;
  }

  async remove(id: string) {
    const [row] = await this.db
      .delete(salaryComponents)
      .where(and(eq(salaryComponents.id, id), eq(salaryComponents.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Salary component');
    return row;
  }

  async seedDefaults() {
    const existing = await this.list();
    if (existing.length > 0) return { skipped: true, count: existing.length };
    for (const d of DEFAULTS) {
      await this.db.insert(salaryComponents).values({
        tenantId: this.tenantId,
        code: d.code, name: d.name,
        type: d.type as any, calcType: d.calcType as any,
        defaultValue: String(d.defaultValue),
        isTaxable: d.isTaxable ?? false,
        isPfApplicable: d.isPfApplicable ?? false,
        isEsiApplicable: d.isEsiApplicable ?? false,
        displayOrder: d.displayOrder,
      });
    }
    return { skipped: false, count: DEFAULTS.length };
  }

  private serialize(input: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = { ...input };
    if (out.defaultValue != null) out.defaultValue = String(out.defaultValue);
    return out;
  }
}
