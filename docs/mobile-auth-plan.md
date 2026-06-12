# runq Mobile Auth — Implementation Plan

**Status:** IMPLEMENTED (2026-06-11) — DOB-gated variant. Code complete; pending
manual Firebase Console + native config before on-device testing (see
"Implemented variant" below).

> ## Implemented variant (supersedes the MSG91/Firebase-Phone design below)
>
> To avoid any SMS cost at launch, the one-time bind uses the employee's **date
> of birth (DDMMYY)** instead of an SMS OTP. There is **no phone OTP and no
> MSG91** — Firebase Phone Auth is not used at all. Only Google + Apple
> sign-in providers are needed.
>
> **Flow**
> - *Every login:* tap Google/Apple → `POST /auth/social/login {idToken}` →
>   if `firebase_uid` is bound, returns the runq JWT.
> - *First login:* `/social/login` returns `{needsBinding:true}` → the app
>   collects phone + DOB → `POST /auth/social/bind {idToken, phone, dob}` →
>   server matches the employee by phone, verifies DOB, links the uid.
>
> **Guardrails**
> - 5 wrong DOB tries → `employees.mobile_bind_attempts` locks the bind;
>   admin clears it via **HR → Employee → Reset mobile login**
>   (`POST /hr/employees/:id/reset-mobile-login`, clears the counter + unbinds
>   `firebase_uid`).
> - No DOB on file → bind blocked ("ask your admin").
> - Anti-hijack guards retained (uid already bound elsewhere, etc.).
>
> **Touched:** `social-auth.schema.ts` (`socialBindSchema` += phone, dob);
> `social-auth.routes.ts` (rewrote `/social/bind`, deleted `/phone-otp/*` +
> `FIXED_OTP`); `employee.service.ts` (`resetMobileLogin`); migration
> `0130_employee_bind_throttle.sql`; mobile `firebase_auth_service.dart`
> (Google/Apple only), `auth_provider.dart`, `signin_screen.dart`;
> web `detail.tsx` + `useResetMobileLogin`.
>
> **Remaining manual setup:** Firebase Console — enable Google + Apple
> providers (Phone NOT needed). iOS — re-download `GoogleService-Info.plist`
> after enabling Google (it currently has no `CLIENT_ID`), add its
> `REVERSED_CLIENT_ID` as a URL scheme in `Info.plist`, add the "Sign in with
> Apple" capability. Android — add debug+release SHA-1/256 to the Firebase
> Android app, re-download `google-services.json`.

---

## Original design (MSG91 phone OTP) — superseded, kept for reference

**Status:** Planned — on hold (as of 2026-05-22). To be resumed later.
**Decision:** One-time MSG91 phone OTP for account binding, then Google / Apple
Sign-In for all subsequent logins.

---

## 1. Goal

Replace the mobile app's phone-OTP login (today hardcoded to `123456` in
`apps/api/src/modules/auth/phone-otp.routes.ts`) with **Google / Apple
Sign-In**. Phone OTP survives only as a **one-time binding step** — after that,
login is pure Google/Apple with no SMS. Web login (email + password) is
untouched.

The phone number stays runq's identity key (every employee already has one on
file). Google/Apple is the credential. SMS cost ≈ one message per employee, ever.

---

## 2. Architecture decisions

| Decision | Choice | Why |
|---|---|---|
| OTP delivery | **MSG91** (server-side), via existing MSG91 account | Already owned; ~₹0.15–0.20/SMS; branded sender; no Firebase phone-auth native setup |
| DLT | Header **RUNQIN**, OTP template registered via **PingConnect** | India regulatory requirement for SMS |
| Social sign-in | **Google + Apple via Firebase Auth** | Apple is mandatory on iOS if Google is offered (App Store rule 4.8) |
| Token the API trusts | **Firebase ID token** (Google/Apple only) | Verified with `firebase-admin` — same `FIREBASE_SERVICE_ACCOUNT` already used for FCM (project `runq-63597`) |
| Binding storage | New column **`users.firebase_uid`** | runq stays source of truth; simpler than Firebase account-linking |
| Login match key | `firebase_uid` | Stable per Google/Apple account; survives Apple private-relay emails |
| Bind match key | phone (existing employee-match logic) | Employees have phone on file, rarely a personal email |

Phone OTP does **not** go through Firebase — only Google/Apple do. This removes
the Firebase Phone provider, reCAPTCHA fallback, APNs-for-auth, and phone test
numbers from scope.

