# Phase 1 — Multi-Tenant for CA Firms

**Goal:** One CA login → access many client tenants. Cmd-K switcher, no re-login, no remote desktops.
**Target ship:** 4–5 weeks
**Status:** ✅ **Shipped** (Weeks 1–5 + 7-gap hardening complete; RLS deferred to a later phase)

---

## Context

Original problem: one `user` row → one `tenantId` (FK on users table). JWT carried `tenantId` baked in at login. CAs couldn't manage multiple clients without re-logging-in or sharing passwords.

The codebase was **already 80% multi-tenant ready** — every service accepted `tenantId` as a constructor/method param and added a manual `WHERE tenant_id = ?` clause. The gaps were auth (JWT shape) and frontend (storage + picker).

99 tables already had `tenantId` FKs. RLS policies existed in code but were inactive (no `app.current_tenant_id` setting in connection context).

---

## Architecture change

**Before:**
```
login → JWT { userId, tenantId, role } → tenant-context plugin reads JWT.tenantId → request.tenantId
```

**After:**
```
login → JWT { userId, tenantId? } → tenant-context plugin reads X-Tenant-Id header
                                  → validates against user_tenants membership
                                  → request.tenantId + request.activeRole
```

JWT became slim. Tenant is per-request, validated against membership. **Per-tenant role** resolved via `user_tenants.role` for the active tenant — never trusted from JWT.

---

## Data model

```sql
CREATE TABLE user_tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        user_role NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id)
);

CREATE TABLE tenant_invites (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token                varchar(64) UNIQUE NOT NULL,
  inviting_user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inviting_tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invite_type          invite_type NOT NULL DEFAULT 'new_tenant',  -- new_tenant | join_tenant
  role                 user_role NOT NULL DEFAULT 'accountant',
  email                varchar(255),
  company_name         varchar(255),       -- CA-prefilled prospect name (new_tenant only)
  note                 varchar(500),
  expires_at           timestamptz NOT NULL,
  accepted_at          timestamptz,
  accepted_tenant_id   uuid REFERENCES tenants(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);
```

**Roles:** `owner | accountant | viewer | client_owner`. Owner-equivalents (`owner`, `client_owner`) treated as the same in `rbacHook.expandRoles()`.

---

## Week-by-week — what shipped

### Week 1 — DB + auth backbone ✅
- [x] `user_tenants` table + Drizzle schema + migration `0055_user_tenants.sql` with backfill from existing `users.(tenant_id, role)` pairs
- [x] JWT payload type updated (`tenantId` optional)
- [x] `tenant-context.ts` resolves from `X-Tenant-Id` header → validates membership → falls back to JWT `tenantId` (also membership-validated)
- [x] `/auth/me` returns `{ user, tenant, tenants[], impersonatedBy }` with the active membership's role

### Week 2 — Frontend tenant context ✅
- [x] Auth provider stores active tenant in `localStorage` (`runq-active-tenant-id`)
- [x] `api-client` sends `X-Tenant-Id` on every request
- [x] Cmd-K palette has a "Switch client" section (gated on ≥2 tenants)
- [x] Cross-tab sync: switching in one tab reloads the others

### Week 3 — Invite flows (both directions) ✅
- [x] `tenant_invites` table + migration `0056_tenant_invites.sql`
- [x] `invite_type` enum migration `0058_invite_type.sql` with two flows:
  - **`new_tenant`**: CA invites a prospect → accept creates new tenant + `client_owner`, attaches CA as `accountant`
  - **`join_tenant`**: tenant owner invites a CA / teammate → accept attaches them to existing tenant (no new tenant)
- [x] Three accept sub-flows for `join_tenant`:
  - (a) Logged-in user → one-click accept
  - (b) Existing user not logged in → email + password → log in & accept
  - (c) Brand-new user → register & accept
- [x] CA-prefilled `company_name` migration `0059_invite_company_name.sql`
- [x] Settings → **Invitations** page with dual-mode picker, sent-invitations table, copy/email/revoke actions, send-via-email toggle
- [x] Public `/signup/invite/:token` page (light-themed, runQ logo, instrument-serif headlines)

