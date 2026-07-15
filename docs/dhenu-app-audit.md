# Dhenu App Audit — Gaps, UX, Reliability

**Date:** 2026-07-15 · **Scope:** apps/collect (farmer, VMCC, CC, PP, admin switcher) · **Method:** 3 parallel deep code audits (farmer surface, VMCC operator flows, shared infra + CC/PP)

Complements `dhenu-feature-roadmap.md` — nothing here duplicates P1–P5 roadmap items (referral, feed ordering, notifications infra, hardware, multi-society). PP Phase 5 deliberately excluded.

**Legend:** ✅ done · 🔄 in progress · ⬜ todo

---

## Tier 1 — Money-trust correctness (farmers/operators are shown wrong money data)

| # | Status | Finding | Where |
|---|---|---|---|
| A1 | ✅ | **Net-payable subtracts ALL-TIME ledger deductions from one cycle's gross** — an old feed loan wrongly reduces (even negates) this cycle's payable; the outstanding-advance chip then counts it a second time | `farmer_payments_tab.dart:124-133`, `farmer_providers.dart:36` (ledger fetched with no date range) |
| A2 | ✅ | **Every past cycle row shows a green "PAID" chip unconditionally** — no payment status exists; history shows gross (no deductions) so it can't be reconciled with the net card above it | `farmer_payments_tab.dart:348,323` |
| A3 | ✅ | **Offline double-pay hole**: duplicate guard + picker "Recorded" tags read server-backed providers only; offline re-entry of the same farmer/slot creates a second queued pour with a fresh `deviceLocalId` → both post | `record_collection.dart:186-189,237-240`; `pour_queue.dart:68-69` |
| A4 | ✅ | **Sync queue poison-entry stall**: `drain()` catches all errors, re-queues, and `break`s — one pour the server keeps rejecting (shift closed, no rate chart) blocks every pour behind it forever; `attempts`/`lastError` recorded but never used | `pour_queue.dart:117-139,199` |
| A5 | ✅ | **Streak disagrees between Home and Rewards** (current-cycle pours vs this-month pours) — visible contradiction in the gamified feature | `farmer_home.dart:529` vs `farmer_rewards.dart:235` |
| A6 | ✅ | **Quality bonus is invisible in Payments** — bonus approximated as `lineAmount − qty×rate` which is ~0 when the server stores the blended rate, so the farmer's quality premium (the point of the nudges) never renders | `farmer_payments_tab.dart:120-122` |

## Tier 2 — Field reliability (spotty-connectivity failure modes)

