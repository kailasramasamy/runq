/**
 * Seed sample leave data for Vrindavan Dairy LLP:
 *   - Default leave types (CL, SL, EL, ML, CO, LOP)
 *   - Per-employee leave balances for the current year
 *   - Mixed-status leave requests (pending, approved, rejected, cancelled)
 *
 * Run: pnpm tsx --env-file=../../.env seeds/hr-vrindavan-leave.ts
 */

import { Client } from 'pg';

const TENANT_SLUG = 'vrindavan-dairy-llp';

const LEAVE_TYPES = [
  { name: 'Casual Leave', code: 'CL', daysPerYear: 12, carryForward: false, isPaid: true },
  { name: 'Sick Leave', code: 'SL', daysPerYear: 12, carryForward: false, isPaid: true },
  { name: 'Earned Leave', code: 'EL', daysPerYear: 15, carryForward: true, maxCarryForward: 45, encashable: true, isPaid: true },
  { name: 'Maternity Leave', code: 'ML', daysPerYear: 182, carryForward: false, isPaid: true },
  { name: 'Compensatory Off', code: 'CO', daysPerYear: 0, carryForward: true, maxCarryForward: 12, isPaid: true },
  { name: 'Loss of Pay', code: 'LOP', daysPerYear: 0, carryForward: false, isPaid: false },
];

const YEAR = new Date().getFullYear();

// Mixed dates spanning the past + future for visual variety
const SAMPLE_REQUESTS = [
  // Approved (past)
  { codeOffset: 0, leaveCode: 'CL', from: `${YEAR}-03-12`, to: `${YEAR}-03-12`, reason: 'Personal work',            approve: true },
  { codeOffset: 1, leaveCode: 'SL', from: `${YEAR}-02-05`, to: `${YEAR}-02-06`, reason: 'Fever',                    approve: true },
  { codeOffset: 2, leaveCode: 'EL', from: `${YEAR}-04-13`, to: `${YEAR}-04-17`, reason: 'Family vacation - Mysore', approve: true },
  { codeOffset: 3, leaveCode: 'CL', from: `${YEAR}-01-29`, to: `${YEAR}-01-29`, reason: 'Bank work',                approve: true },
  { codeOffset: 4, leaveCode: 'SL', from: `${YEAR}-03-21`, to: `${YEAR}-03-22`, reason: 'Doctor consultation',      approve: true },
  { codeOffset: 5, leaveCode: 'CL', from: `${YEAR}-04-08`, to: `${YEAR}-04-08`, reason: 'School admission',         approve: true, halfDay: true },
  { codeOffset: 6, leaveCode: 'EL', from: `${YEAR}-02-19`, to: `${YEAR}-02-21`, reason: 'Sister wedding',           approve: true },
  // Pending (upcoming)
  { codeOffset: 7, leaveCode: 'CL', from: `${YEAR}-06-15`, to: `${YEAR}-06-15`, reason: 'Festival at home' },
  { codeOffset: 8, leaveCode: 'EL', from: `${YEAR}-07-20`, to: `${YEAR}-07-24`, reason: 'Annual vacation' },
  { codeOffset: 9, leaveCode: 'SL', from: `${YEAR}-06-22`, to: `${YEAR}-06-23`, reason: 'Recovery' },
  { codeOffset: 10, leaveCode: 'CL', from: `${YEAR}-06-30`, to: `${YEAR}-06-30`, reason: 'Personal' },
  // Rejected
  { codeOffset: 11, leaveCode: 'EL', from: `${YEAR}-05-18`, to: `${YEAR}-05-25`, reason: 'Tour', reject: 'Peak production period' },
  // Cancelled
  { codeOffset: 12, leaveCode: 'CL', from: `${YEAR}-04-06`, to: `${YEAR}-04-06`, reason: 'Rescheduled', cancel: true },
];

