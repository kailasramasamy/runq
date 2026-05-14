# HR & Payroll Module — Implementation Plan

## Overview

Add a holistic HR & Payroll module to runq, targeting small Indian manufacturers (50+ employees, 10+ products). Goal: customers run their entire back-office — Finance + HR + Payroll — on runq alone, without bolting on Keka, GreytHR, Zoho Payroll, or Excel.

Module is **kept architecturally separate from Finance** (Tally-style switcher) but **shares the same tenant, auth, masters, and posts into the Finance GL**.

## Target ICP

- Indian SME manufacturers
- 50–500 employees (mix of staff + factory workers + contract labour)
- 1–3 factory locations
- Mix of monthly-salaried staff and wage workers (shift-based, OT)
- Already running Finance on runq (or onboarding both modules together)

---

## Strategic Positioning

| Competitor | Strength | Where runq wins |
|---|---|---|
| **Keka** | Polished UI, mid-market focus | Costlier, no native finance integration, weaker for factory floor |
| **GreytHR** | Compliance-heavy, India-first, popular with SMEs | Outdated UX, separate from accounting |
| **Zoho Payroll** | Cheap, integrates with Zoho Books | Limited HR (no attendance/shifts), not manufacturing-aware |
| **RazorpayX Payroll** | Free + bank-integrated disbursement | Payroll-only, no HR, no factory workflows |
| **Tally + manual payroll** | Status quo for many SMEs | Excel sheets, no compliance automation |

**Wedge:** "The only HR+Payroll built into your accounting system, designed for Indian factories — shift attendance, contract labour, statutory compliance, payslips, and PF/ESI filings in one place."

---

## Architecture: Module Separation

### Routing

| Surface | Finance | HR |
|---|---|---|
| Marketing | `runq.in/finance` | `runq.in/hr` |
| App | `app.runq.in/finance/...` | `app.runq.in/hr/...` |
| Sidebar | Finance-only nav | HR-only nav |

### Module Switcher

Top-left of app (where logo sits) — dropdown:

```
[runq ▾]   Finance   ←  active
           HR & Payroll
           ───────────
           (later) Inventory, CRM, Projects
```

Switching changes URL prefix, sidebar nav, and the "recents" list. Same tenant, same login, same theme.

### Code Layout

```
apps/api/src/
  modules/
    finance/            (AR, AP, banking, GST — existing)
    hr/                 (NEW — attendance, leave, payroll)
    shared/             (employees, masters, approvals)
  core/                 (auth, tenancy, db, audit)

apps/web/src/app/
  (finance)/            existing routes
  (hr)/                 NEW route group
  shared/               settings, admin, masters

packages/db/src/schema/
  hr/                   NEW — employees, attendance, payroll, statutory
```

### Shared Abstraction Layer

What HR reuses from existing runq:
- Auth, tenancy, RBAC, user/role
- Org masters: branches, cost centres, banks
- Document storage (S3 — for payslips, contracts, ID proofs)
- Approval workflow engine (already used for bills/POs — reused for leave, expense claims, payroll runs)
- Notification system (in-app, email, WhatsApp later)
- Audit log
- Super admin billing — add `modules: ['finance' | 'hr']` to subscription plan

### Integration Points (HR ↔ Finance)

1. **Payroll Journal Entry**: Each payroll run posts a JE — Salary Expense (Dr) / PF Payable, ESI Payable, TDS Payable, Net Pay Payable (Cr)
2. **Salary Disbursement**: Bank transfer file → bank reconciliation matches against Net Pay Payable
3. **Statutory Payments**: PF/ESI/PT/TDS payments flow as bank transactions → reconcile against payables
4. **Employee Reimbursements**: Expense claims approved in HR → create AP bill in Finance
5. **TDS-on-Salary**: Feeds into the same TDS reporting/return as vendor TDS
6. **Employee = Vendor (optional)**: For contract labour, employee can also exist as a vendor for AP-style payments

---

## Phase 1: Employee Master & Attendance (~2 weeks)

### 1.1 DB Schema

```sql
employees:
  id, tenant_id, employee_code, first_name, last_name, email, phone,
  date_of_birth, gender, blood_group, address,
  joining_date, confirmation_date, exit_date, status (active/inactive/terminated),
  employment_type (permanent/contract/intern/consultant),
  branch_id, department_id, designation_id, reporting_to_id,
  -- statutory
  pan, aadhaar, uan, pf_number, esi_number,
  -- bank
  bank_account_number, bank_ifsc, bank_name,
  -- audit
  created_at, updated_at, created_by, updated_by

departments:
  id, tenant_id, name, code, parent_id

designations:
  id, tenant_id, name, level

shifts:
  id, tenant_id, name, start_time, end_time, break_minutes,
  weekly_off_days (jsonb), is_night_shift

employee_shifts:
  id, employee_id, shift_id, effective_from, effective_to

attendance:
  id, tenant_id, employee_id, date, shift_id,
  check_in, check_out, hours_worked, ot_hours,
  status (present/absent/half_day/leave/holiday/week_off),
  source (manual/biometric/mobile),
  notes, created_at, updated_at

biometric_imports:
  id, tenant_id, file_name, device_type, imported_by, imported_at,
  total_records, success_count, error_count, errors (jsonb)
```