---

## 3. Auth flows

### Phase 1 — first login (one-time binding)

1. App: user enters phone → `POST /api/v1/auth/phone-otp/request { phone }`.
2. API: normalise phone, call MSG91 send-OTP (RUNQIN template). Always returns
   `200 { ok: true }` — never leak whether the phone is a registered employee.
3. App: user enters the 6-digit OTP, then taps **Sign in with Google / Apple**.
4. App: Firebase Auth sign-in → Firebase ID token.
5. App: `POST /api/v1/auth/social/bind { phone, otp, socialIdToken }`.
6. API:
   a. Verify `socialIdToken` via `firebase-admin` → `uid`, `sign_in_provider`
      (must be `google.com` or `apple.com`). *(cheap, no side effect — do first)*
   b. Verify `otp` against MSG91 verify-OTP for that phone. *(consuming — do last)*
   c. Resolve runq user by phone (reuse the existing employee-match /
      auto-provision logic).
   d. Guards: reject if the user already has a *different* `firebase_uid`
      (anti-hijack); reject if this `firebase_uid` is already bound elsewhere.
   e. Write `firebase_uid` + `auth_provider`; issue the runq JWT.
7. App: store JWT, land by role.

### Phase 2 — every login after

1. App: shows Google / Apple buttons only.
2. App: Firebase sign-in (use `signInSilently` → usually one-tap) → Firebase ID token.
3. App: `POST /api/v1/auth/social/login { idToken }`.
4. API: verify token → look up `users.firebase_uid`.
   - Found + active → runq JWT.
   - Not found → `200 { data: { needsBinding: true } }` → app routes into Phase 1.
   - Found + inactive → `403`.
5. App: store JWT, land. **No SMS.**

---

## 4. Database (`packages/db`)

