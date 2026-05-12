# runq Analytics Plan

Essential analytics for business owners and CAs.

---

## Scope: Analytics vs BI

**Analytics (this plan):** pre-built, curated answers to known questions. Cards, fixed dashboards, drill-down. Zero user skill required.

**BI module (deferred):** user-built reports — pivot tables, custom charts, saved reports, cross-module slicing. Medium user skill required.

**Rule of thumb:** if 100 customers want the same answer → analytics. If each customer wants their own answer → BI.

### Decision

1. **Analytics lives inside each module** — AR dashboard in AR, AP dashboard in AP, GST dashboard in GST. Tracked below.
2. **Top-level "Dashboard" page** pulls the 6–8 most critical owner cards across modules (cash, AR aging, AP aging, P&L mini, GST status). The "morning coffee" view.
3. **BI deferred to Phase 4+** — build only if customers ask for custom reports. Most ask for *more pre-built reports* instead, which is still analytics.
4. **When BI comes, it's a separate module** (`/bi` or `/reports`) — report builder, saved reports, scheduled email exports. Reuses the same data layer, different UI.
5. **Bridge for power users today:** CSV/Excel export on every analytics view. They'll pivot in Excel.

**Why not bundle BI into finance now:** BI done badly is worse than no BI; it pulls focus from filling actual finance gaps (29/84 features done); Tally has no real BI either. Curated analytics first produces a cleaner data model for a future BI layer.

---

## Principles

Built around these principles:

- **One number, one insight** per card — no 12-metric dashboards
- **Drill-down everywhere** — every number clicks through to underlying transactions
- **Action on the metric** — "5 overdue invoices" → send reminders button, not just a number
- **Global date filter** top-right, applies to whole page
- **Default comparisons** — vs last month, vs last year, built in

---

## Phasing

| Phase | Scope | Why |
|-------|-------|-----|
| **Phase 1 (MVP)** | Cash, AR, AP basics, P&L, BS, unreconciled txns | Covers 80% of daily owner needs |
| **Phase 2** | GST + TDS reconciliation | CA value-add, key differentiator vs Tally |
| **Phase 3** | Cash flow forecast, inventory, advanced drill-downs | Power user / scale-up |

---

## Tracking List

### Phase 1 — Owner Essentials + Basic Books

| # | Metric | Audience | Status | Notes |
|---|--------|----------|--------|-------|
| 1 | Cash position today (all banks + 7/30-day expected flow) | Owner | ☑ Done | P1A live cash + dedicated 7/30-day Cash Forecast card with projected balance |
| 2 | Bank balance 90-day trend (per account) | Owner | ☑ Done | P1B step 2; total series only (per-account drill in P1C) |
| 3 | Outstanding receivables + aging (0-30, 31-60, 61-90, 90+) | Owner | ☑ Done | P1A total + P1B aging |
| 4 | Top 10 overdue customers (with send-reminder action) | Owner | ☑ Done | P1B list + P3-4 inline send button on hover |
| 5 | Avg collection period (DSO) — 6-month trend | Owner | ☑ Done | P1B step 2 |
| 6 | Sales this month vs last month (revenue + invoice count) | Owner | ☑ Done | P1A |
| 7 | Outstanding payables + aging buckets | Owner | ☑ Done | P1A total + P1B aging |
| 8 | Bills due this week (actionable list) | Owner | ☑ Done | P1A |
| 9 | Top 10 vendors by spend (last 90 days) | Owner | ☑ Done | P1B |
| 10 | Revenue vs expense — 12-month bar | Owner | ☑ Done | P1B step 2 |
| 11 | Top expense categories — this month | Owner | ☑ Done | P1B (GL-based, expense accounts) |
| 12 | Unreconciled bank transactions (count + amount per account) | CA | ☑ Done | P1C (live, 5min cache) |
| 13 | P&L — month/quarter/FY with comparison | Both | ☑ Done | Period dropdown (FY/Quarter/Month) on the P&L card with vs-prior-period delta % |
| 14 | Balance Sheet — as on date | Both | ☑ Done | P1C summary + existing /reports/balance-sheet page |

### Phase 2 — GST + TDS (CA Differentiator)

