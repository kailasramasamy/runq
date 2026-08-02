# Manufacturing (BOM) — Implementation Plan

> **Build mandate:** ship a clean, fully working Manufacturing module across API + web + mobile in one pass. Same parity bar as Inventory and Purchase. Every feature must exist on all three surfaces; no surface ships partial.
>
> **Hard prerequisite:** Purchase & Procurement v1 must be live (provides reliable RM cost basis via GRN-from-PO + Direct Receipt). Inventory must support batch + expiry + FEFO (it does).
>
> **Brand:** rose — `#E11D48` primary, `#BE123C` deep, `#9F1239` darkest, `#FDA4AF` light (dark-mode text/icon). Hero gradient `#9F1239 → #F43F5E`. Reads as "production/heat/output." Reserved peers: amber (Inventory), violet (Purchase), teal (HR), indigo (Finance).
>
> **Module slug:** `manufacturing`. Folder names: `apps/api/src/modules/manufacturing/`, `apps/web/src/routes/manufacturing/`, `apps/mobile/lib/screens/manufacturing/`. Class prefix: `Mfg*` (e.g. `MfgColors`, `MfgDocListTile`).

---

## 1. Overview

### What Manufacturing is

The production layer that turns raw materials and packing into finished goods, with batch-level traceability and costed GL postings. The shape is universal across discrete + process SMEs: BOM defines the recipe → Work Order schedules a run → consumption is recorded against FEFO-suggested batches → output emits a new FG batch with cost rolled up from inputs.

Scope is **Phase A only** (Phase B/C deferred — see §11):

1. **BOM** — recipe header + lines (input items, qty per output, scrap %).
2. **Work Order (WO)** — a scheduled production run against a BOM.
3. **WO Consumption** — actual qty consumed per input, FEFO-suggested + editable, draws from `stock_ledger`.
4. **WO Output** — new FG batch with expiry; cost = sum(inputs at WAC) ÷ output qty.
5. **GL postings** — `Dr FG / Cr Raw Materials + Packing` at weighted-avg cost; yield variance → variance GL.
6. **Mobile scan-to-confirm** — plant-floor consumption confirmed by batch barcode scan.

### What Manufacturing is NOT (Phase A)

