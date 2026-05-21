/**
 * Backing-row seeding for the interactive HR-notification tester.
 *
 * Each HR notification points at a screen; an empty screen makes the tap
 * impossible to verify. These helpers insert one real row in the state the
 * destination screen queries, so a tapped notification lands on actionable
 * content.
 *
 * Two test employees are scaffolded once per run:
 *   selfEmp — linked to the device user (phone match); employee-facing
 *             screens ("your leave", "your payslip") read this one.
 *   subEmp  — reports to selfEmp; manager/approval screens read this one.
 *
 * Rows are additive — re-running the script stacks more cards. That is fine
 * for a test surface; delete the NTEST-* employees to clear everything.
 */
import { and, eq } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  attendancePunches, attendanceRegularizations, departments, employeeLoans,
  employeePayments, employeeSalary, employees, expenseClaims, fnfSettlements,
  hrAnnouncements, hrTickets, hrTicketComments, leaveRequests, leaveTypes,
  onboardingItems, onboardingWorkflows, payrollRuns, payslips,
  performanceCycles, performanceReviews, taxDeclarations,
} from '@runq/db';

export interface SeedCtx {
  db: Db;
  tenantId: string;
  deviceUserId: string;
  selfEmp: string;
  subEmp: string;
  leaveTypeId: string;
  departmentId: string;
  payrollRunId: string;
  perfCycleId: string;
}

export interface DeviceUser {
  id: string; tenantId: string; name: string; email: string; phone: string | null;
}

/** What a seed reports back. Usually just a short console label, but a seed
 *  whose production notification deep-links to a per-row detail screen also
 *  returns that targetUrl — the catalogue can't name the row before it's
 *  created, so the seed supplies the real URL at fire time. */
export type SeedResult = string | { label: string; targetUrl: string };

const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const shift = (days: number): Date => { const d = new Date(); d.setDate(d.getDate() + days); return d; };
const rnd = (): string => Math.random().toString(36).slice(2, 7).toUpperCase();
const last10 = (p: string | null): string => (p ?? '').replace(/\D/g, '').slice(-10);

// ─── Scaffolding ──────────────────────────────────────────────────────────

/** Build the shared context: two test employees + the FK rows they need. */
export async function scaffold(db: Db, user: DeviceUser): Promise<SeedCtx> {
  const tenantId = user.tenantId;
  const departmentId = await ensureDepartment(db, tenantId);
  const leaveTypeId = await ensureLeaveType(db, tenantId);
  const selfEmp = await ensureSelfEmp(db, user);
  const subEmp = await ensureSubEmp(db, tenantId, selfEmp, departmentId);
  await warnStraySelf(db, tenantId, selfEmp);
  const payrollRunId = await ensurePayrollRun(db, tenantId);
  const perfCycleId = await ensurePerfCycle(db, tenantId);
  return { db, tenantId, deviceUserId: user.id, selfEmp, subEmp,
    leaveTypeId, departmentId, payrollRunId, perfCycleId };
}

async function ensureDepartment(db: Db, tenantId: string): Promise<string> {
  const [found] = await db.select({ id: departments.id }).from(departments)
    .where(eq(departments.tenantId, tenantId)).limit(1);
  if (found) return found.id;
  const [made] = await db.insert(departments)
    .values({ tenantId, name: 'Operations' }).returning({ id: departments.id });
  return made!.id;
}

async function ensureLeaveType(db: Db, tenantId: string): Promise<string> {
  const [found] = await db.select({ id: leaveTypes.id }).from(leaveTypes)
    .where(eq(leaveTypes.tenantId, tenantId)).limit(1);
  if (found) return found.id;
  const [made] = await db.insert(leaveTypes)
    .values({ tenantId, name: 'Casual Leave', code: 'CL', daysPerYear: '12' })
    .returning({ id: leaveTypes.id });
  return made!.id;
}

/** The device user's own employee record. Resolved exactly as GET /hr/me
 *  does — case-insensitive email match OR digit-normalised phone — so the
 *  script's "self" is the same employee the mobile app resolves. Throws when
 *  unlinked: a fabricated row would never match what /hr/me returns. */
