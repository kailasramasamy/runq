/**
 * Interactive HR-notification tester.
 *
 * Fires each HR notification (Sections 1–12 of docs/hr-notifications-plan.md
 * plus the scheduler reminders) one at a time to a chosen user, so the real
 * inbox row + FCM push can be verified on a device. Before each send it also
 * seeds a real backing row (see hr-notif-seed.ts) so the tapped notification
 * lands on a screen with actionable content, not an empty list.
 *
 * EVERY notification is sent to one target user (the script argument) — the
 * mobile app must be logged in as that same person to receive them. Each
 * notification is tagged with its real-world audience (employee / manager /
 * HR admin) so you know which ones need an HR-admin login to verify the
 * destination screen.
 *
 * Usage (from apps/api):
 *   tsx --env-file=../../.env src/scripts/test-hr-notifications.ts [phone|email]
 *
 * Without an argument it lists users that have a device token registered and
 * lets you pick one. At each step: Enter sends the next, `r` re-sends the
 * last, a number jumps to that notification, `q` quits.
 */
import { createInterface } from 'node:readline/promises';
import { desc, eq, sql } from 'drizzle-orm';
import { createDb, deviceTokens, users } from '@runq/db';
import type { Db } from '@runq/db';
import { NotificationsService } from '../modules/dashboard/notifications.service';
import type { HrNotice } from '../modules/hr/hr-notifier';
import {
  announcement, expense, fnf, leave, loan, onboarding, payment, payslip,
  punchIn, regularization, review, salaryRevision, scaffold, tax, ticket,
} from './hr-notif-seed';
import type { DeviceUser, SeedCtx, SeedResult } from './hr-notif-seed';

/** Who really receives this notification in production. Informational — every
 *  notification is still sent to the single target; this drives the hint. */
type Audience = 'employee' | 'manager' | 'hr';
const AUDIENCE_LABEL: Record<Audience, string> = {
  employee: 'Employee', manager: 'Manager', hr: 'HR admin',
};

interface TestCase {
  section: string;
  label: string;
  audience: Audience;
  notice: HrNotice;
  /** Inserts the backing row(s). Returns a short description, or a
   *  description plus a targetUrl override for row-specific deep links. */
  seed?: (c: SeedCtx) => Promise<SeedResult>;
}

