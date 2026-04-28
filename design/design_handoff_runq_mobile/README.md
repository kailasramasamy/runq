# Handoff: runQ Mobile (Flutter app)

## Overview

This bundle is the design specification for **runQ Mobile** — the on-the-go companion to the runQ web product (an AI-native, agent-first books-of-account / GST / cash management platform for Indian SMEs). The app gives a small business owner or finance lead a glanceable view of cash, AR, AP, and GST status, plus the ability to act on the move: scan bills with AI extraction, send WhatsApp invoice reminders, approve payments, reconcile bank transactions, and converse with the runQ agent.

The target platform is **Flutter** (iOS + Android from one codebase). The prototype in `prototype/` is a high-fidelity HTML/React mock built inside an iPhone 15-class device frame; it represents pixel-level intent, not the production codebase.

## About the design files

The files in `prototype/` are **design references** — an interactive HTML/React prototype showing the intended look, layout, copy, status vocabulary, and behaviour. **They are not production code to lift.** Your task is to recreate these screens in Flutter using:

- **Material 3** as the base, with a custom `ColorScheme.fromSeed(seedColor: Color(0xFF4F46E5))` and the typography overrides documented below.
- The codebase's existing widget primitives, theming, routing, and state-management conventions. If those don't exist yet, set them up before screen work — pick `go_router` for navigation, `riverpod` or `bloc` for state (team preference), and a single `AppTheme` class that owns colours and text styles.
- Cupertino-flavoured affordances (sheets, swipe-back) on iOS where it improves feel — the prototype uses iOS chrome but the design language is platform-neutral and should adapt to Material on Android.

Tap through the prototype first (`open prototype/runQ Mobile.html` in any browser; or open the project root and click that file). It is the source of truth for spacing, motion, hierarchy, and copy. **When in doubt, screenshot the prototype and match it.**

## Fidelity

**High-fidelity.** All colours, type sizes, spacing, radii, shadows, status pill vocabulary, and Indian-rupee number formatting are final. Match them. The only deliberately loose areas are:

- Iconography: the prototype draws icons inline as small SVG components in `ui.jsx`. In Flutter, swap to `Icons.*` (Material) or a coherent icon pack like `phosphor_flutter` or `lucide_icons`. Keep the metaphors (camera = scan, paper plane = send, building = bank, sparkle = AI).
- Empty/loading/error states are not drawn for every screen. Use the patterns in the prototype's `Card` + skeleton conventions and follow Material 3 defaults for what's missing.

## Brand & product context

- **Name:** runQ. The wordmark uses **League Spartan 800**, with the Q in the brand indigo (`#4F46E5`) and "run" in a neutral text colour. Replicate this in Flutter using a `Text.rich` with two `TextSpan`s.
- **Voice:** confident, terse, India-aware. Numbers in **₹ lakhs/crores** grouping (Indian numbering system, not Western). Examples: ₹4,99,500 (not ₹499,500); ₹47.2L; ₹1.24Cr. Use the `formatINR(value, { compact })` helper logic from `prototype/ui.jsx` as the spec for a Dart `IndianRupeeFormatter`.
- **GST/tax vocabulary:** GSTIN, HSN, IGST/CGST/SGST, GSTR-1, GSTR-3B. Three-way match (PO ↔ GRN ↔ Bill) appears on bill detail.
- **Status vocabulary** (must match exactly): `paid`, `partially_paid`, `sent`, `overdue`, `draft`, `pending_match`, `approved`, `pending_approval`, `pending`. Pill colours for each are listed in **Design tokens** below.

## Information architecture

```
RootShell (bottom nav, FAB)
├── Home (Dashboard)
├── Invoices (AR)
│   └── Invoice Detail
├── [FAB] → Quick Action Sheet
│           ├── Scan a bill        → Bill Scan flow
│           ├── Create invoice     → Invoices
│           ├── Record payment     → Invoices
│           └── Pay a vendor       → Bills
├── Bills (AP)
│   └── Bill Scan (capture → extracting → review)
├── Banking
├── Approvals (modal-style)
└── Agent (full-bleed chat)
```

