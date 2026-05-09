# Handoff: runQ Admin — Tenant Shell, Dashboard & AR Module

## Overview

This package is a hi-fi design reference for **runQ**, an AI-native accounting/ERP product for Indian SMBs. It covers three things:

1. **The full app shell** — sidebar navigation (grouped by Money in / Money out / Books / Compliance / Setup), topbar, command palette (⌘K), notifications, theme toggle, and a Tweaks panel exposing design knobs.
2. **The owner-first Dashboard** — hero greeting + total cash, 5-KPI strip with sparklines, cashflow forecast (actual + AI-projected), agent activity feed, approvals queue, AR/AP aging, GST readiness, period-close checklist, and recent activity. Three layout presets (Owner / Accountant / CA).
3. **The AR (Accounts Receivable) module** — every page in the "Money in" sidebar group, fully built:
   - Customers (list + detail)
   - Invoices (list + detail, with full document layout, e-invoice IRN, activity timeline)
   - Quotes & Sales Orders (tabbed combined page)
   - Credit Notes
   - Receipts (with payment-method badges + unallocated highlighting)
   - Collections (case-card layout)
   - Dunning (Overdue / Rules / Log tabs)

All other sidebar destinations (AP, Inventory, Books, Compliance, Setup) currently render a "Coming soon" placeholder — those modules are out of scope for this handoff.

---

## About the Design Files

**The HTML/JSX files in this bundle are design references, not production code.** They are intentionally built as a single static page using inline Babel-transpiled React + CDN Tailwind so designers can preview the work in any browser without a build step.

The implementation task is to **recreate these designs in your existing codebase's environment** — most likely a real React + bundler setup (Vite / Next.js / etc.) with your established component library, design tokens, routing, and data layer. Adapt the patterns; don't ship the HTML.

If runQ has no frontend codebase yet, choose: **Next.js (App Router) + Tailwind + shadcn/ui** is a clean fit for this design — the visual vocabulary (rounded-md surfaces, OKLCH tokens, Inter + JetBrains Mono, Lucide icons) maps to shadcn directly.

---

## Fidelity

**High-fidelity.** Final colors, typography, spacing, component shapes, hover/active states, and copy are all production-intent. Light + dark themes are designed and verified. Pixel-level fidelity is expected when reimplementing.

---

## File Structure

```
design_handoff_runq_admin/
├── README.md                      ← you are here
├── runQ Admin.html                ← entry point — open in a browser to preview
├── tweaks-panel.jsx               ← floating "Tweaks" panel (theme/density/accent/etc.)
├── assets/                        ← runQ logos (light/dark wordmarks + favicon)
└── src/
    ├── shell/
    │   ├── app.jsx                ← root <App>, routing (RouterView), tweak protocol
    │   ├── sidebar.jsx            ← grouped nav, collapse-to-rail, upgrade card
    │   ├── topbar.jsx             ← breadcrumb, ⌘K trigger, notifications, profile
    │   └── cmdk.jsx               ← command palette overlay
    │
    ├── shared/
    │   ├── icons.jsx              ← Lucide icon wrapper (window.Icon)
    │   ├── data.jsx               ← Dashboard mock data + window.formatINR helper
    │   ├── primitives.jsx         ← Card, Sparkline, Pill, Avatar, Kbd, Dot
    │   └── ar-primitives.jsx      ← AR-specific atoms: PageHeader, Button, Badge,
    │                                 StatusBadge, Table, EmptyState, Pagination,
    │                                 Input, Select, Tabs, StatTile
    │
    ├── dashboard/
    │   ├── hero.jsx               ← greeting + total-cash card
    │   ├── kpis.jsx               ← 5 KPI tiles with sparklines
    │   ├── cashflow.jsx           ← 9-month cashflow chart (6 actual + 3 forecast)
    │   ├── agent-feed.jsx         ← AI agent activity timeline
    │   ├── approvals-actions.jsx  ← Approvals queue + Quick Actions panel
    │   ├── aging.jsx              ← AR & AP aging side-by-side
    │   ├── gst-close.jsx          ← GST readiness ring + period-close checklist
    │   └── recent-docs.jsx        ← recent activity list
    │
    └── ar/
        ├── data.jsx               ← AR mock data — exposed as window.AR
        ├── customers.jsx          ← CustomerList + CustomerDetail
        ├── invoices.jsx           ← InvoiceList + InvoiceDetail (the showcase)
        ├── quotes-credits-receipts.jsx
        │                          ← QuotesSOsPage, CreditNotesPage, ReceiptsPage
        └── collections-dunning.jsx
                                   ← CollectionsPage (case cards) + DunningPage (3 tabs)
```