### 1.2 Features

- Employee CRUD with statutory fields validation (PAN, Aadhaar, UAN format)
- Bulk import via CSV (for onboarding existing workforce)
- Shift management (general shift, factory shifts: 6-2, 2-10, 10-6)
- Attendance entry: manual, CSV import from biometric devices (eSSL, Matrix, ZKTeco — most common in Indian factories)
- Attendance dashboard: daily muster, late arrivals, OT summary
- Holiday calendar (national + state + factory-specific)

### 1.3 Mobile App (Flutter — same app as AP intake)

- Employee self check-in/check-out (geo-fenced to factory location)
- View own attendance, payslips, leave balance
- Manager: approve leave/OT, view team attendance

---

## Phase 2: Leave Management (~1 week)

### 2.1 DB Schema

```sql
leave_types:
  id, tenant_id, name, code, days_per_year, carry_forward,
  encashable, is_paid, applicable_to (jsonb — employment types)

leave_balances:
  id, tenant_id, employee_id, leave_type_id, year,
  opening, accrued, used, balance

leave_requests:
  id, tenant_id, employee_id, leave_type_id,
  from_date, to_date, half_day, reason,
  status (pending/approved/rejected/cancelled),
  approved_by, approved_at, rejected_reason
```

### 2.2 Features

- Configurable leave types (CL, SL, EL, ML, Comp Off — defaults seeded)
- Year-end accrual + carry-forward rules
- Leave application + manager approval (reuses approval workflow engine)
- Leave calendar view (team + org level)
- Leave balance auto-deduction on approval, restoration on cancellation
- Holiday + week-off awareness when calculating leave days

---

## Phase 3: Payroll Run (~2-3 weeks)

### 3.1 DB Schema

```sql
salary_components:
  id, tenant_id, name, code, type (earning/deduction/reimbursement),
  calculation_type (fixed/percentage/formula),
  formula (jsonb), is_taxable, is_pf_applicable, is_esi_applicable,
  display_order

salary_structures:
  id, tenant_id, name, code, ctc_range_min, ctc_range_max

salary_structure_components:
  id, salary_structure_id, salary_component_id, value, percentage_of

employee_salary:
  id, tenant_id, employee_id, salary_structure_id,
  ctc_annual, effective_from, effective_to,
  components (jsonb — frozen snapshot of structure at assignment time)

payroll_runs:
  id, tenant_id, month, year, status (draft/processed/approved/paid),
  total_employees, total_gross, total_deductions, total_net,
  processed_by, processed_at, approved_by, approved_at,
  je_id (FK to finance journal entry)

payslips:
  id, payroll_run_id, employee_id,
  working_days, lop_days, paid_days, ot_hours,
  earnings (jsonb), deductions (jsonb),
  gross, deductions_total, net_pay,
  pf_employee, pf_employer, esi_employee, esi_employer,
  tds, pt, other_deductions,
  pdf_url, generated_at
```

### 3.2 Features

- Salary component library (Basic, HRA, DA, Conveyance, Special, PF, ESI, PT, TDS — seeded)
- Salary structure templates (e.g., "Manufacturing — Worker", "Manufacturing — Supervisor", "Office Staff")
- Employee salary assignment with revision history
- **Payroll run workflow**:
  1. Select month → system pulls attendance (working days, LOP, OT)
  2. Calculate gross per employee (applying structure)
  3. Auto-calculate statutory deductions (PF 12%, ESI 0.75%, PT slabs, TDS using projected annual income)
  4. Review screen — edit any line item, add ad-hoc bonus/deduction
  5. Approval (reuses workflow engine)
  6. Generate payslips (PDF)
  7. Post JE to Finance GL
  8. Generate bank transfer file (NEFT/IMPS format for HDFC, ICICI, SBI)
- Payslip distribution: email + portal + mobile app
- Lock processed months (prevent edits after approval)

### 3.3 Statutory Calculations

