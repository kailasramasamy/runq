# HR & Payroll Phase-Next — Verification Guide

Real-life test scenarios for the 10 features. Each scenario walks through both **web (HR / admin)** and **mobile (employee)** to prove parity.

## Prerequisites

1. **Dev API running** on `localhost:3003` (already up).
2. **Web** running on `localhost:5173` (or wherever your `pnpm -F @runq/web dev` boots).
3. **Mobile**: `cd apps/mobile && flutter run` on a real device or simulator (geo features need a real device for GPS).
4. At least 2 employee records seeded with email/phone matching at least 2 user accounts — one **HR/owner** (web admin), one **regular employee** (mobile user).
5. Owner/HR account logged in on web. Employee account logged in on mobile.

> Tip: if `flutter pub get` hasn't picked up `geolocator`, run it once before `flutter run`.

---

## 1. Geo-fenced mobile check-in & out

**Scenario**: Factory worker arrives at the plant, opens runq, punches in. Manager later sees the punch trail with GPS location and "inside fence" flag.

### Web (admin setup)
1. Open **HR → Geo-fences** in the sidebar.
2. Click **New fence**. Enter:
   - Name: `Head office`
   - Latitude: your current latitude (use Google Maps → drop pin → copy)
   - Longitude: same
   - Radius: `200`
3. Save. The fence appears in the table as **Active**.
4. Toggle **Disable** → row chip flips to `Inactive`. Toggle back to `Active`.

### Mobile (employee)
1. Open the app on a real device.
2. Tap **HR tab → More → Check in** (top-row quick action).
3. Tap **Fetch current location** → grant location permission. Coordinates render below.
4. Tap **Selfie (optional)** → grant camera permission → snap a selfie. Button label flips to `Selfie captured ✓`.
5. Tap **Check in**. Toast: "Checked in".
6. The "Recent punches" list shows your row with **Inside fence** in green if you're within the radius, or **Outside / no fence** in orange.
7. Tap **Check out** an hour later — second row appears.

### Web (admin verification)
1. Open **HR → Punches**. The two rows appear with employee name, time, fence chip, and GPS coords.
2. Open **HR → Attendance**. The daily row for that employee now has `Check-in`, `Check-out`, and `Hours worked` populated, with source = `mobile`.

✅ **Pass criteria**: punch event appears within seconds; attendance row materialises; "inside fence" flag matches your actual position.

---

## 2. Attendance regularization

**Scenario**: Employee forgot to punch out yesterday. They raise a regularization request; manager approves; the daily attendance row is corrected.

### Mobile (employee raises request)
1. **HR → More → Regularize attendance**.
2. Tap the **New request** FAB.
3. Pick yesterday's date.
4. Enter check-in `09:00`, check-out `18:30`.
5. Reason: `Forgot to punch out — system meeting ran late`.
6. Tap **Submit**. Toast: "Request raised".
7. The "My requests" tab shows the row as **pending**.

### Web (manager reviews)
1. **HR → Regularizations**. Filter = `pending` (default).
2. Find the request. Click **Approve**.
3. Toast: "Approved". Row vanishes from `pending` filter.

### Web (verify correction)
1. **HR → Attendance**. Yesterday's row now shows `09:00` → `18:30` with source = `manual`.

### Mobile (employee sees outcome)
1. Pull-to-refresh the **My requests** tab. Status chip flips to **approved** (green).

✅ **Pass criteria**: pending request → manager approval → daily attendance row updated. Employee can also cancel a pending one (X icon on the row).

---

## 3. Investment declarations (Form 12BB)

**Scenario**: Start of the financial year. Employee declares their planned investments for tax purposes. HR approves; payroll TDS engine will use it.

### Mobile (employee)
1. **HR → More → Tax declarations (12BB)**.
2. Tap the **FY 2026-2027** card at the top.
3. Select regime: **Old** (so sections become claimable).
4. Enter:
   - Section 80C: `150000` (PPF + ELSS)
   - Section 80D: `25000` (health insurance)
   - Home loan interest: `200000`
   - HRA: `180000`
5. Tap **Save draft**. Toast: "Saved as draft".
6. Tap **Submit**. Toast: "Submitted for approval". Form locks (read-only banner appears on re-entry).

### Web (HR approves)
1. **HR → Tax declarations (12BB)**. Filter = `submitted`.
2. Find the row. Note the **Total claims** column (should sum to ~₹5.55L).
3. Click **Approve**. Toast: "Approved".

### Mobile (verify)
1. Back on the tax declarations screen, the history list shows status **approved**.

### Negative path
1. From web, create a second draft from a different employee, submit, then **Reject** with reason "Missing rent receipts".
2. On that employee's mobile, status flips to **rejected** — form unlocks for re-edit.

✅ **Pass criteria**: full lifecycle draft → submit → approve / reject → re-edit on rejection.

---

## 4. Loans & advances

**Scenario**: Employee asks for a ₹60,000 salary advance recoverable over 6 months. HR creates and approves; EMI schedule is generated; employee sees it on their phone.

