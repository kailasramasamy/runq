# Dhenu — Build Tracker

**Owner:** Kailas · **Created:** 2026-06-13
**Specs:** architecture `dairy-sme-plan.md §3.7` · UI `dhenu-design-spec.md` · data model `dhenu-schema-spec.md`
**Convention:** every API increment ships with a live e2e against `runq_dev` before it's marked ✅.

**Legend:** ✅ done · 🔄 in progress · 🔜 next · ⬜ todo · ⏸ deferred

---

## Phase 0 — Foundations

| # | Item | Status | Notes |
|---|---|---|---|
| 0.1 | Brand + architecture decisions | ✅ | Name "Dhenu", own app `apps/collect/`, separate `mp_` module |
| 0.2 | UI design spec (system + 4 dashboards + farmer Part-1) | ✅ | `dhenu-design-spec.md` |
| 0.3 | Schema spec (16 tables) + §8 decisions | ✅ | `dhenu-schema-spec.md` |
| 0.4 | Drizzle schema `milk-procurement/*.ts` + typecheck | ✅ | 9 files, wired into `index.ts` |
| 0.5 | SQL migration `0131_*` applied + verified in dev | ✅ | 16 tables, 17 enums, 3 partial-unique idx |
| 0.6 | Register `milk_procurement` ModuleCode | ✅ | `@runq/types`; not in tenant defaults (premium) |

---

## Phase A — API module (`apps/api/src/modules/milk-procurement/`)

| # | Increment | Status | Depends | Notes |
|---|---|---|---|---|
| A1 | **Masters: nodes + farmers** | ✅ | 0.* | CRUD; farmer auto-vendor + membership; **e2e 17/17** |
| A2 | **Rate charts** — header + cells + rules + `resolveRate()` | ✅ | A1 | matrix/flat; nearest-floor lookup; bonus/slab; grade heuristic (C4 to tune); **e2e 13/13** |
| A3 | **Pour capture** — record / list / reverse | ✅ | A2 | rate resolution on record; receipt_no via `mp_sequences`; offline `device_local_id` dedupe; last-write-wins reversal; **e2e 18/18** |
| A4 | **Consignments** — VMCC→CC, CC→PP | ✅ | A1 | dispatch/receive/variance/reverse; **e2e**. ⚠ PP→`stock_ledger` raw-milk posting deferred (item/warehouse mapping, §9.4) |
| A5 | **QC tests** — bind to pour/consignment | ✅ | A3,A4 | create + list-by-subject + verdict; **e2e** |
| A6 | **Payout** — cycles / lines / deductions / farmer-ledger | ✅ | A3 | generate from pours; advance+feed-loan deductions; lock rolls totals + posts repayment ledger; pay direct/via-VMCC → `payments`; **e2e**. ⚠ GL post on lock deferred to C3 (CoA sign-off) — `journal_entry_id` null |
| A7 | **Operator comp** — commission from pour volume | ✅ | A3 | terms CRUD; `GET /operators/commission` (nodeQty × rate + salary + rent); **e2e** |
| A8 | **Config** — `mp_gl_settings` + `mp_sequences` admin | ✅ | A6 | GET/PUT gl-settings (upsert, default payout mode + account map), GET sequences; **e2e** |
| A9 | **Reports** — collection rollups | ✅ | A3,A6 | `GET /reports/collection` (qty/am-pm/farmers/avg FAT-SNF/gross); **e2e**. Farmer ledger via A6 `/payouts/ledger`; cycle summary via A6 `/payouts/cycles/:id` |

**Phase A (API module) — COMPLETE.** All increments e2e-passed against `runq_dev`.

**⏸ Parked by decision (2026-06-13) — revisit before go-live, not blocking further build:**
- A4 PP receipt → `stock_ledger` raw-milk posting — awaits raw-milk item/warehouse mapping (§9.4).
- A6 GL journal posting on lock — awaits CA chart-of-accounts sign-off (C3); `journal_entry_id` stays null.

**Still open (inputs):** pilot rate chart to seed A2 (C4).

**✅ Persona roles + write-scoping — DONE (2026-06-13, e2e 13/13).** Added `field_operator` + `farmer` to `user_role` (mig 0132), confined to milk_procurement (modules.ts). `access-scope.ts` resolves principal (operator→assigned nodes via `mp_node_operators.user_id`; farmer→own row by phone). Scoped: pours (operator records/reads own node, farmer reads own, blocked from writing), consignments (operator at own node), farmers/nodes lists, payout ledger (farmer own). Verified: operator 403 at other node + blocked from finance; farmer read-only + own-data-only. **B-phase auth unblocked.**

