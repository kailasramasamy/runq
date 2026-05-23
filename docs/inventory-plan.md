# Inventory Module — Implementation Plan

> **Build mandate:** ship a clean, fully working Inventory module across API + web + mobile in one pass. The bottleneck on past modules (HR took ~1 week of post-build refinement) was **API ↔ web ↔ app drift** and **missing edge cases**. This spec is written to eliminate both. Every feature listed below MUST exist on all three surfaces before the module is called done. No surface ships partial.

---

## 1. Overview

Standard inventory management for Indian SMEs — **not** a full WMS. The goal is feature parity with what Tally / Zoho Books / Vyapar offer for inventory, plus the things they fake poorly (batch + expiry with FEFO, real-time GL tie-in, mobile-first stock take).

### Target ICP
- Indian SME manufacturers, distributors, wholesalers
- 200–10,000 SKUs
- 1–5 physical locations (godowns, factory floor, retail counter, vehicle)
- Owner / manager operates day-to-day; mobile-first usage on the warehouse floor
- Already on runq Finance (Inventory plugs into AR invoices, AP bills, GL)

### Explicit Non-goals (defer to a later "WMS-lite" module)
- Bin-level locations (Aisle/Rack/Shelf/Bin)
- Pick paths, wave/zone picking, putaway strategies
- Dock door / yard management
- 3PL billing
- RF scanner workflows beyond a simple barcode lookup
- Demand forecasting / MRP (lives in future Manufacturing module)

### Strategic Wedge

| Competitor | Where runq wins |
|---|---|
| **Tally** | Live GL posting, batch+expiry FEFO, mobile stock take, bin-free multi-location |
| **Zoho Inventory** | Bundled with our own finance/HR, India-first (HSN, GST nuances), one-tenant data |
| **Vyapar** | Multi-user, multi-location, audit-ready, plugs into formal accounting |
| **Unicommerce / Increff** | Out of ICP — they target high-SKU D2C/3PL |

Wedge: **"The only inventory built into your accounting + HR, with batch/expiry done right and a mobile app your godown actually uses."**

---

## 2. Architecture

### 2.1 Module Boundaries

- New top-level module: `/inventory` (mirrors `/finance`, `/hr`).
- Reuses: tenant, auth, RBAC, branches, items master (which currently lives under `masters/items` in Finance), document storage, audit, notifications, approval engine.
- **Item master moves out of `finance/masters` into `inventory/items`** but stays referenced from Finance (invoices, bills). A thin import alias keeps existing imports working during migration.

### 2.2 Code Layout

```
apps/api/src/modules/inventory/
  routes.ts                 // mounts everything under /api/v1/inventory
  items.service.ts          // item master CRUD + variants + barcodes
  warehouses.service.ts     // locations
  stock-ledger.service.ts   // append-only stock movement log
  batches.service.ts        // batch + expiry + FEFO suggestions
  serials.service.ts        // serial tracking (optional per item)
  grn.service.ts            // goods receipt note (against PO or direct)
  delivery.service.ts       // delivery challan / stock-out
  transfer.service.ts       // inter-location transfer
  adjustment.service.ts     // write-off, found, damage, revaluation
  stock-take.service.ts     // physical count session + variance posting
  valuation.service.ts      // moving average / FIFO calc + GL posting
  reorder.service.ts        // reorder alert evaluation
  reports.service.ts        // stock summary, ageing, movement, valuation
  gl-poster.ts              // ALL stock-affecting actions post JEs through here

packages/db/src/schema/inventory/
  items.ts                  (moved from masters/)
  item-variants.ts
  warehouses.ts
  stock-ledger.ts           // append-only
  stock-on-hand.ts          // materialised view per (item, warehouse, batch)
  batches.ts
  serials.ts
  grn.ts, grn-lines.ts
  delivery-notes.ts, delivery-note-lines.ts
  transfers.ts, transfer-lines.ts
  adjustments.ts, adjustment-lines.ts
  stock-takes.ts, stock-take-lines.ts
  reorder-rules.ts

apps/web/src/routes/inventory/
  index.tsx                 dashboard
  items/                    list, new, detail, edit, import, analysis (move existing)
  warehouses/               list, new, detail
  stock/                    on-hand, ledger, ageing, valuation
  grn/                      list, new, detail
  delivery/                 list, new, detail
  transfers/                list, new, detail
  adjustments/              list, new, detail
  stock-take/               list, new (session), detail (count screen)
  reports/                  movement, valuation, ageing, reorder

apps/mobile/lib/screens/inventory/
  inventory_home_screen.dart            // KPIs + quick actions
  inventory_items_screen.dart           // search + scan
  inventory_item_detail_screen.dart
  inventory_grn_screen.dart             // scan-to-receive
  inventory_delivery_screen.dart        // scan-to-pick
  inventory_transfer_screen.dart
  inventory_stock_take_screen.dart      // scan-driven count
  inventory_adjustment_screen.dart
  inventory_on_hand_screen.dart
  widgets/
    inventory_item_card.dart
    inventory_batch_picker.dart
    inventory_qty_keypad.dart
    inventory_scan_field.dart           // barcode scan widget (mobile_scanner)
```