| # | Metric | Audience | Status | Notes |
|---|--------|----------|--------|-------|
| 15 | GSTR-1 vs GSTR-3B reconciliation (mismatch flags) | CA | ☑ Done | P2 step 1; section-wise delta with ₹2 tolerance |
| 16 | GSTR-2B vs purchase register (missing invoices, wrong GSTIN, rate mismatch) | CA | ☑ Done | P2 step 1; uses existing reconcile engine, shows synced-but-not-reconciled state |
| 17 | GST liability this period (output − ITC, ready to file) | CA | ☑ Done | P2 step 1; reads from generated GSTR-3B table 6.1 |
| 18 | Vendors not filed GSTR-1 (blocks your ITC) | CA | ☑ Done | P2 step 1; ITC-at-risk sorted, filters no-tax noise |
| 19 | TDS deducted vs deposited — section-wise (194C/J/I etc.) | CA | ⏸ Deferred | TDS module not built yet (no tds_payments table). Revisit later. |
| 20 | TDS return-ready quarterly summary | CA | ⏸ Deferred | Same — depends on TDS module. |
| 21 | Suspense / unallocated entries count | CA | ☑ Done | Pattern-match on account name (suspense/clearing/unalloc); flags non-zero balances |
| 22 | Journal entries pending approval | CA | ☑ Done | Reads approval_instances; broader than just JEs (any pending entity) |
| 23 | Trial balance with drill-down | CA | ☑ Done | New /reports/trial-balance page (type-grouped subtotals, GL drill-down on row click). Backend endpoint reuses CAPortalService.getTrialBalance — no duplicate compute. Note: a separate /gl/trial-balance page predates this; both coexist. |

### Phase 3 — Forecast + Inventory + Margin

| # | Metric | Audience | Status | Notes |
|---|--------|----------|--------|-------|
| 24 | Cash runway (months at current burn) | Owner | ☑ Done | P3; shows ∞ when cash-positive |
| 25 | Gross margin % (if COGS tracked) | Owner | ☑ Done | P3; COGS from accounts code-range 50xx-51xx (existing P&L logic) |
| 26 | Stock value on hand | Owner | ⏸ Deferred | items table has no stock_qty/reorder fields — inventory module pending |
| 27 | Slow-moving items (no movement 60+ days) | Owner | ⏸ Deferred | Same |
| 28 | Low-stock alerts (below reorder level) | Owner | ⏸ Deferred | Same |
| 29 | Cash Flow Statement (indirect method) | CA | ☑ Done | P3 summary card; full report at /reports/cash-flow |

---

## Implementation Notes

- **Status legend:** ☐ Not started · ◐ In progress · ☑ Done
- Update the Status column as work progresses. Add commit/PR refs in Notes.
- Each metric should be implemented as a reusable widget so it can be dropped into the dashboard, a module page, or an export.
- GST metrics (15–18) depend on GSP integration — coordinate with `gst-filing-tracker.md`.
- Inventory metrics (26–28) depend on inventory module landing.

---

## Implementation Plan (optimized for speed + low server load)

**Core idea:** pre-aggregate, cache, paginate. Never compute heavy metrics on page load.

### Architecture principles (apply to all phases)