/** The full catalogue. Copy/targetUrls mirror docs/hr-notifications-plan.md. */
function catalogue(c: SeedCtx): TestCase[] {
  const runUrl = `/hr/payroll-runs/${c.payrollRunId}`;
  return [
    // 1. Leave
    { section: '1 Leave', label: 'Request submitted', audience: 'manager',
      seed: (x) => leave(x, x.subEmp, 'pending'),
      notice: { source: 'hr_leave', title: 'New leave request', targetUrl: '/hr/leave-requests',
        body: 'Ramesh Kumar applied for 2 day(s) Casual Leave from 25 May 2026.' } },
    { section: '1 Leave', label: 'Approved', audience: 'employee',
      seed: (x) => leave(x, x.selfEmp, 'approved'),
      notice: { type: 'ok', source: 'hr_leave', title: 'Leave approved', targetUrl: '/hr/leave-requests',
        body: 'Your Casual Leave from 25 May 2026 to 26 May 2026 was approved.' } },
    { section: '1 Leave', label: 'Rejected', audience: 'employee',
      seed: (x) => leave(x, x.selfEmp, 'rejected'),
      notice: { type: 'warn', source: 'hr_leave', title: 'Leave rejected', targetUrl: '/hr/leave-requests',
        body: 'Your Casual Leave request was rejected. Coverage not available.' } },
    { section: '1 Leave', label: 'Approved leave cancelled', audience: 'manager',
      seed: (x) => leave(x, x.subEmp, 'cancelled'),
      notice: { source: 'hr_leave', title: 'Leave cancelled', targetUrl: '/hr/leave-requests',
        body: 'Ramesh Kumar cancelled approved Casual Leave (25 May 2026–26 May 2026).' } },

    // 2. Payroll
    { section: '2 Payroll', label: 'Payslip published', audience: 'employee', seed: payslip,
      notice: { type: 'ok', source: 'hr_payroll', title: 'Payslip ready', targetUrl: '/hr/pay',
        body: 'Your payslip for May 2026 is ready. Net pay ₹38,500.' } },
    { section: '2 Payroll', label: 'Run awaiting approval', audience: 'hr',
      notice: { source: 'hr_payroll', title: 'Payroll needs approval', targetUrl: runUrl,
        body: 'May 2026 payroll run is ready for review — 24 employees.' } },
    { section: '2 Payroll', label: 'Salary structure revised', audience: 'employee', seed: salaryRevision,
      notice: { source: 'hr_payroll', title: 'Salary updated', targetUrl: '/hr/pay',
        body: 'Your salary structure was updated, effective 1 Jun 2026.' } },

    // 3. Employee payments
    { section: '3 Payments', label: 'Payment credited', audience: 'employee', seed: payment,
      notice: { type: 'ok', source: 'hr_payroll', title: 'Payment credited', targetUrl: '/hr/pay',
        body: '₹38,500 has been paid to your account (UTR 2026052112345).' } },

    // 4. Expense claims — targetUrl is set by the seed: production deep-links
    //    each decision to the claim detail screen (/hr/expense-claims/:id),
    //    whose id only exists after seeding.
    { section: '4 Expense', label: 'Claim submitted', audience: 'manager',
      seed: (x) => expense(x, x.subEmp, 'submitted'),
      notice: { source: 'hr_expense', title: 'New expense claim',
        body: 'Ramesh Kumar submitted a claim for ₹4,200.' } },
    { section: '4 Expense', label: 'Claim approved', audience: 'employee',
      seed: (x) => expense(x, x.selfEmp, 'approved'),
      notice: { type: 'ok', source: 'hr_expense', title: 'Expense claim approved',
        body: 'Your claim EXP-0042 for ₹4,200 was approved.' } },
    { section: '4 Expense', label: 'Claim rejected', audience: 'employee',
      seed: (x) => expense(x, x.selfEmp, 'rejected'),
      notice: { type: 'warn', source: 'hr_expense', title: 'Expense claim rejected',
        body: 'Your claim EXP-0042 was rejected. Missing bill copy.' } },
    { section: '4 Expense', label: 'Claim reimbursed', audience: 'employee',
      seed: (x) => expense(x, x.selfEmp, 'reimbursed'),
      notice: { type: 'ok', source: 'hr_expense', title: 'Expense reimbursed',
        body: '₹4,200 for claim EXP-0042 has been reimbursed.' } },

    // 5. Loans
    { section: '5 Loans', label: 'Request submitted', audience: 'manager',
      seed: (x) => loan(x, x.subEmp, 'requested'),
      notice: { source: 'hr_loan', title: 'New loan request', targetUrl: '/hr/loans',
        body: 'Ramesh Kumar requested a personal loan of ₹50,000.' } },
    { section: '5 Loans', label: 'Manager-approved', audience: 'hr',
      seed: (x) => loan(x, x.subEmp, 'manager_approved'),
      notice: { source: 'hr_loan', title: 'Loan needs HR approval', targetUrl: '/hr/loans',
        body: "Ramesh Kumar's personal loan (₹50,000) was approved by their manager." } },
    { section: '5 Loans', label: 'Approved / disbursed', audience: 'employee',
      seed: (x) => loan(x, x.selfEmp, 'active'),
      notice: { type: 'ok', source: 'hr_loan', title: 'Loan approved', targetUrl: '/hr/loans',
        body: 'Your personal loan of ₹50,000 is approved. EMI ₹4,500.' } },
    { section: '5 Loans', label: 'Rejected', audience: 'employee',
      seed: (x) => loan(x, x.selfEmp, 'rejected'),
      notice: { type: 'warn', source: 'hr_loan', title: 'Loan request rejected', targetUrl: '/hr/loans',
        body: 'Your personal loan request was rejected. Existing loan still active.' } },
    { section: '5 Loans', label: 'Closed', audience: 'employee',
      seed: (x) => loan(x, x.selfEmp, 'closed'),
      notice: { type: 'ok', source: 'hr_loan', title: 'Loan closed', targetUrl: '/hr/loans',
        body: 'Your personal loan has been fully repaid and closed.' } },

    // 6. Tax declarations
    { section: '6 Tax', label: 'Declaration submitted', audience: 'hr',
      seed: (x) => tax(x, x.subEmp, 'submitted'),
      notice: { source: 'hr_tax', title: 'Tax declaration to review', targetUrl: '/hr/tax-declarations',
        body: 'Ramesh Kumar submitted their 2026-27 Form 12BB.' } },
    { section: '6 Tax', label: 'Declaration approved', audience: 'employee',
      seed: (x) => tax(x, x.selfEmp, 'approved'),
      notice: { type: 'ok', source: 'hr_tax', title: 'Tax declaration approved',
        targetUrl: '/hr/tax-declarations', body: 'Your 2026-27 tax declaration was approved.' } },
    { section: '6 Tax', label: 'Declaration rejected', audience: 'employee',
      seed: (x) => tax(x, x.selfEmp, 'rejected'),
      notice: { type: 'warn', source: 'hr_tax', title: 'Tax declaration rejected',
        targetUrl: '/hr/tax-declarations', body: 'Your 2026-27 declaration was rejected. Proof for 80C missing.' } },

    // 7. Full & Final
    { section: '7 FnF', label: 'Settlement started', audience: 'employee', seed: (x) => fnf(x, 'draft'),
      notice: { source: 'hr_lifecycle', title: 'Final settlement started', targetUrl: '/hr/fnf',
        body: 'Your full & final settlement is being processed.' } },
    { section: '7 FnF', label: 'Settlement approved', audience: 'employee', seed: (x) => fnf(x, 'approved'),
      notice: { type: 'ok', source: 'hr_lifecycle', title: 'Final settlement approved', targetUrl: '/hr/fnf',
        body: 'Your full & final settlement of ₹62,000 was approved.' } },
    { section: '7 FnF', label: 'Settlement paid', audience: 'employee', seed: (x) => fnf(x, 'paid'),
      notice: { type: 'ok', source: 'hr_lifecycle', title: 'Final settlement paid', targetUrl: '/hr/fnf',
        body: 'Your full & final settlement of ₹62,000 has been paid.' } },

    // 8. Helpdesk
    { section: '8 Helpdesk', label: 'Ticket created', audience: 'hr',
      seed: (x) => ticket(x, x.subEmp, 'open'),
      notice: { source: 'hr_helpdesk', title: 'New HR ticket', targetUrl: '/hr/helpdesk',
        body: 'HR-0021: Payslip not visible (Payroll, high).' } },
    { section: '8 Helpdesk', label: 'Ticket assigned', audience: 'hr',
      seed: (x) => ticket(x, x.subEmp, 'open', { assignToDevice: true }),
      notice: { source: 'hr_helpdesk', title: 'Ticket assigned to you', targetUrl: '/hr/helpdesk',
        body: 'HR-0021: Payslip not visible.' } },
    { section: '8 Helpdesk', label: 'New comment', audience: 'employee',
      seed: (x) => ticket(x, x.selfEmp, 'in_progress', { withComment: true }),
      notice: { source: 'hr_helpdesk', title: 'New reply on your ticket', targetUrl: '/hr/helpdesk',
        body: 'HR-0021: Payslip not visible.' } },
    { section: '8 Helpdesk', label: 'Ticket resolved', audience: 'employee',
      seed: (x) => ticket(x, x.selfEmp, 'resolved'),
      notice: { type: 'ok', source: 'hr_helpdesk', title: 'Ticket resolved', targetUrl: '/hr/helpdesk',
        body: 'Your ticket HR-0021 has been marked resolved.' } },
    { section: '8 Helpdesk', label: 'Ticket escalated', audience: 'hr',
      seed: (x) => ticket(x, x.subEmp, 'waiting_human'),
      notice: { type: 'warn', source: 'hr_helpdesk', title: 'Ticket escalated', targetUrl: '/hr/helpdesk',
        body: 'HR-0021: Payslip not visible needs a human response.' } },

    // 9. Performance
    { section: '9 Performance', label: 'Self-review submitted', audience: 'manager',
      seed: (x) => review(x, x.subEmp, 'self_submitted'),
      notice: { source: 'hr_performance', title: 'Self-review submitted', targetUrl: '/hr/performance',
        body: 'Ramesh Kumar submitted their self-review for H1 2026.' } },
    { section: '9 Performance', label: 'Manager review submitted', audience: 'employee',
      seed: (x) => review(x, x.selfEmp, 'manager_submitted'),
      notice: { source: 'hr_performance', title: 'Manager review submitted', targetUrl: '/hr/performance',
        body: 'Your manager submitted your H1 2026 review.' } },

    // 10. Attendance
    { section: '10 Attendance', label: 'Regularisation submitted', audience: 'manager',
      seed: (x) => regularization(x, x.subEmp, 'pending'),
      notice: { source: 'hr_attendance', title: 'Attendance regularisation',
        targetUrl: '/hr/regularizations', body: 'Ramesh Kumar requested a correction for 20 May 2026.' } },
    { section: '10 Attendance', label: 'Regularisation approved', audience: 'employee',
      seed: (x) => regularization(x, x.selfEmp, 'approved'),
      notice: { type: 'ok', source: 'hr_attendance', title: 'Regularisation approved',
        targetUrl: '/hr/regularizations', body: 'Your attendance correction for 20 May 2026 was approved.' } },
    { section: '10 Attendance', label: 'Regularisation rejected', audience: 'employee',
      seed: (x) => regularization(x, x.selfEmp, 'rejected'),
      notice: { type: 'warn', source: 'hr_attendance', title: 'Regularisation rejected',
        targetUrl: '/hr/regularizations',
        body: 'Your attendance correction for 20 May 2026 was rejected. No supporting proof.' } },
    { section: '10 Attendance', label: 'Biometric import errors', audience: 'hr',
      notice: { type: 'warn', source: 'hr_attendance', title: 'Attendance import had errors',
        targetUrl: '/hr/attendance-punches', body: '12 of 240 rows failed to import.' } },

    // 11. Announcements
    { section: '11 Announcement', label: 'Announcement posted (pinned)', audience: 'employee',
      seed: announcement,
      notice: { type: 'warn', source: 'hr_announcement', title: '📢 Holiday on 2 June',
        targetUrl: '/hr/announcements',
        body: 'The factory will remain closed on 2 June for maintenance. Plan your work accordingly.' } },

    // 12. Onboarding
    { section: '12 Onboarding', label: 'Onboarding started', audience: 'employee',
      seed: (x) => onboarding(x, x.selfEmp, false),
      notice: { source: 'hr_onboarding', title: 'Welcome aboard', targetUrl: '/hr/onboarding',
        body: 'Your onboarding checklist is ready — 8 items to complete.' } },
    { section: '12 Onboarding', label: 'Onboarding completed', audience: 'hr',
      seed: (x) => onboarding(x, x.subEmp, true),
      notice: { type: 'ok', source: 'hr_onboarding', title: 'Onboarding complete',
        targetUrl: '/hr/onboarding', body: 'Ramesh Kumar finished their onboarding checklist.' } },

    // Tier 3 — scheduler reminders
    { section: 'T3 Scheduler', label: 'Missed punch-out', audience: 'employee', seed: punchIn,
      notice: { type: 'warn', source: 'hr_attendance', title: 'You forgot to check out',
        targetUrl: '/hr/attendance-punches',
        body: 'You checked in today but never checked out. Open the app to fix your attendance.' } },
    { section: 'T3 Scheduler', label: 'Payroll unapproved', audience: 'hr',
      notice: { type: 'warn', source: 'hr_payroll', title: 'Payroll awaiting approval', targetUrl: runUrl,
        body: 'The April 2026 payroll run is still draft. Review and approve it.' } },
    { section: 'T3 Scheduler', label: 'Statutory dues pending', audience: 'hr',
      notice: { type: 'warn', source: 'hr_payroll', title: 'Statutory dues pending',
        targetUrl: '/hr/tds-challans',
        body: 'PF, ESI for April 2026 are not yet deposited. The 15th is the deadline.' } },
    { section: 'T3 Scheduler', label: 'Tax-declaration window', audience: 'employee',
      notice: { source: 'hr_tax', title: 'Submit your tax declaration', targetUrl: '/hr/tax-declarations',
        body: 'Declare your investments for FY 2026-27 (Form 12BB) so your TDS is calculated correctly.' } },
    { section: 'T3 Scheduler', label: 'Onboarding overdue', audience: 'employee',
      notice: { type: 'warn', source: 'hr_onboarding', title: 'Finish your onboarding',
        targetUrl: '/hr/onboarding',
        body: 'Some onboarding tasks are still pending. Open HR → Onboarding to complete them.' } },
    { section: 'T3 Scheduler', label: 'Birthday', audience: 'employee',
      notice: { type: 'ok', source: 'hr_announcement', title: '🎉 Birthday today',
        targetUrl: '/hr/directory', body: 'Wish Ramesh Kumar a happy birthday!' } },
    { section: 'T3 Scheduler', label: 'Work anniversary', audience: 'employee',
      notice: { type: 'ok', source: 'hr_announcement', title: '🎊 Work anniversary',
        targetUrl: '/hr/directory', body: 'Ramesh Kumar completes 3 years at work today!' } },
  ];
}

