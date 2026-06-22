# Dhenu — Feature Roadmap & Tracker

**Owner:** Kailas · **Created:** 2026-06-21
**Context:** Procurement engine (collection → rate chart → cycles → payout → dispatch → QC) is built and hardened. This doc tracks the *next* surface — moat completion, monetization, retention, hardware, scale.
**Related:** strategy `dairy-sme-plan.md §3.6–3.7` · build state `dhenu-tracker.md` · UI `dhenu-design-spec.md §6.6` (Part-2 stub)

**Legend:** ✅ done · 🔄 in progress · 🔜 next · ⬜ todo · ⏸ deferred

---

## Priority 1 — Close the moat plumbing (gates "farmer-to-shelf" pitch)
These are deferred integration gaps, not new features. They make "one platform" real.

| # | Item | Status | Notes |
|---|---|---|---|
| P1.1 | **Payout → GL journal posting (expense-basis)** | ✅ | Done 2026-06-22 (mig 0151, e2e 15/15). Dedicated dairy CoA (5050 Milk Purchases, 2150 Farmer Payable, 1150 Farmer Advances, 1151 Cattle-Feed Loans). `MpGlPoster` posts: advance/feed grant → Dr asset/Cr Bank; **lock** → Dr Milk Purchases / Cr Payable + recovered advances/loans (`cycle.journalEntryId`); **pay** → Dr Payable / Cr Bank. Honors `mp_gl_settings` account overrides. Payable & advances net to zero across the lifecycle. **Capitalize-as-inventory** (Dr Raw-Milk Inventory / Cr Clearing at PP receipt + valuation/variance) deliberately deferred — revisit with pilot CA. |
| P1.2 | **PP receipt → `stock_ledger` raw-milk batch posting** | ✅ | Done 2026-06-22 (mig 0150, e2e 13/13). PP intake posts a raw-milk batch into `stock_ledger` (one item per milk type via `mp_raw_milk_items`, single warehouse `mp_gl_settings.raw_milk_warehouse_id`, zero-valued — GL/valuation deferred to P1.1). milk type rides on `mp_consignments.milk_type`, derived from the source's real composition; posting is best-effort (skips if unmapped); `reverse()`/`editReceipt` keep stock in lockstep. Web Settings → Raw-milk inventory card. **Follow-on:** operator-driven per-type tanker split on dispatch (today mixed→`mixed` item or skip). |

---

## Priority 2 — Part-2 agri-services layer (revenue + retention engine)
Locked launch order per `dhenu-design-spec.md §8.5`. Turns Dhenu from data-entry tool into sticky platform. The payout-deduction mechanic = captive commerce/lending channel.

| # | Item | Status | Notes |
|---|---|---|---|
| P2.1 | **Referral + bonus** | ⬜ | Tiny, viral, already half-surfaced in Rewards screen (§6.5). Cheapest win — do first. |
| P2.2 | **Feed/fodder/medicine ordering, auto-deduct from payout** | ⬜ | **Highest-leverage feature.** "Buy feed, deduct from milk cheque." Financial rails already exist (advance/feed-loan deduction in payout cycle). |
| P2.3 | Cattle insurance | ⏸ | On demand, post-pilot. |
| P2.4 | Cattle loan | ⏸ | On demand. Leverages guaranteed recurring payout inflow as lending channel. |
| P2.5 | Vet appointment booking | ⏸ | On demand. |
| P2.6 | AI / insemination booking | ⏸ | On demand. |
| P2.7 | Cow buy/sell marketplace | ⏸ | On demand. |
| P2.8 | **Banner ads — farmer-facing** | ⬜ | Ad-revenue channel on farmer Home/Collections/Payments. Natural fit: sponsored slots for feed/medicine/insurance brands — ties into P2.2 commerce (sponsored product → in-app order → payout-deduct). Respect low-literacy/clean-UI principles; cap density, never block core flows. |

---

## Priority 3 — Farmer retention / intelligence (cheap, high stickiness)
Make farmers open the app daily, not twice. All data (FAT/SNF/CLR per pour) already captured.

| # | Item | Status | Notes |
|---|---|---|---|
| P3.1 | **Quality nudges** | ⬜ | "Your FAT dropped 0.3 this week — here's why / talk to a vet." |
| P3.2 | **Earnings projection** | ⬜ | "On track for ₹X this cycle." Daily-open hook. |
| P3.3 | **Best-rate coaching** | ⬜ | Make the you-are-here FAT×SNF matrix actionable: "+1 point SNF = ₹Y more." |
| P3.4 | **In-app notifications** | ⬜ | Foundational infra that powers P3.1/P3.2 nudges, P2.1 referral, payout-ready alerts ("cycle locked, ₹X paid"), shift reminders. Dhenu has its own auth/personas — reuse the FCM stack from `apps/mobile` (`project_fcm_push`) but wire a Dhenu-specific notifier; persona-scoped (farmer vs operator). In-app feed/inbox + push. |

---

## Priority 4 — Hardware (displaces incumbent AMCU/DPMCS)
Parked C6, Phase 3 per plan. But if a pilot dairy already has analyzers, supporting them is the deal-winning wedge.

| # | Item | Status | Notes |
|---|---|---|---|
| P4.1 | BT milk analyzer (FAT/SNF) integration | ⏸ | Isolated in `apps/collect/`, never pollutes ERP mobile. |
| P4.2 | BT weighing scale | ⏸ | |
| P4.3 | Thermal printer (collection slip) | ⏸ | |

---

## Priority 5 — Co-op / scale ops (when a multi-society dairy lands)

| # | Item | Status | Notes |
|---|---|---|---|
| P5.1 | Multi-society rollups + inter-society reconciliation | ⬜ | For the parent dairy managing many VMCCs/societies. |
| P5.2 | Per-active-farmer billing meter | ⏸ | C5 — designed; needed before charging ₹3–5/farmer/mo. |

---

## Recommended sequence
1. **P1.1 + P1.2** — moat plumbing. Do before any new feature.
2. **P2.1 → P2.2** — referral, then feed-ordering-with-payout-deduction (the single highest-leverage build).
3. Co-design **P2.3+, P3.*, P4.*** with the first pilot dairy — don't build speculatively (per `dairy-sme-plan.md §5.1`).

## Open question
- **Is a pilot dairy committed?** Determines whether P2/P4 are built for real usage or on spec.