### Week 4 — Read-only gating + role hardening ✅
- [x] Audited write endpoints — `WRITE_ROLES = ['owner', 'accountant']` excludes viewer correctly across all modules
- [x] Hid write CTAs for viewer on Invoices, Bills, Customers, Receipts, Credit Notes, Vendors, Payments, Debit Notes, Banking Accounts via `useIsReadOnly()` hook
- [x] Added `client_owner` role (migration `0057_client_owner_role.sql`); assigned at invite-accept; `rbacHook` treats as owner-equivalent
- [x] **Critical security fix:** `rbacHook` now reads `request.activeRole` (per-tenant, from `user_tenants`) instead of JWT `role`. Without this, a CA who is owner in their home tenant would have owner powers in every client tenant.
- [x] Forged `X-Tenant-Id` returns 403 explicitly (no silent fallback)

### Week 5 — Testing ✅
- [x] Two-user isolation: forged header → 403; cross-tenant data leaks impossible
- [x] Per-tenant role enforcement: same user is `owner` in tenant A and `accountant` in tenant B → backend correctly applies different permissions
- [x] Performance: membership lookup adds <1ms to a 2.8ms request. Single indexed query on `(user_id, tenant_id)`. No caching needed.

---

## Above-and-beyond extras (built during Phase 1)

These weren't in the original spec but came up as we built. All shipped.

### Welcome / onboarding
- 4-slide welcome carousel with two variants (`new_tenant_owner` and `ca_joining`)
- Triggered via localStorage flag set on accept-invite (only for register-mode), cleared per-(user, tenant) so it never repeats
- Indigo-violet gradient hero, Instrument Serif headlines matching marketing site
- Dashboard mounts welcome before the existing OnboardingWizard

### UI polish
- Light theme as default (was dark); dark still toggleable
- Login page redesigned: two-column layout with feature pitch + testimonial on left, sign-in card on right; Instrument Serif "*for Indian SMEs.*" gradient headline
- Accept-invite page redesigned in light theme; runQ logo (dark variant) visible
- Topbar **TenantSwitcher** dropdown — visible alternative to Cmd-K
- Profile menu shows user role badge per active tenant
- "Reopen welcome tour" pattern hooks left in place (icon constants exported)

### Real KPIs
- Net Burn (30d), Net Burn delta vs prior 30d, Runway months — all from `bank_transactions`
- Revenue MTD, MoM delta vs same period last month, prior-month total subtitle, daily sparkline — all from `sales_invoices`
- AR/AP historical deltas (vs 30 days ago) computed from invoice + receipt/payment date snapshots
- Empty-tenant graceful state: ₹0 + "Cash positive — no burn" / "No invoices last month"

### Robustness
- `refreshTenants()` on auth provider; called on Cmd-K open and TenantSwitcher open
- Display name fallback: when `users.name` is an email, dashboard greets "Kumar" not "kumar@dailyfresh.in"
- Email-shaped names rejected at validator (defensive against typos at signup)
- Required-field validation on accept-invite: name + email + password + (for new_tenant) company name + slug
- Rate-limit fix: `/auth/*` authenticated endpoints no longer share the strict 10/min cap meant for `/login` — switching tenants doesn't 429
- 401-only sign-out: non-401 errors (429, network blips, 500s) keep the session intact

### Email integration
- `tenantInviteEmail` template (handles both invite types with appropriate copy)
- Optional "Email the link" toggle on invite create form
- Backend reports `emailDelivery: 'sent' | 'failed' | 'skipped'`

### Audit
- `/auth/log-switch` endpoint logs `tenant.switch_in` to `audit_log` on every tenant switch (compliance: "who saw client X's books and when?")

---

## 7-gap hardening pass (post-Week-5)

Done in one focused session before declaring Phase 1 complete.

| # | Gap | Status |
|---|---|---|
| 4 | Settings → Users reads `user_tenants` (members from any home tenant show up; role updates scoped to active tenant) | ✅ |
| 7 | Send invite via email (toggle + template) | ✅ |
| 6 | Audit log for tenant switches | ✅ |
| 3 | Viewer write-gating extended to 7 list pages | ✅ |
| 5 | AR/AP historical deltas (no more fake `−3.1%`) | ✅ |
| 2 | Drop JWT role fallback — every authenticated request now requires a `user_tenants` membership; JWT role never trusted as security input | ✅ |
| 1 | RLS activation | 🟡 Prep done, deferred (see below) |