### Load order (in `runQ Admin.html`)

The HTML loads scripts in dependency order:
1. **Vendor:** React 18.3 (UMD), ReactDOM, Babel standalone, Lucide
2. **Tweaks panel** (`tweaks-panel.jsx`) — provides `window.useTweaks`, `<TweaksPanel>`, `<TweakRadio>`, etc.
3. **Shared:** icons → data → primitives → ar-primitives
4. **Shell:** sidebar → topbar → cmdk
5. **Dashboard:** all 8 dashboard files
6. **AR module:** data → customers → invoices → quotes-credits-receipts → collections-dunning
7. **Entry:** `src/shell/app.jsx` last (it composes everything)

When you reimplement, replace this with proper ES module imports.

---

## Architecture Notes for the Implementer

### Routing
Currently a flat string `active` state in `<App>` (`"dashboard"`, `"customers"`, `"invoices"`, etc.) plus a `detail` object (`{ type: "customer" | "invoice", id }`) for drill-down views. `RouterView` switches on these.

In a real codebase: replace with file-based routing (Next.js) or React Router. Suggested URL scheme:
```
/                              → Dashboard
/ar/customers                  → Customer list
/ar/customers/:id              → Customer detail
/ar/invoices                   → Invoice list
/ar/invoices/:id               → Invoice detail
/ar/quotes                     → Quotes & SOs (tab=quotes by default)
/ar/quotes?tab=sos             → Sales orders tab
/ar/credit-notes
/ar/receipts
/ar/collections
/ar/dunning?tab=overdue|rules|log
```

### State / Data
All data is mocked in two places: `src/shared/data.jsx` (dashboard) and `src/ar/data.jsx` (AR module). Replace with React Query / SWR / RTK Query against your real API. Recommended endpoints:

- `GET /api/dashboard/summary` → drives hero + KPIs
- `GET /api/dashboard/cashflow?from=&to=&forecastDays=90` → cashflow chart
- `GET /api/agent/activity?limit=10` → agent feed
- `GET /api/approvals` → approvals queue
- `GET /api/ar/customers?search=&type=&page=&limit=`
- `GET /api/ar/customers/:id`
- `GET /api/ar/invoices?search=&status=&customerId=&page=&limit=`
- `GET /api/ar/invoices/:id` (returns invoice + line items + linked receipts/CNs + activity)
- `GET /api/ar/quotes`, `/api/ar/sales-orders`, `/api/ar/credit-notes`, `/api/ar/receipts`
- `GET /api/ar/collections`, `POST /api/ar/collections/:id/log`
- `GET /api/ar/dunning/overdue`, `/api/ar/dunning/rules`, `/api/ar/dunning/log`

### Theming
Theme is driven by a single `dark` class on `<html>`. All colors are CSS custom properties defined in two `:root` / `.dark` blocks at the top of `runQ Admin.html`. Accent colors are mutated dynamically by `<App>` based on the user's chosen accent. Port these tokens into `globals.css` (or wherever your theme lives) verbatim.

### Tweaks panel
The Tweaks panel exposes 6 design knobs (theme, accent, density, sidebar style, layout preset, widget visibility). It uses a small parent-iframe message protocol that's specific to this preview environment — **do not port this to production**. Strip it out. The underlying dimensions (theme, accent, density) might still be exposed as user preferences in your real product; the others (layout preset, widget visibility) were design exploration tools.