New migration `migrations/0107_users_firebase_auth.sql` (next after
`0106_device_tokens.sql`):

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid varchar(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider varchar(20);
CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_unique
  ON users (firebase_uid) WHERE firebase_uid IS NOT NULL;
```

- Add the two columns to the drizzle schema `src/schema/user.ts`.
- Do **not** declare the partial unique index in drizzle (mirrors how `phone`'s
  partial index is migration-only — avoids the `drizzle-kit push` crash on
  `WHERE` clauses).
- Apply locally: `tsx scripts/run-sql.ts migrations/0107_users_firebase_auth.sql`.

`firebase_uid` = login lookup key. `auth_provider` (`google`/`apple`) = drives
the profile / admin "signed in with…" display and the reset-login flow.

---

## 5. API server (`apps/api`)

- **`src/utils/push/firebase-admin.ts`** — refactor: extract a shared
  `getFirebaseApp()`, add `getFirebaseAuth()`. `getFcm()` reuses it.
- **New `src/utils/msg91.ts`** — thin MSG91 client: `sendOtp(phone)`,
  `verifyOtp(phone, otp)`. Phone formatted as `91` + 10 digits. Uses MSG91 OTP
  send / verify / retry endpoints (confirm exact URLs against current MSG91 docs).
- **New `src/modules/auth/social-auth.routes.ts`** — replaces `phone-otp.routes.ts`:
  - `POST /auth/phone-otp/request` — `{ phone }` → MSG91 send-OTP.
  - `POST /auth/social/login` — `{ idToken }` → verify, look up `firebase_uid`,
    JWT or `needsBinding`.
  - `POST /auth/social/bind` — `{ phone, otp, socialIdToken }` → verify both,
    resolve user, guards, write binding, JWT.
- Extract phone→user resolution into `resolveUserByPhone()` +
  `ensureTenantMembership()` helpers (keeps each function ≤50 lines).
- **`src/app.ts`** — swap `phoneOtpRoutes` for `socialAuthRoutes`. Delete
  `phone-otp.routes.ts` and `FIXED_OTP`.
- **New env vars:** `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID` (add to
  `config/env.ts`). `FIREBASE_SERVICE_ACCOUNT` already exists.

### `@runq/validators` (`src/auth/login.schema.ts`)

Remove `phoneOtpRequestSchema` / `phoneOtpVerifySchema`. Add:
- `phoneOtpRequestSchema = { phone }`
- `socialLoginSchema = { idToken }`
- `socialBindSchema = { phone, otp, socialIdToken }`

---

## 6. Mobile app (`apps/mobile`)

- **`pubspec.yaml`** — add `firebase_auth` (pairs with `firebase_core ^3.8.0`)
  and `google_sign_in`. Apple Sign-In via `firebase_auth`'s native
  `AppleAuthProvider` (iOS-only audience → no extra package).
- **New `lib/services/firebase_auth_service.dart`** — wraps `signInWithGoogle()`,
  `signInWithApple()`; returns Firebase ID tokens.
- **`lib/providers/auth_provider.dart`** — replace `requestOtp`/`verifyOtp` with
  `signInWithGoogle()`, `signInWithApple()` (→ `/auth/social/login`, surface
  `needsBinding`), `requestPhoneOtp()` (→ `/auth/phone-otp/request`), and
  `bindAccount()` (→ `/auth/social/bind`). Keep `_finishLogin`, JWT storage,
  `PushService.onLogin()` unchanged.
- **`lib/screens/signin_screen.dart`** — rework the step machine:
  `choose` (Google/Apple) → on `needsBinding` → `phone` → `otp` → bind → land.
  Reuse the existing `_Palette`, `_OtpInput`, animations, landing logic. Must
  pass `scripts/check-fonts.sh` (RunqText tokens) and render in dark mode.
- **iOS `Info.plist`** — add the `REVERSED_CLIENT_ID` URL scheme (Google Sign-In).

---

## 7. MSG91 / DLT setup (manual)

- **PingConnect (DLT):** register header **RUNQIN** and the OTP template under
  the runq brand/entity.
- OTP template body (Service / "Service Implicit" category):
  > `{#var#} is your runq verification code. Valid for 10 minutes. Do not share it with anyone.`
  No URLs; keep the brand name "runq" in the body.
- **MSG91:** create the matching OTP template in the existing MSG91 account,
  pointing at the RUNQIN header. Note the **template ID** → `MSG91_OTP_TEMPLATE_ID`.
- Set `MSG91_AUTH_KEY` from the MSG91 panel.

---

## 8. Firebase Console + native config (manual)

- **Firebase Console:** enable **Google** and **Apple** sign-in providers.
  (Phone provider NOT needed — MSG91 handles OTP.)
- **Apple:** Apple Developer — App ID "Sign in with Apple" capability, a
  Services ID + key, configured into Firebase's Apple provider. Xcode — add the
  "Sign in with Apple" capability to the Runner target.
- **Google / Android:** add **SHA-1 + SHA-256** (debug + release) to the
  Firebase Android app, re-download `google-services.json`. (Required for Google
  Sign-In on Android.)
- Verify the `FIREBASE_SERVICE_ACCOUNT` on Railway is project `runq-63597`.

---

## 9. Testing

- MSG91 OTP — test with real numbers (one SMS each). Verify delivery via the
  RUNQIN header.
- Google/Apple — use real test accounts (no fake-account mode exists for social).
- Existing testers on `123456` migrate **lazily**: first social login returns
  `needsBinding`, they bind once, done. No migration script.

---

## 10. Rollout

**Recommended: hard cutover.** runq is pre-launch (testers only) — delete the
old `/phone-otp/*` behaviour outright. Alternative: keep old routes returning
HTTP 426 "update the app".

---

## 11. Order of work

1. DB migration + drizzle schema
2. `firebase-admin` refactor + `msg91.ts` client + validators
3. `social-auth.routes.ts` + wire into `app.ts`, delete old route
4. Mobile deps + `firebase_auth_service.dart`
5. `auth_provider.dart`
6. `signin_screen.dart` rework
7. Native config (Info.plist) + Firebase Console + MSG91/DLT (parallel, manual)
8. End-to-end test on a device

---

## 12. Deferred to phase 2

- **Admin "reset login"** — clears `firebase_uid` so a user can re-bind (lost
  Google account, wrong account picked at bind time). For now, a manual SQL
  `UPDATE`. Worth a small admin endpoint + button soon.
- Profile screen "Signed in with Google / Apple" label.

---

## 13. Edge cases (handled by the design)

- Wrong Google account picked at bind → admin reset to fix; confirm account
  before committing the bind.
- Google/Apple account already bound to another user → API rejects.
- User record already bound to a different uid → API rejects (anti-hijack).
- Phone matches no employee → API `404` (existing behaviour preserved).
- Apple private relay email → fine; binding keys on `uid`, never email.
- New device / reinstall → Phase 2 only; binding lives server-side, no re-OTP.