### Web (HR creates)
1. **HR → Loans & advances**. Click **New loan**.
2. Employee: pick the test employee.
3. Kind: `Salary advance`. Principal: `60000`. Instalments: `6`. Disbursed on: today. First EMI month/year: next month.
4. Save → row appears as **draft**.
5. Click **Approve**. Toast: "Loan approved & schedule generated". Status → `active`. EMI = `₹10,000`.

### Web (verify schedule)
1. Hit `GET /api/v1/hr/loans/<id>` (or browse — the loan detail surface is API-only for now). Confirm the response contains 6 `instalments` rows with sequential due months.

### Mobile (employee)
1. **HR → More → My loans**. The salary advance card shows:
   - Principal ₹60,000
   - EMI ₹10,000 × 6 months
   - Outstanding ₹60,000
   - Status **active** (green)

### Negative path
1. Back on web, try to **Delete** the active loan — server returns 409 "Cannot delete an active loan with outstanding balance". Toast surfaces the error.

✅ **Pass criteria**: schedule generation works, employee sees it, active loans are protected from deletion.

> ⚠️ Phase 2: the payroll-run service does not yet auto-consume instalments. After the next month's payroll run, the `paid_payroll_run_id` will still be null on instalments — that's the deferred work.

---

## 5. Full & Final Settlement (FNF)

**Scenario**: Employee resigns. HR computes the final settlement: last month's salary + leave encashment + gratuity − notice recovery − loan recovery − TDS.

### Web (HR drafts)
1. **HR → Full & final**. Click **New FNF**.
2. Employee: pick a test employee.
3. Resignation date: 30 days ago. Last working date: today.
4. Earnings: Last month salary `50000`, Leave encashment `15000`, Gratuity `0`, Bonus `5000`.
5. Deductions: Notice recovery `0`, Loan recovery `0`, TDS `7500`.
6. Save → row appears with auto-computed:
   - Gross = `70,000`
   - Deductions = `7,500`
   - Net payable = `62,500`
   - Status: `draft`

### Web (approve + pay)
1. Click **Approve**. Toast: "FNF approved & employee marked terminated". Status → `approved`.
2. Verify in **HR → Employees**: that employee now shows status **terminated** with the exit date set.
3. Click **Mark paid** → status → `paid`.

### Negative path
1. Try creating a second FNF for the same employee → server returns the unique-index conflict (the schema enforces one FNF per employee).

✅ **Pass criteria**: totals auto-compute correctly, employee terminated on approval, paid status sticks.

> ⚠️ Phase 2: JE post to Finance GL on approval — `je_id` stays null for now.

---

## 6. Employee onboarding

**Scenario**: New hire joins on Monday. HR starts an onboarding workflow from a template; the new hire ticks off checklist items as they complete them.

### Web (HR creates template)
1. **HR → Onboarding → Templates** tab.
2. Click **New template**.
3. Name: `Manufacturing — Factory worker`.
4. Items (defaults are pre-filled — keep or edit):
   - Upload ID proof (Aadhaar / PAN)
   - Sign offer letter acknowledgement
   - Issue laptop & ID card
   - Compliance induction