### Layout presets
The dashboard supports 3 presets — Owner, Accountant, CA — that reorder sections. The Owner preset is the production default (cashflow + agent prominent, then approvals, then aging, then GST/close). Accountant flips the order to put approvals first. CA leads with GST. Whether to ship all three or just Owner is a product call; the design supports all three.

---

## Design Tokens

### Colors (light)
```
--bg:            oklch(0.99 0.003 264)   /* near-white app background */
--surface:       oklch(1 0 0)            /* card surfaces */
--surface-2:     oklch(0.985 0.004 264)  /* hover / table-header / inset */
--border:        oklch(0.92 0.005 264)
--border-soft:   oklch(0.95 0.004 264)   /* row dividers */
--text:          oklch(0.22 0.015 264)   /* primary */
--text-2:        oklch(0.45 0.012 264)   /* secondary */
--text-3:        oklch(0.62 0.008 264)   /* tertiary / muted */
--accent:        oklch(0.55 0.20 268)    /* indigo (default) */
--accent-soft:   oklch(0.96 0.03 268)    /* subtle accent fill */
--accent-text:   oklch(0.45 0.18 268)    /* accent on tinted bg */
--pos:           oklch(0.60 0.15 155)    /* positive / success / paid */
--pos-soft:      oklch(0.96 0.04 155)
--neg:           oklch(0.60 0.18 25)     /* negative / overdue / failed */
--neg-soft:      oklch(0.96 0.04 25)
--warn:          oklch(0.72 0.15 75)     /* warning / partial */
--warn-soft:     oklch(0.96 0.05 80)
```

### Colors (dark — warm-tinted, intentionally not clinical zinc-950)
```
--bg:            oklch(0.155 0.008 264)
--surface:       oklch(0.195 0.01 264)
--surface-2:     oklch(0.22 0.011 264)
--border:        oklch(0.28 0.012 264)
--border-soft:   oklch(0.24 0.01 264)
--text:          oklch(0.96 0.005 264)
--text-2:        oklch(0.72 0.012 264)
--text-3:        oklch(0.55 0.012 264)
--accent:        oklch(0.72 0.18 268)
--accent-soft:   oklch(0.28 0.06 268)
--accent-text:   oklch(0.78 0.16 268)
--pos:           oklch(0.74 0.16 155)
--pos-soft:      oklch(0.28 0.06 155)
--neg:           oklch(0.72 0.18 25)
--neg-soft:      oklch(0.30 0.07 25)
--warn:          oklch(0.78 0.15 75)
--warn-soft:     oklch(0.30 0.06 80)
```

### Accent alternatives
4 accents are exposed as a Tweaks knob. Each has light/dark variants (see `ACCENTS` const in `src/shell/app.jsx`):
- **Indigo** (default): hue 268
- **Emerald**: hue 160
- **Violet**: hue 305
- **Rose**: hue 12

Pick one as production default (Indigo recommended) and either lock the rest or expose them as user theme preferences.

### Typography
- **Sans (body / UI):** `Inter` 400/500/600/700, with feature settings `cv02 cv03 cv04 cv11 ss01` enabled. `text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased;`
- **Mono (numbers, IDs, references):** `JetBrains Mono` 400/500/600 with `font-feature-settings: "tnum"; font-variant-numeric: tabular-nums;`. Applied via `.num` utility class to anywhere a number appears (currency, dates, IDs, GSTINs, IRNs, percentages).

### Type scale (used throughout)
- `10px` — `[10px]`, `[10.5px]` — uppercase microlabels (`tracking-wider font-medium uppercase`)
- `11px / 11.5px` — secondary metadata, table cells in dense rows
- `12px / 12.5px` — body text, table cell default
- `13px` — buttons, body text in detail views
- `14px` — section titles in cards
- `18px` — invoice number heading, customer name in detail headers
- `22px` — page title (h1)
- `28–40px` — display numbers (balance hero, total cash)

### Spacing
Standard 4-px Tailwind scale. Card padding standardized at:
- Small card: `p-4` (16px)
- Standard card: `px-5 py-3` header / `px-5 py-3` body
- Hero card: `p-5` or `p-6`
- Page padding: density-driven — `p-4` / `p-6` / `p-7` for dense / balanced / comfy