interface TargetUser extends DeviceUser { email: string; role: string; devices: number; }

const ADMIN_ROLES = ['owner', 'accountant', 'hr'];

/** Resolve the user to notify — by phone/email argument, or interactive pick.
 *  Every notification is sent to this one user; the app must be logged in as
 *  them to receive anything. */
async function resolveTarget(db: Db, rl: ReturnType<typeof createInterface>): Promise<TargetUser> {
  const arg = process.argv[2]?.trim();
  if (arg) {
    const digits = arg.replace(/\D/g, '');
    const rows = await db.select().from(users).where(eq(users.isActive, true));
    const hit = rows.find((u) =>
      (u.email.toLowerCase() === arg.toLowerCase())
      || (digits.length >= 10 && (u.phone ?? '').replace(/\D/g, '').endsWith(digits.slice(-10))));
    if (!hit) throw new Error(`No active user matches "${arg}"`);
    return { id: hit.id, tenantId: hit.tenantId, name: hit.name, phone: hit.phone,
      email: hit.email, role: hit.role, devices: await deviceCount(db, hit.id) };
  }

  const rows = await db
    .select({ id: users.id, tenantId: users.tenantId, name: users.name,
      phone: users.phone, email: users.email, role: users.role })
    .from(users).where(eq(users.isActive, true)).orderBy(desc(users.createdAt)).limit(40);
  const withDevices: TargetUser[] = [];
  for (const r of rows) {
    const devices = await deviceCount(db, r.id);
    if (devices > 0) withDevices.push({ ...r, devices });
  }
  if (withDevices.length === 0) throw new Error('No users have a device token — log in on the app first.');

  console.log('\nUsers with a registered device:');
  withDevices.forEach((u, i) =>
    console.log(`  ${i + 1}. ${u.name} <${u.email}> · ${u.phone ?? 'no phone'} — ${u.devices} device(s)`));
  const pick = Number(await rl.question('\nPick a user number: '));
  const chosen = withDevices[pick - 1];
  if (!chosen) throw new Error('Invalid selection');
  return chosen;
}

