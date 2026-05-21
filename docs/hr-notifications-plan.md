# HR Module — Push Notifications Plan & Tracker

Deep integration of FCM push + in-app notifications across the HR & Payroll
module. Builds on the existing infra (`NotificationsService.create`,
`sendPushToUser`, `device_tokens`).

## Status — implemented 2026-05-21

All event-driven triggers (Sections 1–12) and all six Tier-3 scheduler
reminders are wired and the API typechecks clean. Two items are deferred:

- **Loan closed** notification — the `POST /loans/:id/close` endpoint does not
  exist yet; wire when it is built.
- Mobile has no Full & Final screen — `/hr/fnf` deep-links fall back to
  `/hr/more`; `/hr/tds-challans` and `/hr/directory` deep-links from the
  scheduler are not yet mapped.

## Architecture

All HR notifications go through **`HrNotifier`**
(`apps/api/src/modules/hr/hr-notifier.ts`). HR entities reference `employees`;
notifications target `users`. `HrNotifier` resolves the link (phone-match,
email fallback) so route handlers never re-implement the join.

```ts
const notifier = new HrNotifier(req.server.db, req.tenantId);

await notifier.notifyEmployee(employeeId, notice);          // the subject
await notifier.notifyEmployees([id1, id2], notice);         // fan-out
await notifier.notifyManagerOf(employeeId, notice);         // manager (HR fallback)
await notifier.notifyHrAdmins(notice);                      // owner/accountant/hr
await notifier.notifyUser(userId, notice);                  // known user id
await notifier.notifyAudience({ departmentId, audience }, notice); // announcements
```

`notice` = `{ type?: 'info'|'ok'|'warn', source, title, body?, targetUrl? }`.

**Rules for implementers**
- Notifications are best-effort side effects. Wrap each `notifier.*` call so a
  failure never fails the request: `.catch((e) => req.log.error(e))` or a
  narrow try/catch around the block. Never block the response on push.
- Fire the notification **after** the DB transaction commits / the row is
  returned — never on a path that may still roll back.
- Resolve the actor's own `userId` (`req.user!.userId`) and pass it as
  `exclude` on fan-out / admin sends so people don't get pinged for their own
  action.
- Keep copy short: title ≤ 6 words, body one sentence. Indian SME factory
  audience — plain language, no jargon.
- `targetUrl` uses web-style `/hr/...` paths; the mobile app maps them.

## Source tags → mobile icon

| source | meaning |
|---|---|
| `hr_leave` | leave requests/approvals |
| `hr_payroll` | payslips, salary, payroll runs |
| `hr_attendance` | attendance, regularisation, biometric |
| `hr_expense` | expense claims / reimbursements |
| `hr_loan` | employee loans / advances |
| `hr_tax` | Form 12BB tax declarations |
| `hr_helpdesk` | HR tickets |
| `hr_announcement` | company announcements |
| `hr_onboarding` | onboarding workflows |
| `hr_lifecycle` | full & final settlement |
| `hr_performance` | goals & reviews (already wired) |

---

## Scenario spec

Status: `[ ]` todo · `[x]` done. `type` defaults to `info` when unstated.

### 1. Leave — `leave.routes.ts` / `leave-request.service.ts`

- [ ] **Leave request submitted** (`POST /leave-requests`)
  → `notifyManagerOf(employeeId)` ·
  title `New leave request` ·
  body `{EmployeeName} applied for {days} day(s) {leaveTypeName} from {fromDate}.` ·
  targetUrl `/hr/leave-requests` · source `hr_leave`
- [ ] **Leave approved** (`POST /leave-requests/:id/approve`)
  → `notifyEmployee` · type `ok` ·
  title `Leave approved` ·
  body `Your {leaveTypeName} from {fromDate} to {toDate} was approved.` ·
  targetUrl `/hr/leave-requests` · source `hr_leave`
- [ ] **Leave rejected** (`POST /leave-requests/:id/reject`)
  → `notifyEmployee` · type `warn` ·
  title `Leave rejected` ·
  body `Your {leaveTypeName} request was rejected. {rejectionReason}` ·
  targetUrl `/hr/leave-requests` · source `hr_leave`
- [ ] **Approved leave cancelled** (`PUT /leave-requests/:id` → cancelled, was approved)
  → `notifyManagerOf` ·
  title `Leave cancelled` ·
  body `{EmployeeName} cancelled approved {leaveTypeName} ({fromDate}–{toDate}).` ·
  targetUrl `/hr/leave-requests` · source `hr_leave`