### Radii
- `rounded-md` (6px) — buttons, inputs, badges, sidebar nav items
- `rounded-lg` (8px) — modal cards, command palette
- `rounded-xl` (12px) — primary surface cards, KPI tiles, list tables
- `rounded-full` — avatars, status dots, progress bars

### Shadows
Generally avoided. Cards rely on `border` for definition. Two exceptions:
- `shadow-sm` on solid CTAs (`Button variant="primary"`)
- `hover:shadow-sm` on Collections case cards

---

## Screens

### 1. App Shell

**Sidebar (`src/shell/sidebar.jsx`)**
- 256px wide expanded, 64px collapsed (icon-rail mode)
- Top: runQ wordmark logo (auto-swaps light/dark). Switches to favicon-only when collapsed.
- Tenant chip: company name + GSTIN truncated, with a chevron for tenant switcher
- Search input with ⌘K shortcut hint
- 6 nav groups (label uppercase 10px tracking-wider in `text-3`):
  1. **Pinned** (no label): Dashboard, Ask runQ (with `AI` badge), Inbox (with count badge), Documents
  2. **Money in:** Invoices, Quotes & SOs, Delivery notes, Credit notes, Receipts, Customers, Collections (count badge)
  3. **Money out:** Bills (count), POs, GRN/Receipts, Debit notes, Payments, Vendors, Expenses, Pay runs
  4. **Inventory:** Items, Stock & warehouses, Stock transfers
  5. **Books:** Banking, Journal entries, GL, Fixed assets, Reports, Budgets
  6. **Compliance:** GST filing (with `7d` due-date badge), e-Invoice, e-Way bill, TDS & TCS, Audit trail
  7. **Setup:** Workflows, Masters, Users & roles, Integrations, Settings
- Active item: `surface-2` background, 3px accent-colored left rail (via `.nav-active::before` in CSS)
- Bottom: "Upgrade to runQ Pro" gradient card (hidden when collapsed)
- All nav items keyboard-accessible via the command palette

**Topbar (`src/shell/topbar.jsx`)**
- Breadcrumb: page icon + tenant name + page title (in `text-1 font-semibold`)
- Center-right: ⌘K command palette pill (shows "Search anything…" with kbd hint)
- "Ask runQ" gradient pill — opens command palette with AI suggestions
- FY switcher dropdown: "FY 2025–26"
- Notifications icon with red unread dot — opens dropdown panel of recent notifications
- Theme toggle (sun/moon icon)
- Profile avatar with menu

**Command Palette (`src/shell/cmdk.jsx`)**
- Triggered by ⌘K / Ctrl+K, or by clicking the topbar pill
- Sections: Quick actions / Navigate / Ask runQ
- Each item: icon + title + (optional) subtitle on right
- Esc to close, Enter to activate

**Tweaks panel (`src/shell/app.jsx` — `TweaksUI`)**
- Floating bottom-right panel, hidden by default; toggled by the host iframe's "Tweaks" button
- Sections: Theme / Accent / Density / Sidebar / Layout preset / Widget toggles
- **Strip in production** — see Architecture Notes above

---

### 2. Dashboard (Owner preset)

**Hero card** (`dashboard/hero.jsx`) — full-width
- Left: greeting (`Good morning, Vaidehi`) + agent activity summary line
- Right: "Total cash" massive display number (`text-[40px] font-semibold num`) with a per-bank breakdown stacked bar showing 4 connected banks

**KPI strip** (`dashboard/kpis.jsx`) — 5 tiles in a grid
1. Cash on hand
2. Accounts receivable (with `% change` delta)
3. Accounts payable (with `% change` delta)
4. Burn / runway (showing both rate and months remaining)
5. Revenue MTD (with sparkline)

Each tile: label (10.5px uppercase muted) → big num → trend delta + 24px sparkline. Sparklines are inline SVG path elements colored with `--accent` or pos/neg.

**Cashflow chart** (`dashboard/cashflow.jsx`)
- 9 months of bars: 6 actual (solid), 3 forecast (dashed/translucent)
- Hover tooltip with month + inflow/outflow/net
- 90-day projected net displayed bottom-right
- Built with raw SVG — no chart library dependency