### 2.3 Integration with Finance

Every stock movement that has accounting impact posts a JE through `gl-poster.ts`. **No direct DB writes to `gl_journal_entries` from individual services.**

| Action | Dr | Cr |
|---|---|---|
| GRN (against bill) | Inventory Asset | GR/IR Clearing |
| AP Bill posting | GR/IR Clearing + GST Input | Vendor Payable |
| Delivery Note (against invoice) | COGS | Inventory Asset |
| AR Invoice | Customer Receivable | Sales + GST Output |
| Stock Transfer | Inventory @ Dest | Inventory @ Source (intra-tenant, same account if no branch accounting) |
| Adjustment — Write-off | Inventory Write-off Expense | Inventory Asset |
| Adjustment — Found | Inventory Asset | Inventory Gain |
| Stock Take Variance | Inventory Write-off / Gain | Inventory Asset |
| Revaluation | Inventory Asset / Revaluation P&L | (counterpart) |

GR/IR Clearing is a new ledger account — must be added to `seeds/standard-chart-of-accounts.ts`.

### 2.4 RBAC

| Role | Items / Warehouses | GRN / Delivery / Transfer | Adjustment | Stock Take | Reports |
|---|---|---|---|---|---|
| owner | full | full | full | full | full |
| accountant | full | full | full (with approval) | view | full |
| store_keeper *(new)* | view + create draft | full | propose only | full | view own warehouse |
| sales | view stock-on-hand only | create delivery only | — | — | limited |
| viewer | view | view | — | — | view |

Add `store_keeper` to `packages/validators/src/index.ts` role enum. Update `canManageInventoryModule()` helper alongside the existing `canAccessFinanceModule`/`canManageHrModule`.

---

## 3. Data Model — Core Tables

All tables have: `id (uuid)`, `tenant_id`, `created_at`, `updated_at`, `created_by`, `updated_by`. Soft delete via `deleted_at` only on masters (items, warehouses); transactions are immutable + reversed via counter-entries.

### 3.1 items (extend existing `masters_items`)

```
existing:        sku, name, description, hsn, sac, uom, sale_price, purchase_price,
                 gst_rate, category_id, is_service, ...
ADD:
  type              enum('goods','service','bundle')  default 'goods'
  track_inventory   boolean default true   // false → behaves like current service item
  track_batches     boolean default false
  track_serials     boolean default false
  track_expiry      boolean default false  // implies track_batches
  reorder_level     numeric(18,3)
  reorder_qty       numeric(18,3)
  default_warehouse_id  uuid → warehouses
  barcode           varchar(64) unique per tenant, nullable
  weight_kg         numeric(10,3)
  shelf_life_days   integer
```