The bottom tab bar floats inside a frosted, rounded pill (12px side margin, 22px corner radius, 92% opacity white with `BackdropFilter blur 20 saturation 1.8`). It hides on these screens because they own the bottom: `invoiceDetail` (sticky CTAs), `billScan` (camera/CTA), `approvals` (action bar), `agent` (composer).

## Screens

For every screen below: status bar takes top **54px**; safe-area home-indicator zone is **34px** at bottom; tab bar (when shown) sits above home indicator with **28px** bottom padding. Page background is `#F7F5F1` (warm bone). Cards default to white `#FFFFFF` with `0.5px solid rgba(20,18,16,0.08)` border and `0 1px 3px rgba(20,18,16,0.04)` shadow.

### 1. Dashboard (Home)

**Purpose.** Glanceable answer to "how's the business today?" plus 4 high-frequency actions.

**Hero — Cash position card.** Full-bleed (16px gutters), dark indigo gradient `linear-gradient(135deg, #1E1B4B 0%, #312E81 60%, #3730A3 100%)`, 22px radius, 20px padding, white type.
- Top row: tiny "Cash position" caption, opacity 0.65, 11/500.
- Headline number: `formatINR(total, { compact: true })` at **34/700**, letter-spacing −0.02em, tabular-nums. Trend chip beside it: green `+5.2%` pill if positive.
- Sparkline: 14-point line chart (data in `data.js → cashSpark`), 56px tall, indigo-200 line `#A5B4FC` over indigo-900 fill at 0.18 opacity. Last point gets a small filled dot.
- Mini-stat strip below sparkline, divided by `1px solid rgba(255,255,255,0.15)`:
  - **Owed to you (AR)** — `₹X.XXL` · "2 overdue" red caption
  - **To pay (AP)** — `₹X.XXL` · "3 due this week" amber caption

**Quick actions row.** 4 cards, equal flex, 96px tall, 14px radius, 12px padding, white, 10px gap. Each: 20×20 icon top-left in brand-tinted square (e.g. indigo for Scan, cyan for Invoice, green for Reconcile, amber for Approve), 14/600 label, 11/500 sub. Tap navigates.
1. Scan bill — camera icon, "AI extract"
2. Invoice — paper-plane, "Create + send"
3. Reconcile — bank, "13 to match"
4. Approve — check, "4 pending"

**Section: Needs your attention.** Header row: "Needs your attention" (15/600) + "Ask agent →" link (12/600 indigo). Horizontal-scroll snap row of 4 spotlight cards, each `200×148`, 16px radius, 14px padding:
1. **Overdue** (amber gradient `linear-gradient(160deg, #FEF3C7, #FDE68A)`): activity icon top-left in 32px tinted square + "Overdue" pill top-right. Bottom: ₹4,99,500 in 24/700, "2 invoices · 11d since reminder" in 12/normal, then footer "Send reminder →" with WhatsApp icon. Brand colour `#92400E`.
2. **Save** (purple gradient `linear-gradient(160deg, #EDE9FE, #DDD6FE)`): sparkle icon + "Save" pill. Headline "SAVE ₹11,744" with the rupee figure at 24/700. Sub "Bharat Steel · 2% by 5 May". Footer "Pay now →". Brand `#5B21B6`.
3. **GST On track** (green gradient `linear-gradient(160deg, #ECFDF5, #D1FAE5)`): a 32px circular progress ring at 92%, with "92%" centered inside in 9/700. "On track" pill top-right. Headline "13 days" 24/700, sub "GSTR-1 April · 2 invoices missing HSN", footer "Fix & review →". Brand `#047857`.
4. **Cash 30 days** (dark indigo gradient `linear-gradient(160deg, #1E1B4B, #312E81)`, white type): activity icon, "−26%" red caption top-right. Headline ₹47.2L compact, sub "Cash · 30 days", footer "Ask agent →" with sparkle.

All four cards drop the prose paragraphs in favour of: glyph + status pill + headline number + one-line context + tap-to-act footer.