**Agent feed** (`dashboard/agent-feed.jsx`)
- Vertical timeline of automated actions runQ took (matched receipt to invoice, flagged GST mismatch, created draft invoice from email, etc.)
- Each event: avatar/icon, title, subtitle, time ago, optional `[Approve]` `[Review]` actions

**Approvals + Quick Actions** (`dashboard/approvals-actions.jsx`)
- Left (col-span-2): Approvals queue — list of pending approvals (bills to approve, payments to authorize, journal entries to verify), with `[Approve]` `[Reject]` `[Open]` actions per row
- Right (col-span-1): Quick Actions grid — 4–6 large icon buttons for the most common workflows (New invoice, Record payment, Reconcile bank, etc.)

**Aging panel** (`dashboard/aging.jsx`) — 2-column grid
- Left: AR aging — buckets (Current / 1–30 / 31–60 / 61–90 / 90+), each as a horizontal stacked bar segment with amount + count
- Right: AP aging — same structure for payables

**GST + Close** (`dashboard/gst-close.jsx`) — 2-column grid
- Left: GST readiness — radial score ring (e.g. 87%) + checks list (Sales reconciled ✓, Purchases reconciled ✓, e-Invoices generated ✓, ITC matched, GSTR-1 ready, GSTR-3B ready)
- Right: Period-close checklist — categorized tasks (Reconciliation, Adjustments, Reports), each with check status and assignee

**Recent activity** (`dashboard/recent-docs.jsx`)
- Compact list of recent documents touched (invoices created, bills approved, payments recorded), with type icon + title + customer/vendor + amount + time

---

### 3. AR Module

All AR pages share the same scaffolding:
- `<PageHeader>` — breadcrumb (e.g. `AR / Invoices`) + title + description + actions row
- KPI strip (4-5 `<StatTile>` cards) — module-specific stats
- Filter row — search input + status/method/customer dropdowns
- `<Table>` — list view, with row click → detail
- `<Pagination>` — when applicable

#### Customer list (`ar/customers.jsx — CustomerList`)
- KPIs: Total customers / Outstanding / Avg credit score / High-risk accounts
- Columns: Name (with avatar + GSTIN) / Type (B2B/B2C/Gateway badge) / Contact / Terms (Net Xd) / Risk (CreditScorePill — shield icon + score, color tone by risk level) / Outstanding (₹) / Status / →
- Pagination at 8/page

#### Customer detail (`CustomerDetail`)
- Header: name + nickname badge + risk pill + Edit/Actions
- **Outstanding hero** — large balance number, breakdown line (X overdue, Y open, avg DSO)
- **Payment portal card** — share-link to public-pay URL (`pay.runq.io/portal/s/...`) with Copy/Regenerate
- **Basic info** card — type, contact person, email, phone, payment terms, credit limit
- **Tax & legal** card — GSTIN, PAN, place of supply, full address
- **Recent invoices** table (capped at 6 + View all link)
- **Receipts** table

#### Invoice list (`ar/invoices.jsx — InvoiceList`)
- KPIs: Outstanding / Overdue / Drafts / Paid (this view)
- Columns: Invoice # (with PO ref) / Customer (with line count) / Issued / Due (with `Xd overdue` for overdue rows) / Total / Balance / Status / e-Inv (IRN truncated, with green check)
- Pagination at 10/page

#### Invoice detail (`InvoiceDetail`) — the showcase screen
- Header: invoice number + status badge + actions (PDF, Send, Record receipt, Credit note)
- **Banner** — overdue warning (red, with last-reminder timestamp + Send reminder / Log call CTAs) OR paid confirmation (green, with cleared date + reference)
- **Left col (col-span-2):**
  - **Invoice document** — full tax-invoice layout: header with Tax invoice + invoice #, runQ logo, GSTIN; bill-to + dates grid; line items table (#, description, HSN, qty + unit, rate, tax%, amount); totals breakdown (Subtotal, CGST 9%, SGST 9%, Total, Balance due)
  - **Activity timeline** — chronological events (created, e-invoice generated, sent, viewed, reminder sent, payment received, credit note issued)