### 3.2 warehouses

```
id, tenant_id, code, name, type ('main'|'godown'|'shop'|'vehicle'|'virtual'),
address, branch_id (nullable FK), is_default, is_active
```

Seed one default warehouse per tenant on module activation.

### 3.3 batches

```
id, tenant_id, item_id, batch_no, mfg_date, expiry_date, supplier_id (nullable),
notes,
UNIQUE (tenant_id, item_id, batch_no)
```

### 3.4 serials

```
id, tenant_id, item_id, serial_no, current_warehouse_id, current_status
  ('in_stock'|'sold'|'returned'|'scrapped'),
batch_id (nullable),
UNIQUE (tenant_id, item_id, serial_no)
```

### 3.5 stock_ledger (append-only)

```
id, tenant_id, item_id, warehouse_id, batch_id (nullable), serial_id (nullable),
movement_type enum('grn','delivery','transfer_in','transfer_out',
                  'adjustment_in','adjustment_out','opening','reversal',
                  'stock_take_in','stock_take_out'),
source_type   ('grn'|'delivery'|'transfer'|'adjustment'|'stock_take'|'opening'|'invoice'|'bill'),
source_id, source_line_id,
qty_in numeric(18,3) default 0,
qty_out numeric(18,3) default 0,
unit_cost numeric(18,4),         // landed cost at movement time
running_qty numeric(18,3),       // post-movement on-hand for (item, warehouse, batch)
running_value numeric(18,4),
moved_at timestamptz,            // business date
posted_at timestamptz,           // system date
posted_by, je_id (nullable FK → gl_journal_entries)
```

Indexed on `(tenant_id, item_id, warehouse_id, moved_at)` and `(tenant_id, source_type, source_id)`.

### 3.6 stock_on_hand (cache table, updated transactionally)

```
PK (tenant_id, item_id, warehouse_id, batch_id),
qty numeric(18,3), avg_cost numeric(18,4), value numeric(18,4),
last_movement_at
```

Updated in the same transaction as the ledger insert. Rebuilt by a `inventory:rebuild-cache` admin command from ledger if it ever drifts.

### 3.7 grn (goods receipt note)

```
grn:
  id, tenant_id, grn_no (per-tenant sequence), warehouse_id, vendor_id,
  bill_id (nullable — linked once bill created), po_id (nullable),
  received_date, vehicle_no, lr_no, notes, status('draft'|'posted'|'cancelled')

grn_lines:
  id, grn_id, item_id, batch_no, mfg_date, expiry_date, serial_nos (jsonb array),
  qty, uom, unit_rate, landed_cost_per_unit, hsn, gst_rate, total
```

### 3.8 delivery_notes (stock-out / dispatch)

```
delivery_notes:
  id, tenant_id, dn_no, warehouse_id, customer_id,
  invoice_id (nullable — linked when invoice created), so_id (nullable),
  dispatch_date, vehicle_no, lr_no, e_way_bill_no, status('draft'|'dispatched'|'cancelled')

delivery_note_lines:
  id, dn_id, item_id, batch_id, serial_nos (jsonb), qty, uom, unit_cost (snapshot)
```

### 3.9 transfers

```
transfers:
  id, tenant_id, transfer_no, from_warehouse_id, to_warehouse_id,
  status('draft'|'in_transit'|'received'|'cancelled'),
  dispatched_at, received_at

transfer_lines:
  id, transfer_id, item_id, batch_id, qty, qty_received, unit_cost
```

Two ledger entries on dispatch (`transfer_out`) and two on receipt (`transfer_in`). In-transit qty visible.

### 3.10 adjustments