**Section: Recent activity.** Vertical list of 6 rows, dividers between (`0.5px rgba(20,18,16,0.06)`). Each row: 36px circular avatar (initials over coloured fill — green for paid, amber for due, indigo for default), then a 2-line cell: action title (13/600, e.g. "Royal Hardware paid INV-2026-0137") + timestamp (11/normal, muted). Trailing `₹` figure in 13/600 tabular.

### 2. Invoices (AR)

**Purpose.** Browse, filter, send, and chase customer invoices.

**Header.** "Invoices" 22/700 + searchbar (rounded, 40px, magnifier icon left, "Search invoices, customers" placeholder).

**Tabs.** Segmented control: `All · Outstanding · Overdue · Paid · Drafts`. Underline-style. Counts in subscript (e.g. "Overdue 2"). Active tab text `#1A1714` 13/600, inactive `#7B7468` 13/500. Underline `2px solid #4F46E5`.

**Summary strip** (above list): 2 stat cards side-by-side — "Outstanding ₹6.2L (12 invoices)" + "Overdue ₹4.99L (2 invoices, red)".

**Invoice row** (left→right): 36px circular avatar with customer initials over a colour derived from name hash (use `Color((name.hashCode & 0xFFFFFF) | 0xFF000000)` with 0.15 opacity fill + matching solid initials). Then a 3-line stack: customer name (14/600), invoice ID + " · " + date (12/500 muted), then a status pill OR a partial-pay progress bar. Trailing: amount (15/700 tabular). Tap → Invoice Detail.

**Status pills** (height 22, 7px H padding, 6px radius, 11/600, uppercase, letter-spacing 0.04em):
- `paid` — bg `#D1FAE5` text `#047857`
- `sent` — bg `#DBEAFE` text `#1E40AF`
- `partially_paid` — show progress bar instead: 4px tall, full-width row item, indigo `#4F46E5` fill on `#E5E7EB` track, with label "₹80,000 of ₹1,24,800 paid" 11/500
- `overdue` — bg `#FEE2E2` text `#B91C1C`, with a tiny `!` glyph
- `draft` — bg `#F3F4F6` text `#6B7280`

### 3. Invoice Detail

**Header.** Back chevron (left), invoice ID centred, share icon right.

**Hero card.** Customer block: 48px avatar + name (16/600) + GSTIN (11/500 mono muted) + city. Then big amount block: "Total" caption + ₹ figure (32/700 tabular). Status pill below.

**Line items table.** 3-column: description (left, 14/500), qty × rate (12/500 muted), line total (14/600 right). Dividers `0.5px`. Show 3-5 items; if more, "View all N items" link.

**GST breakdown.** A bordered card listing Subtotal, IGST/CGST/SGST (whichever applies based on inter/intra-state), Total. Each row 12/500 with right-aligned amounts.

**Payment history** (if partial). Mini-list of payments received: date · method (UPI/NEFT/Cash) · amount.

**Sticky footer** (above home indicator, 0.5px top border, 16px H padding, 12px V): two CTAs side-by-side:
- **WhatsApp** — green `#25D366` filled button, WhatsApp icon + "Send reminder", flex 1.
- **Record payment** — indigo filled, flex 1.

### 4. Bills (AP)

**Purpose.** Browse, approve, and pay vendor bills. Mirrors Invoices structurally.

**Header.** "Bills" 22/700 + scan-bill button (right, indigo filled circle, camera icon, 40px).

**Tabs.** `All · To approve · Pending match · Approved · Paid`.

**Bill row.** Same anatomy as invoice row, with two added affordances:
- **AI badge** — when `bill.ai === true`, a tiny purple chip "AI" inline next to bill ID, indicating fields were extracted automatically.
- **3-way match indicator** — small dot + text: "✓ 3WM" green when matched, "⚠ Match needed" amber, no indicator when N/A.

Status pills include `pending_match` (amber `#FEF3C7` / `#92400E`) and `approved` (`#DBEAFE` / `#1E40AF`).