function countWorkingDays(from: string, to: string, halfDay: boolean, holidayDates: Set<string>): number {
  if (halfDay) return 0.5;
  const start = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  let days = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (holidayDates.has(iso)) continue;
    if (d.getUTCDay() === 0) continue; // Sunday
    days++;
  }
  return days;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const tRes = await c.query(`SELECT id FROM tenants WHERE slug = $1`, [TENANT_SLUG]);
  if (!tRes.rows[0]) throw new Error(`Tenant ${TENANT_SLUG} not found`);
  const tenantId: string = tRes.rows[0].id;
  console.log(`✓ Tenant ${TENANT_SLUG} → ${tenantId}`);

  // Leave types
  const typeIds = new Map<string, { id: string; daysPerYear: string }>();
  for (const t of LEAVE_TYPES) {
    const r = await c.query(
      `INSERT INTO leave_types (tenant_id, name, code, days_per_year, carry_forward, max_carry_forward, encashable, is_paid)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tenant_id, code) DO UPDATE SET
         name = EXCLUDED.name,
         days_per_year = EXCLUDED.days_per_year,
         carry_forward = EXCLUDED.carry_forward,
         max_carry_forward = EXCLUDED.max_carry_forward,
         encashable = EXCLUDED.encashable,
         is_paid = EXCLUDED.is_paid
       RETURNING id, days_per_year`,
      [tenantId, t.name, t.code, t.daysPerYear, t.carryForward, t.maxCarryForward ?? null, t.encashable ?? false, t.isPaid],
    );
    typeIds.set(t.code, { id: r.rows[0].id, daysPerYear: r.rows[0].days_per_year });
  }
  console.log(`✓ ${LEAVE_TYPES.length} leave types`);

  // Employees
  const empRes = await c.query(
    `SELECT id, employee_code FROM employees WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY employee_code`,
    [tenantId],
  );
  const employees: Array<{ id: string; code: string }> = empRes.rows.map((r) => ({ id: r.id, code: r.employee_code }));
  console.log(`✓ ${employees.length} employees`);

  // Leave balances — one row per (employee, type, year) using type's accrued days
  let balCount = 0;
  for (const e of employees) {
    for (const t of LEAVE_TYPES) {
      const ti = typeIds.get(t.code)!;
      await c.query(
        `INSERT INTO leave_balances (tenant_id, employee_id, leave_type_id, year, opening, accrued, used)
         VALUES ($1, $2, $3, $4, 0, $5, 0)
         ON CONFLICT (employee_id, leave_type_id, year) DO UPDATE SET
           accrued = EXCLUDED.accrued,
           updated_at = NOW()`,
        [tenantId, e.id, ti.id, YEAR, ti.daysPerYear],
      );
      balCount++;
    }
  }
  console.log(`✓ ${balCount} leave balances`);

  // Holiday dates (for working-day counting)
  const holRes = await c.query(
    `SELECT date::text AS date FROM holidays WHERE tenant_id = $1`,
    [tenantId],
  );
  const holidayDates = new Set<string>(holRes.rows.map((r) => r.date));

  // Sample requests
  let reqCount = 0;
  for (const s of SAMPLE_REQUESTS) {
    const emp = employees[s.codeOffset];
    if (!emp) continue;
    const ti = typeIds.get(s.leaveCode);
    if (!ti) continue;

    const halfDay = (s as any).halfDay === true;
    const days = countWorkingDays(s.from, s.to, halfDay, holidayDates);
    if (days <= 0) continue;

    // Check overlap to keep idempotent-ish
    const ov = await c.query(
      `SELECT id FROM leave_requests
       WHERE tenant_id = $1 AND employee_id = $2
         AND from_date = $3 AND to_date = $4`,
      [tenantId, emp.id, s.from, s.to],
    );
    if (ov.rows[0]) continue;

    let status: string = 'pending';
    let reviewedBy: string | null = null;
    let reviewedAt: Date | null = null;
    let rejectionReason: string | null = null;

    if ((s as any).approve) status = 'approved';
    else if ((s as any).reject) { status = 'rejected'; rejectionReason = (s as any).reject; }
    else if ((s as any).cancel) status = 'cancelled';

    if (status === 'approved' || status === 'rejected') {
      reviewedAt = new Date();
    }

    await c.query(
      `INSERT INTO leave_requests
        (tenant_id, employee_id, leave_type_id, from_date, to_date, half_day, days, reason, status, reviewed_by, reviewed_at, rejection_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::leave_request_status,$10,$11,$12)`,
      [tenantId, emp.id, ti.id, s.from, s.to, halfDay, days, s.reason, status, reviewedBy, reviewedAt, rejectionReason],
    );

    // For approved: bump balance + mark attendance
    if (status === 'approved') {
      await c.query(
        `UPDATE leave_balances
         SET used = used + $1, updated_at = NOW()
         WHERE tenant_id = $2 AND employee_id = $3 AND leave_type_id = $4 AND year = $5`,
        [days, tenantId, emp.id, ti.id, Number(s.from.slice(0, 4))],
      );

      const start = new Date(s.from + 'T00:00:00Z');
      const end = new Date(s.to + 'T00:00:00Z');
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (d.getUTCDay() === 0) continue;
        if (holidayDates.has(iso)) continue;
        await c.query(
          `INSERT INTO attendance (tenant_id, employee_id, date, status, source)
           VALUES ($1, $2, $3, $4::attendance_status, 'manual')
           ON CONFLICT (employee_id, date) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
          [tenantId, emp.id, iso, halfDay ? 'half_day' : 'leave'],
        );
      }
    }
    reqCount++;
  }
  console.log(`✓ ${reqCount} leave requests (mixed statuses)`);

  await c.end();
  console.log('\n✅ Vrindavan leave seed complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