```
adjustments:
  id, tenant_id, adj_no, warehouse_id, reason
    enum('damage','expiry','theft','found','revaluation','correction','opening_balance'),
  notes, status('draft'|'posted'|'cancelled'), requires_approval bool,
  approved_by, approved_at

adjustment_lines:
  id, adj_id, item_id, batch_id, qty (signed: + or -), unit_cost
```

### 3.11 stock_takes

```
stock_takes:
  id, tenant_id, st_no, warehouse_id, scope('full'|'partial'|'cycle'),
  category_id (for partial), started_at, completed_at, frozen (bool),
  status('in_progress'|'reviewed'|'posted'|'cancelled')

stock_take_lines:
  id, st_id, item_id, batch_id, system_qty, counted_qty,
  variance (generated), unit_cost, counted_by, counted_at, recount_flag
```

Posting a stock take creates one consolidated `adjustment` row (with all variance lines) and a single JE.

### 3.12 reorder_rules

Optional per (item, warehouse) override:
```
id, tenant_id, item_id, warehouse_id, reorder_level, reorder_qty, lead_time_days
```

Falls back to item-level values if no row.

---

## 4. API Surface — Exhaustive

Every endpoint MUST be implemented. Mobile and web hit the same endpoints — no surface-specific routes. All endpoints scoped by tenant via existing middleware.

Base path: `/api/v1/inventory`

### 4.1 Items (extends existing)

```
GET    /items                       list + search (q, category, type, active, has_stock, page)
GET    /items/:id
POST   /items
PUT    /items/:id
DELETE /items/:id                   soft delete (only if no stock movement)
POST   /items/import                CSV import
GET    /items/:id/stock             on-hand across warehouses + batches
GET    /items/:id/ledger            paginated movement history
GET    /items/barcode/:code         lookup by barcode (mobile scan)
```

### 4.2 Warehouses

```
GET    /warehouses
POST   /warehouses
GET    /warehouses/:id
PUT    /warehouses/:id
DELETE /warehouses/:id              blocked if non-zero stock
GET    /warehouses/:id/stock        on-hand summary
```

### 4.3 Stock

```
GET    /stock/on-hand               (warehouse?, item?, category?, batch_expiring_in_days?)
GET    /stock/ledger                (item?, warehouse?, from?, to?, type?, page)
GET    /stock/valuation             as-of date, by warehouse/category
GET    /stock/ageing                bucketed (0-30, 31-60, 61-90, 91-180, 180+)
GET    /stock/expiring              within N days, with FEFO suggestion
GET    /stock/reorder-alerts        items below reorder_level
GET    /stock/movement-summary      in/out by period
```

### 4.4 GRN

```
GET    /grn
POST   /grn                         create draft
GET    /grn/:id
PUT    /grn/:id                     edit draft only
POST   /grn/:id/post                post → updates ledger + JE
POST   /grn/:id/cancel              creates reversal entries
POST   /grn/:id/link-bill           attach to existing bill OR create new bill
```

### 4.5 Delivery Notes

```
GET    /delivery-notes
POST   /delivery-notes
GET    /delivery-notes/:id
PUT    /delivery-notes/:id
POST   /delivery-notes/:id/dispatch
POST   /delivery-notes/:id/cancel
POST   /delivery-notes/:id/link-invoice
POST   /delivery-notes/:id/suggest-batches    FEFO suggestion
```

### 4.6 Transfers

```
GET    /transfers
POST   /transfers                    draft
GET    /transfers/:id
POST   /transfers/:id/dispatch       → in_transit, ledger transfer_out
POST   /transfers/:id/receive        → received, ledger transfer_in (qty_received per line)
POST   /transfers/:id/cancel
```

### 4.7 Adjustments

```
GET    /adjustments
POST   /adjustments
GET    /adjustments/:id
PUT    /adjustments/:id              draft only
POST   /adjustments/:id/post
POST   /adjustments/:id/approve      if requires_approval
POST   /adjustments/:id/cancel
```

### 4.8 Stock Take

