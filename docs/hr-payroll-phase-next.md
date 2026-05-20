# HR & Payroll — Competitive Gap Analysis & Phase-Next Plan

Date: 2026-05-18
Status: design + implementation

## 1. Competitive landscape

| Capability area | Keka | Zoho People + Payroll | GreytHR | Tally + manual | runq (today) |
|---|---|---|---|---|---|
| Employee master, departments, designations | ✓ | ✓ | ✓ | partial | ✓ |
| Shift + holiday + leave | ✓ | ✓ | ✓ | – | ✓ |
| Attendance: biometric / CSV | ✓ | ✓ | ✓ | – | ✓ (CSV) |
| Mobile geo-fenced check-in + selfie | ✓ | ✓ | ✓ | – | ✓ *(shipped)* |
| Attendance regularisation | ✓ | ✓ | ✓ | – | ✓ *(shipped)* |
| Payroll engine + PF/ESI/PT/TDS | ✓ | ✓ | ✓ | manual | ✓ |
| Salary structures, components, payslip PDF | ✓ | ✓ | ✓ | – | ✓ |
| Bank disbursement files | ✓ | ✓ | ✓ | – | ✓ |
| Investment declarations (Form 12BB) | ✓ | ✓ | ✓ | – | ✓ *(shipped)* |
| Loans & advances (payroll-linked) | ✓ | ✓ | ✓ | – | ✓ *(shipped — payroll auto-deduct: Phase 2)* |
| Full & Final Settlement (FNF) | ✓ | ✓ | ✓ | manual | ✓ *(shipped — JE post: Phase 2)* |
| Employee onboarding workflow | ✓ | ✓ | partial | – | ✓ *(shipped)* |
| Employee document repository (UI) | ✓ | ✓ | ✓ | – | partial (schema + AP-side UI; HR UI: Phase 2) |
| Letter generation (offer/exp/salary) | ✓ | ✓ | ✓ | – | ✓ *(shipped — PDF render: Phase 2)* |
| HR helpdesk / tickets | ✓ | ✓ | partial | – | ✓ *(shipped)* |
| Performance management (goals/reviews) | ✓ | ✓ | – | – | ✓ *(shipped)* |
| Expense claims | ✓ | ✓ | partial | – | ✓ |
| Recruitment / ATS | ✓ | ✓ | – | – | deferred |
| Asset management | ✓ | ✓ | partial | – | deferred |
| Training / LMS | ✓ | ✓ | – | – | deferred |
| Surveys / engagement | ✓ | ✓ | – | – | deferred |
| Travel module | ✓ | partial | – | – | deferred |

## 2. Top-10 critical features (Phase 1 — this delivery)

Picked by impact for an Indian SME factory ICP:

1. **Geo-fenced mobile check-in & out** — pre-requisite for daily-wage workers and field staff. Punch trail with GPS + selfie thumbnail. Auto-rolls up into the `attendance` daily row.
2. **Attendance regularisation** — workers miss punches. Self-service request → manager approval → patches the daily row.
3. **Investment declarations (Form 12BB)** — directly drives TDS-on-salary accuracy. Sections 80C, 80D, 80G, HRA, home-loan interest, NPS, other chapter VI-A. Approved declaration feeds the payroll TDS engine.
4. **Loans & advances** — salary advance + festival/personal loans with EMI schedule auto-deducted in payroll. Outstanding balance feeds FNF.
5. **Full & Final Settlement (FNF)** — on exit: pending leave encashment + last-month salary + gratuity (if eligible) − loan recovery − notice-pay shortfall. Posts JE to Finance.
6. **Employee onboarding** — template-driven checklist (offer accept, document upload, asset issue, induction sessions). Owners see completion %.
7. **Employee document repository** — leverages existing `document_attachments` table; categorised UI (ID proofs, qualifications, contracts, statutory) on both web and mobile.
8. **Letter generation** — offer, appointment, salary certificate, experience, relieving. Token-based templates (`{{employee.firstName}}`, `{{salary.ctcAnnual}}`). PDF generated server-side, stored in S3, emailed.
9. **HR helpdesk** — employees raise queries (payroll / leave / asset / IT / other). Categorised, SLA-tagged, assignable. Both web and mobile inbox.
10. **Performance management (lightweight)** — cycles (annual/half-yearly), per-employee goals with weightage, manager review with rating. Outputs feed appraisal/increment workflow later.

## 3. Phase plan

**Phase 1 (this delivery)** — the 10 above.

**Phase 2 (next, not in this delivery)**:
- Comp-off accrual + redemption
- Attendance from biometric devices via direct API (eSSL, Matrix)
- WhatsApp payslip + notification delivery
- Recruitment / ATS (jobs, applicants, interview kanban)
- Asset management (issue/return tracking)

**Phase 3**:
- Training & LMS
- Employee surveys / engagement
- Travel & travel-expense
- Bonus + increment workflow on top of performance
- 360° reviews + 9-box

## 4. Design decisions (committed)

- **Geo-fence model**: per-branch lat/lng + radius (metres). If `null`, no geo check enforced. Selfie required is a tenant setting. Punches accepted outside geo are flagged but stored — managers see exception list.
- **Form 12BB**: one row per (employee, financial-year) holding a JSON of section claims + a status (`draft`/`submitted`/`approved`/`rejected`). Payroll TDS engine reads only `approved`.
- **Loans**: monthly EMI schedule materialised at disbursement; payroll consumes the next-pending instalment per run. Skipped instalments roll forward.
- **FNF**: separate model from `payroll_runs` — it can co-exist with the normal monthly run for the same month. Generates its own payslip-style PDF.
- **Onboarding**: stage = ordered checklist items, each can be self-serve or manager-action. Completion auto-marks the employee `active` (was previously `inactive` while onboarding).
- **Letters**: Handlebars-style template with whitelisted tokens. PDF via existing puppeteer/pdf pipeline (same as payslip).
- **Helpdesk**: simple ticket with status (`open`/`in_progress`/`resolved`/`closed`), category enum, assigned-to user, SLA target (24/48/72h based on category).
- **Performance**: weights sum to 100 on a goal sheet. Rating scale 1-5 default. Review is a single round (self → manager) for v1; calibration deferred.

## 5. Cross-cutting

- All new tables: `tenant_id`, `created_at`, `updated_at`, `deleted_at` (soft delete where ownership matters).
- Validators in `@runq/validators/hr/<feature>.schema.ts`.
- API routes registered through `apps/api/src/modules/hr/routes.ts`.
- Web: TanStack Router routes under `apps/web/src/routes/hr/`.
- Mobile: Flutter screens under `apps/mobile/lib/screens/hr/`. New screens reachable from `hr_more_screen` and from a redesigned `hr_home_screen` quick-actions row.
- RBAC: existing roles `owner | accountant | hr | viewer`. New rule: employee self-service endpoints (`/hr/me/...`) accept any authenticated user with a matching employee row.
- All money values: `decimal(15,2)`. All dates: `date`. All timestamps: `timestamp with time zone`.