async function ensureSelfEmp(db: Db, user: DeviceUser): Promise<string> {
  const phone10 = last10(user.phone);
  const rows = await db.select({ id: employees.id, email: employees.email, phone: employees.phone })
    .from(employees).where(eq(employees.tenantId, user.tenantId));
  const hit = rows.find((r) =>
    (!!r.email && r.email.toLowerCase() === user.email.toLowerCase())
    || (phone10.length === 10 && last10(r.phone) === phone10));
  if (hit) return hit.id;
  throw new Error(
    `"${user.name}" has no linked employee record in this tenant.\n`
    + `  GET /hr/me matches by email (${user.email}) or phone (${user.phone ?? 'none'}) — `
    + 'no employee matched. Link one, then re-run.');
}

/** An earlier phone-only run could have created a duplicate NTEST-SELF
 *  employee (a junk copy of the device user). Flag it for cleanup. */
async function warnStraySelf(db: Db, tenantId: string, selfEmp: string): Promise<void> {
  const [stray] = await db.select({ id: employees.id }).from(employees)
    .where(and(eq(employees.tenantId, tenantId), eq(employees.employeeCode, 'NTEST-SELF')))
    .limit(1);
  if (stray && stray.id !== selfEmp) {
    console.warn(`⚠  Stray NTEST-SELF employee (${stray.id}) from an earlier run — `
      + 'delete it to clear the duplicate directory row.');
  }
}

/** A subordinate reporting to selfEmp — keeps approval screens populated.
 *  DOB / joining are reset to today so the birthday + anniversary nudges fire. */
async function ensureSubEmp(db: Db, tenantId: string, selfEmp: string, deptId: string): Promise<string> {
  const today = new Date();
  const dob = ymd(new Date(1992, today.getMonth(), today.getDate()));
  const joined = ymd(new Date(today.getFullYear() - 3, today.getMonth(), today.getDate()));
  const [found] = await db.select({ id: employees.id }).from(employees)
    .where(eq(employees.employeeCode, 'NTEST-SUB')).limit(1);
  if (found) {
    await db.update(employees).set({ reportingToId: selfEmp, departmentId: deptId,
      dateOfBirth: dob, joiningDate: joined }).where(eq(employees.id, found.id));
    return found.id;
  }
  const [made] = await db.insert(employees).values({
    tenantId, employeeCode: 'NTEST-SUB', firstName: 'Ramesh', lastName: 'Kumar',
    reportingToId: selfEmp, departmentId: deptId, dateOfBirth: dob, joiningDate: joined,
  }).returning({ id: employees.id });
  return made!.id;
}

async function ensurePayrollRun(db: Db, tenantId: string): Promise<string> {
  const [found] = await db.select({ id: payrollRuns.id }).from(payrollRuns)
    .where(eq(payrollRuns.tenantId, tenantId)).limit(1);
  if (found) return found.id;
  const now = new Date();
  const [made] = await db.insert(payrollRuns)
    .values({ tenantId, month: now.getMonth() + 1, year: now.getFullYear(), status: 'draft' })
    .returning({ id: payrollRuns.id });
  return made!.id;
}

async function ensurePerfCycle(db: Db, tenantId: string): Promise<string> {
  const [found] = await db.select({ id: performanceCycles.id }).from(performanceCycles)
    .where(eq(performanceCycles.tenantId, tenantId)).limit(1);
  if (found) return found.id;
  const [made] = await db.insert(performanceCycles).values({
    tenantId, name: 'H1 2026', startDate: ymd(shift(-150)), endDate: ymd(shift(30)),
    status: 'review',
  }).returning({ id: performanceCycles.id });
  return made!.id;
}

// ─── Per-notification row seeders ──────────────────────────────────────────

type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export async function leave(c: SeedCtx, emp: string, status: LeaveStatus): Promise<string> {
  const reviewed = status === 'approved' || status === 'rejected';
  await c.db.insert(leaveRequests).values({
    tenantId: c.tenantId, employeeId: emp, leaveTypeId: c.leaveTypeId,
    fromDate: ymd(shift(4)), toDate: ymd(shift(5)), days: '2', status,
    reason: 'Family function',
    reviewedBy: reviewed ? c.deviceUserId : null,
    reviewedAt: reviewed ? new Date() : null,
    rejectionReason: status === 'rejected' ? 'Coverage not available' : null,
  });
  return `leave_requests · ${status}`;
}