1. **Two-tier data model:**
   - **Live queries** for small, cheap data (today's cash, < 1000 row scans)
   - **Pre-aggregated snapshots** for anything touching > 30 days or full tables
2. **Snapshot tables** updated by background jobs, not on read
3. **Tenant-scoped indexes** on `(tenant_id, date)` for every analytics query
4. **Redis cache** with short TTLs (5–15 min) for dashboard cards
5. **Cursor pagination** on lists (top-10, aging detail) — no `OFFSET`
6. **Async drill-down** — card loads fast, drill-down loads on click
7. **No N+1** — one SQL per card, joins done in DB not app

### Server-stress safeguards

- Query budgets: any analytics SQL > 500ms triggers a Sentry alert
- Per-tenant rate limit on heavy reports (P&L, BS): 10/min
- Row-count cap on drill-downs: 500 rows, then "Load more"
- No `COUNT(*)` on huge tables — use snapshot counts
- Read replica (Postgres) for analytics queries when traffic grows — Railway supports this, flip via env var
- Connection pool sized so analytics can't starve transactional traffic

### Frontend speed

- Skeleton loaders for every card (perceived speed)
- Cards load in parallel, not sequentially
- React Query / SWR with `staleWhileRevalidate` — instant on revisit
- Charts use canvas (uPlot/Recharts lazy chunk) not SVG for > 100 points
- Code-split the dashboard route

### Build order (~6 weeks for Phases 1 + 2)

1. **Phase 0** — Foundation (1 wk)
2. **Phase 1A** — Live, cheap metrics (1 wk) → ship dashboard skeleton
3. **Phase 1B** — Snapshot metrics (1 wk) → AR/AP aging, biggest UX win
4. **Phase 1C** — Heavy reports: P&L, BS (1 wk) → "morning coffee" view complete
5. **Phase 2** — GST + TDS (2 wks)
6. **Phase 3** — Forecast + inventory + cash flow

### Metric → strategy mapping

**Phase 1A — Live (cached 5–15 min):** cash position, bills due this week, outstanding AR total, outstanding AP total, sales this month.

**Phase 1B — Snapshots:**
| Metric | Snapshot grain | Refresh |
|---|---|---|
| AR aging buckets | Per-tenant, daily | Nightly + on-invoice-event |
| AP aging buckets | Per-tenant, daily | Nightly + on-bill-event |
| Top 10 overdue customers | Per-tenant, daily | Nightly |
| Top 10 vendors by spend | Per-tenant, weekly | Weekly |
| Top expense categories | Per-tenant, monthly | Nightly |
| Revenue vs expense (12 mo) | Per-tenant, monthly buckets | Nightly |
| Bank balance 90-day trend | Per-tenant-account, daily | Nightly |
| DSO trend (6 mo) | Per-tenant, monthly | Nightly |

**Event-driven invalidation:** invoice paid → enqueue refresh job for that tenant's AR snapshots. No full recompute.

**Phase 1C — Computed + cached:** P&L, BS, Trial Balance. Compute on demand, cache by `(tenant_id, period, as_of_date)` for 1 hour. Background prewarm current period after each JE posts.

**Phase 2 — GSP-driven:** GSTR sync persists to `gst_returns_raw`. Reconciliation snapshots computed after each sync into `gst_recon_results`. UI just reads.

---

## Phase 0 Foundation Tracker

Shared infra so every metric is cheap to add. Estimated 1 week.

| # | Task | Status | Notes |
|---|------|--------|-------|
| F1 | Create `analytics_snapshots` table: `(tenant_id, metric_key, period, payload jsonb, computed_at)` | ☑ Done | Index on `(tenant_id, metric_key, period)` |
| F2 | Background worker setup (BullMQ or pg-cron) for snapshot refresh jobs | ☑ Done | Decide BullMQ vs pg-cron |
| F3 | Redis cache wrapper: `getOrCompute(key, ttl, fn)` | ☑ Done | Tenant-scoped keys |
| F4 | Shared `<AnalyticsCard>` component (skeleton → data → error, drill-down slot) | ☑ Done | |
| F5 | Global `<DateRangeFilter>` component with URL state | ☑ Done | Top-right of dashboard pages |
| F6 | DB index audit — `(tenant_id, txn_date)` on invoices, bills, journal_entries, bank_txns | ☑ Done | Add via migration |
| F7 | Event-bus hook for snapshot invalidation (invoice/bill/JE events → refresh queue) | ☑ Done | |
| F8 | Sentry alert rule: analytics SQL > 500ms | ☑ Done | |
| F9 | Per-tenant rate limiter for heavy reports (10/min on P&L, BS) | ☑ Done | |
| F10 | Dashboard route skeleton + code-splitting setup | ☑ Done | `/analytics` route + page; repo uses static imports, code-splitting deferred until route bundle pressure justifies introducing a new pattern. |
| F11 | Chart library decision + lazy-load chunk (uPlot vs Recharts) | ☑ Done | Decision: Recharts (SVG) for typical < 100-point dashboards; revisit uPlot only if a chart exceeds that. Dep deferred until first chart metric. |
| F12 | CSV export utility (shared across all analytics views) | ☑ Done | Bridge for power users until BI module |