- **Right col:**
  - **Balance card** — balance due display, progress bar (% paid), of-total subtitle
  - **Customer mini** — avatar, name, contact person, email/phone/address, outstanding total
  - **e-Invoice card** — IRN, GSTN-verified status, View QR/IRN button
  - **Linked documents** — receipts and credit notes with amounts

#### Quotes & SOs (`ar/quotes-credits-receipts.jsx — QuotesSOsPage`)
- Tabs: Quotes / Sales orders
- KPIs: Open quotes / Accepted / Open SOs / Win rate
- Quotes columns: # / Customer / Issued / Valid till / Total / Status (with `Convert to invoice` action when accepted)
- SOs columns: # / Customer / Issued / Expected delivery / Total / Fulfilment (Pending/Partial/Delivered) / Status

#### Credit notes (`CreditNotesPage`)
- KPIs: Issued / Pending adjustment / Drafts / Avg amount
- Columns: # / Customer / Linked invoice (or "Standalone") / Issued / Reason / Amount / Status

#### Receipts (`ReceiptsPage`)
- KPIs: Total received / Bank transfers / RTGS / Unallocated
- Columns: Date / Customer (with avatar) / Method (icon + label) / Reference / Allocated to (invoice numbers or "Unallocated" warning badge) / Amount

#### Collections (`ar/collections-dunning.jsx — CollectionsPage`)
- **Card layout, not a table** — collections are conversations, not rows
- KPIs: Total at risk / Open / Contacted / Promised / Escalated
- Each case card: customer avatar + name + invoice # + status badge + days overdue + notes + assignee + follow-up date + balance + action buttons (Log call / Email / Update)

#### Dunning (`DunningPage`)
- Tabs: Overdue invoices / Rules / Activity log
- **Overdue tab:** checkbox-selectable table with invoice / customer / due date / days overdue (color-coded by severity) / balance / next rule that will fire / Send now action
- **Rules tab:** card per rule with channel icon (mail/whatsapp), level badge (1/2/3 with color escalation), trigger conditions, body template (in monospace), enable toggle + Edit
- **Log tab:** table of every reminder sent — date, invoice, customer, channel, recipient, status (delivered/sent/failed)

---

## Components — Quick Reference

These are the production atoms. When porting, map each to your component library:

| Atom | File | Maps to (shadcn/ui suggestion) |
|---|---|---|
| `<PageHeader>` | shared/ar-primitives | custom — breadcrumb + Heading + Actions slot |
| `<Button variant size icon>` | shared/ar-primitives | `<Button>` (with `Lucide` icon child) |
| `<Badge variant>` | shared/ar-primitives | `<Badge>` |
| `<StatusBadge status>` | shared/ar-primitives | `<Badge>` w/ status→variant lookup |
| `<Table>` `<TableRow>` `<TableCell>` `<Th>` | shared/ar-primitives | `<Table>` family |
| `<EmptyState icon title description action>` | shared/ar-primitives | custom |
| `<Pagination>` | shared/ar-primitives | shadcn `<Pagination>` |
| `<Input icon>` | shared/ar-primitives | `<Input>` w/ leading-icon variant |
| `<Select options>` | shared/ar-primitives | `<Select>` (use shadcn) |
| `<Tabs tabs active onChange>` | shared/ar-primitives | `<Tabs>` |
| `<StatTile label value sub tone>` | shared/ar-primitives | custom Card |
| `<Card>` `<Sparkline>` `<Pill>` `<Avatar>` `<Kbd>` `<Dot>` | shared/primitives | mostly custom; Avatar = shadcn `<Avatar>` |
| `<DetailCard>` `<DetailRow>` (in customer detail) | ar/customers | custom |
| `<CreditScorePill score risk>` | ar/customers | custom Badge variant |
| `<PaymentMethodBadge method>` | ar/quotes-credits-receipts | custom |
| `<CollectionStatusBadge status>` | ar/collections-dunning | extends StatusBadge |
| `<Toggle on>` | ar/collections-dunning | shadcn `<Switch>` |