---

## Migrations applied

| File | Purpose |
|---|---|
| `0055_user_tenants.sql` | `user_tenants` table + backfill |
| `0056_tenant_invites.sql` | `tenant_invites` table |
| `0057_client_owner_role.sql` | `client_owner` value added to `user_role` enum |
| `0058_invite_type.sql` | `invite_type` enum + column |
| `0059_invite_company_name.sql` | `tenant_invites.company_name` for CA prefill |
| `0060_rls_enable.sql` | Row-level security on 85 tables — **NOT applied** (deferred) |

---

## Definition of Done — Phase 1 ✅

- [x] One user can be a member of N tenants
- [x] Cmd-K switcher in web app + visible topbar dropdown alternative
- [x] CA can invite a client → client signs up → CA auto-attached as accountant (Flow A)
- [x] Tenant owner can invite a CA / teammate → join_tenant flow with 3 sub-modes (Flow B)
- [x] Email-send on invite create
- [x] Sent invitations table with persistent state (copy / email / revoke)
- [x] Tenant role badge in profile menu reflects active membership
- [x] `viewer` role cannot write at API layer; key UI CTAs hidden across 9 list pages
- [x] Forged `X-Tenant-Id` → 403; cross-tenant reads/writes isolated
- [x] Per-tenant role enforced (same user, different roles per tenant)
- [x] Existing single-tenant production users have zero regression
- [x] Audit log entries for tenant switches
- [x] Real Net Burn / Revenue MTD / AR-AP deltas (no fake placeholders)
- [x] Welcome tour for new tenant owners + CAs joining
- [x] Light-themed entry pages (login, accept-invite)
- [x] Required-field validation + email-as-name guard on accept-invite
- [ ] RLS active as defense-in-depth — **deferred** (see below)

---

## Deferred to a later phase

### RLS activation

Status:
- `RLS_TABLES` extended to all 85 tenant-scoped tables (`packages/db/src/rls/policies.ts`)
- Migration ready to apply: `packages/db/migrations/0060_rls_enable.sql`
- **Migration NOT yet applied** — would break every query because
  `app.current_tenant_id` is not currently set on the connection.
- **Decision:** deferred. App-layer WHERE-clause isolation + membership-validated
  tenant context + role gating is the active security boundary. RLS becomes
  defense-in-depth when activated.

Rollout plan when picked up (~1 week):

1. **Refactor `apps/api/src/plugins/db.ts`** to expose a per-request DB context:
   - Borrow a connection from the pool on `preHandler`
   - `SET LOCAL app.current_tenant_id = $1` with `request.tenantId`
   - Release the connection on `onResponse`
   - Decorate `request.db` with the per-request drizzle client
2. **Update services** to use `request.db` instead of `app.db` / `request.server.db`.
   The existing services accept a `Db` constructor arg, so the change is mechanical
   across the ~50 service files.
3. **Test pass:** run the full integration suite under a non-bypass DB role to
   ensure no query relies on cross-tenant visibility.
4. **Apply `0060_rls_enable.sql`** in production.
5. **Verify** with the same two-user isolation scenarios used in Phase 1 Week 5.
6. **Grant/revoke**: app role should have `INSERT/UPDATE/DELETE/SELECT` on
   tenant-scoped tables but lack `BYPASSRLS`.

Why this is its own phase: the dbPlugin refactor touches 50+ services. It's a
multi-day initiative that needs its own staging window, not a 1-hour ticket.

### Other Phase 2 nice-to-haves (lower priority than For-CAs work)

- Drop legacy JWT `tenantId` entirely (currently still used to resolve the user's
  home tenant when `X-Tenant-Id` header is absent — always membership-validated,
  so no security risk; just cleanup)
- Extend write-CTA gating to remaining modules (Reports, GST, Workflows, HR, Fixed Assets, Masters)
- AR/AP **sparkline** (delta + value already real; sparkline still uses fallback shape)
- "Reopen welcome tour" link in help menu (icons already exported)
- Cross-tenant audit search ("show me everything Priya did across her clients")
