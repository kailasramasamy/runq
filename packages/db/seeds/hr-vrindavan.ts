/**
 * Seed sample HR data for Vrindavan Dairy LLP.
 *
 * Adds departments, designations, shifts, holidays, ~25 employees,
 * and 14 days of attendance for each employee.
 *
 * Run: pnpm tsx --env-file=../../.env seeds/hr-vrindavan.ts
 */

import { Client } from 'pg';

const TENANT_SLUG = 'vrindavan-dairy-llp';

const DEPARTMENTS = [
  { name: 'Production', code: 'PROD' },
  { name: 'Packaging', code: 'PACK' },
  { name: 'Quality Control', code: 'QC' },
  { name: 'Logistics', code: 'LOG' },
  { name: 'Maintenance', code: 'MAINT' },
  { name: 'Sales & Marketing', code: 'SLS' },
  { name: 'Accounts', code: 'ACC' },
  { name: 'Administration', code: 'ADM' },
];

const DESIGNATIONS = [
  { name: 'Plant Manager', level: 8 },
  { name: 'Production Supervisor', level: 6 },
  { name: 'QC Officer', level: 5 },
  { name: 'Machine Operator', level: 3 },
  { name: 'Packaging Operator', level: 3 },
  { name: 'Loader', level: 2 },
  { name: 'Driver', level: 3 },
  { name: 'Accountant', level: 5 },
  { name: 'Sales Executive', level: 4 },
  { name: 'Office Assistant', level: 2 },
  { name: 'Maintenance Technician', level: 4 },
];

const SHIFTS = [
  { name: 'Morning', startTime: '06:00', endTime: '14:00', breakMinutes: 30, weeklyOffDays: [0], isNightShift: false },
  { name: 'Afternoon', startTime: '14:00', endTime: '22:00', breakMinutes: 30, weeklyOffDays: [0], isNightShift: false },
  { name: 'Night', startTime: '22:00', endTime: '06:00', breakMinutes: 30, weeklyOffDays: [0], isNightShift: true },
  { name: 'General', startTime: '09:00', endTime: '18:00', breakMinutes: 60, weeklyOffDays: [0, 6], isNightShift: false },
];

const HOLIDAYS_2026 = [
  { name: 'Republic Day', date: '2026-01-26', type: 'national' },
  { name: 'Holi', date: '2026-03-04', type: 'national' },
  { name: 'Good Friday', date: '2026-04-03', type: 'national' },
  { name: 'Ambedkar Jayanti', date: '2026-04-14', type: 'national' },
  { name: 'Eid ul-Fitr', date: '2026-04-20', type: 'national' },
  { name: 'Labour Day', date: '2026-05-01', type: 'national' },
  { name: 'Independence Day', date: '2026-08-15', type: 'national' },
  { name: 'Gandhi Jayanti', date: '2026-10-02', type: 'national' },
  { name: 'Dussehra', date: '2026-10-20', type: 'national' },
  { name: 'Diwali', date: '2026-11-08', type: 'national' },
  { name: 'Christmas', date: '2026-12-25', type: 'national' },
  { name: 'Krishna Janmashtami', date: '2026-08-26', type: 'company' },
  { name: 'Annual Day', date: '2026-12-15', type: 'company' },
];

interface EmpSeed {
  code: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  joiningDate: string;
  employmentType: 'permanent' | 'contract' | 'wage';
  department: string;
  designation: string;
  ctcAnnual: number;
  pan?: string;
  uan?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankName?: string;
}