---

## Interactions & Behavior

### Navigation
- Sidebar item click → `setActive(key)` + clears `detail` state
- Customer/invoice row click → sets `detail` to `{ type, id }` → renders detail view
- Detail "Back" button → clears `detail`
- ⌘K / Ctrl+K → toggles command palette globally; Esc closes
- Topbar breadcrumb → currently static; should be clickable in production

### Filters & Pagination
- All list pages: filters reset `page` to 1 on change
- Filters are client-side in mocks; will be server-side in production (pass through query string)
- Pagination shows "Showing X–Y of Z" + Page N / M with prev/next buttons disabled at bounds

### Hover & active states
- Table rows: `hover:surface-2` on hoverable rows; cursor-pointer when clickable
- Buttons: `hover:opacity-90` on solid, `hover:surface-2` on outline/ghost
- Sidebar nav items: same pattern + accent left-rail when active
- Status badges: no hover (informational only)
- Toggle (`Switch`): instant flip, accent background when on

### Theme switching
- Topbar moon/sun icon click → toggles `dark` class on `<html>`
- All components use CSS custom properties — no JS swapping needed beyond the class
- Accent color does need JS sync because OKLCH hue is parameterized; see `ACCENTS` const + the useEffect in `<App>`

### Animations
The design is intentionally restrained on motion. Only:
- Sidebar collapse: width transition (default Tailwind ease, ~200ms)
- Hover color transitions: `transition-colors` (default 150ms)
- Spinner on `<Button loading>`: `animate-spin` on Lucide `loader-2`

No page transitions, no entrance animations on cards, no skeletons in the design (add appropriate skeletons in production for any async data).

### Form validation, loading, error states
**Not designed.** This was a hi-fi static design pass. When implementing:
- Add skeleton states for every list/detail page (preserve the layout shape)
- Add empty states for filtered-to-zero (already designed — see `<EmptyState>`)
- Add error states for failed fetches (similar treatment to EmptyState with `alert-triangle` icon, `Retry` button)
- Form validation patterns are not in this bundle — derive from your existing form library

### Responsive
The design is **desktop-first** (1280px+ ideal). Most layouts use `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-N` patterns and degrade reasonably to ~768px. **Mobile (<640px) is not designed** — sidebar collapse + responsive tables would need a separate pass. Flag this as out of scope or schedule a mobile design pass.

---

## Mock Data — What's There, What to Replace

### `src/shared/data.jsx` — `window.RUNQ`
Dashboard mocks: `COMPANY` (tenant info + user), `KPIS` (the 5 dashboard metrics), `CASHFLOW` (9-month series), `AGENT_FEED`, `APPROVALS`, `AGING_AR`, `AGING_AP`, `GST` (readiness checks + close tasks), `NOTIFICATIONS`, `BANKS` (per-bank balances), `INVOICE_DRAFTS`.

Also exports `window.formatINR(n, { short })` — INR currency formatter with Indian numbering convention (lakh / crore short forms). Replace with your i18n helper or `Intl.NumberFormat('en-IN')`.

### `src/ar/data.jsx` — `window.AR`
AR mocks: `CUSTOMERS` (12), `INVOICES` (16), `INVOICE_LINES_001` (full line breakdown for the showcase invoice), `QUOTES`, `SALES_ORDERS`, `CREDIT_NOTES`, `RECEIPTS`, `COLLECTIONS`, `DUNNING_OVERDUE`, `DUNNING_RULES`, `DUNNING_LOG`.

All entities use stable string IDs (`cus_001`, `inv_001`, etc.) and reference each other by ID — easy to map to whatever ID scheme your real DB uses.

---

## Assets

- `assets/runq-dark.png` — dark wordmark, used on light backgrounds
- `assets/runq-light.png` — light wordmark, used on dark backgrounds (auto-swapped via `dark:hidden` / `hidden dark:block`)
- `assets/runq-favicon.png` — square mark, used in collapsed sidebar + browser tab

