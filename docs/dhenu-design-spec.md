# Dhenu — Design Spec

**App:** Dhenu (milk procurement) · code dir `apps/collect/` · backend `apps/api/src/modules/milk-procurement/`
**Owner:** Kailas · **Created:** 2026-06-13 · **Status:** Sprint 1 — design system + 4 role dashboards + farmer Part-1 screens. Part 2 stubbed.
**Goal:** Ultra-modern, low-literacy-first milk procurement app for farmers, VMCC, CC, PP on one shared backend.

> Scope of this doc: the **Dhenu design language** (§2–3), **information architecture** (§4), the **four role dashboards** (§5), and the **farmer Part-1 moat screens** (§6). Part 2 (agri-services super-app) is intentionally a stub (§6.6) — designed next sprint. Wireframes are ASCII intent sketches, not pixel specs.

---

## 1. Design principles

The user is a low-literacy, vernacular, rural Android user — often on a cheap or shared phone, often offline. Every rule below serves that.

1. **Number-first, text-second.** Liters and ₹ are the heroes — huge, tabular, glanceable. Words are support.
2. **One screen, one job.** The farmer's daily question is "how much milk, what quality, how much money." Answer it above the fold, every time.
3. **Icon + colour + number > label.** Shift = sun/moon. Quality = green/amber/red. A user who can't read still understands.
4. **Thumb-reachable, fat targets.** Min 56px touch targets; primary actions bottom-anchored; nothing critical in the top corners.
5. **Offline is a first-class state, not an error.** Capture works offline; sync status is always visible and calm, never alarming.
6. **Vernacular by default, audio on demand.** Language toggle persists per user; key figures have a 🔊 read-aloud.
7. **Trust through transparency.** Rate chart, deductions, and payment math are always shown in full — the moat is "you can see exactly how you got paid."

---

## 2. Brand & visual language

**Name meaning:** Dhenu = the cow, the source. The brand should feel **fresh, warm, trustworthy, and modern** — dairy-clean surfaces, an agri-confident accent, never childish or "govt-scheme" drab.

**Wordmark:** lowercase `dhenu` with a subtle cow-horn / milk-drop ligature on the **d**. Mark works as a standalone app-icon glyph (drop + horn) on the emerald tile.

### 2.1 Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `brand` | `#0F7A5A` | `#2BAE85` | Primary — emerald (agri trust, fresh) |
| `brand-pressed` | `#0B5E45` | `#1E8A68` | Pressed/active |
| `accent` | `#3DDC97` | `#3DDC97` | Mint — active states, highlights, progress fill |
| `surface` | `#FBFAF6` | `#14150F` | App background (warm milk-white / warm near-black) |
| `card` | `#FFFFFF` | `#1E201A` | Cards, sheets |
| `ink` | `#1A1D1A` | `#F2F3EE` | Primary text/numbers |
| `ink-soft` | `#5B635C` | `#A6ADA4` | Secondary text |
| `hairline` | `#E9E7DF` | `#2C2F28` | Borders, dividers |
| `am` | `#F5A524` | `#F7B64A` | ☀️ Morning shift |
| `pm` | `#6D5BD0` | `#8C7BEA` | 🌙 Evening shift |
| `grade-a` | `#16A34A` | `#34D17B` | Quality A / positive |
| `grade-b` | `#F59E0B` | `#FBBF4A` | Quality B / caution |
| `grade-c` | `#DC2626` | `#F26A6A` | Quality C / deduction / negative |

**Semantic rule:** money-in and good-quality always read emerald/green; deductions and poor quality read red; the two shifts are *always* amber (AM) and violet (PM) everywhere in the app, so colour alone communicates shift.

### 2.2 Typography

- **Latin:** Inter (tabular figures on for all numbers).
- **Indic:** Noto Sans Devanagari / Tamil / Telugu / Kannada / Malayalam / Gujarati / Bengali — matched weights, so a language switch never breaks layout.
- **Min body size 16** (legibility for low-literacy users). Numbers go big.