### 5. Bill Scan flow

A 3-step modal, full-screen, no tab bar.

**Step A — Capture.** Pure black background, framing rectangle in centre with corner brackets (white, 32px L-shapes at each corner). Live "viewfinder" placeholder (in Flutter use `camera` package). Bottom: shutter button (72px circle, white border, white inner), gallery icon left, flash icon right. Tap shutter → step B.

**Step B — Extracting.** Card slides up from bottom. 80px sparkle icon, animated pulse. "Reading the bill…" 18/600. Below it a 4-step progress checklist with each step ticking on as it completes (~600ms per step):
1. Detecting fields (vendor, GSTIN, total)
2. Matching to vendor "Bharat Steel Co."
3. Extracting line items
4. Looking for matching PO

**Step C — Review.** Form-style card with all auto-extracted fields. Each field is a row: label (11/500 muted) + value (15/600). Sparkle icon to the left of any AI-extracted field, indicating editable AI suggestion. Fields:
- Vendor (with GSTIN)
- Bill date · Due date
- Subtotal · GST breakdown · Total
- 3-line items
- **PO match** card: green tinted, "Auto-matched to PO-2026-0044 · 100%" with a "View PO" link.

**Sticky footer.** "Save as draft" (ghost) + "Submit for approval" (indigo filled).

### 6. Banking

**Account carousel.** Horizontal-scroll snap of bank cards, each `260×140`, 18px radius, 16px padding. Each card uses its bank's brand colour as a subtle gradient (`#F37021` for ICICI, `#004C8F` for HDFC, etc.) at low opacity over white, with the bank name in its brand colour at top-left (12/600), masked account number (11/500 muted), then balance (24/700 tabular). Bottom strip: "{n} uncategorized" amber link if n > 0.

**AI reconciliation banner.** Below carousel. Indigo-tinted card (bg `#EEF2FF`, border `0.5px solid #C7D2FE`): sparkle icon + "13 transactions ready to auto-match" headline + "Review and confirm in 30 seconds" sub + "Review →" CTA right-aligned. 12px radius, 14px padding.

**Transaction list.** Grouped by date with sticky date headers (e.g. "Today · 28 Apr"). Each row:
- Direction icon (24px circle): green up-arrow for inflow, red down-arrow for outflow.
- 2-line cell: narration (truncated to 1 line, 13/500), then either matched-to chip ("→ INV-2026-0141 · 98% confidence" green) or suggestion chip ("Suggested: Office Snacks" purple) or "Uncategorised" muted.
- Trailing amount: 15/600 tabular, green `#047857` for inflow, default for outflow.

Tapping a suggestion chip opens an inline accept/edit sheet.

### 7. Approvals

**Header.** "Approvals" 22/700 + "Pending (4)" subtitle.

**Approval card** (one per pending item, full-width, 14px radius). Top strip: kind icon (bill/payment/invoice) + ref (e.g. "BIL-2026-0089") + age ("17m ago") right-aligned. If urgent, prepend a red dot + "URGENT" 10/700 uppercase chip.

Body: who (vendor/customer name 15/600), amount in 22/700, requested-by line ("Anita Rao requested 10:14am").

Actions row: **Decline** (ghost red, flex 1) + **Approve** (filled green, flex 1). On tap, the card animates to a confirmed state showing a green tick and the action label, then collapses out of the list.

### 8. AI Agent

Full-bleed chat. No tab bar. The composer pins to the bottom with safe-area inset.

**Header.** Sparkle icon + "Agent" + a "Close ✕" right.

**Message list** (scrolls):
- **User bubble:** right-aligned, indigo `#4F46E5` fill, white text, 18px radius corners (sharper bottom-right at 4px), max-width 75%.
- **Agent bubble:** left-aligned, `#FFFFFF` fill, 0.5px border, 18px radius (sharper bottom-left at 4px), 14/500 body. Above each agent message: tiny sparkle + "Agent" 10/700 uppercase muted.
- **Suggestion chips** (under agent message): row of 1-3 pills, 36px height, 18px radius, white bg with 0.5px border, 12/500 indigo text, tap to send as user message.
- **Rich data card** (when agent answers with a forecast, P&L line, etc.): inline card inside the agent bubble — title (12/600), big number (22/700 tabular), 30px sparkline, "Open full view →" link.