These are presumed to be the official runQ brand assets already in your codebase. If reimplementing, use whichever logos exist there.

---

## Out of Scope (Future Work)

These were intentionally not designed in this pass; capture as follow-ups:

1. **Mobile responsive design** — sidebar drawer pattern, mobile table → card transformation, mobile bottom nav
2. **AP module** (Money out) — Bills, POs, GRN, Debit notes, Payments, Vendors, Expenses, Pay runs. Should mirror AR patterns where possible.
3. **Inventory, Books, Compliance, Setup modules** — placeholders only.
4. **Detail screens for Quotes, Credit notes, Receipts, individual collection cases** — list pages exist; detail views need design.
5. **Empty / error / loading skeleton states** — only base empty state designed.
6. **Inline create flows** — "New invoice" / "New customer" / "Record receipt" buttons exist but the create forms themselves are not designed.
7. **Onboarding** — first-run experience, tenant setup wizard, GSTIN verification flow.
8. **Settings screens** — user prefs, tenant settings, integrations config, billing.
9. **Print stylesheets** for invoice PDF — currently the PDF generation is a backend concern; if printing from the browser is in scope, design `@media print` styles for the invoice document.

---

## Files in This Bundle

| Path | What's in it |
|---|---|
| `runQ Admin.html` | Entry point — open in any browser to preview the full design |
| `tweaks-panel.jsx` | Floating Tweaks panel host (strip in production) |
| `assets/runq-dark.png` | Dark wordmark |
| `assets/runq-light.png` | Light wordmark |
| `assets/runq-favicon.png` | Favicon / collapsed-sidebar mark |
| `src/shell/app.jsx` | Root App, routing, theme + tweak orchestration |
| `src/shell/sidebar.jsx` | Grouped nav definition + collapse behavior |
| `src/shell/topbar.jsx` | Topbar chrome — breadcrumb, ⌘K trigger, FY, notifs, theme, profile |
| `src/shell/cmdk.jsx` | Command palette overlay |
| `src/shared/icons.jsx` | Lucide icon wrapper exposed as `window.Icon` |
| `src/shared/data.jsx` | Dashboard mock data + `formatINR` |
| `src/shared/primitives.jsx` | `Card`, `Sparkline`, `Pill`, `Avatar`, `Kbd`, `Dot` |
| `src/shared/ar-primitives.jsx` | AR atoms — PageHeader, Button, Badge, Table, etc. |
| `src/dashboard/hero.jsx` | Hero greeting + total-cash card |
| `src/dashboard/kpis.jsx` | KPI strip with sparklines |
| `src/dashboard/cashflow.jsx` | 9-month cashflow + 90-day forecast chart |
| `src/dashboard/agent-feed.jsx` | AI agent activity timeline |
| `src/dashboard/approvals-actions.jsx` | Approvals queue + Quick Actions panel |
| `src/dashboard/aging.jsx` | AR & AP aging side-by-side |
| `src/dashboard/gst-close.jsx` | GST readiness ring + period-close checklist |
| `src/dashboard/recent-docs.jsx` | Recent activity list |
| `src/ar/data.jsx` | AR module mock data — `window.AR` |
| `src/ar/customers.jsx` | Customer list + detail |
| `src/ar/invoices.jsx` | Invoice list + detail (the showcase) |
| `src/ar/quotes-credits-receipts.jsx` | Quotes/SOs page, Credit notes, Receipts |
| `src/ar/collections-dunning.jsx` | Collections + Dunning (3 tabs) |

---

## How to Preview

1. Open `runQ Admin.html` directly in any modern browser (Chrome, Safari, Firefox)
2. Click sidebar items to navigate between modules
3. On Invoices or Customers, click any row to open the detail view
4. Press ⌘K (Mac) or Ctrl+K (Windows/Linux) to open the command palette
5. Click the moon/sun icon in the topbar to toggle dark mode
6. The Tweaks panel (floating bottom-right) lets you switch theme/accent/density/layout preset

The page is fully static — no build, no server, no network calls (except CDN script tags for React/Tailwind/Lucide). It will work offline once those CDNs are cached.