| Style | Size / weight | Use |
|---|---|---|
| Hero number | 40 / 700 tabular | The headline L or ₹ figure |
| Display | 32 / 700 | Secondary big numbers |
| H1 | 28 / 700 | Screen titles |
| H2 | 22 / 600 | Section heads |
| Title | 18 / 600 | Card titles, list leads |
| Body | 16 / 400 | Default text |
| Label | 14 / 600 | Buttons, chips, captions-strong |
| Caption | 12 / 500 | Timestamps, helper text |

### 2.3 Spacing, radius, elevation, motion

- **Spacing:** 4px base → tokens 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40. Screen padding 20. Min tap target 56.
- **Radius:** card 20 · button 16 · input 14 · pill/chip 999 · sheet top 28.
- **Elevation:** soft and low — one ambient shadow (`y4 blur16 8%`), cards lift only when actionable. No harsh Material shadows.
- **Motion:** 200ms `ease-out` default; **count-up** animation on hero numbers when they change; a slow calm **pulse** on the sync dot; spring (light) on primary-button press. Respect reduce-motion.

---

## 3. Core component library

Built once, themed by the tokens above; reused across all 4 roles.

- **HeroNumberCard** — the big L/₹ figure + a one-line delta (`▲8% vs last`) + optional progress dots. The signature Dhenu surface.
- **ShiftToggle** — segmented ☀️ AM / 🌙 PM control, amber/violet; defaults to the current shift by clock.
- **QualityBadge** — pill showing FAT · SNF · Grade, coloured by grade. Always the same shape everywhere.
- **FarmerRow / SourceRow** — avatar/initials · name · liters · quality · ₹. The atom of every list (farmers at VMCC, VMCCs at CC, CCs/tankers at PP).
- **PrimaryAction** — full-width, bottom-anchored, 56px, emerald. One per screen max (`+ Record Collection`, `+ Receive Tanker`).
- **BottomNav** — 5 items, role-specific (§4.3). Active item emerald with mint underline.
- **SyncStatus** — calm chip in the header: `● Synced 2m ago` / `⏳ 3 to send` / `⚠ Offline — saved on device`. Tappable to force-sync.
- **LanguageToggle** — persistent `EN ▾` in header; switches Latin↔Indic font + strings instantly.
- **AudioPlay** — 🔊 affordance next to key figures (rate, payment) for read-aloud.
- **TankGauge** — horizontal fill bar for BMC / chilling / tanker capacity (`428 / 1000 L`).
- **States** — every list has explicit **empty** ("No collection yet today"), **loading** (skeleton rows), and **offline** variants.

---

## 4. Information architecture

### 4.1 One app, four role-experiences

A user signs in (Firebase phone OTP, per `project_mobile_auth_otp`) and is resolved to a role on this tenant: **Farmer · VMCC operator · CC operator · PP operator**. Role decides the home dashboard + bottom-nav set. No role switcher for v1 (a person is one role); multi-role accounts deferred.

### 4.2 The shared data spine — "one record at four altitudes"

The same physical milk is the same record, viewed at increasing aggregation:

```
Farmer pour ──► VMCC (per-farmer, +QC) ──► CC (per-VMCC aggregate, +QC) ──► PP (per-CC/tanker, +QC)
   sees own        sees its farmers           sees its VMCCs                sees its CCs/tankers
```

Each tier captures **AM/PM totals + QC params (FAT/SNF/temp)**; each higher tier sees the tier below it as its `SourceRow` list. This is why the design system is shared — only the *grain* of the list changes per role.

### 4.3 Navigation per role (bottom nav)

| Role | Tab 1 | Tab 2 (primary) | Tab 3 | Tab 4 | Tab 5 |
|---|---|---|---|---|---|
| **Farmer** | 🏠 Home | 📊 Collections | 💰 Payments | 🛒 Services *(stub)* | 👤 Profile |
| **VMCC** | 🏠 Home | ➕ Collect | 👥 Farmers | 📈 Reports | 👤 Profile |
| **CC** | 🏠 Home | ➕ Receive | 🏭 VMCCs | 🚚 Dispatch | 👤 Profile |
| **PP** | 🏠 Home | ➕ Receive | 🚚 Tankers | 🧪 QC | 👤 Profile |

---

## 5. The four role dashboards

### 5.1 Farmer — Home