**Composer.** White card pinned to bottom (above home indicator), 0.5px top border, 12px V padding, 16px H padding. Row: text field (40px, 12px radius, `#F6F4F0` fill, "Ask anything…" placeholder), then send button (40px circle, indigo filled, paper-plane icon white).

## Interactions & motion

- **Screen transitions:** 180ms `rqFade` (opacity + 4px Y). In Flutter use a `FadeTransition` + small `SlideTransition` on `PageRoute`.
- **FAB toggle:** 200ms ease, `transform: rotate(45deg)` on the `+` glyph when sheet is open.
- **FAB sheet:** 220ms `cubic-bezier(0.2, 0.8, 0.2, 1)`, slides up 16px + opacity. Backdrop fades in at 150ms with 2px blur.
- **Sparkle pulse** (used on AI badges, hero, chat avatar): 2s `ease-in-out` infinite, scale 1 → 1.15 + opacity 0.6 → 1.
- **Approval card confirm:** 300ms cross-fade to confirmed state, then 250ms collapse-and-remove with a tiny height tween.
- **Bill-scan extracting checklist:** stagger ticks ~600ms each.
- **Tap feedback:** 95% scale on press (100ms in, 150ms out) for primary CTAs and quick-action cards. Use Flutter `InkWell` or a custom `AnimatedScale`.

## State management

State you need globally:
- **Auth/session** (out of scope of this design — assume the user is logged into a workspace).
- **Live data slices** (`invoices`, `bills`, `banks`, `bankTxns`, `approvals`, `customers`, `vendors`, `insights`, `cashSpark`). Mock shapes are in `prototype/data.js` — treat that file as the canonical schema for the API contract.
- **Nav stack** — the prototype models nav as a stack of `{screen, params}` (see `app.jsx`). In Flutter use `go_router`'s nested shell route with the bottom-nav shell at root and modal/full-screen routes for invoiceDetail / billScan / approvals / agent.
- **FAB sheet open/closed** — local to shell.
- **Theme tweaks** — primary colour, accent, density, AI prominence, nav style (FAB vs flat tabs), tab labels on/off. The prototype exposes these via the Tweaks panel; in production these become user settings (most should be hard-coded; see "Tweaks" below for what to keep configurable).

## Design tokens

Drop these into a `runq_tokens.dart` file as a starting point.

### Colours

```dart
// Brand
const rqIndigo       = Color(0xFF4F46E5); // primary
const rqIndigoDeep   = Color(0xFF3730A3);
const rqIndigoDarkest= Color(0xFF1E1B4B); // hero card start
const rqIndigoDeep2  = Color(0xFF312E81); // hero card mid
const rqIndigoLight  = Color(0xFFA5B4FC); // sparkline / accents on dark
const rqAccent       = Color(0xFF7C3AED); // accent purple

// Neutrals
const rqInk          = Color(0xFF1A1714); // body text
const rqInk2         = Color(0xFF3F3A33);
const rqMuted        = Color(0xFF7B7468);
const rqMuted2       = Color(0xFF9C9489);
const rqBgWarm       = Color(0xFFF7F5F1); // page bg
const rqBgWarmer     = Color(0xFFECE9E2); // stage bg (web only)
const rqSurface      = Color(0xFFFFFFFF);
const rqHairline     = Color(0x14141210); // 0.08 black

// Status semantics
const rqGreenBg      = Color(0xFFD1FAE5); const rqGreenInk = Color(0xFF047857); // paid, healthy
const rqAmberBg      = Color(0xFFFEF3C7); const rqAmberInk = Color(0xFF92400E); // overdue / pending_match
const rqRedBg        = Color(0xFFFEE2E2); const rqRedInk   = Color(0xFFB91C1C);
const rqBlueBg       = Color(0xFFDBEAFE); const rqBlueInk  = Color(0xFF1E40AF); // sent / approved
const rqPurpleBg     = Color(0xFFEDE9FE); const rqPurpleInk= Color(0xFF5B21B6); // AI suggestion
const rqGrayBg       = Color(0xFFF3F4F6); const rqGrayInk  = Color(0xFF6B7280); // draft

// Channels
const rqWhatsApp     = Color(0xFF25D366);
```