async function deviceCount(db: Db, userId: string): Promise<number> {
  const rows = await db.select({ t: deviceTokens.token }).from(deviceTokens)
    .where(eq(deviceTokens.userId, userId));
  return rows.length;
}

interface SuggestedLogin { name: string; phone: string; }

/** A phone-enabled HR-admin account — the login that can open the admin-only
 *  payroll-run screen. Null when no owner/accountant/hr user has a phone. */
async function resolveHrLogin(db: Db, tenantId: string): Promise<SuggestedLogin | null> {
  const res = await db.execute(sql`
    SELECT u.name, u.phone FROM users u
    WHERE u.tenant_id = ${tenantId} AND u.is_active = true
      AND u.role IN ('owner', 'accountant', 'hr') AND coalesce(u.phone, '') <> ''
    ORDER BY u.role LIMIT 1`);
  const rows = (res as unknown as { rows: Array<{ name: string; phone: string }> }).rows;
  return rows[0] ? { name: rows[0].name, phone: rows[0].phone } : null;
}

/** Seed the backing row (if any), then create the in-app + push notification. */
async function fire(c: SeedCtx, svc: NotificationsService, tc: TestCase): Promise<void> {
  if (tc.seed) {
    const made = await tc.seed(c);
    // A seed may override the catalogue's targetUrl when the real deep link
    // is row-specific (the row only exists after seeding).
    if (typeof made === 'string') {
      console.log(`   ↳ seeded: ${made}`);
    } else {
      tc.notice.targetUrl = made.targetUrl;
      console.log(`   ↳ seeded: ${made.label}`);
    }
  } else {
    console.log('   ↳ no backing row (transient / uses scaffolded data)');
  }
  await svc.create(tc.notice);
  console.log(`   ✔ sent · ${tc.notice.type ?? 'info'} · ${tc.notice.source} · "${tc.notice.title}"`);
  console.log(`     ${tc.notice.body}`);
  console.log(`     → ${tc.notice.targetUrl}\n`);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required (run with --env-file)');
  const { db, pool } = createDb(process.env.DATABASE_URL);
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const target = await resolveTarget(db, rl);
    const targetIsAdmin = ADMIN_ROLES.includes(target.role);
    console.log(`\n═══ Every notification is sent to: ${target.name} `
      + `(${target.phone ?? 'no phone'}) · role ${target.role} ═══`);
    console.log('📱 Log into the mobile app as THIS person (OTP 123456) — that device receives them.');
    if (target.devices === 0) {
      console.log('⚠  No device token yet — open the app and log in as them, then re-run.');
    }

    console.log('\nScaffolding test employees + reference data…');
    const ctx = await scaffold(db, target);
    console.log(`  selfEmp ${ctx.selfEmp}\n  subEmp  ${ctx.subEmp} (reports to selfEmp)`);

    const cases = catalogue(ctx);
    const hrCount = cases.filter((c) => c.audience === 'hr').length;
    if (!targetIsAdmin && hrCount > 0) {
      const hr = await resolveHrLogin(db, target.tenantId);
      console.log(`\n${target.name} is a non-admin login — ${hrCount} notifications are HR-admin-`);
      console.log("targeted. They still arrive here, but the payroll-run screen (#6, #39) needs");
      console.log('an admin login to open.'
        + (hr ? ` For those, re-run targeting: ${hr.name} (${hr.phone})` : ''));
    }
    console.log(`\n${cases.length} notifications queued. Enter = send next · r = re-send · `
      + 'N = jump to #N · q = quit\n');

    const svc = new NotificationsService(db, target.tenantId, target.id);
    let i = 0;
    while (i < cases.length) {
      const c = cases[i]!;
      const warn = c.audience === 'hr' && !targetIsAdmin ? '  ⚠ admin-targeted' : '';
      const ans = (await rl.question(
        `[${i + 1}/${cases.length}] ${c.section} — ${c.label}`
        + `  · real recipient: ${AUDIENCE_LABEL[c.audience]}${warn}\n▶ `)).trim().toLowerCase();
      if (ans === 'q') break;
      if (ans === 'r') { i = Math.max(0, i - 1); continue; }
      if (/^\d+$/.test(ans)) { i = Math.min(cases.length, Math.max(1, Number(ans))) - 1; continue; }

      await fire(ctx, svc, c);
      i++;
    }
    console.log('\nDone.');
  } finally {
    rl.close();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n✖', err instanceof Error ? err.message : err);
  process.exit(1);
});