### 2. Payroll — `payroll.routes.ts`, `payroll/employee-salary.service.ts`

- [ ] **Payslip published** (`POST /payroll-runs/:id/finalize` — per payslip)
  → `notifyEmployees(allEmployeeIdsInRun)` · type `ok` ·
  title `Payslip ready` ·
  body `Your payslip for {Month Year} is ready. Net pay ₹{netPay}.` ·
  targetUrl `/hr/payroll-runs/{runId}` · source `hr_payroll`
- [ ] **Payroll run awaiting approval** (`POST /payroll-runs` created / on processed)
  → `notifyHrAdmins(exclude=actor)` ·
  title `Payroll needs approval` ·
  body `{Month Year} payroll run is ready for review — {totalEmployees} employees.` ·
  targetUrl `/hr/payroll-runs/{runId}` · source `hr_payroll`
- [ ] **Salary structure assigned / revised** (`POST /employee-salaries`)
  → `notifyEmployee` ·
  title `Salary updated` ·
  body `Your salary structure was updated, effective {effectiveFrom}.` ·
  targetUrl `/hr/pay` · source `hr_payroll`

### 3. Employee payments — `payroll/employee-payment.routes.ts`

- [ ] **Salary / payment credited** (`POST /employee-payments/:id/pay`)
  → `notifyEmployee` · type `ok` ·
  title `Payment credited` ·
  body `₹{amount} has been paid to your account ({reference}).` ·
  targetUrl `/hr/pay` · source `hr_payroll`

### 4. Expense claims — `expense-claim.routes.ts` / `expense-claim.service.ts`

- [ ] **Claim submitted** (`POST /expense-claims/:id/submit`)
  → `notifyManagerOf(claimEmployeeId)` ·
  title `New expense claim` ·
  body `{ClaimantName} submitted a claim for ₹{totalAmount}.` ·
  targetUrl `/hr/expense-claims` · source `hr_expense`
- [ ] **Claim approved** (`POST /expense-claims/:id/approve`)
  → `notifyEmployee` · type `ok` ·
  title `Expense claim approved` ·
  body `Your claim {claimNumber} for ₹{totalAmount} was approved.` ·
  targetUrl `/hr/expense-claims` · source `hr_expense`
- [ ] **Claim rejected** (`POST /expense-claims/:id/reject`)
  → `notifyEmployee` · type `warn` ·
  title `Expense claim rejected` ·
  body `Your claim {claimNumber} was rejected. {rejectionReason}` ·
  targetUrl `/hr/expense-claims` · source `hr_expense`
- [ ] **Claim reimbursed** (status → reimbursed, or paid via employee-payment with sourceType expense_claim)
  → `notifyEmployee` · type `ok` ·
  title `Expense reimbursed` ·
  body `₹{totalAmount} for claim {claimNumber} has been reimbursed.` ·
  targetUrl `/hr/expense-claims` · source `hr_expense`

### 5. Loans — `phase-next/tax-loans.routes.ts`

- [ ] **Loan request submitted** (`POST /loans/:id/request`)
  → `notifyManagerOf(employeeId)` ·
  title `New loan request` ·
  body `{EmployeeName} requested a {kind} loan of ₹{principal}.` ·
  targetUrl `/hr/loans` · source `hr_loan`
- [ ] **Loan manager-approved** (`POST /loans/:id/manager-approve`)
  → `notifyHrAdmins` ·
  title `Loan needs HR approval` ·
  body `{EmployeeName}'s {kind} loan (₹{principal}) was approved by their manager.` ·
  targetUrl `/hr/loans` · source `hr_loan`
- [ ] **Loan approved / disbursed** (`POST /loans/:id/approve`)
  → `notifyEmployee` · type `ok` ·
  title `Loan approved` ·
  body `Your {kind} loan of ₹{principal} is approved. EMI ₹{emiAmount}.` ·
  targetUrl `/hr/loans` · source `hr_loan`
- [ ] **Loan rejected** (`POST /loans/:id/reject`)
  → `notifyEmployee` · type `warn` ·
  title `Loan request rejected` ·
  body `Your {kind} loan request was rejected. {rejectionReason}` ·
  targetUrl `/hr/loans` · source `hr_loan`
- [ ] **Loan closed** (`POST /loans/:id/close`)
  → `notifyEmployee` · type `ok` ·
  title `Loan closed` ·
  body `Your {kind} loan has been fully repaid and closed.` ·
  targetUrl `/hr/loans` · source `hr_loan`