### Typography

Inter for body/UI; League Spartan 800 for the runQ wordmark only.

| Token        | Size / Weight / LH | Usage |
| ------------ | ------------------ | ----- |
| display      | 34 / 700 / 1.05    | Hero number on Dashboard cash card |
| h1           | 28 / 700 / 1.1     | Invoice/bill detail amount |
| h2           | 22 / 700 / 1.15    | Screen titles |
| h3           | 18 / 600 / 1.2     | Section heads inside detail |
| number-lg    | 24 / 700 / 1.2 tab | Card headline numbers |
| body         | 14 / 500 / 1.4     | Default body |
| body-strong  | 14 / 600 / 1.4     | List primary line |
| caption      | 12 / 500 / 1.35    | Subtitles, GSTIN, dates |
| label        | 11 / 600 / 1.3 0.04em uppercase | Pills, eyebrow labels |
| micro        | 10 / 700 / 1.2 0.06em uppercase | URGENT, ON TRACK, OVERDUE pills |

All numbers — every rupee figure — use `fontFeatures: [FontFeature.tabularFigures()]` and Indian comma grouping.

### Spacing & radii

- Page horizontal gutter: **16px**
- Card padding default: **14-16px**
- Card-to-card vertical gap inside a section: **10-12px**
- Section vertical gap: **20px** between section heads
- Radii: **10** (chips), **12** (input), **14** (small card), **16-18** (medium card), **22** (tab bar pill, hero card)
- Hairline divider: 0.5px `rgba(20,18,16,0.06-0.08)`

### Shadows

- Card resting: `0 1px 3px rgba(20,18,16,0.04)` + `0 0 0 0.5px rgba(20,18,16,0.08)`
- Tab bar / floating: `0 4px 16px rgba(20,18,16,0.08)` + inner `0 1px 0 rgba(255,255,255,0.7)`
- FAB: `0 6px 20px rgba(79,70,229,0.4)` (40% of primary)
- Modal sheet: `0 12px 40px rgba(20,18,16,0.2)`

## Tweaks

Of the variations exposed in the prototype's Tweaks panel, ship to production:

| Tweak                | Ship?            | Notes |
| -------------------- | ---------------- | ----- |
| Primary / Accent     | No               | Brand-locked. Keep `#4F46E5` / `#7C3AED`. |
| Density              | Maybe (Settings) | If you ship, persist per-user. Default `regular`. |
| AI prominence        | Yes (Settings)   | Default `moderate`. Subtle = no sparkles in chrome; Prominent = sparkle + "AI insights · today" eyebrow on Dashboard. |
| Navigation (FAB/tab) | No               | Ship FAB style. The flat-tabs variant is for evaluation only. |
| Tab labels           | No               | Ship with labels (better discoverability). |

## Accessibility

- Minimum hit target **44×44** logical px. All tab-bar items, FAB, list-row tap regions meet this.
- Status is never colour-only — pills always carry a label, and the overdue badge gets a `!` glyph.
- Body text contrast: `#1A1714` on `#F7F5F1` is 16.4:1. Muted `#7B7468` on `#F7F5F1` is 4.7:1 — use only for non-essential metadata.
- `formatINR` should stay readable to screen readers — emit `Semantics(label: "four lakh ninety-nine thousand five hundred rupees")` for hero numbers.
- Respect `MediaQuery.textScaler` in Flutter; the layouts in the prototype are tested up to 130%.

## Indian rupee formatting reference

