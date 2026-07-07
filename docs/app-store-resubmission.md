# runQ iOS — App Store Resubmission

Status as of 2026-07-07. Covers the current **Guideline 2.1(b)** information
request and the fixes made so the resubmission build passes review.

---

## 1. Current hold — Guideline 2.1(b) "Information Needed"

Apple saw subscription/plan wording ("Starter, Pro, Enterprise plans. 14-day
free trial — no credit card needed") and wants to confirm the business model
before deciding whether In-App Purchase (3.1.1) applies.

**Key facts in our favour**
- That pricing copy lives **only on the marketing website** (`apps/www` —
  `/pricing`, `/get-started`). The iOS app contains **no** pricing, plan-picker,
  upgrade, or purchase UI (verified — no IAP surface anywhere in `apps/mobile`).
- runQ is a **B2B enterprise SaaS** sold to organizations, used by their
  employees — the standard IAP-exempt model (QuickBooks / Xero / Zoho Books).

### Reply to paste into Resolution Center

> Thank you for the questions. runQ is a business-to-business (B2B) enterprise
> software service (accounting, GST invoicing, HR/payroll, inventory) for
> registered businesses in India. It is not a consumer product and is not sold
> to individuals for personal or family use. The iOS app is a free companion
> client to a subscription that a business purchases on our website — the same
> model as QuickBooks, Xero, and Zoho Books.
>
> 1. Who uses the paid subscriptions? Employees and owners of registered
>    businesses (SMEs). The subscriber is always the organization; individual
>    employees access their employer's account. There is no consumer use.
> 2. Where are subscriptions purchased? Only on our website (https://runq.in),
>    by the business owner/administrator on behalf of their organization.
>    Subscriptions cannot be, and are not, purchased in the iOS app. The app has
>    no purchase, pricing, or plan-selection screens.
> 3. What previously-purchased subscriptions can be accessed? A user whose
>    organization holds an active runQ subscription can sign in to view and
>    manage that organization's own business data (invoices, ledgers, employees,
>    inventory). The app is a client for the organization's account.
> 4. What paid content/features are unlocked in-app without IAP? None is sold in
>    the app. The app provides access to the organization's own business records
>    — the customer's own data — under a subscription bought on the web. No
>    digital content or subscription is offered for sale inside the app.
> 5. Sold to single users, consumers, or family? Sold to businesses/
>    organizations as an enterprise service. Not to individual consumers, not for
>    family use.
> 6. Where is "Starter, Pro, Enterprise plans. 14-day free trial…" located? It
>    is marketing copy on our public website only — https://runq.in/pricing and
>    https://runq.in/get-started. It does not appear anywhere in the iOS app.
>
> Because runQ is an enterprise service sold to organizations and consumed
> through the customer's own business account (not digital content sold to
> consumers), we believe In-App Purchase is not required, consistent with App
> Review Guideline 3.1.3. Please let us know if you need anything further.

The **current in-review build** still has Google + phone/DOB sign-in, so the
reviewer can log in there via "Use phone & date of birth" with any test
employee's number + DOB (DDMMYY). Provide one in the reply's sign-in line.

---

## 2. Fixes shipped for the resubmission build (MSG91 build, `1.0.0+13`)

The resubmission build uses MSG91 phone-OTP login. These were added so it clears
review once the reviewer actually signs in and explores:

| Guideline | Fix | Where |
|-----------|-----|-------|
| **2.1** reviewer can't get an Indian SMS | Demo-account login bypass — an employee in the `runq-demo` tenant whose date-of-birth (DDMMYY) is accepted as the OTP, no SMS sent. Scoped to that tenant only. | `apps/api/src/modules/auth/phone-auth.routes.ts` (`demoOtpFor`) |
| **5.1.1(v)** no account deletion | In-app "Delete account" in Profile → `DELETE /api/v1/account` drops tenant membership + anonymises/deactivates the login (org's business records retained). | `apps/api/src/modules/auth/account.{routes,service}.ts`; `apps/mobile/lib/screens/profile_screen.dart`; `auth_provider.deleteAccount()` |
| **5.1.1** missing privacy manifest | Added `PrivacyInfo.xcprivacy` (tracking off, data types, required-reason APIs) and wired it into the Runner target. | `apps/mobile/ios/Runner/PrivacyInfo.xcprivacy` + `project.pbxproj` |

Verified: `apps/api/scripts/e2e-hr-account.ts` (9/9 — demo login + deletion) and
`e2e-hr-otp.ts` (8/8 — normal login unaffected). `flutter analyze` clean.

### 2.1(a) — dead "Request access" button on login (iPad)

The reviewer (iPad Air, iPadOS 26.4) reported that tapping **"Request access"**
on the login screen did nothing. That element was on the old build's sign-in
screen; the sign-in screen has been **fully rebuilt** for this version (phone →
one-time code) and no longer contains any "Request access" control. Every button
on the new screen is wired: Send code, Verify & sign in, Resend code, Change
number. No dead ends remain (grep for "request access" in `apps/mobile/lib`
returns nothing).

### iPhone-only

Per product decision, the app now targets **iPhone only**. All
`TARGETED_DEVICE_FAMILY` entries in `ios/Runner.xcodeproj/project.pbxproj` are
set to `1` (the Runner target was already `1`; the project-level defaults were
`"1,2"` and are now `1`). Note: iPhone-only apps can still be *installed* on iPad
in iPhone-compatibility mode, so a reviewer may still open it there — which is
why removing the broken button (above) is the actual fix. In App Store Connect,
set the app's device support to iPhone.

---

## 3. Reviewer notes (App Store Connect → App Review Information)

The demo account is **seeded in production** (verified against the live API):

> Sign in with phone number and one-time code.
> Demo account (no SMS is sent — the code is fixed for this account):
>   Mobile number: 9000000002
>   Code: 010190
> Enter the number, tap "Send code", then enter the code above. This signs you
> in as an owner of the "runQ Demo Co" workspace with full access.
> This is a B2B business app; subscriptions are purchased on https://runq.in,
> not in the app.

(Phone `9000000001` is the separate **Dhenu** app's reviewer operator — the
runQ HR/finance reviewer uses `9000000002`. Re-seed either with
`apps/api/scripts/provision-runq-demo-login.ts` against the prod `DATABASE_URL`.)

---

### 5.1.1(ix) — organization account (regulated / finance app)

Administrative, not code. The app must be submitted from an Apple Developer
Program account enrolled as an **organization** (not individual). Now handled.
- If the individual account was **converted** to an organization (same Team ID),
  just resubmit — the app record is unchanged.
- If a **new** organization account was enrolled (different Team ID), transfer
  the app to it (App Store Connect → app → Transfer) or recreate the listing
  there before uploading the new build.

## 4. Remaining manual steps (before archiving/uploading)

1. **Production demo account — DONE.** Seeded via
   `apps/api/scripts/provision-runq-demo-login.ts` (owner user + demo employee in
   the `runq-demo` tenant, phone `9000000002`, code `010190`, no SMS). Re-run
   with `DATABASE_URL=<prod> tsx apps/api/scripts/provision-runq-demo-login.ts`
   if it ever needs refreshing.
2. **Verify the privacy manifest is bundled** — open `ios/Runner.xcodeproj` in
   Xcode, confirm `PrivacyInfo.xcprivacy` is in the Runner target's "Copy Bundle
   Resources" (it was added to `project.pbxproj`; a visual check is worth it).
3. **App Privacy questionnaire** in App Store Connect — set answers to match the
   manifest: data collected (name, email, phone, precise location, photos) is
   linked to identity, **not** used for tracking, all for App Functionality.
4. **Build number** — `1.0.0+13`; confirm it's higher than the last upload.
5. **MSG91** — ensure the production account has credit + an approved OTP
   template so real users receive the SMS (the demo account never sends one).

## 5. Audit note — not blockers
- Info.plist usage strings (camera, photos, location) — all present. OK.
- Release build points to `https://api.runq.in`. OK.