const EMPLOYEES: EmpSeed[] = [
  // Leadership
  { code: 'VD001', firstName: 'Rajesh', lastName: 'Sharma', email: 'rajesh@vrindavan.in', phone: '9876543201', joiningDate: '2018-04-01', employmentType: 'permanent', department: 'Production', designation: 'Plant Manager', ctcAnnual: 1200000, pan: 'ABCPS1234A', uan: '100123456789', bankAccountNumber: '50100123456', bankIfsc: 'HDFC0001234', bankName: 'HDFC Bank' },
  { code: 'VD002', firstName: 'Priya', lastName: 'Iyer', email: 'priya@vrindavan.in', phone: '9876543202', joiningDate: '2019-06-15', employmentType: 'permanent', department: 'Accounts', designation: 'Accountant', ctcAnnual: 720000, pan: 'BCDPI2345B', uan: '100123456790', bankAccountNumber: '50100234567', bankIfsc: 'ICIC0001234', bankName: 'ICICI Bank' },

  // Production - permanent supervisors
  { code: 'VD003', firstName: 'Suresh', lastName: 'Patil', phone: '9876543203', joiningDate: '2020-01-10', employmentType: 'permanent', department: 'Production', designation: 'Production Supervisor', ctcAnnual: 540000, uan: '100123456791' },
  { code: 'VD004', firstName: 'Manjunath', lastName: 'Reddy', phone: '9876543204', joiningDate: '2020-03-20', employmentType: 'permanent', department: 'Production', designation: 'Production Supervisor', ctcAnnual: 540000, uan: '100123456792' },
  { code: 'VD005', firstName: 'Vinod', lastName: 'Kumar', phone: '9876543205', joiningDate: '2021-08-12', employmentType: 'permanent', department: 'Quality Control', designation: 'QC Officer', ctcAnnual: 480000, uan: '100123456793' },

  // Production wage workers
  { code: 'VD010', firstName: 'Ramesh', lastName: 'Yadav', phone: '9876543210', joiningDate: '2022-01-15', employmentType: 'wage', department: 'Production', designation: 'Machine Operator', ctcAnnual: 240000 },
  { code: 'VD011', firstName: 'Sunita', lastName: 'Devi', phone: '9876543211', joiningDate: '2022-02-10', employmentType: 'wage', department: 'Production', designation: 'Machine Operator', ctcAnnual: 240000 },
  { code: 'VD012', firstName: 'Mahesh', lastName: 'Kale', phone: '9876543212', joiningDate: '2022-05-01', employmentType: 'wage', department: 'Production', designation: 'Machine Operator', ctcAnnual: 240000 },
  { code: 'VD013', firstName: 'Geeta', lastName: 'Bai', phone: '9876543213', joiningDate: '2023-01-08', employmentType: 'wage', department: 'Production', designation: 'Machine Operator', ctcAnnual: 228000 },
  { code: 'VD014', firstName: 'Anil', lastName: 'Pawar', phone: '9876543214', joiningDate: '2023-04-12', employmentType: 'wage', department: 'Production', designation: 'Machine Operator', ctcAnnual: 228000 },

  // Packaging
  { code: 'VD020', firstName: 'Kavita', lastName: 'Joshi', phone: '9876543220', joiningDate: '2022-03-15', employmentType: 'wage', department: 'Packaging', designation: 'Packaging Operator', ctcAnnual: 216000 },
  { code: 'VD021', firstName: 'Lakshmi', lastName: 'Naidu', phone: '9876543221', joiningDate: '2022-06-22', employmentType: 'wage', department: 'Packaging', designation: 'Packaging Operator', ctcAnnual: 216000 },
  { code: 'VD022', firstName: 'Pooja', lastName: 'Singh', phone: '9876543222', joiningDate: '2023-02-01', employmentType: 'wage', department: 'Packaging', designation: 'Packaging Operator', ctcAnnual: 216000 },
  { code: 'VD023', firstName: 'Shanti', lastName: 'Kumari', phone: '9876543223', joiningDate: '2023-09-10', employmentType: 'wage', department: 'Packaging', designation: 'Packaging Operator', ctcAnnual: 204000 },

  // Logistics
  { code: 'VD030', firstName: 'Imran', lastName: 'Khan', phone: '9876543230', joiningDate: '2021-11-20', employmentType: 'permanent', department: 'Logistics', designation: 'Driver', ctcAnnual: 300000 },
  { code: 'VD031', firstName: 'Santosh', lastName: 'More', phone: '9876543231', joiningDate: '2022-04-05', employmentType: 'permanent', department: 'Logistics', designation: 'Driver', ctcAnnual: 300000 },
  { code: 'VD032', firstName: 'Bharat', lastName: 'Jadhav', phone: '9876543232', joiningDate: '2022-08-18', employmentType: 'wage', department: 'Logistics', designation: 'Loader', ctcAnnual: 192000 },
  { code: 'VD033', firstName: 'Dilip', lastName: 'Gaikwad', phone: '9876543233', joiningDate: '2023-01-25', employmentType: 'wage', department: 'Logistics', designation: 'Loader', ctcAnnual: 192000 },

  // Maintenance
  { code: 'VD040', firstName: 'Naveen', lastName: 'Bhat', phone: '9876543240', joiningDate: '2021-05-10', employmentType: 'permanent', department: 'Maintenance', designation: 'Maintenance Technician', ctcAnnual: 420000 },
  { code: 'VD041', firstName: 'Prakash', lastName: 'Shetty', phone: '9876543241', joiningDate: '2022-10-15', employmentType: 'permanent', department: 'Maintenance', designation: 'Maintenance Technician', ctcAnnual: 396000 },

  // Sales
  { code: 'VD050', firstName: 'Ananya', lastName: 'Menon', email: 'ananya@vrindavan.in', phone: '9876543250', joiningDate: '2022-07-01', employmentType: 'permanent', department: 'Sales & Marketing', designation: 'Sales Executive', ctcAnnual: 420000 },
  { code: 'VD051', firstName: 'Rohit', lastName: 'Desai', email: 'rohit@vrindavan.in', phone: '9876543251', joiningDate: '2023-03-15', employmentType: 'permanent', department: 'Sales & Marketing', designation: 'Sales Executive', ctcAnnual: 396000 },

  // Office
  { code: 'VD060', firstName: 'Sushma', lastName: 'Rao', phone: '9876543260', joiningDate: '2021-09-01', employmentType: 'permanent', department: 'Administration', designation: 'Office Assistant', ctcAnnual: 264000 },
  { code: 'VD061', firstName: 'Faisal', lastName: 'Ahmed', phone: '9876543261', joiningDate: '2023-06-12', employmentType: 'contract', department: 'Administration', designation: 'Office Assistant', ctcAnnual: 240000 },
];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const tRes = await c.query(`SELECT id FROM tenants WHERE slug = $1`, [TENANT_SLUG]);
  if (!tRes.rows[0]) throw new Error(`Tenant ${TENANT_SLUG} not found`);
  const tenantId: string = tRes.rows[0].id;
  console.log(`✓ Tenant ${TENANT_SLUG} → ${tenantId}`);

  // Departments
  const deptIds = new Map<string, string>();
  for (const d of DEPARTMENTS) {
    const r = await c.query(
      `INSERT INTO departments (tenant_id, name, code) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, name) DO UPDATE SET code = EXCLUDED.code
       RETURNING id`,
      [tenantId, d.name, d.code],
    );
    deptIds.set(d.name, r.rows[0].id);
  }
  console.log(`✓ ${DEPARTMENTS.length} departments`);

  // Designations
  const desigIds = new Map<string, string>();
  for (const d of DESIGNATIONS) {
    const r = await c.query(
      `INSERT INTO designations (tenant_id, name, level) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, name) DO UPDATE SET level = EXCLUDED.level
       RETURNING id`,
      [tenantId, d.name, d.level],
    );
    desigIds.set(d.name, r.rows[0].id);
  }
  console.log(`✓ ${DESIGNATIONS.length} designations`);

  // Shifts
  for (const s of SHIFTS) {
    await c.query(
      `INSERT INTO shifts (tenant_id, name, start_time, end_time, break_minutes, weekly_off_days, is_night_shift)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (tenant_id, name) DO NOTHING`,
      [tenantId, s.name, s.startTime, s.endTime, s.breakMinutes, JSON.stringify(s.weeklyOffDays), s.isNightShift],
    );
  }
  console.log(`✓ ${SHIFTS.length} shifts`);

  // Holidays
  for (const h of HOLIDAYS_2026) {
    await c.query(
      `INSERT INTO holidays (tenant_id, name, date, type, is_paid)
       VALUES ($1, $2, $3, $4::holiday_type, true)
       ON CONFLICT (tenant_id, date, name) DO NOTHING`,
      [tenantId, h.name, h.date, h.type],
    );
  }
  console.log(`✓ ${HOLIDAYS_2026.length} holidays`);

  // Employees
  const empIds = new Map<string, string>();
  for (const e of EMPLOYEES) {
    const deptId = deptIds.get(e.department);
    const desigId = desigIds.get(e.designation);
    if (!deptId || !desigId) {
      console.warn(`⚠ Missing dept/desig for ${e.code}`);
      continue;
    }
    const r = await c.query(
      `INSERT INTO employees (
        tenant_id, employee_code, first_name, last_name, email, phone,
        joining_date, employment_type, department_id, designation_id,
        pan, uan, bank_account_number, bank_ifsc, bank_name, ctc_annual, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::employment_type, $9, $10,
                $11, $12, $13, $14, $15, $16, 'active')
       ON CONFLICT (tenant_id, employee_code) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         phone = EXCLUDED.phone,
         department_id = EXCLUDED.department_id,
         designation_id = EXCLUDED.designation_id,
         ctc_annual = EXCLUDED.ctc_annual,
         updated_at = NOW()
       RETURNING id`,
      [
        tenantId, e.code, e.firstName, e.lastName, e.email ?? null, e.phone,
        e.joiningDate, e.employmentType, deptId, desigId,
        e.pan ?? null, e.uan ?? null,
        e.bankAccountNumber ?? null, e.bankIfsc ?? null, e.bankName ?? null,
        e.ctcAnnual,
      ],
    );
    empIds.set(e.code, r.rows[0].id);
  }
  console.log(`✓ ${empIds.size} employees`);

  // Attendance for last 14 days
  const today = new Date();
  let attCount = 0;
  for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
    const d = new Date(today);
    d.setDate(today.getDate() - dayOffset);
    const date = ymd(d);
    const dow = d.getDay(); // 0=Sun
    const isSunday = dow === 0;

    for (const e of EMPLOYEES) {
      const empId = empIds.get(e.code);
      if (!empId) continue;

      let status: string;
      let checkIn: string | null = null;
      let checkOut: string | null = null;
      let hours: number | null = null;
      const rng = Math.random();

      if (isSunday) {
        status = 'week_off';
      } else if (rng < 0.04) {
        status = 'absent';
      } else if (rng < 0.08) {
        status = 'leave';
      } else if (rng < 0.11) {
        status = 'half_day';
        checkIn = '09:00';
        checkOut = '13:30';
        hours = 4.5;
      } else {
        status = 'present';
        const inMin = 540 + Math.floor(Math.random() * 30); // 09:00-09:30
        const workMin = 480 + Math.floor(Math.random() * 60); // ~8-9 hrs
        const outMin = inMin + workMin + 60; // + break
        checkIn = `${String(Math.floor(inMin / 60)).padStart(2, '0')}:${String(inMin % 60).padStart(2, '0')}`;
        checkOut = `${String(Math.floor(outMin / 60)).padStart(2, '0')}:${String(outMin % 60).padStart(2, '0')}`;
        hours = Math.round((workMin / 60) * 100) / 100;
      }

      await c.query(
        `INSERT INTO attendance (tenant_id, employee_id, date, check_in, check_out, hours_worked, status, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7::attendance_status, 'manual')
         ON CONFLICT (employee_id, date) DO NOTHING`,
        [tenantId, empId, date, checkIn, checkOut, hours, status],
      );
      attCount++;
    }
  }
  console.log(`✓ ${attCount} attendance records (14 days × ${empIds.size} employees)`);

  await c.end();
  console.log('\n✅ Vrindavan Dairy HR seed complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