### 6. Tax declarations (Form 12BB) — `phase-next/tax-loans.routes.ts`

- [ ] **Declaration submitted** (`POST /tax-declarations/:id/submit`)
  → `notifyHrAdmins` ·
  title `Tax declaration to review` ·
  body `{EmployeeName} submitted their {financialYear} Form 12BB.` ·
  targetUrl `/hr/tax-declarations` · source `hr_tax`
- [ ] **Declaration approved** (`POST /tax-declarations/:id/approve`)
  → `notifyEmployee` · type `ok` ·
  title `Tax declaration approved` ·
  body `Your {financialYear} tax declaration was approved.` ·
  targetUrl `/hr/tax-declarations` · source `hr_tax`
- [ ] **Declaration rejected** (`POST /tax-declarations/:id/reject`)
  → `notifyEmployee` · type `warn` ·
  title `Tax declaration rejected` ·
  body `Your {financialYear} declaration was rejected. {rejectionReason}` ·
  targetUrl `/hr/tax-declarations` · source `hr_tax`

### 7. Full & Final settlement — `phase-next/lifecycle.routes.ts`

- [ ] **FnF created** (`POST /fnf-settlements`)
  → `notifyEmployee` ·
  title `Final settlement started` ·
  body `Your full & final settlement is being processed.` ·
  targetUrl `/hr/fnf` · source `hr_lifecycle`
- [ ] **FnF approved** (`POST /fnf-settlements/:id/approve`)
  → `notifyEmployee` · type `ok` ·
  title `Final settlement approved` ·
  body `Your full & final settlement of ₹{netPayable} was approved.` ·
  targetUrl `/hr/fnf` · source `hr_lifecycle`
- [ ] **FnF paid** (`POST /fnf-settlements/:id/pay`)
  → `notifyEmployee` · type `ok` ·
  title `Final settlement paid` ·
  body `Your full & final settlement of ₹{netPayable} has been paid.` ·
  targetUrl `/hr/fnf` · source `hr_lifecycle`

### 8. Helpdesk — `phase-next/helpdesk-performance.routes.ts`

- [ ] **Ticket created** (`POST /hr-tickets`)
  → `notifyHrAdmins(exclude=actor)` ·
  title `New HR ticket` ·
  body `{ticketNumber}: {subject} ({category}, {priority}).` ·
  targetUrl `/hr/helpdesk` · source `hr_helpdesk`
- [ ] **Ticket assigned** (`PUT /hr-tickets/:id` — assignedTo changed)
  → `notifyUser(assignedTo)` ·
  title `Ticket assigned to you` ·
  body `{ticketNumber}: {subject}.` ·
  targetUrl `/hr/helpdesk` · source `hr_helpdesk`
- [ ] **New comment on ticket** (`POST /hr-tickets/:id/comments`)
  → notify the *other* party — if author is the employee, `notifyHrAdmins`
  (or assignee); if author is HR/agent, `notifyEmployee(ticket.employeeId)`.
  Skip when the comment is an internal agent draft (`draftedBy` set, not posted).
  title `New reply on your ticket` ·
  body `{ticketNumber}: {subject}.` ·
  targetUrl `/hr/helpdesk` · source `hr_helpdesk`
- [ ] **Ticket resolved** (`PUT /hr-tickets/:id` — status → resolved)
  → `notifyEmployee(ticket.employeeId)` · type `ok` ·
  title `Ticket resolved` ·
  body `Your ticket {ticketNumber} has been marked resolved.` ·
  targetUrl `/hr/helpdesk` · source `hr_helpdesk`
- [ ] **Ticket escalated to human** (`POST /hr-tickets/:id/escalate`)
  → `notifyHrAdmins` · type `warn` ·
  title `Ticket escalated` ·
  body `{ticketNumber}: {subject} needs a human response.` ·
  targetUrl `/hr/helpdesk` · source `hr_helpdesk`

### 9. Performance — `phase-next/helpdesk-performance.routes.ts`

(Goals bulk-publish & review finalise already wired — leave them.)

- [ ] **Self-review submitted** (`PUT /performance/reviews/:id/self-submit`)
  → `notifyUser(review.managerUserId)` ·
  title `Self-review submitted` ·
  body `{EmployeeName} submitted their self-review for {cycleName}.` ·
  targetUrl `/hr/performance` · source `hr_performance`