---

## Phase B — Dhenu mobile app (`apps/collect/`, Flutter)

| # | Increment | Status | Depends | Notes |
|---|---|---|---|---|
| B0 | Flutter app scaffold + Dhenu design system | ⬜ | 0.2 | tokens, components, theme, dark mode; own language (not `module-ui`) |
| B1 | Auth + role resolution (Firebase OTP) | ⬜ | B0 | reuse mobile OTP; role → dashboard |
| B2 | VMCC capture flow (`+ Record Collection`) | ⬜ | A3,B1 | most-used screen; manual entry; offline queue |
| B3 | Farmer Part-1 (home, rate, collections, payment, rewards) | ⬜ | A2,A3,A6 | the moat screens; read-mostly + transparency |
| B4 | VMCC / CC / PP dashboards | ⬜ | A3,A4 | the 4 role homes |
| B5 | Services hub stub (Part-2 placeholder) | ⬜ | B3 | "coming soon" grid + notify-me |
| B6 | Localisation + audio read-aloud | ⬜ | B0 | vernacular + 🔊 on rate/payment |

---

## Phase D — Web admin (owner-facing, `/milk-procurement/*`)

Owner manages the flow end-to-end + impersonates personas (UI-context: owner stays owner, "View as" scopes the screen by node/farmer — no token swap).

| # | Item | Status | Notes |
|---|---|---|---|
| D0 | Scaffold — hooks, sidebar nav, routing, module guard | ✅ | `use-milk-procurement.ts`; sidebar `MILK_NAV_GROUPS`; `__root.tsx` routes + BUSINESS_PREFIXES; web typecheck green |
| D1 | Home dashboard (today's collection KPIs + quick links) | ✅ | `/milk-procurement` |
| D2 | Network (nodes) — table + create + deactivate | ✅ | `/milk-procurement/nodes` |
| D3 | Farmers — list + create (auto-vendor + VMCC membership) | ✅ | `/milk-procurement/farmers` |
| D4 | Rate charts — list + create (matrix/flat + Grade-A bonus) | ✅ | `/milk-procurement/rate-charts` |
| D5 | Collection — record pours (*as VMCC* persona) | ✅ | VMCC picker + record form + today's pours |
| D6 | Consignments — dispatch/receive (*as CC/PP*) | ✅ | node picker + dispatch + inbound receive (variance) |
| D7 | Payouts — cycles + lock/pay + farmer ledger | ✅ | cycle list/create/detail + ledger advances |
| D8 | Personas hub — "View as" + farmer view | ✅ | persona cards + farmer pours/ledger view |
| D9 | Operators + Settings + Collection report | ✅ | operator comp + commission calc; payout-mode setting; collection summary |

*All D-pages typecheck-clean + production `vite build` passes (3400 modules). Visual/runtime browser click-through still pending (no browser-automation tool available; backend is e2e-proven).*

## Phase C — Cross-cutting

| # | Item | Status | Notes |
|---|---|---|---|
| C1 | Module-access UI mirrors (web settings + mobile Dart) | ⬜ | so owner can enable/grant `milk_procurement` |
| C2 | Seed data — demo nodes/farmers/rate-chart for `runq-demo` | ⬜ | replace ad-hoc e2e rows |
| C3 | CA review — milk-procurement chart of accounts | ⬜ | blocks A6 go-live |
| C4 | Pilot dairy rate chart + sample slip | ⬜ | tune A2 seed + A6 deductions |
| C5 | Per-active-farmer billing meter | ⏸ | post-MVP; pricing model already decided |
| C6 | Hardware (BT analyzer/scale, thermal printer) | ⏸ | Phase 3 (Q2 2027) per plan |

---

## Recommended build order
~~A1–A9~~ ✅ **entire API backend done & e2e-passed.** Next: **B0 → B2** (Flutter scaffold + Dhenu design system → VMCC capture screen on the live `/pours` endpoint), then the remaining app screens (B3–B6). Cross-cutting C1–C4 in parallel as inputs arrive (pilot rate chart, CA CoA).