```
┌─────────────────────────────┐
│ 🐄 dhenu        ● 2m  🔔  EN▾│
│                             │
│ Namaste, Ramesh 👋          │
│ Cycle 12 · 1–10 Jun         │
│ ┌─────────────────────────┐ │
│ │ THIS CYCLE              │ │
│ │  142.5 L      ₹ 6,840   │ │  ← HeroNumberCard
│ │  ▲ 8% vs last cycle     │ │
│ │  ●●●●●●●○○○   Day 7/10   │ │
│ └─────────────────────────┘ │
│ Today                       │
│ ┌──────────┐ ┌──────────┐   │
│ │☀️ AM 7.5L│ │🌙 PM 6.0L│   │  ← shift split, QualityBadge
│ │FAT 4.2 ·A│ │FAT 4.0 ·A│   │
│ └──────────┘ └──────────┘   │
│ ┌─────────────────────────┐ │
│ │⭐ Quality streak: 6 days │ │  ← rewards nudge
│ │ 4 more Grade-A → ₹200 → │ │
│ └─────────────────────────┘ │
│ [📋 Rate] [🧾 History] [🛒]  │
├─────────────────────────────┤
│ 🏠   📊    💰    🛒    👤    │
└─────────────────────────────┘
```

### 5.2 VMCC operator — Home

Operator's job: record each farmer's pour fast, see the running tank + shift total, sync. The `+ Record Collection` action is the gravity centre.

```
┌─────────────────────────────┐
│ 🐄 Kadod VMCC   ⏳3 send  EN▾│
│ ☀️ AM shift · in progress   │
│ ┌─────────────────────────┐ │
│ │ TODAY ☀️ AM             │ │
│ │  428.5 L   · 37 farmers │ │  ← HeroNumberCard
│ │  Avg FAT 4.1 · SNF 8.6  │ │
│ └─────────────────────────┘ │
│ ┌────────────┐ ┌──────────┐ │
│ │  Pending   │ │ BMC tank │ │
│ │  3 unsent  │ │428/1000L │ │  ← TankGauge
│ └────────────┘ └──────────┘ │
│ Recent entries              │
│ ─────────────────────────── │
│ Ramesh P.   7.5L · 4.2 ·₹360│  ← FarmerRow
│ Sita D.     5.0L · 3.9 ·₹230│
│ Arjun M.    9.2L · 4.4 ·₹470│
│ … 34 more                   │
│                             │
│ ┌─────────────────────────┐ │
│ │   + RECORD COLLECTION   │ │  ← PrimaryAction (bottom)
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ 🏠   ➕    👥    📈    👤    │
└─────────────────────────────┘
```

### 5.3 CC operator — Home

Aggregates inbound from multiple VMCCs; receives by VMCC, dispatches to plant.

```
┌─────────────────────────────┐
│ 🐄 Anand CC      ● synced EN▾│
│ ☀️ AM · inbound from 6 VMCCs │
│ ┌─────────────────────────┐ │
│ │ TODAY ☀️ AM             │ │
│ │  2,540 L   · 6 VMCCs in │ │
│ │  Avg FAT 4.0 · SNF 8.5  │ │
│ └─────────────────────────┘ │
│ VMCC inflow                 │
│ ─────────────────────────── │
│ Kadod VMCC   428L ✓ received│  ← SourceRow
│ Bardoli VMCC 512L ✓ received│
│ Mota VMCC    390L ⏳ transit │
│ … 3 more                    │
│ ⤓ Chilling: 2,540 / 5,000 L │  ← TankGauge
│ ┌────────────┐ ┌──────────┐ │
│ │ + RECEIVE  │ │ Dispatch │ │
│ │   VMCC     │ │ → plant  │ │
│ └────────────┘ └──────────┘ │
├─────────────────────────────┤
│ 🏠   ➕    🏭    🚚    👤    │
└─────────────────────────────┘
```

### 5.4 PP operator — Home

Receives tankers from CCs, runs lab QC, posts accepted milk into runq Inventory as raw-milk batches.