- **PF**: 12% employee + 12% employer (capped at Rs 15,000 basic), EDLI, admin charges
- **ESI**: 0.75% employee + 3.25% employer (wages ≤ Rs 21,000)
- **PT**: State-wise slabs (start with Karnataka, Maharashtra, Tamil Nadu, Gujarat, Telangana)
- **TDS on Salary**: Section 192 — old vs new regime, declarations (80C, HRA, etc.), monthly TDS based on projected annual

---

## Phase 4: Statutory Compliance & Reports (~2 weeks)

### 4.1 PF (EPFO)

- **PF ECR file** generation (monthly) — format per EPFO spec
- UAN-wise contribution breakdown
- Generate challan
- Manual upload to EPFO portal (Phase 1) → API integration later (EPFO doesn't expose public API; needs partner)

### 4.2 ESI

- **ESI return file** generation (monthly)
- IP-wise contribution
- Challan generation
- Manual upload to ESIC portal

### 4.3 Professional Tax

- State-wise monthly/half-yearly returns
- Challan generation per state portal

### 4.4 TDS on Salary

- **Form 24Q** quarterly return
- **Form 16** annual generation per employee
- Integrates with existing TDS pipeline (when built)

### 4.5 Bank Disbursement

- NEFT/RTGS bulk transfer file generation:
  - HDFC corporate format
  - ICICI Corporate Internet Banking format
  - SBI Corporate format
  - Generic NEFT CSV

---

## Phase 5: Contract Labour & Reimbursements (~1 week)

Manufacturing-specific:
- Contract labour management — different salary structure, no PF/ESI if outside ceiling, optional vendor link
- Wage register (Form XVIII under CLRA)
- Expense reimbursement flow:
  - Employee submits claim with receipt photo (mobile app)
  - Manager approves
  - Auto-create AP bill in Finance (vendor = employee)
  - Pay via banking module

---

## Phase 6: Mobile App Features (parallel)

Add to existing Flutter app:
- Check-in/check-out with geo-fence
- View payslip history
- Apply leave
- Submit expense claim (photo + amount)
- Approve leave/expense (for managers)
- Push notifications: payslip published, leave approved/rejected, attendance reminder

---

## Pricing & Packaging

### Subscription Plans

| Plan | Finance | HR & Payroll | Price (monthly) |
|---|---|---|---|
| Finance Starter | ✓ | – | existing |
| Finance Pro | ✓ | – | existing |
| **HR Starter** | – | up to 25 employees | Rs 1,500 |
| **HR Pro** | – | up to 100 employees | Rs 4,000 |
| **HR Enterprise** | – | unlimited | Rs 8,000 + Rs 50/employee over 200 |
| **Bundle (Finance + HR)** | ✓ | ✓ | 15% off combined |

(Numbers indicative — benchmark against Keka Rs 6,999/100 emp, GreytHR Rs 3,495/100 emp.)

### Add-ons

- Biometric device integration (per device)
- WhatsApp payslip delivery
- Custom statutory reports

---

## Rollout Plan

| Phase | Scope | Duration | Cumulative |
|---|---|---|---|
| 1 | Employees + Attendance | 2 weeks | 2w |
| 2 | Leave Management | 1 week | 3w |
| 3 | Payroll Run + Payslips | 2-3 weeks | 5-6w |
| 4 | Statutory Reports (PF/ESI/PT/TDS) | 2 weeks | 7-8w |
| 5 | Contract Labour + Reimbursements | 1 week | 8-9w |
| 6 | Mobile features (parallel) | continuous | – |

**Total: ~8-9 weeks for MVP** that competes with Zoho Payroll + lightweight Keka.

---

## Out of Scope (v1)

Deferred to later phases — do not bloat MVP:
- Performance reviews / appraisals
- Recruitment / ATS
- Training & LMS
- Asset management
- Travel & expense (beyond simple reimbursement)
- Exit / FNF automation (manual JE in v1)
- Org chart visualization
- Employee surveys / engagement

These ship in v2 once core HR+Payroll is stable and has paying customers.

---

## Success Metrics

After MVP launch, track:
- # tenants on HR module / total tenants
- Avg employees per HR tenant
- % HR tenants also on Finance (bundle attach rate)
- Monthly payroll runs processed
- Statutory filings generated
- Mobile DAU (employee self-service)
- Support tickets / category — to find next priority

---

## Open Decisions

1. **Biometric integration**: CSV import only (v1) or direct device API (v2)? — start CSV.
2. **PF/ESI API filing**: Manual upload (v1) or partner integration (v2)? — start manual, partner depends on volume.
3. **Multi-currency / cross-border**: Defer — Indian factories only for v1.
4. **Loans & advances**: Defer to v2.
5. **Module switcher styling**: Same theme or HR gets distinct accent colour? — decide during design phase.