- [ ] **Manager review submitted** (`PUT /performance/reviews/:id/manager-submit`)
  → `notifyEmployee(review.employeeId)` ·
  title `Manager review submitted` ·
  body `Your manager submitted your {cycleName} review.` ·
  targetUrl `/hr/performance` · source `hr_performance`

### 10. Attendance — `attendance.routes.ts`, `phase-next/geo-attendance.routes.ts`

- [ ] **Regularisation submitted** (regularisation create endpoint)
  → `notifyManagerOf(employeeId)` ·
  title `Attendance regularisation` ·
  body `{EmployeeName} requested a correction for {date}.` ·
  targetUrl `/hr/regularizations` · source `hr_attendance`
- [ ] **Regularisation approved** → `notifyEmployee` · type `ok` ·
  title `Regularisation approved` ·
  body `Your attendance correction for {date} was approved.` ·
  targetUrl `/hr/regularizations` · source `hr_attendance`
- [ ] **Regularisation rejected** → `notifyEmployee` · type `warn` ·
  title `Regularisation rejected` ·
  body `Your attendance correction for {date} was rejected. {reason}` ·
  targetUrl `/hr/regularizations` · source `hr_attendance`
- [ ] **Biometric import finished with errors** (`POST /attendance/biometric-import`)
  → `notifyUser(importedBy)` · type `warn` ·
  title `Attendance import had errors` ·
  body `{errorCount} of {totalRecords} rows failed to import.` ·
  targetUrl `/hr/attendance-punches` · source `hr_attendance`

### 11. Announcements — `announcement.routes.ts`

- [ ] **Announcement posted** (`POST /announcements`)
  → `notifyAudience({ departmentId, audience }, …, exclude=actor)` ·
  type `warn` if `pinned` else `info` ·
  title `📢 {announcementTitle}` ·
  body first ~140 chars of body ·
  targetUrl `/hr/announcements` · source `hr_announcement`

### 12. Onboarding — onboarding routes (`onboarding.routes.ts` or under `routes.ts`)

- [ ] **Onboarding started** (`POST /onboarding-workflows`)
  → `notifyEmployee(employeeId)` ·
  title `Welcome aboard` ·
  body `Your onboarding checklist is ready — {itemCount} items to complete.` ·
  targetUrl `/hr/onboarding` · source `hr_onboarding`
- [ ] **Onboarding completed** (last item complete → workflow completed)
  → `notifyHrAdmins` · type `ok` ·
  title `Onboarding complete` ·
  body `{EmployeeName} finished their onboarding checklist.` ·
  targetUrl `/hr/onboarding` · source `hr_onboarding`

---

## Tier 3 — Scheduler reminders

New file `apps/api/src/scheduler/hr-reminder-scheduler.ts`, registered in
`apps/api/src/index.ts`. Daily ticks; mirror `performance-reminder-scheduler.ts`.

- [ ] **Missed punch-out** — 20:00 IST. Employees with an `in` punch today and
  no `out`. → `notifyEmployee` · type `warn` · `hr_attendance`.
- [ ] **Payroll run unapproved** — 09:00 IST. `payroll_runs` in `draft`/`processed`
  older than 2 days. → `notifyHrAdmins` · type `warn` · `hr_payroll`.
- [ ] **Statutory deadline** — 09:00 IST on the 10th–15th. PF/ESI/PT/TDS challans
  `pending` for last month. → `notifyHrAdmins` · type `warn` · `hr_payroll`.
- [ ] **Tax-declaration window** — 09:00 IST once in April. Active employees with
  no submitted 12BB for the new FY. → `notifyEmployee` · `hr_tax`.
- [ ] **Onboarding item overdue** — 09:00 IST. `onboarding_items` past
  `joiningDate + dueDays`, not completed. → `notifyEmployee` · type `warn` ·
  `hr_onboarding`.
- [ ] **Birthday / work anniversary** — 09:00 IST. `dateOfBirth` / `joiningDate`
  month-day matches today. → `notifyEmployees(deptColleagues)` · type `ok` ·
  `hr_announcement`.

---

## Mobile

- [ ] `apps/mobile/lib/screens/notifications_screen.dart` — add icon + accent
  colour cases for the new sources (`hr_expense`, `hr_loan`, `hr_tax`,
  `hr_attendance`, `hr_announcement`, `hr_onboarding`, `hr_lifecycle`).
- [ ] Verify notification-tap deep-links resolve the `/hr/...` targetUrls to the
  right HR screen.