type ExpenseStatus = 'submitted' | 'approved' | 'rejected' | 'reimbursed';
export async function expense(c: SeedCtx, emp: string, status: ExpenseStatus): Promise<SeedResult> {
  const approved = status === 'approved' || status === 'reimbursed';
  const [made] = await c.db.insert(expenseClaims).values({
    tenantId: c.tenantId, claimNumber: `EXP-${rnd()}`, claimantId: c.deviceUserId,
    employeeId: emp, claimDate: ymd(new Date()), totalAmount: '4200', status,
    description: 'Client visit — travel & meals',
    approvedBy: approved ? c.deviceUserId : null,
    approvedAt: approved ? new Date() : null,
    rejectionReason: status === 'rejected' ? 'Missing bill copy' : null,
    reimbursedAt: status === 'reimbursed' ? new Date() : null,
  }).returning({ id: expenseClaims.id });
  // Production (expense-claim.service.ts) deep-links every expense decision
  // to the claim *detail* screen — persona-independent, so it always shows
  // the claim. The list route (/hr/expense-claims → Pay > Expenses) hides
  // own-claims under the manager lens; mirror production instead.
  return {
    label: `expense_claims · ${status}`,
    targetUrl: `/hr/expense-claims/${made!.id}`,
  };
}

type LoanStatus = 'requested' | 'manager_approved' | 'active' | 'rejected' | 'closed';
export async function loan(c: SeedCtx, emp: string, status: LoanStatus): Promise<string> {
  const now = new Date();
  await c.db.insert(employeeLoans).values({
    tenantId: c.tenantId, employeeId: emp, kind: 'personal',
    principal: '50000', emiAmount: '4500', totalInstalments: 12,
    disbursedOn: ymd(now), firstEmiMonth: now.getMonth() + 1, firstEmiYear: now.getFullYear(),
    outstanding: status === 'closed' ? '0' : '50000', status,
    reason: 'Personal need', createdBy: c.deviceUserId,
    rejectionReason: status === 'rejected' ? 'Existing loan still active' : null,
    managerApprovedBy: status === 'manager_approved' ? c.deviceUserId : null,
    managerApprovedAt: status === 'manager_approved' ? now : null,
    approvedBy: status === 'active' ? c.deviceUserId : null,
    approvedAt: status === 'active' ? now : null,
    closedAt: status === 'closed' ? now : null,
  });
  return `employee_loans · ${status}`;
}

type TaxStatus = 'submitted' | 'approved' | 'rejected';
export async function tax(c: SeedCtx, emp: string, status: TaxStatus): Promise<string> {
  await c.db.insert(taxDeclarations).values({
    tenantId: c.tenantId, employeeId: emp, financialYear: '2026-27', status,
    section80c: '150000',
    submittedAt: status === 'submitted' ? new Date() : null,
    reviewedBy: status === 'approved' ? c.deviceUserId : null,
    reviewedAt: status === 'approved' ? new Date() : null,
    rejectionReason: status === 'rejected' ? 'Proof for 80C missing' : null,
  });
  return `tax_declarations · ${status}`;
}

type FnfStatus = 'draft' | 'approved' | 'paid';
export async function fnf(c: SeedCtx, status: FnfStatus): Promise<string> {
  await c.db.insert(fnfSettlements).values({
    tenantId: c.tenantId, employeeId: c.selfEmp, lastWorkingDate: ymd(shift(-2)),
    status, netPayable: '62000', grossEarnings: '62000',
    approvedBy: status !== 'draft' ? c.deviceUserId : null,
    approvedAt: status !== 'draft' ? new Date() : null,
    paidAt: status === 'paid' ? new Date() : null,
  });
  return `fnf_settlements · ${status}`;
}

type TicketStatus = 'open' | 'in_progress' | 'waiting_human' | 'resolved';
export async function ticket(
  c: SeedCtx, emp: string, status: TicketStatus,
  opts: { assignToDevice?: boolean; withComment?: boolean } = {},
): Promise<string> {
  const [row] = await c.db.insert(hrTickets).values({
    tenantId: c.tenantId, ticketNumber: `HR-${rnd()}`, employeeId: emp,
    subject: 'Payslip not visible', description: 'My May payslip is not showing in the app.',
    category: 'payroll', priority: 'high', status,
    assignedTo: opts.assignToDevice ? c.deviceUserId : null,
    resolvedAt: status === 'resolved' ? new Date() : null,
  }).returning({ id: hrTickets.id });
  if (opts.withComment) {
    await c.db.insert(hrTicketComments).values({
      ticketId: row!.id, authorUserId: c.deviceUserId, body: 'We are looking into this.',
    });
  }
  return `hr_tickets · ${status}${opts.withComment ? ' + comment' : ''}`;
}