```
GET    /stock-takes
POST   /stock-takes                  start session (freezes scope)
GET    /stock-takes/:id
GET    /stock-takes/:id/sheet        printable count sheet
POST   /stock-takes/:id/lines        bulk upsert counts
PUT    /stock-takes/:id/lines/:lid   single line update
POST   /stock-takes/:id/recount      mark high-variance lines for recount
POST   /stock-takes/:id/post         create variance adjustment + JE
POST   /stock-takes/:id/cancel
```

### 4.9 Reports

```
GET    /reports/stock-summary
GET    /reports/movement
GET    /reports/valuation
GET    /reports/ageing
GET    /reports/reorder
GET    /reports/batch-expiry
GET    /reports/dead-stock           no movement in N days
```

All reports support CSV export via `?format=csv`.

### 4.10 Dashboard

```
GET    /dashboard                   KPIs: total value, # items below reorder,
                                    # batches expiring 30d, top movers, dead stock count,
                                    today's GRN/dispatch counts
```

---

## 5. Web Surface — Required Pages

Every API endpoint above MUST have a corresponding web screen with full CRUD where applicable. **A page is not "done" until create + edit + list + detail + delete (where allowed) all work end-to-end with toasts, loading states, empty states, error states, and mobile-responsive layout.**

| Route | Page | Notes |
|---|---|---|
| `/inventory` | Dashboard | KPI strip, charts, recents, quick actions |
| `/inventory/items` | Item list | Search, filter, bulk actions; reuses existing masters/items page |
| `/inventory/items/new` | New item | All flags (track_batches, track_serials, track_expiry, reorder) |
| `/inventory/items/$id` | Item detail | Stock-on-hand strip + ledger + analytics tabs |
| `/inventory/items/$id/edit` | Edit | — |
| `/inventory/items/import` | CSV import | — |
| `/inventory/warehouses` | Warehouse list | — |
| `/inventory/warehouses/new` | New warehouse | — |
| `/inventory/warehouses/$id` | Detail | On-hand summary by category |
| `/inventory/stock/on-hand` | On-hand grid | Filters: warehouse, category, low stock, expiring |
| `/inventory/stock/ledger` | Ledger | Filters: item, warehouse, type, date range |
| `/inventory/stock/valuation` | Valuation report | As-of date picker |
| `/inventory/stock/ageing` | Ageing buckets | — |
| `/inventory/stock/expiring` | Expiring soon | N-day picker |
| `/inventory/stock/reorder` | Reorder alerts | "Create PO" CTA |
| `/inventory/grn` | GRN list | Status tabs |
| `/inventory/grn/new` | New GRN | Vendor + lines + batch/expiry/serial entry |
| `/inventory/grn/$id` | Detail | Post / cancel / link bill |
| `/inventory/delivery` | DN list | — |
| `/inventory/delivery/new` | New DN | Customer + lines + FEFO-suggested batches |
| `/inventory/delivery/$id` | Detail | — |
| `/inventory/transfers` | Transfer list | — |
| `/inventory/transfers/new` | New transfer | From/to warehouse + lines |
| `/inventory/transfers/$id` | Detail | Dispatch / receive actions |
| `/inventory/adjustments` | List | Reason filter |
| `/inventory/adjustments/new` | New | Reason picker + lines (signed qty) |
| `/inventory/adjustments/$id` | Detail | Approve / post / cancel |
| `/inventory/stock-take` | Sessions list | — |
| `/inventory/stock-take/new` | Start session | Scope picker |
| `/inventory/stock-take/$id` | Count screen | Editable counted_qty grid, variance highlight, post |
| `/inventory/reports/movement` | Movement report | — |
| `/inventory/reports/valuation` | Valuation report | — |
| `/inventory/reports/ageing` | Ageing report | — |
| `/inventory/reports/reorder` | Reorder report | — |
| `/inventory/reports/batch-expiry` | Batch expiry | — |
| `/inventory/reports/dead-stock` | Dead stock | — |