```
┌─────────────────────────────┐
│ 🐄 Main Plant    ● synced EN▾│
│ Today · all shifts · 4 CCs  │
│ ┌─────────────────────────┐ │
│ │ TODAY                   │ │
│ │  12,480 L  · 9 tankers  │ │
│ │  Avg FAT 4.0 · SNF 8.5  │ │
│ │  Variance −0.3% vs disp.│ │  ← reconciliation signal
│ └─────────────────────────┘ │
│ Tanker inflow               │
│ ─────────────────────────── │
│ Anand CC   3,540L  TKR-12 ✓ │  ← SourceRow
│ Nadiad CC  2,980L  TKR-08 ✓ │
│ … 7 more tankers            │
│ ┌────────────┐ ┌──────────┐ │
│ │ + RECEIVE  │ │ QC Lab   │ │
│ │   TANKER   │ │ results  │ │
│ └────────────┘ └──────────┘ │
│ → Accepted posts to runq    │
│   Inventory (raw-milk batch)│  ← integration note
├─────────────────────────────┤
│ 🏠   ➕    🚚    🧪    👤    │
└─────────────────────────────┘
```

---

## 6. Farmer Part-1 screens (the moat)

The farmer's whole reason to open Dhenu daily: *how much, what quality, how much money — and is it fair.*

### 6.1 Rate chart

Shows the farmer exactly where their milk lands and what drives the rate — read-aloud for low literacy.

```
┌─────────────────────────────┐
│ ←  Rate Chart      ☀️ AM ▾ 🔊│
│ Effective 1 Jun 2026        │
│ Your last: FAT 4.2 · SNF 8.6│
│  →  ₹ 48.0 / L   ●          │  ← "you are here"
│ ─────────────────────────── │
│ FAT↓ \ SNF→  8.3   8.5  8.7 │
│ 4.0          44.0 45.0 46.0 │
│ 4.2          47.0[48.0]49.0 │  ← highlighted cell
│ 4.4          50.0 51.0 52.0 │
│ ─────────────────────────── │
│ + Grade-A bonus   ₹1.0 / L  │
│ + Volume >200L    ₹0.5 / L  │
└─────────────────────────────┘
```

### 6.2 Collections (tab) & daily detail

List of days in the cycle; tapping a day opens AM/PM pours with QC and computed line value. Reuses `ShiftToggle` + `QualityBadge`.

### 6.3 Payment — cycle summary

The transparency screen. Every addition and deduction shown; nothing hidden. (Payout cycle = every 10 days per the domain notes.)

```
┌─────────────────────────────┐
│ ←  Payment · Cycle 12    🔊  │
│ 1–10 Jun 2026 · PAID ✓      │
│ ┌─────────────────────────┐ │
│ │ Net paid     ₹ 6,512    │ │
│ │ to ●●●●4821 · 12 Jun    │ │
│ └─────────────────────────┘ │
│ Gross milk   142.5L   7,140 │
│ Quality bonus        + 200  │
│ ─────────────────────────── │
│ Cattle-feed loan     − 600  │
│ Advance              − 228  │
│ ─────────────────────────── │
│ Net payable         ₹6,512  │
│ [ View daily breakup    → ] │
│ [ ⤓ Download statement   ]  │
└─────────────────────────────┘
```

### 6.4 History

Past cycles as cards: cycle no, dates, total L, net ₹, paid status. Tap → that cycle's payment screen (6.3). Simple, scannable, infinite-scroll.

### 6.5 Rewards

Consistency = retention. Streaks, badges, and the referral hook (referral payout is Part 2, but the invite lives here to seed virality early).

```
┌─────────────────────────────┐
│ ←  Rewards                   │
│ ┌─────────────────────────┐ │
│ │ ⭐ 6-day quality streak  │ │
│ │ ●●●●●●○○○○               │ │
│ │ 4 more Grade-A → ₹200   │ │
│ └─────────────────────────┘ │
│ Badges                      │
│ 🥇 Consistent  🐄 100-day   │
│ 🧪 Top FAT     🤝 Referrer  │
│ ─────────────────────────── │
│ Refer a farmer → ₹100 each  │
│ [ Share invite ]            │
└─────────────────────────────┘
```

### 6.6 Services — Part 2 stub

The agri-services super-app, surfaced now as a "coming soon" grid so the navigation is final and users see the roadmap. Tiles are disabled with a single **Notify me** capture; flows designed next sprint.