| # | Status | Finding | Where |
|---|---|---|---|
| B1 | ⬜ | **Offline-saved pours are invisible** — "Saved on device" toast, then the pour appears nowhere (Today's entries reads recorded providers only; count chip is the sole trace) | `record_collection.dart:718-754` |
| B2 | ⬜ | **No failed/pending pour inspection** — `PendingPour.hasFailed`+`lastError` computed but never surfaced; tapping the sync chip just drains. No per-pour retry/delete | `pour_queue.dart:201-210`, `sync_status.dart:72-80` |
| B3 | ⬜ | **CC/PP writes have zero offline support** — receive, dispatch, manual receive, shift close all call the API directly and throw on 2G; the pour queue pattern covers VMCC capture only | `receive_consignment_screen.dart:116`, `cc_dispatch_tab.dart:73,193`, `manual_receive_screen.dart:303` |
| B4 | ⬜ | **Raw exceptions dumped at operators** — CC/PP screens render `'$e'` (`SocketException … errno = 61`); no central network→friendly-message mapping (no NetworkException layer like apps/mobile has) | `cc_dispatch_tab.dart:213`, `manual_receive_screen.dart:323,349`, `cc_home.dart:210,303`, `pp_home.dart:110` |
| B5 | ⬜ | **No crash reporting, no analytics** — firebase_core already initialized; Crashlytics is a small add. Production crashes and adoption funnels are invisible today | `pubspec.yaml`, `main.dart:20-30` |
| B6 | ⬜ | **Corrections are online-only** — edit/combine/delete call `reversePour` directly; a wrong entry can't be fixed offline | `record_collection.dart:316-391`, `pour_detail_sheet.dart:41-67` |
| B7 | ⬜ | Timeout constants inconsistent (15s/60s/120s/8s) + stale "30s" comment; no retry/backoff in api_client | `api_client.dart:47,92,130`, `auth_provider.dart:119` |

## Tier 3 — Quick wins (low effort, immediate feel)

| # | Status | Finding | Where |
|---|---|---|---|
| C1 | ⬜ | **Haptic + sound confirmation on pour save** — zero `HapticFeedback` in codebase; eyes-on-queue operators need non-visual confirmation. One line + reuse AudioPlay | `record_collection.dart:393-398` |
| C2 | ⬜ | **Permanent fake "unread" bell dot** on farmer Home — always painted, leads to a "no notifications" toast. Remove until notifications ship (P3.4) | `farmer_home.dart:170-178,152` |
| C3 | ⬜ | **Logout has no confirmation** — one tap drops the session, forcing a fresh OTP round-trip (delete-account confirms; logout doesn't) | `profile_tab.dart:371` |
| C4 | ⬜ | **Placeholder support contacts** — falls back to `+918000000000` / `support@dhenu.app` when tenant config missing; users would dial a dead number | `help_support_screen.dart:12-14` |
| C5 | ⬜ | **Farmer picker sorts by name with a text keyboard** — operators call farmers by code/number; no recent-first ordering | `farmer_picker.dart:64-71,86-87` |
| C6 | ⬜ | **Auto-open farmer picker after save** for true rapid-fire queue entry (form resets but focuses nothing) | `record_collection.dart:475-486` |
| C7 | ⬜ | Statement share forces a cycle pick every time — default to latest | `farmer_statement_share.dart:56-97` |
| C8 | ⬜ | Water mandatory in capture but optional in dispatch — blocks entry when analyzer doesn't emit water | `record_collection.dart:136-140` vs `vmcc_dispatch_tab.dart:237` |
| C9 | ⬜ | Plausibility validation missing — FAT 45 / SNF 30 / 500 L pass silently; add upper bounds + large-qty confirm | `record_collection.dart:137-153` |

## Tier 4 — Language & reach (the audience the app is for)

| # | Status | Finding | Where |
|---|---|---|---|
| D1 | ⬜ | **CC/PP/settings/auth/admin surfaces are 100% hardcoded English** (68 literals in cc/ alone) while ARB kn/ta parity is perfect (439/439 keys) — a Kannada user gets a half-translated app | `cc/*`, `pp/*`, `auth/*`, `settings/*`, `admin/*` |
| D2 | ⬜ | **Language unreachable before login + no device-locale default** — locale defaults `en`, picker only in post-login Profile; a Kannada-only user can't read the login screen | `locale_provider.dart:46`, `login_screen.dart` |
| D3 | ⬜ | **English leaks inside localized farmer screens** — error/offline states, ShiftAccentCard AM/PM/"Not recorded", notifications & help screens, month-name arrays (duplicated 4×), sync chip labels | `dhenu_states.dart:74-92`, `shift_accent_card.dart:60,70`, `sync_status.dart:67-87`, `notifications_screen.dart:42-59` |
| D4 | ⬜ | **Farmer FAQ is operator-oriented and wrong** ("How do I record a collection? Tap Collect…") — farmers don't collect | `help_support_screen.dart:102-118` |
| D5 | ⬜ | Rate matrix under-uses the literacy toolkit — one Listen button reading only the last rate; no spoken "your rate is X, +Y if SNF reaches Z" despite `computeRateCoaching` already computing it | `farmer_rate_chart.dart:361-456` |

## Tier 5 — Missing capabilities (not on the roadmap, real value)

| # | Status | Finding | Where |
|---|---|---|---|
| E1 | ⬜ | **Farmer can't see where their money goes** — "Bank & payout" row is an operator-only dead end for farmers ("Your compensation is set up by your admin") | `profile_tab.dart:204-209`, `bank_payout_screen.dart:21-37` |
| E2 | ⬜ | **No farmer self-serve statement** — cycle-statement PDF share exists but only on the VMCC side; farmers need statements for loans/records. Plumbing exists | `vmcc/farmer_statement_share.dart` |
| E3 | ⬜ | **No dispute/recourse affordance** — farmer pour rows aren't tappable, no "this looks wrong", Help routes to tenant support not their own VMCC | `farmer_collections_tab.dart:595-628` |
| E4 | ⬜ | **Outstanding advance not visible at pour-entry time** — operator tracks farmer debts on paper; ledger balance exists but only in farmer detail | `record_collection.dart:756-792`, `farmer_ledger_sheet.dart` |
| E5 | ⬜ | **No shift-end shareable summary / per-farmer daily slip** — the WhatsApp shift roundup operators do manually isn't absorbed; reuse the PDF/share path | `record_collection.dart:506-513` |
| E6 | ⬜ | **Rate-change transparency** — no notice when the chart pricing a farmer's milk changes; no pull-to-refresh on the rate screen | `farmer_rate_chart.dart:151-162` |
| E7 | ⬜ | Admin's last-operated centre not persisted — cold start always drops to the picker | `centre_switcher.dart:62`, `mp_context_provider.dart` |
| E8 | ⬜ | No end-of-day unclosed-shift nudge (closing only gates dispatch; nothing reminds) | `record_collection.dart:498-513` |

## Polish batch (single cleanup PR)

- Emoji status glyphs → `DhenuIcons` (`cc_receive_tab.dart:177`, `cc_dispatch_tab.dart:522-524`, `pp_home.dart:210,269-271`)
- Hardcoded `Color(0xFF3DDC97)` (`farmer_payments_tab.dart:199,207`), `Color(0xFF4A3300)` (`vmcc_payments_tab.dart:168`) → tokens
- Hardcoded `fontSize:` (`farmer_detail_screen.dart:76,91,92`, `farmer_pours_tab.dart:120`)
- Skeletons for lazily-loaded history rows (`farmer_payments_tab.dart:318`, `farmer_collections_tab.dart:391`)
- Pull-to-refresh on Rate chart + Rewards screens
- `+91` hardcoded country code (`phone_otp_form.dart:182`)
- Offline `_save` invalidates server providers that then error (`record_collection.dart:300-306`)

## What's already strong (leave alone)

Theme-token discipline (zero hardcoded semantic colors in screens), full dark mode, ARB en/kn/ta parity, the OTP flow (resend cooldown, autofill hints, auto-submit), pour-queue `deviceLocalId` idempotency for replay, shift-close gating dispatch, overnight-pooling comprehension aids, cycle lock→pay flow with optimistic paid toggles, fail-open force-update gate.

## Suggested sequence

1. **Money-trust sprint (A1–A6)** — before any pilot demo; wrong payable numbers kill farmer trust permanently.
2. **Offline hardening (A3, A4, B1, B2)** — one coherent piece of work in `pour_queue` + `record_collection`; these four interact.
3. **Quick-wins batch (C1–C9 + polish batch)** — a day or two, big perceived-quality jump.
4. **Crashlytics (B5)** — before wider distribution; can ride any release.
5. **i18n completion (D1–D4)** — gate on which pilot region lands (kn vs ta first); pure wiring since ARB infra is proven.
6. **Farmer value adds (E1–E3, E6)** — co-design with pilot dairy per `dairy-sme-plan.md §5.1`.