- **Not routing or job cards.** No multi-stage WIP tracking. A WO is one-step: inputs in → output out.
- **Not co-products / by-products.** Split-output recipes (e.g. cream + skim from milk, multiple grades from one run) — Phase C.
- **Not standard costing.** Actual cost only (WAC of inputs). Variance is yield, not price.
- **Not MRP / planning.** No demand-driven WO suggestions. User schedules WOs manually.
- **Not shop-floor time tracking.** Shift is metadata, not a clock-in system (HR's job).
- **Not quality control.** QC ships as a separate module in Epoch 2; WO has a `qc_status` hook for it.
- **Not items master.** Uses existing items master read-only; relies on `trackBatches`, `uom`, `itemClass` already there.

### Target ICP

Indian SME manufacturers running 1–3 plant lines with simple, mostly-linear recipes:

- **Food / FMCG / dairy** — single-stage assembly or processing (e.g. milk → pouch milk; flour + oil → biscuits).
- **Light engineering / fabrication** — assemble component kits into finished goods.
- **Chemicals / cosmetics / personal care** — batch mixing with packing.
- **Apparel / leather** — cut → stitch → pack collapsed into one WO in v1 (multi-stage = Phase B).

Vrindavan Dairy is the design pilot, but nothing in the data model is dairy-specific. Items master classification (`raw_material`, `packing`, `finished_good`) is what drives behaviour, not the vertical.

### Strategic wedge

Same as the rest of runq: low-ceremony, mobile-first. A plant-floor operator opens the app, picks today's WO, scans inputs as they're consumed, scans outputs as they come out, and the books are posted. No paper, no end-of-day reconciliation, no separate "production register."

---

## 2. Module dependencies

| Prereq | Status | Why |
|---|---|---|
| Inventory module (batch + expiry + FEFO) | ✅ Done | WO consumption draws from `stock_ledger`; output writes a new batch |
| Purchase & Procurement v1 | ✅ Done | RM cost basis at receipt — WO costing relies on accurate WAC |
| AP Pattern-B | ✅ Done | GRNI + inventory accounts in COA needed for WO postings |
| Items master with UOM + `itemClass` | ✅ Done | Need RM / packing / FG classification + UOM conversion |
| Item-level GL mapping per `itemClass` | ⚠️ Verify | COA must have `raw_material`, `packing`, `finished_good`, `yield_variance` accounts mapped |
| `/module-ui` skill | ✅ Done | UI scaffolding pattern |

Hard blocker: confirm the items master exposes a per-class GL mapping (or that the GL routing layer reads `itemClass` and maps to the right COA leaf). If not, that's a 2-day prereq before Phase 1.

---

## 3. Architecture

### 3.1 Module boundaries

```
                        ┌──────────────────────┐
                        │     Manufacturing    │
                        └──────────────────────┘
                           │            │
           owns: BOM, WO,  │            │  consumes:
           consumption,    │            │   - inventory.fefoSuggest()
           output, costing │            │   - inventory.postStockTxn()
                           ▼            ▼
         ┌──────────────────┐    ┌──────────────────┐
         │    Inventory     │    │       GL         │
         │ (stock, batches, │    │ (postings via    │
         │  FEFO, items)    │    │  postManufactureJE) │
         └──────────────────┘    └──────────────────┘
```

Manufacturing **never writes `stock_ledger` directly.** It calls `inventory.postStockTxn({ type: 'production_in' | 'production_out', ... })`. Inventory enforces batch + qty rules. GL routing is a single new function `postManufactureJE(woId)` invoked at WO close.

### 3.2 Code layout

```
apps/api/src/modules/manufacturing/
  bom.service.ts                 # BOM CRUD + versioning + clone
  bom.routes.ts
  wo.service.ts                  # WO lifecycle: draft → in_progress → completed → closed
  wo.routes.ts
  consumption.service.ts         # FEFO suggest + record actuals
  output.service.ts              # FG batch creation + costing roll-up
  costing.service.ts             # WAC pull, yield variance calc
  reports.service.ts             # WO summary, yield trend, BOM usage
  routes.ts

packages/db/src/schema/manufacturing/
  boms.ts
  bom-lines.ts
  work-orders.ts
  wo-consumption.ts
  wo-output.ts

apps/web/src/routes/manufacturing/
  _widgets.tsx
  index.tsx                      # Manufacturing home
  boms/                          # BOM list, create, detail, edit, clone
  wos/                           # WO list, create, detail, in-progress view
  reports/

apps/mobile/lib/screens/manufacturing/
  widgets/
    mfg_colors.dart              # rose brand palette
    mfg_primitives.dart          # Mfg* widgets (per /module-ui skill)
  manufacturing_home_screen.dart
  bom_list_screen.dart
  bom_detail_screen.dart
  bom_create_screen.dart
  wo_list_screen.dart
  wo_detail_screen.dart
  wo_create_screen.dart
  wo_run_screen.dart             # the scan-to-confirm production view
```

### 3.3 Integration with Finance / GL

| Event | JE |
|---|---|
| BOM create / edit | None — definitional only |
| WO create | None — a plan, not a transaction |
| WO start (status → in_progress) | None |
| WO consumption recorded | None individually — accumulates on the WO |
| WO output recorded | None individually — accumulates on the WO |
| **WO close (v1)** | **No JE posted.** Under actual costing with single-account inventory, the entry would be a same-account `Dr 1112 / Cr 1112` shuffle with zero net impact on trial balance / P&L / balance sheet. `stock_ledger` already records the movement with the correct WAC — there is nothing more for GL to capture. |
| **WO close (target)** | `Dr FG-Inventory(1112)  $output_value` / `Cr RM-Inventory(1111)  $consumed_rm` / `Cr Packing-Inventory(1113)  $consumed_pkg` |

**v1 decision (2026-05-30, Vrindavan dogfood):** the `ManufacturingGlPoster.postClose` returns `null` when `outputValue === consumedValue` (always true under v1 actual costing). `work_orders.je_id` stays NULL, `stock_ledger.journal_entry_id` stays NULL for production rows. Activity register on `1112` stays clean — no paired-and-canceling lines per WO.

The JE machinery is still in place and posts automatically when `outputValue ≠ consumedValue`. That case can't arise under v1 actual costing (cost is conserved by `costing.assignOutputCosts`) but WILL arise when standard costing or class-routed inventory accounts land in Phase C — at which point the existing poster handles the real Dr/Cr split without further change.

**Yield variance in v1 is a stock metric, not a JE line.** With actual-cost roll-up (§8.2), input cost is fully transferred to output cost — output_value always equals consumed_value (cost is conserved). The yield variance figure (`actualQty − expectedQty`, valued at output cost) is reported on `work_orders.yield_variance` and surfaces in reports, but **does not appear as a 5105 JE line** under actual costing. The 5105 account remains seeded for the standard-costing path (Phase C).

WAC for inputs is read at consumption time (per batch / per warehouse), not at WO close. A WO that consumes across two days uses the WAC live at each consumption event.

### 3.4 RBAC

As built, against the real `user_role` enum (the earlier draft named roles that
were never created):

| Role | BOM | WO create/edit/cancel | WO run (start/consume/output/close) | Record Production (§5.6) | Reports |
|---|---|---|---|---|---|
| `technician` | view | — | yes | yes | — |
| `viewer` | view | — | — | — | full |
| `accountant` | full | full | full | full | full |
| `owner` | full | full | full | full | full |

`technician` is the shop-floor persona: it is confined to the Manufacturing and
Inventory modules (`roleAllowedModules` in `@runq/types`) and has read-only
access within Inventory, so a device on the floor never carries Finance rights.
Because module grants and rbac must stay in lockstep — a granted module that
rbac rejects would 403 — `technician` is present in the Inventory and BOM
`READ_ROLES` as well as the Manufacturing run roles.

---

## 4. Data model

### 4.1 `boms`

```sql
CREATE TABLE boms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  bom_code        varchar(50) NOT NULL,        -- tenant-scoped, e.g. "BOM-PANEER-1KG"
  name            varchar(200) NOT NULL,
  output_item_id  uuid NOT NULL REFERENCES items(id),
  output_qty      numeric(12,3) NOT NULL,      -- nominal output per run
  output_uom      varchar(20) NOT NULL,

  version         integer NOT NULL DEFAULT 1,
  is_active       boolean NOT NULL DEFAULT true, -- only one active per (tenant, output_item)
  effective_from  date,
  notes           text,

  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, bom_code, version)
);

CREATE UNIQUE INDEX idx_bom_active_per_item ON boms (tenant_id, output_item_id)
  WHERE is_active = true;
```

Versioning: edits to a "sent" BOM create a new version row + flip `is_active`. WOs always reference an exact `(bom_id, version)` so historical costing reproduces.

### 4.2 `bom_lines`

```sql
CREATE TABLE bom_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  bom_id          uuid NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  line_no         integer NOT NULL,

  input_item_id   uuid NOT NULL REFERENCES items(id),
  qty_per_output  numeric(12,4) NOT NULL,      -- qty of input per 1 unit of output_uom
  input_uom       varchar(20) NOT NULL,
  scrap_pct       numeric(5,2) NOT NULL DEFAULT 0,  -- expected wastage, factored into expected qty

  is_optional     boolean NOT NULL DEFAULT false,   -- e.g. flavour additive
  notes           text
);

CREATE INDEX idx_bom_lines_bom ON bom_lines (bom_id);
```

Expected input for a WO of `wo_qty`:

```
expected_input_qty = qty_per_output × wo_qty × (1 + scrap_pct/100)
```

### 4.3 `work_orders`

```sql
CREATE TABLE work_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  wo_number       varchar(50) NOT NULL,           -- tenant-scoped sequence
  bom_id          uuid NOT NULL REFERENCES boms(id),
  bom_version     integer NOT NULL,               -- snapshot at create-time

  planned_qty     numeric(12,3) NOT NULL,         -- in BOM.output_uom
  warehouse_id    uuid NOT NULL REFERENCES warehouses(id),
  shift           varchar(20),                    -- 'AM' | 'PM' | 'NIGHT' | free text
  scheduled_for   date NOT NULL,

  status          wo_status NOT NULL DEFAULT 'draft',
                  -- draft → in_progress → completed → closed → cancelled

  started_at      timestamptz,
  completed_at    timestamptz,
  closed_at       timestamptz,

  output_qty      numeric(12,3) NOT NULL DEFAULT 0,   -- denormalised, sum of wo_output
  consumed_value  numeric(15,2) NOT NULL DEFAULT 0,   -- denormalised, sum of wo_consumption value
  output_value    numeric(15,2) NOT NULL DEFAULT 0,   -- denormalised, set at close
  yield_variance  numeric(15,2) NOT NULL DEFAULT 0,

  qc_status       qc_status DEFAULT 'pending',        -- hook for QC module
  je_id           uuid REFERENCES journal_entries(id), -- set on close

  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, wo_number)
);
```

### 4.4 `wo_consumption`

```sql
CREATE TABLE wo_consumption (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  wo_id           uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  bom_line_id     uuid REFERENCES bom_lines(id),       -- nullable: ad-hoc additions allowed
  input_item_id   uuid NOT NULL REFERENCES items(id),
  batch_no        varchar(60),                         -- required if item trackBatches=true; matches existing inventory string-batch convention
  warehouse_id    uuid NOT NULL REFERENCES warehouses(id),

  qty             numeric(12,3) NOT NULL,
  uom             varchar(20) NOT NULL,
  unit_cost       numeric(15,4) NOT NULL,              -- WAC at consumption time
  value           numeric(15,2) NOT NULL,              -- qty × unit_cost

  consumed_at     timestamptz NOT NULL DEFAULT now(),
  consumed_by     uuid REFERENCES users(id),
  stock_txn_id    uuid REFERENCES stock_ledger(id),    -- the inventory entry created

  notes           text
);

CREATE INDEX idx_wo_cons_wo ON wo_consumption (wo_id);
```

### 4.5 `wo_output`

```sql
CREATE TABLE wo_output (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  wo_id           uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  output_item_id  uuid NOT NULL REFERENCES items(id),
  batch_no        varchar(60) NOT NULL,                          -- generated as `<bom_code>-<YYYYMMDD>-<seq>`; matches existing string-batch convention
  warehouse_id    uuid NOT NULL REFERENCES warehouses(id),

  qty             numeric(12,3) NOT NULL,
  uom             varchar(20) NOT NULL,
  unit_cost       numeric(15,4) NOT NULL,            -- set at WO close
  value           numeric(15,2) NOT NULL,
  expiry_date     date,                              -- required if item trackBatches=true

  produced_at     timestamptz NOT NULL DEFAULT now(),
  produced_by     uuid REFERENCES users(id),
  stock_txn_id    uuid REFERENCES stock_ledger(id),

  notes           text
);
```

### 4.5b Batch model — string, not FK

Batches across runq are identified by `batch_no varchar(60)` on `stock_ledger`, `stock_on_hand`, and `inventory_grn_lines`. There is no `stock_batches` table. Phase 2 follows the same convention — `wo_consumption.batch_no` references the batch by string (same FEFO lookup as `delivery.service.ts`), and `wo_output.batch_no` is generated as `<bom_code>-<YYYYMMDD>-<seq>` at output time.

When QC ships in Epoch 2 and needs richer per-batch metadata (test results, holds, release status), we will promote `batch_no` to a real `stock_batches` table in a dedicated sub-project that refactors GRN, delivery, manufacturing, and on-hand together. Phase 2 deliberately defers that — it would block Manufacturing on a multi-module refactor.

FG batch expiry is queried for downstream FEFO via a UNION across `inventory_grn_lines.expiry_date` and `wo_output.expiry_date`, both keyed by `batch_no`.

### 4.6 No new tables for variance

Yield variance is a column on `work_orders` and posts as a JE line at close. No history table — query via JE lines if needed.

---

## 5. API surface

### 5.1 BOM

```
POST   /manufacturing/boms                    create
PUT    /manufacturing/boms/:id                edit (creates new version if WOs exist)
POST   /manufacturing/boms/:id/clone          clone as new bom_code
POST   /manufacturing/boms/:id/activate       flip is_active (deactivates others for same item)
POST   /manufacturing/boms/:id/deactivate
GET    /manufacturing/boms                    list with filters (item, active, search)
GET    /manufacturing/boms/:id                detail + lines + version history
```

### 5.2 Work Orders

```
POST   /manufacturing/wos                     create draft from BOM + planned qty + date
PUT    /manufacturing/wos/:id                 edit (draft only)
POST   /manufacturing/wos/:id/start           draft → in_progress
POST   /manufacturing/wos/:id/complete        in_progress → completed (no GL yet)
POST   /manufacturing/wos/:id/close           completed → closed (posts JE, locks)
POST   /manufacturing/wos/:id/cancel          draft | in_progress → cancelled (reverses stock txns)
GET    /manufacturing/wos                     list with filters (status, date, warehouse, bom)
GET    /manufacturing/wos/:id                 detail + consumption + output + costing preview
GET    /manufacturing/wos/:id/suggested-batches  per bom_line: FEFO list with available qty
```

### 5.3 Consumption + Output

```
POST   /manufacturing/wos/:id/consumption     record one consumption row (calls inventory.postStockTxn)
DELETE /manufacturing/wos/:id/consumption/:cid  reverse (in_progress only)
POST   /manufacturing/wos/:id/output          record one output batch (creates stock_batch + ledger entry)
DELETE /manufacturing/wos/:id/output/:oid     reverse (in_progress only)
```

### 5.4 Reports

```
GET    /manufacturing/reports/wo-summary           per-WO: planned vs actual, cost, variance
GET    /manufacturing/reports/yield-trend          per-BOM: yield % over time
GET    /manufacturing/reports/bom-usage            BOM run frequency + avg variance
GET    /manufacturing/reports/wo-pending-close     completed but not closed (chase finance)
```

### 5.5 Dashboard

```
GET    /manufacturing/dashboard
  → { wosInProgress, wosCompletedPendingClose, todayPlannedOutput,
      todayActualOutput, weekVariancePct, topBomsThisWeek }
```

### 5.6 Unplanned production entry ("Record Production")

```
POST   /manufacturing/production/preview   backflush a BOM, FEFO-allocate, report shortages
POST   /manufacturing/production           post the run as one unplanned WO
```

**Why it exists.** On a dairy floor the plant manager is not always on shift.
Packing technicians and cooks make product anyway, from raw materials, with no
work order authored for them. Without this they have no way to get finished
goods into stock, and the raw materials they used stay on the books.

**How it works.** The technician states the BOM (or the product) and how much
came out. The server derives the inputs — `qtyPerOutput × runs × (1 +
scrapPct/100)` where `runs = producedQty ÷ bom.outputQty` — allocates each one
FEFO across the batches actually on hand, and posts the whole run in a single
transaction: create WO (`entry_mode = 'unplanned'`) → start → consumption rows
→ output row → complete → close.

**Design decisions.**

- **Reuses the WO engine rather than posting stock directly.** Costing, the
  stock ledger, GL and every report stay single-sourced; there is no parallel
  accounting path to keep in step. The only new logic is the backflush and the
  FEFO allocation a manager would otherwise do by hand.
- **One transaction.** `WoConsumptionService`, `WoOutputService` and
  `WoLifecycleService` each expose an `*InTx` core alongside their public
  method, so the run cannot half-post — stock consumed with no finished goods
  to show for it is the failure mode this exists to prevent.
- **Shortages block, they do not warn.** If on-hand cannot cover the BOM, the
  entry is rejected with a 422 naming every short input and by how much
  (`details.shortages`). Stock never goes negative; the floor fixes the receipt
  first.
- **FEFO is applied, not merely suggested.** Unlike the WO run screen — where
  FEFO is advisory and the operator picks — the allocation here is computed and
  pre-filled, then editable. An override replaces the server's allocation for
  that item entirely and is still validated against on-hand.
- **Yield variance is zero by construction.** Planned qty *is* what the
  technician says was produced, so there is no plan to deviate from. Input
  overrides move unit cost instead, which costing picks up.
- **Idempotent at the WO level.** `work_orders.idempotency_key` is unique per
  tenant, so a replayed mobile offline-queue entry returns the original run
  rather than posting it twice.

**Access.** Open to the `technician` role (see §3.4) as well as owner and
accountant — a role that can run production and read BOMs and stock, but cannot
author BOMs or work orders and never sees Finance.

**Review.** Unplanned runs carry an `Unplanned` badge and filter on the WO
list, so a returning manager can see exactly what was made while they were out.

---

## 6. Web surface — per `/module-ui` skill

Brand: rose. Spacing rhythm per skill.

| Route | Purpose |
|---|---|
| `/manufacturing` | Home — KPI strip (In-progress WOs, Pending close, Today output, Week variance) + quick actions (Create WO, Start scheduled WO, New BOM) + recent activity |
| `/manufacturing/boms` | BOM list (active filter, output-item search) |
| `/manufacturing/boms/new` | Create BOM — output item + qty + UOM, lines editor with input combobox |
| `/manufacturing/boms/:id` | BOM detail — lines, version history, "Clone", "Deactivate" |
| `/manufacturing/boms/:id/edit` | Edit (warns if WOs exist → will version-up) |
| `/manufacturing/wos` | WO list with status tabs (Draft / In-progress / Completed / Closed / Cancelled), date range, warehouse filter |
| `/manufacturing/wos/new` | Create WO — BOM picker, planned qty, date, shift, warehouse |
| `/manufacturing/wos/:id` | WO detail — header, expected vs actual table, consumption list, output list, costing preview, actions |
| `/manufacturing/wos/:id/run` | The "live run" view — left: input lines with FEFO-suggested batches + qty input; right: output entry; bottom: post-and-close |
| `/manufacturing/reports/wo-summary` | Table + drill-through |
| `/manufacturing/reports/yield-trend` | Line chart per BOM |
| `/manufacturing/reports/bom-usage` | Sortable table |
| `/manufacturing/reports/wo-pending-close` | Action list |

### 6.1 Web quality bar (per skill)

- Combobox for BOM + item + batch pickers (never plain selects).
- Status pills using `MfgStatusPill`.
- Card-based detail layouts; UPPERCASE section headers.
- Loading / empty / error / skeleton on every page.
- Costing preview panel shows live recompute as user edits consumption/output.
- Variance banner uses `var(--neg-soft)` + dark variant per `feedback-dark-mode-support`.

---

## 7. Mobile surface — per `/module-ui` skill

Run `/module-ui manufacturing #E11D48` to scaffold `mfg_colors.dart` + `mfg_primitives.dart`. Then build:

| Screen | Purpose |
|---|---|
| `manufacturing_home_screen.dart` | Module home — `MfgGradientHeader` + KPI strip + 2×3 quick-action grid + today's WO list |
| `bom_list_screen.dart` | BOM list with active filter + search |
| `bom_detail_screen.dart` | BOM detail — line cards, version history pill |
| `bom_create_screen.dart` | Create BOM — bottom-sheet line entry, item combobox |
| `wo_list_screen.dart` | WO list with status pills + date filter |
| `wo_detail_screen.dart` | WO detail — expected vs actual, consumption + output summary, action sheet |
| `wo_create_screen.dart` | Create WO — BOM picker, planned qty, date, shift |
| **`wo_run_screen.dart`** | The plant-floor view — top: WO header + progress; tabbed (Consume / Output); per-line tap → bottom sheet → scan batch barcode → enter qty → post. Big primary buttons, large numeric fields, low cognitive load |

### 7.1 Mobile quality bar (per skill)

**Non-negotiable:** every screen ships at production polish — no "good enough for v1" surfaces. The bar is the Purchase module's mobile app as it exists today. Spacing, typography, iconography, motion, empty/error/loading states, dark mode — all match or exceed Purchase. If a screen feels rougher than the Purchase equivalent, it's not done.

- **Quick-action tiles on the home screen replicate Purchase exactly.** Same 2×3 grid layout, same tile dimensions, same icon + label composition, same shadow / border / press animation, same tap target sizing. `MfgQuickActionTile` is a direct port of `PurQuickActionTile` with the rose palette swapped in — do not redesign. The home screen header, KPI strip, recent-activity list, and section spacing also mirror Purchase.
- All `Text` widgets via `RunqText` tokens (guarded by `check-fonts.sh`).
- `keyboardDismissBehavior: onDrag` on every scrollable.
- `TextCapitalization.none` on qty/numeric fields; `sentences` on notes.
- Bottom-sheet pickers for BOM + item + batch (same UX pattern as Purchase vendor / catalog pickers).
- Status pills, list tiles, action sheets, empty states, primary buttons — all use the `Mfg*` primitives generated from the Purchase pattern; no one-off styling per screen.
- Dark mode verified per screen — every colour has a dark variant, no fixed-tone callouts.
- Camera barcode scan for batch capture (reuse inventory scan infra).
- The Run view tolerates offline — queue posts on flaky plant wifi. **Shipped in Phase 2.5** (`apps/mobile/lib/services/wo_run_queue.dart`): Hive-backed FIFO queue, `connectivity_plus` watcher drains on offline→online + app foreground, client-generated `idempotencyKey` per entry with server-side dedupe (partial unique indexes on `wo_consumption.idempotency_key` and `wo_output.idempotency_key`). Pending banner on the Run screen surfaces queued/failed entries; tap to retry.

### 7.2 Skill invocation

```
/module-ui manufacturing #E11D48
```

Generates `mfg_colors.dart` with the rose brand and stub `mfg_primitives.dart` to fill with the standard `Mfg*` widgets. Hero gradient is `#9F1239 → #F43F5E`.

---

## 8. Costing — design detail

### 8.1 WAC pull at consumption time

When a consumption row is recorded:

```
unit_cost = inventory.getBatchWAC(batchId, warehouseId)  -- per-batch WAC
value     = qty × unit_cost
```

`stock_ledger` entry uses this cost. WO `consumed_value` accumulates.

### 8.2 Output cost roll-up at close

On `POST /manufacturing/wos/:id/close`:

```
total_consumed = sum(wo_consumption.value)
total_output_qty = sum(wo_output.qty)             -- in BOM.output_uom
per_unit_output_cost = total_consumed / total_output_qty
for each output row: unit_cost = per_unit_output_cost
                     value = qty × unit_cost
```

If WO has multiple output rows (e.g. two batches from one run), they share the same `unit_cost`.

### 8.3 Yield variance — metric only in v1

```
expected_output = bom.output_qty × (planned_qty / bom.output_qty)   = planned_qty
actual_output   = sum(wo_output.qty)
variance_qty    = actual_output - expected_output
variance_value  = variance_qty × per_unit_output_cost
```

Stored on `work_orders.yield_variance` for reporting. **Not posted as a JE line under actual costing** — input cost rolls fully into output cost (cost is conserved per §8.2), so the trial balance has no plug.

The `5105 Production Yield Variance` account is seeded (and backfilled to existing tenants by migration 0125) so the standard-costing path (Phase C) has a target leaf when it activates. Per-tenant COA override stays a Phase 3 polish.

### 8.4 GL routing at close (v1)

**v1 posts no JE on a cost-conserved close.** `ManufacturingGlPoster.postClose` returns `null` when `outputValue === consumedValue` (always true under actual costing — `costing.assignOutputCosts` enforces cost conservation by absorbing rounding drift on the last `wo_output` row). `work_orders.je_id` stays NULL.

Rationale: the same-account `Dr 1112 / Cr 1112` shuffle has zero impact on trial balance, P&L, and balance sheet. The `stock_ledger` rows already record the movement at the correct WAC. Posting the JE would only inflate the activity register on `1112` without adding any auditable financial event. Trail-by-WO is still possible via `work_orders` and `stock_ledger.sourceType='work_order'`.

**Future (class-routed inventory accounts):** once GRN + Delivery + Adjustment posters split debits/credits by `itemClass` via `inventoryAccountFor()`, the same `postClose` will produce a real cross-account JE — Cr lines split across `1111` (RM) / `1113` (Packing) per consumed value, Dr line on `1112` for FG output. No code change is needed in `postClose`; the same `outputValue !== consumedValue` branch fires once consumed_value at class-routed accounts diverges from output_value at FG. The `costing.service` already exposes the per-class consumed breakdown (`consumedValueByClass`) for the poster to consume.

**Future (standard costing — Phase C):** when output is valued at BOM-derived standard cost (not actual), `outputValue` and `consumedValue` diverge by definition. The variance flows to `5105`. Same `postClose` machinery handles this without rewrite.

### 8.5 Reversal

WO cancel before close: reverses every `stock_ledger` entry created by consumption + output rows. No JE was posted, so no JE reversal needed.

WO reversal after close: out of scope in v1 — surface a "contact finance" message. (Workaround: post a manual correction JE.) Add proper reversal in Phase 2 if customers ask.

---

## 9. Validation, errors, edge cases

| # | Scenario | Behaviour |
|---|---|---|
| 1 | Consume qty > available batch qty | Block with "Insufficient stock — batch X has only Yl" |
| 2 | Output batch has no expiry but item `trackBatches=true` | Block with "Expiry required for batch-tracked item" |
| 3 | Close WO with zero output | Block — must have at least one output row |
| 4 | Close WO with zero consumption | Allow with warning ("WO closed with no input — variance will equal full output value") |
| 5 | BOM edited while WOs reference it | Auto-bump version; existing WOs keep their snapshot version |
| 6 | Deactivate BOM with in-progress WOs | Allow deactivation but block new WO creation against it |
| 7 | UOM mismatch between BOM line and stock batch | Auto-convert via item UOM conversion table; block if no conversion path |
| 8 | Output item ≠ BOM's `output_item_id` | Block — outputs must match BOM output item in v1 |
| 9 | Consumption of item not in BOM | Allow (ad-hoc) with reason note; flagged in variance report |
| 10 | WO `scheduled_for` < tenant lock date | Block (mirrors GL lock-date enforcement) |
| 11 | Duplicate `wo_number` within tenant | DB unique constraint prevents; sequence generator handles |
| 12 | Per-unit output cost is 0 (all inputs free) | Allow — emit warning. Some tenants test with zero-cost inputs. |
| 13 | Variance > 20% of expected output | Soft warning at close ("High variance — confirm?"); proceed with reason |

---

## 10. Acceptance criteria — single source of truth

The module is **not** done until all of these pass.

### 10.1 API
- [ ] All endpoints exist, return typed JSON, validated with Zod.
- [ ] All write endpoints idempotent (status transitions not double-applied).
- [ ] Tenant isolation verified on every query.
- [ ] RBAC enforced via `rbacHook` on every route.
- [ ] FEFO suggestion correct: oldest expiry first, available qty respected.
- [ ] WAC pulled per batch + warehouse at consumption time.
- [ ] WO close emits exactly one balanced JE with correct COA leaves.

### 10.2 Web
- [ ] Every API endpoint has a corresponding screen.
- [ ] CRUD + status transitions all work end-to-end.
- [ ] Loading / empty / error states on every page.
- [ ] Mobile-responsive (web responsive layer).
- [ ] Search + filter on every list.
- [ ] WO Run view recomputes costing preview live.

### 10.3 Mobile
- [ ] `/module-ui manufacturing` skill ran cleanly; `mfg_colors.dart` + `mfg_primitives.dart` exist.
- [ ] Every web screen has a mobile counterpart (heavy reports may be web-only).
- [ ] `check-fonts.sh` exits clean.
- [ ] Every scrollable sets `keyboardDismissBehavior: onDrag`.
- [ ] Dark mode verified per screen.
- [ ] Batch barcode scan works in WO Run view.
- [ ] Run view queues posts offline.

### 10.4 Cross-surface parity
- [ ] Same BOM + item + batch combobox UX on web and mobile.
- [ ] Same status pills, same colour semantics.
- [ ] Same KPI numbers on home (web + mobile read same dashboard endpoint).
- [ ] Costing preview identical.

### 10.5 Integration
- [ ] Inventory `stock_ledger` updated atomically per consumption + output.
- [ ] `stock_batches` row created on first output of a WO.
- [ ] FG batch carries expiry forward to S&D / dispatch.
- [ ] GL JE on close balances to the cent; reversible via standard JE-reversal flow.
- [ ] Items with `itemClass='raw_material'` and `'packaging'` map to distinct COA leaves at close.

### 10.6 Data integrity
- [ ] `boms` unique on `(tenant_id, bom_code, version)`.
- [ ] One active BOM per `(tenant_id, output_item_id)` enforced by partial unique index.
- [ ] CHECK constraints on `wo_status`, `qc_status`.
- [ ] FK cascade on WO delete drops consumption + output rows but **not** `stock_ledger` (preserve history).
- [ ] WO cancellation reverses every linked `stock_ledger` entry.

---

## 11. Phasing

3 phases over ~3 weeks (matches dairy plan §3.3 "2–3 wks" estimate).

### Phase 1 — BOM + WO skeleton (Week 1)
- Schema: `boms`, `bom_lines`, `work_orders` + status enum + sequence.
- API: BOM CRUD + versioning + clone; WO create + edit + cancel + list + detail.
- Web: BOM list + create + detail; WO list + create + detail (no run view).
- Mobile: BOM list + detail + create; WO list + detail + create.
- Run `/module-ui manufacturing #E11D48`.
- **No consumption, no output, no JE.** Just the planning surface.

### Phase 2 — Run + costing (Week 2)
- Schema: `wo_consumption`, `wo_output`.
- API: consumption + output endpoints; suggested-batches (FEFO); WO start/complete/close.
- Costing service: WAC pull, per-unit roll-up, yield variance calc.
- GL routing: `postManufactureJE`.
- Web: WO Run view with live costing preview.
- Mobile: WO Run view with barcode scan + offline queue.
- Item-class → COA leaf mapping confirmed in tenant settings.

### Phase 3 — Reports + dashboard + polish (Week 3)
- Reports: WO summary, yield trend, BOM usage, WO pending close.
- Manufacturing dashboard endpoint + home KPIs.
- Spacing tweaks per `/module-ui` skill (expect 2–3 spacing commits on Mfg home).
- Edge-case hardening from §9.
- Cross-surface parity sweep.

### Deferred (Phase B / C — not in v1)
- Multi-stage routing + job cards (Phase B).
- Co-products / by-products (cream + skim, whey) — needs split-cost-allocation rules.
- Standard costing + price variance (separate from yield variance).
- WO reversal after close.
- MRP / demand-driven WO suggestions.
- Shop-floor time tracking (HR integration).
- QC binding (waits for QC module in Epoch 2).

---

## 12. Pre-flight checklist for the build agent

Before starting Phase 1:

- [ ] PP v1 has shipped end-to-end (verified by recent merge to main).
- [ ] At least 1 BOM-able item in items master classified as `finished_good`, plus 2+ inputs as `raw_material` / `packing`.
- [ ] Tenant COA has leaves for: FG-Inventory, RM-Inventory, Packing-Inventory, Yield-Variance (loss + gain — can share one leaf in v1).
- [ ] Item-class → COA leaf mapping confirmed (or schedule the 2-day prereq to add it).
- [ ] UOM conversion table populated for the inputs (e.g. milk L ↔ kg if recipes mix units).
- [ ] `/module-ui manufacturing #E11D48` executed; `mfg_colors.dart` + stub `mfg_primitives.dart` committed.
- [ ] `docs/manufacturing-tracker.md` created with phase checklist.

---

## 13. Open questions

1. **Brand colour** — proposed rose `#E11D48`. Confirm or pick alternative. Reserved peers: amber (Inventory), violet (Purchase), teal (HR), indigo (Finance).
2. **Yield-variance accounts** — one COA leaf for both directions, or split into gain + loss? Recommend one leaf in v1, split later if CA pushes back.
3. **WO numbering format** — recommend `WO-YYYYMMDD-NNNN` (date-scoped sequence per day). Easier to eyeball today's runs in a list.
4. **Ad-hoc consumption (item not in BOM)** — allowed with reason note? Recommend yes — plant reality. Surface in variance report.
5. **Multi-output WO** — Phase A allows multiple output rows of the **same** item (e.g. two batches packed at different times in one run). Co-products (different items) is Phase C.
6. **Scrap %** — applied to expected qty only (for variance comparison)? Or actually creates a "scrap" stock entry? Recommend expected-qty only in v1; no scrap stock movements.
7. **QC hook** — `wo.qc_status` column exists from day one but no flow until QC module ships. WO close ignores `qc_status` in v1; in Epoch 2, close will require `passed` or override.
8. **Mobile offline queue** — local SQLite + replay on reconnect, same as Inventory scan? Recommend yes — reuse the inventory queue infra.

---

## 14. File touch list (informational)

**Schema**
- `packages/db/src/schema/manufacturing/boms.ts` (new)
- `packages/db/src/schema/manufacturing/bom-lines.ts` (new)
- `packages/db/src/schema/manufacturing/work-orders.ts` (new)
- `packages/db/src/schema/manufacturing/wo-consumption.ts` (new)
- `packages/db/src/schema/manufacturing/wo-output.ts` (new)
- `packages/db/migrations/0NNN_mfg_phase1.sql`
- `packages/db/migrations/0NNN_mfg_phase2.sql`

**API**
- `apps/api/src/modules/manufacturing/` (entire new module)
- `apps/api/src/modules/inventory/stock-txn.service.ts` (accept `type='production_in' | 'production_out'`)
- `apps/api/src/modules/gl/gl.service.ts` (`postManufactureJE` added)
- `apps/api/src/modules/inventory/wac.service.ts` (expose `getBatchWAC(batchId, warehouseId)`)

**Validators**
- `packages/validators/src/manufacturing/*.schema.ts` (new)

**Web**
- `apps/web/src/routes/manufacturing/` (entire new route tree)
- `apps/web/src/hooks/queries/use-boms.ts` (new)
- `apps/web/src/hooks/queries/use-work-orders.ts` (new)

**Mobile**
- `apps/mobile/lib/screens/manufacturing/` (entire new screen tree)
- `apps/mobile/lib/screens/manufacturing/widgets/mfg_colors.dart` (generated by `/module-ui`)
- `apps/mobile/lib/screens/manufacturing/widgets/mfg_primitives.dart` (generated by `/module-ui`)
- `apps/mobile/lib/api/manufacturing_repo.dart` (new)
- `apps/mobile/lib/api/manufacturing_models.dart` (new)
- `apps/mobile/lib/providers/manufacturing_providers.dart` (new)

**Docs**
- `docs/manufacturing-plan.md` (this file)
- `docs/manufacturing-tracker.md` (created at start of Phase 1)
- `docs/dairy-sme-plan.md` (update §6 tracker row + §2 map when shipped)

---

## 15. What this unlocks

- Any SME on runq can run daily production with full batch traceability — every FG unit ties back to the input batches that made it.
- FG stock lands in inventory with actual cost, ready for S&D in Epoch 2.
- P&L reflects actual production cost, not estimated — yield variance becomes a real management lever.
- QC, S&D, and (for dairy tenants) Milk Procurement all plug into a WO model that already understands batches end-to-end.
- After Manufacturing ships, **the factory side of the ERP is complete** — Inventory + Purchase + Manufacturing = goods in, made, ready to ship. Same code path serves dairy, food, light engineering, chemicals, apparel.