```
┌─────────────────────────────┐
│ ←  Services          soon    │
│ Coming to Dhenu             │
│ ┌─────────┐ ┌─────────┐     │
│ │🌾 Feed & │ │💊 Medicine│   │
│ │ fodder  │ │ & supps │     │
│ ├─────────┤ ├─────────┤     │
│ │🛡 Insure │ │💰 Loan  │     │
│ ├─────────┤ ├─────────┤     │
│ │🩺 Vet    │ │🐂 AI /  │     │
│ │ visit   │ │ insem.  │     │
│ ├─────────┤ ├─────────┤     │
│ │🤝 Refer  │ │🐄 Cow   │     │
│ │ & earn  │ │ market  │     │
│ └─────────┘ └─────────┘     │
│ [ 🔔 Notify me when live ]  │
└─────────────────────────────┘
```

Part 2 backlog, in launch order (per §8.5): **1) referral + bonus → 2) feed/fodder/medicine ordering** (auto-deduct from payout) → then cattle insurance, cattle loan, vet appointment, AI/insemination booking, cow buy/sell marketplace — on demand.

---

## 7. Cross-cutting

- **Localisation:** language picked at first run, changeable from header anytime; strings + Indic fonts swap live. Numbers/₹ stay tabular Latin digits (universally read).
- **Accessibility / low-literacy:** icon+colour+number redundancy on every status; 🔊 read-aloud on rate and payment; min 16 body, 56 targets; high-contrast checked in light **and** dark (per `feedback_dark_mode_support`).
- **Offline-first:** VMCC capture is the critical offline path — entries save locally and show in `Pending`; `SyncStatus` reflects state calmly; conflict policy = last-write-wins per (farmer, shift, date) with server timestamp.
- **Onboarding:** Firebase phone OTP, then role auto-resolved on tenant (no role chooser). Farmer first-run = 3 cards (your rate, your collection, your payment) then Home.
- **Typography guard:** all Text uses Dhenu theme tokens — mirror the `apps/mobile` font-guard approach (`check-fonts.sh`) so no hardcoded sizes creep in (per `feedback_hr_mobile_typography`).

## 8. Decisions (resolved 2026-06-13)

The throughline: **simplest thing in the UI for v1, future-proof the schema** — so hardware/print/formula can land later without a migration.

1. **Capture = manual entry only (v1).** Operator reads the milk-analyzer + scale and types weight + FAT + SNF on the VMCC `+ Record` screen. **No BT auto-fill in v1** — analyzer/scale integration deferred to hardware **Phase 3 (Q2 2027)**. *Schema:* store `capture_source` (default `manual`) as cheap future-proofing; no device/calibration metadata yet.
2. **Receipt = app-only, no thermal print (v1).** The farmer-app collection/payment screens (§6.2–6.3) *are* the receipt. **No printed slip in v1**; thermal printer deferred to hardware **Phase 3**. *Schema:* every collection line still gets a stable `receipt_no` from day one, so printing can be added later with zero migration.
3. **Rate chart = matrix *or* flat (configurable).** Per chart, either a versioned **FAT × SNF → ₹/L** grid (§6.1) **or** a single **flat per-litre** rate — effective-dated, scoped to society-tier/season, bonuses/slabs on top of both. Formula-coefficient scheme **not** built for v1. Seed industry-standard values; validate against a real pilot chart before go-live. *(Updated 2026-06-13 — flat option added.)*
4. **Farmer ↔ collection-centre = many-to-many in schema, single society in UI (v1).** A membership table from day one (insurance against a painful migration); farmer Home assumes one active society unless the data shows more. (Resolved per recommendation.)
5. **Part 2 launch order:** **(1) Referral** (tiny, viral, already half-surfaced in §6.5) → **(2) Feed/fodder ordering** (recurring purchase, wired to the payout-deduction mechanic — "buy feed, auto-deduct from your milk cheque") → then insurance / loan / vet / AI-insemination / cow marketplace on demand.

### Still needed from Kailas
- A **pilot dairy's real FAT/SNF rate chart** (and a sample collection slip) to validate Q3 cell values and the deduction lines before the schema is built. Not a blocker for structure; is a blocker for going live.
```