```dart
String formatINR(num value, {bool compact = false}) {
  if (compact) {
    final abs = value.abs();
    if (abs >= 10000000) return '₹${(value / 10000000).toStringAsFixed(2)}Cr';
    if (abs >= 100000)   return '₹${(value / 100000).toStringAsFixed(2)}L';
    if (abs >= 1000)     return '₹${(value / 1000).toStringAsFixed(1)}K';
  }
  // Indian grouping: last 3 digits, then groups of 2.
  final s = value.round().abs().toString();
  final last3 = s.length > 3 ? s.substring(s.length - 3) : s;
  final rest  = s.length > 3 ? s.substring(0, s.length - 3) : '';
  final grouped = rest.replaceAllMapped(RegExp(r'(\d)(?=(\d\d)+$)'), (m) => '${m[1]},');
  return '₹${value < 0 ? '-' : ''}${rest.isEmpty ? last3 : '$grouped,$last3'}';
}
```

Examples:
- `formatINR(499500)` → `₹4,99,500`
- `formatINR(4720000, compact: true)` → `₹47.20L`
- `formatINR(12450000, compact: true)` → `₹1.25Cr`

## Assets

`prototype/assets/`:
- `logo.svg` — runQ wordmark (League Spartan, indigo Q). Re-render in Flutter with `Text.rich` (or convert to a packaged SVG via `flutter_svg`).
- `runq-favicon.png` — square mark, useful as placeholder for app icon at small sizes.

The prototype uses inline-SVG icons (drawn in `ui.jsx` as small React components like `I.home`, `I.bank`, etc.). In Flutter, replace with Material/Cupertino icons or a coherent icon pack — keep the *metaphor* (camera = scan, paper-plane = send, building = bank, sparkle = AI), but don't try to port the SVG paths.

There is no real photography in the prototype. If product wants imagery (for empty states, onboarding, etc.), commission separately.

## Files in this bundle

```
design_handoff_runq_mobile/
├── README.md                      ← this file
└── prototype/
    ├── runQ Mobile.html           ← entry point (open in any browser)
    ├── app.jsx                    ← shell, nav stack, bottom tab bar, FAB sheet, Tweaks
    ├── screens.jsx                ← all 8 screens
    ├── ui.jsx                     ← shared primitives + icon set + formatINR
    ├── data.js                    ← mock data (invoices, bills, banks, txns, approvals, customers, vendors)
    ├── ios-frame.jsx              ← iPhone bezel + status bar (design-only chrome)
    ├── tweaks-panel.jsx           ← in-design tweak controls (do not port)
    └── assets/
        ├── logo.svg
        └── runq-favicon.png
```

## Suggested implementation order

1. **Theming & tokens** — wire `runq_tokens.dart`, build a `RunqTheme` extending Material 3, register Inter (via `google_fonts` or asset).
2. **Shell** — `RootShell` with bottom nav pill, FAB, FAB sheet, route transitions.
3. **Dashboard** — hero, quick actions, "Needs your attention" cards, activity feed. This screen exercises the most primitives; everything else reuses them.
4. **Invoices list + detail** — pulls in status pills, partial-pay progress, sticky CTA pattern.
5. **Bills list + Bill Scan flow** — camera, extracting animation, review form. Mostly mirrors invoices plus the scan flow.
6. **Banking** — bank carousel + transaction grouping + match chips.
7. **Approvals** — confirm-and-collapse animation.
8. **Agent** — chat surface, suggestion chips, rich data cards. Wire to whatever backend the runQ agent runs on.

Ship dashboard + invoices + bills first as a vertical slice; banking/approvals/agent can land in a follow-up.

## Questions to resolve before coding

- **Backend contract.** The shapes in `data.js` are the design's assumed schema. Confirm with the runQ web team's API.
- **Camera permissions copy** — needs a product decision before implementing scan flow.
- **WhatsApp send** — assumed deep-link via `wa.me/{phone}?text=…`. Confirm with the team whether to use the WhatsApp Business API instead for sent-receipts / template messages.
- **Push notifications** — surfaces (overdue reminders, approval requests) are not designed yet. Out of scope of this handoff.