type ReviewStatus = 'self_submitted' | 'manager_submitted';
export async function review(c: SeedCtx, emp: string, status: ReviewStatus): Promise<string> {
  await c.db.insert(performanceReviews).values({
    tenantId: c.tenantId, cycleId: c.perfCycleId, employeeId: emp,
    managerUserId: c.deviceUserId, status,
    selfComments: 'Met all my goals this cycle.',
    managerComments: status === 'manager_submitted' ? 'Strong performance.' : null,
    selfSubmittedAt: new Date(),
    managerSubmittedAt: status === 'manager_submitted' ? new Date() : null,
  });
  return `performance_reviews · ${status}`;
}

type RegStatus = 'pending' | 'approved' | 'rejected';
export async function regularization(c: SeedCtx, emp: string, status: RegStatus): Promise<string> {
  await c.db.insert(attendanceRegularizations).values({
    tenantId: c.tenantId, employeeId: emp, date: ymd(shift(-1)),
    requestedCheckIn: '09:00:00', requestedCheckOut: '18:00:00', status,
    reason: 'Biometric machine was down',
    reviewedBy: status !== 'pending' ? c.deviceUserId : null,
    reviewedAt: status !== 'pending' ? new Date() : null,
    rejectionReason: status === 'rejected' ? 'No supporting proof' : null,
  });
  return `attendance_regularizations · ${status}`;
}

export async function announcement(c: SeedCtx): Promise<string> {
  await c.db.insert(hrAnnouncements).values({
    tenantId: c.tenantId, title: 'Holiday on 2 June',
    body: 'The factory will remain closed on 2 June for maintenance. Plan your work accordingly.',
    audience: 'all', category: 'general', pinned: true, postedById: c.deviceUserId,
  });
  return 'hr_announcements · pinned';
}

export async function onboarding(c: SeedCtx, emp: string, done: boolean): Promise<string> {
  const [wf] = await c.db.insert(onboardingWorkflows).values({
    tenantId: c.tenantId, employeeId: emp,
    status: done ? 'completed' : 'in_progress',
    startedAt: done ? shift(-10) : new Date(),
    completedAt: done ? new Date() : null,
  }).returning({ id: onboardingWorkflows.id });
  const titles = ['Submit ID proof', 'Sign offer letter', 'Complete induction'];
  await c.db.insert(onboardingItems).values(titles.map((title, i) => ({
    workflowId: wf!.id, sequence: i + 1, title, isCompleted: done,
  })));
  return `onboarding_workflows · ${done ? 'completed' : 'in_progress'} (3 items)`;
}

export async function salaryRevision(c: SeedCtx): Promise<string> {
  await c.db.insert(employeeSalary).values({
    tenantId: c.tenantId, employeeId: c.selfEmp, ctcAnnual: '600000',
    effectiveFrom: ymd(shift(11)),
  });
  return 'employee_salary · new revision';
}

export async function payment(c: SeedCtx): Promise<string> {
  await c.db.insert(employeePayments).values({
    tenantId: c.tenantId, sourceType: 'payroll_run', payrollRunId: c.payrollRunId,
    employeeId: c.selfEmp, paymentDate: ymd(new Date()), amount: '38500',
    status: 'paid', reference: `UTR${rnd()}`, createdBy: c.deviceUserId,
  });
  return 'employee_payments · paid';
}

export async function payslip(c: SeedCtx): Promise<string> {
  await c.db.insert(payslips).values({
    tenantId: c.tenantId, payrollRunId: c.payrollRunId, employeeId: c.selfEmp,
    gross: '45000', totalDeductions: '6500', netPay: '38500',
  }).onConflictDoNothing();
  return 'payslips · for current run';
}

export async function punchIn(c: SeedCtx): Promise<string> {
  const at = new Date(); at.setHours(9, 5, 0, 0);
  await c.db.insert(attendancePunches).values({
    tenantId: c.tenantId, employeeId: c.selfEmp, punchAt: at, kind: 'in',
  });
  return 'attendance_punches · in (no out)';
}