5. Save. Template appears with **Default** badge (auto-set when it's the first one).

### Web (HR starts workflow)
1. Switch to the **Workflows** tab → **Start onboarding**.
2. Pick a test employee. Template: leave as **Default**.
3. Save. Row appears with status **in progress**.

### Mobile (employee completes)
1. **HR → More → My onboarding**.
2. Progress bar shows "0 of 4 complete".
3. Tick the first checkbox → toast "Marked complete". Progress updates.
4. Tick remaining boxes. After the last one, the workflow auto-completes.

### Web (verify auto-activation)
1. Back on **HR → Onboarding → Workflows**, the row flips to **completed**.
2. **HR → Employees**: that employee's status is now `active` (auto-activated when the workflow finished).

✅ **Pass criteria**: templates seed checklists, items can be ticked from mobile, employee auto-activates on completion.

---

## 7. Letter generation

**Scenario**: HR issues an experience letter to a departing employee using a tokenised template.

### Web (HR creates template)
1. **HR → Letters → Templates** tab. Click **New template**.
2. Name: `Standard experience letter`. Kind: `experience`.
3. Subject: `Experience certificate — {{employee.fullName}}`
4. Body:
   ```
   Date: {{date.today}}

   To whom it may concern,

   This is to certify that {{employee.fullName}} (employee code {{employee.employeeCode}})
   has been employed with us since {{employee.joiningDate}}.

   We wish them the best in their future endeavours.

   Regards,
   HR Team
   ```
5. Save.

### Web (HR generates letter)
1. Switch to the **Letters** tab → **Generate letter**.
2. Template: the one you just made. Employee: a test employee. Click **Generate**.
3. Row appears as **draft**. Click **View** — the body shows tokens fully substituted with the employee's actual name, code, and joining date.
4. Click **Issue** → status → **issued**.

### Mobile (employee receives)
1. **HR → More → My letters**.
2. The issued letter appears in the list. Tap it.
3. Full rendered letter renders on a clean read screen in serif type.

### Negative path
1. From web, **Revoke** the issued letter. On mobile, pull-to-refresh — the letter disappears from "My letters" (only `issued` letters are surfaced).

✅ **Pass criteria**: tokens substitute correctly, issue/revoke lifecycle works, employee only sees `issued` letters.

> ⚠️ Phase 2: actual PDF rendering. Today the letter is HTML/text only.

---

## 8. HR helpdesk

**Scenario**: Employee can't see their payslip for last month. They raise a ticket; HR responds in the comment thread; ticket gets resolved.

### Mobile (employee raises)
1. **HR → More → Helpdesk**.
2. Tap **Raise ticket** FAB.
3. Subject: `Missing November payslip`. Description: `My November payslip isn't showing in the Pay tab.`
4. Category: `payroll`. Priority: `high`.
5. Submit. Toast "Ticket raised". Row appears with ticket number `HRT-000001` and status `open`.

### Web (HR responds)
1. **HR → Helpdesk**. Filter `status=open`.
2. Find the ticket → click **Open**.
3. Status chip + priority + category render at the top. Description is shown.
4. In the **Status** dropdown, change to `in_progress`.
5. In the comment box, type: `Looking into it now — the run wasn't approved until Dec 3.` and click **Send**.

### Mobile (employee replies)
1. Tap the ticket from the list → detail screen.
2. The HR comment appears with author email + timestamp.
3. Type back: `Thanks, payslip is now visible.` → tap send.

### Web (HR closes)
1. Refresh the ticket detail modal — employee's reply is there.
2. Change status to `resolved` → comment thread persists; status chip flips to green.

✅ **Pass criteria**: ticket number auto-numbers (`HRT-000001`+), category-derived SLA defaults (payroll = 48h), full comment thread visible on both surfaces.

---

## 9. Performance management

**Scenario**: HR opens the FY review cycle. Manager sets two goals for an employee. Employee submits a self-review on mobile. Manager rates and finalises.

### Web (HR opens cycle)
1. **HR → Performance → Cycles** tab.
2. **New cycle**. Name: `FY 2026-27 Annual`. Start: `2026-04-01`. End: `2027-03-31`.
3. Save. Row appears as **planned**. Change status dropdown → **active**.

### Web (manager sets goals)
1. **Goals** tab. Select the cycle.
2. **New goal**:
   - Employee: test employee
   - Title: `Hit 95% on-time delivery`
   - Weight: `60`
   - Target metric: `95% OTD across all SKUs`
3. Save.
4. **New goal** again:
   - Title: `Reduce wastage by 10%`
   - Weight: `40`
5. Save. Sum = 100. Try a third goal at weight `5` → server returns 409 "Goal weights exceed 100".

### Web (manager starts review)
1. **Reviews** tab. Pick the cycle. In the combobox "Start review for…" pick the employee → toast "Review started".
2. Row appears with status `pending`.

### Mobile (employee self-rates)
1. **HR → More → My performance**.
2. Two goal cards render with weights `60%` and `40%` and rating chips `Self: —`, `Mgr: —`, `Final: —`.
3. Scroll to the **Reviews** section → tap **Self review**.
4. Slide overall rating to `4.0`. Add comments. Submit.

### Web (manager rates + finalises)
1. **Reviews** tab → the employee's row now shows status `self_submitted` with `Self: 4.0`.
2. Click into the **Manager** rating field on that row → enter `3.5` → blur. Status flips to `manager_submitted`.
3. Click **Finalise** → prompt asks for final rating → enter `3.7`. Status → **finalised**.
4. The goal-level Manager rating column accepts per-goal ratings the same way.

### Mobile (employee sees outcome)
1. Pull-to-refresh My performance. Review status shows **finalised**, with Self / Mgr / Final all populated.

✅ **Pass criteria**: weight-cap validation works, self-submit from mobile flows back to web, status machine advances correctly.

---

## 10. Geo-fences (admin config)

Already verified inline in **Feature 1**. Geo-fences are the admin counterpart to mobile check-in — there is no employee-side mobile surface (employees consume them implicitly via the `insideFence` flag on their punches).

✅ **Pass criteria**: created in feature 1; CRUD + enable/disable verified.

---

## Cross-cutting checks

After the above, sanity-check the cross-feature glue:

1. **Sidebar**: web HR sidebar now has new groups **Lifecycle** (Onboarding / Letters / Full & final), **Performance & engagement** (Performance / Helpdesk), and the Time & attendance group has **Punches / Regularizations / Geo-fences**. Payroll group has **Tax declarations (12BB) / Loans & advances**.
2. **Mobile More screen**: "Self-service" group exposes Regularize attendance / Tax declarations / My loans / My onboarding / My letters / My performance. Top quick-actions include Check-in and Helpdesk.
3. **RBAC**: log in as a `viewer` user. New write actions (approve regularization, approve loan, issue letter, etc.) should fail with 403 / hide their buttons.
4. **Tenant isolation**: nothing from a different tenant's HR data is ever visible. Spot-check by switching tenants (admin panel) — lists go empty.

If any step fails or surfaces something unexpected, the underlying API endpoint table is in `docs/hr-payroll-phase-next.md` (section 2) and the schema lives in `packages/db/migrations/0093_hr_phase_next.sql` — easy to grep from there.