### Web Quality Bar (non-negotiable)

- Every list page uses the existing table component with pagination, sort, filter.
- Every form uses the existing form components — no rolled-once form layouts.
- Every dropdown is a Combobox (per saved preference `feedback_searchable_dropdowns`).
- Dark mode must render correctly on every screen (per `feedback_dark_mode_support`).
- Auto-collapse sidebar at <1440px (per `feedback_sidebar_design`).
- Currency formatted via existing `formatINR` helper. Quantity to 3 decimals, value to 2.
- Every destructive action confirms via the existing confirm-dialog component.
- Every form validates client-side AND server-side using shared Zod schema from `packages/validators`.
- Loading skeletons, not spinners-only.

---

## 6. Mobile Surface — Required Screens

Goal: **the godown floor operates from the mobile app alone**. Barcode scan is the primary input mode.

| Screen | Purpose |
|---|---|
| Inventory Home | KPIs (low stock, expiring, today's movement), 4 quick actions: Receive, Dispatch, Transfer, Count |
| Items | Search + scan; tap → detail |
| Item Detail | On-hand by warehouse + batch, last 20 movements, reorder info |
| Receive (GRN) | Pick vendor → scan barcode loop → capture qty/batch/expiry → post |
| Dispatch (DN) | Pick customer → scan/pick lines (FEFO auto-suggest batch) → dispatch |
| Transfer | From/to warehouse → scan loop → dispatch / receive |
| Adjustment | Reason → scan → signed qty → post |
| Stock Take | Start session → scan + count loop → review variances → post |
| On-Hand | Filter by warehouse / low / expiring |
| Reorder Alerts | List items below reorder, share via WhatsApp |

### Mobile Quality Bar (non-negotiable)

- Every Text uses `RunqText` theme tokens (per `feedback_hr_mobile_typography`). The `check-fonts.sh` guard must pass.
- Every scrollable uses `keyboardDismissBehavior: onDrag` (per `feedback_keyboard_dismiss_on_scroll`).
- Free-text inputs use `TextCapitalization.sentences`; codes / serials / barcodes use `none` (per `feedback_text_capitalization`).
- Light + dark mode both render correctly (per `feedback_dark_mode_support`).
- Barcode scanning uses the existing `mobile_scanner` package (already in `pubspec.yaml` for HR check-in QR). Add only if missing.
- All state via existing Riverpod patterns under `lib/providers/`.
- Offline tolerance: scan + count work without network; queued ops sync on reconnect (Phase 2 — see §9).
- Every screen has pull-to-refresh.
- No hardcoded colors; use existing theme.

---

## 7. Validation, Errors, Edge Cases

Spec these explicitly so they aren't post-launch bug reports.

1. **Negative stock**: disallowed by default per warehouse. Item-level override (`allow_negative_stock`) for service-like items. Reject delivery / transfer / adjustment that would breach.
2. **Posting on closed period**: blocked. Error references the period.
3. **Batch on non-batch item**: 400 with clear message.
4. **Expired batch**: warned but allowed (some businesses sell at discount). FEFO suggester skips expired batches.
5. **Duplicate serial**: rejected at GRN time.
6. **Serial moved while not in stock**: rejected ("Serial X is currently {status} at {wh}").
7. **Concurrent posting** of two GRNs touching the same (item, batch): row-level lock on `stock_on_hand`; second waits.
8. **Cancellation after posting**: creates a reversal ledger entry + reversal JE. Original row stays for audit.
9. **Edit after posting**: blocked. Only "cancel + new" path.
10. **Decimal UoM**: qty supports 3 decimals, value 2 decimals throughout.
11. **Bill ↔ GRN qty mismatch**: warned at bill posting, allowed (short receipt, debit note path), flag on bill.
12. **Invoice ↔ DN mismatch**: same — warn, allow, flag.
13. **Stock take freeze**: while session is `in_progress` with `frozen=true`, posting any GRN/DN/adjustment/transfer that touches the scope is blocked.
14. **Item type change** (goods→service or batch tracking toggle): blocked once any ledger row exists.
15. **Warehouse delete**: blocked if any ledger row exists, even with zero current stock.
16. **Opening balance**: only via a special `opening` adjustment, posted once per (item, warehouse). Idempotent — second attempt rejected.
17. **Multi-UoM**: out of scope v1. Single UoM per item. Document as known limitation.

---

## 8. Acceptance Criteria — Single Source of Truth

The module ships when **all** of the below are green. No partial release.

### 8.1 API
- [ ] Every endpoint in §4 implemented, with request/response Zod schemas in `packages/validators`.
- [ ] OpenAPI / route table in `docs/api-routes.md` updated.
- [ ] All edge cases in §7 covered by a test.
- [ ] **E2E test suite** (`apps/api/test-inventory-e2e.py`, modeled on existing `test-e2e.py`) green, covering:
  1. Create warehouse, item, batch
  2. GRN → ledger updated, JE posted, on-hand correct
  3. Delivery (with FEFO) → ledger + JE
  4. Transfer dispatch + receive → in-transit visible mid-flow
  5. Adjustment (damage) → JE to write-off
  6. Stock take with variance → consolidated adjustment + JE
  7. Reorder alert fires when on-hand < reorder_level
  8. Expiry report lists batches within N days
  9. Negative-stock attempt rejected
  10. Cancel posted GRN → reversal entries
  11. Closed period block
  12. Stock-on-hand cache matches ledger sum (rebuild check)
- [ ] Lint + typecheck clean.

### 8.2 Web
- [ ] Every route in §5 present, in `apps/web/src/routes/__root.tsx`, with sidebar entry.
- [ ] Module switcher includes "Inventory" alongside Finance and HR.
- [ ] **Parity script** (`apps/web/scripts/check-inventory-parity.ts`) iterates `/api/v1/inventory/*` routes from a manifest and asserts each has a corresponding web route + a smoke test.
- [ ] Playwright smoke test that logs in as owner, navigates every Inventory route, asserts no console errors and no empty/error states.
- [ ] Dark mode pass on every route (manual screenshot in PR).
- [ ] Mobile-web responsive at 375px width.

### 8.3 Mobile
- [ ] Every screen in §6 present, routable from `apps/mobile/lib/router.dart`.
- [ ] Bottom-nav / module switcher includes Inventory.
- [ ] `check-fonts.sh` passes.
- [ ] Riverpod providers under `lib/providers/inventory_providers.dart`.
- [ ] Repo class at `lib/api/inventory_repo.dart` covers every endpoint in §4.
- [ ] Models at `lib/api/inventory_models.dart` with `freezed` / json_serializable.
- [ ] Manual walkthrough script in `apps/mobile/test/inventory-walkthrough.md` covering the 9 happy paths from §8.1's E2E list, run on iOS + Android emulator.

### 8.4 Cross-Surface Parity Check
A single source-of-truth manifest at `apps/api/src/modules/inventory/manifest.ts` lists every {endpoint, web-route, mobile-screen, capability}. CI runs `pnpm check:inventory-parity` which:
1. Reads the manifest
2. Asserts each endpoint exists in route table
3. Asserts each web-route file exists
4. Asserts each mobile-screen file exists
5. Fails build if any row missing.

This is the **single mechanism** that prevents the drift seen in HR.

---

## 9. Phasing

Total estimated agent time: 3–4 build days + ~2 days of e2e + parity hardening.

### Phase 1 — Core (Day 1–2)
Items (extend), warehouses, stock ledger + on-hand cache, GRN, delivery, on-hand + ledger reports. GL posting via `gl-poster.ts`. CoA seed includes GR/IR Clearing, Inventory Write-off, Inventory Gain.

### Phase 2 — Movement (Day 2–3)
Transfers, adjustments, stock take, reorder rules + alerts, expiry report.

### Phase 3 — Batch/Serial/Reports (Day 3–4)
Batch + expiry + FEFO suggester, serial tracking, ageing / valuation / dead-stock / movement reports, dashboard.

### Phase 4 — Mobile + Polish (Day 4–5)
Mobile screens, barcode scan flows, parity script, e2e suite, dark mode pass, doc updates.

### Phase 5 (deferred, not in v1)
- Offline scan queue with sync
- Multi-UoM with conversion
- Landed cost allocation (freight, duty) — currently allowed as flat per-line landed_cost
- Inter-branch transfer with branch accounting
- Drop-ship / cross-dock
- WMS-lite (bin locations)

---

## 10. Pre-flight Checklist for the Build Agent

Before starting:
1. Re-read this doc end-to-end. Treat §4 + §5 + §6 as the contract.
2. Read existing patterns: `apps/api/src/modules/hr/routes.ts`, `apps/web/src/routes/__root.tsx` HR section, `apps/mobile/lib/screens/hr/`.
3. Check `feedback_*` memory notes — every one applies.
4. Create the manifest first (`manifest.ts`). Use it to drive scaffolding.
5. Write the e2e test alongside, not after.
6. After each phase, run the parity script. Do not advance until green.
7. Final step: dogfood — create a warehouse, 5 items, run GRN → DN → transfer → adjustment → stock take, and verify GL ties out.

---

## 11. Open Questions (resolve before build, or assume the listed default)

| # | Question | Default if no answer |
|---|---|---|
| 1 | Valuation method default | Moving weighted average (industry standard for Indian SMEs) |
| 2 | Allow editing landed cost after posting | No — cancel + re-post only |
| 3 | Branch-wise GL accounting | No in v1 — single Inventory Asset account tenant-wide |
| 4 | Cycle count cadence | Manual sessions only in v1; no scheduler |
| 5 | E-way bill from DN | Reuse existing finance e-way bill flow — link, don't duplicate |
| 6 | Customer/vendor returns | Cover via existing credit-note / debit-note flows; DN/GRN have a `is_return` flag |
| 7 | Manufacturing consumption | Out of scope; reserved for future Manufacturing module |
| 8 | Where does item master live | Move to `inventory/items`, alias from `masters/items` for back-compat for one release |

---

## 12. File Touch List (informational, not exhaustive)

Created:
- `packages/db/src/schema/inventory/*` (new dir)
- `apps/api/src/modules/inventory/*` (new dir, ~15 files)
- `apps/web/src/routes/inventory/*` (~35 route files)
- `apps/web/src/hooks/queries/use-inventory.ts`
- `apps/mobile/lib/api/inventory_models.dart`, `inventory_repo.dart`
- `apps/mobile/lib/providers/inventory_providers.dart`
- `apps/mobile/lib/screens/inventory/*` (~12 screens + widgets)
- `apps/api/test-inventory-e2e.py`
- `docs/inventory-tracker.md` (build progress, ticked off as we go)

Modified:
- `packages/db/src/schema/index.ts` (export new schema)
- `packages/db/seeds/standard-chart-of-accounts.ts` (add inventory accounts)
- `packages/validators/src/index.ts` (add inventory validators + `store_keeper` role)
- `apps/api/src/index.ts` / route registration
- `apps/web/src/routes/__root.tsx` (mount inventory routes)
- `apps/web/src/components/layout/sidebar.tsx` (Inventory nav)
- `apps/mobile/lib/router.dart` (Inventory routes)
- `apps/mobile/lib/screens/home/` module switcher
- `docs/api-routes.md` (document new endpoints)
- `docs/feature-roadmap.md` (move Inventory to "done")

---

End of plan. Build agent: do not deviate from §4–§6 without recording the deviation in §11.
