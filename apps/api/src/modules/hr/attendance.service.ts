import { eq, and, gte, lte, asc, sql, inArray } from 'drizzle-orm';
import { attendance, biometricImports, employees } from '@runq/db';
import type { Db } from '@runq/db';
import type {
  UpsertAttendanceInput, AttendanceFilter, BiometricImportInput,
} from '@runq/validators';
import { NotFoundError } from '../../utils/errors';

function calcHours(checkIn?: string | null, checkOut?: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const [ih, im] = checkIn.split(':').map(Number);
  const [oh, om] = checkOut.split(':').map(Number);
  let mins = oh * 60 + om - (ih * 60 + im);
  if (mins < 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

export class AttendanceService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list(filter: AttendanceFilter) {
    const where = and(
      eq(attendance.tenantId, this.tenantId),
      filter.employeeId ? eq(attendance.employeeId, filter.employeeId) : undefined,
      filter.dateFrom ? gte(attendance.date, filter.dateFrom) : undefined,
      filter.dateTo ? lte(attendance.date, filter.dateTo) : undefined,
      filter.status ? eq(attendance.status, filter.status) : undefined,
    );

    const rows = await this.db
      .select({
        att: attendance,
        employeeCode: employees.employeeCode,
        firstName: employees.firstName,
        lastName: employees.lastName,
        photoUrl: employees.photoUrl,
      })
      .from(attendance)
      .innerJoin(employees, eq(employees.id, attendance.employeeId))
      .where(where)
      .orderBy(asc(attendance.date), asc(employees.employeeCode));

    return rows.map((r) => ({
      ...r.att,
      employeeCode: r.employeeCode,
      employeeName: `${r.firstName}${r.lastName ? ' ' + r.lastName : ''}`,
      employeePhotoUrl: r.photoUrl,
    }));
  }

  async upsert(input: UpsertAttendanceInput) {
    const hours = input.hoursWorked ?? calcHours(input.checkIn, input.checkOut);
    const values = {
      tenantId: this.tenantId,
      employeeId: input.employeeId,
      date: input.date,
      shiftId: input.shiftId ?? null,
      checkIn: input.checkIn || null,
      checkOut: input.checkOut || null,
      hoursWorked: hours != null ? String(hours) : null,
      otHours: input.otHours != null ? String(input.otHours) : null,
      status: input.status,
      source: input.source,
      notes: input.notes ?? null,
    };

    const [row] = await this.db
      .insert(attendance)
      .values(values)
      .onConflictDoUpdate({
        target: [attendance.employeeId, attendance.date],
        set: {
          shiftId: values.shiftId,
          checkIn: values.checkIn,
          checkOut: values.checkOut,
          hoursWorked: values.hoursWorked,
          otHours: values.otHours,
          status: values.status,
          source: values.source,
          notes: values.notes,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async bulkUpsert(records: UpsertAttendanceInput[]) {
    const results = [];
    for (const r of records) results.push(await this.upsert(r));
    return { count: results.length };
  }

  async importBiometric(input: BiometricImportInput, userId: string) {
    const codes = [...new Set(input.records.map((r) => r.employeeCode))];
    const emps = await this.db
      .select({ id: employees.id, code: employees.employeeCode })
      .from(employees)
      .where(and(
        eq(employees.tenantId, this.tenantId),
        inArray(employees.employeeCode, codes),
      ));
    const codeMap = new Map(emps.map((e) => [e.code, e.id]));

    const errors: Array<{ row: number; reason: string }> = [];
    let success = 0;
    for (let i = 0; i < input.records.length; i++) {
      const r = input.records[i];
      const empId = codeMap.get(r.employeeCode);
      if (!empId) {
        errors.push({ row: i + 1, reason: `Unknown employee code: ${r.employeeCode}` });
        continue;
      }
      try {
        await this.upsert({
          employeeId: empId,
          date: r.date,
          checkIn: r.checkIn ?? undefined,
          checkOut: r.checkOut ?? undefined,
          status: 'present',
          source: 'biometric',
        } as UpsertAttendanceInput);
        success++;
      } catch (e: any) {
        errors.push({ row: i + 1, reason: e.message ?? 'insert failed' });
      }
    }

    const [imp] = await this.db
      .insert(biometricImports)
      .values({
        tenantId: this.tenantId,
        fileName: input.fileName,
        deviceType: input.deviceType ?? null,
        importedBy: userId,
        totalRecords: input.records.length,
        successCount: success,
        errorCount: errors.length,
        errors,
      })
      .returning();

    return imp;
  }

  async dailyMuster(date: string) {
    const rows = await this.db
      .select({
        status: attendance.status,
        count: sql<number>`count(*)::int`,
      })
      .from(attendance)
      .where(and(eq(attendance.tenantId, this.tenantId), eq(attendance.date, date)))
      .groupBy(attendance.status);

    const totals: Record<string, number> = {
      present: 0, absent: 0, half_day: 0, leave: 0, holiday: 0, week_off: 0,
    };
    for (const r of rows) totals[r.status] = r.count;
    return totals;
  }

  async listImports() {
    return this.db
      .select()
      .from(biometricImports)
      .where(eq(biometricImports.tenantId, this.tenantId))
      .orderBy(sql`${biometricImports.importedAt} desc`)
      .limit(50);
  }
}
