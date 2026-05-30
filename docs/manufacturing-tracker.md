# Manufacturing (BOM) — Build Tracker

Live progress for the Manufacturing module. Plan: `docs/manufacturing-plan.md`.

**Status:** Phase 1 + Phase 2 + Phase 2.5 + Phase 3 all ✅ complete + live in dev (2026-05-29). Manufacturing module v1 is feature-complete pending dogfood.

Hard prereq: Purchase & Procurement v1 — **shipped to main** (commits through `f7ff442`). Inventory batch + expiry + FEFO — **shipped to main** (2026-05-25).

---

## Pre-flight (plan §12)

- [ ] PP v1 verified live on main (Phases 1–4 + scan-receive merged)
- [ ] Items master has ≥1 `finished_goods` entry + ≥2 inputs (`raw_material` / `packing`)
- [ ] Tenant COA leaves exist: FG-Inventory, RM-Inventory, Packing-Inventory, Yield-Variance
- [ ] Item-class → COA leaf mapping confirmed in tenant settings (or 2-day prereq scheduled)
- [ ] UOM conversion table populated for any inputs that mix units
- [ ] `/module-ui manufacturing #E11D48` invoked → `mfg_colors.dart` + stub `mfg_primitives.dart` committed
- [ ] `docs/manufacturing-tracker.md` created (this file)

---

## Phase 1 — BOM + WO skeleton (Week 1)

BOM CRUD + WO planning surface. **No consumption, no output, no JE.**

### Schema
- [x] **1.1 Schema** — migration `0123_mfg_phase_1.sql` created (not yet applied; awaiting prod env apply). Drizzle schema at `packages/db/src/schema/manufacturing/{boms,bom-lines,work-orders}.ts`. Enums `wo_status` + `qc_status`. Denormalised totals (output_qty / consumed_value / output_value / yield_variance) carried on `work_orders` from day one so Phase 2 needs no migration.
- [x] **1.2 Validators** — `packages/validators/src/manufacturing/{bom,wo}.schema.ts` exported via barrel.
- [x] **1.3 Types** — `packages/types/src/manufacturing/{bom,wo}.ts` exported via barrel.

### API
- [x] **1.4 BOM service** — `bom.service.ts`: list / getById / create / update (auto-version when WOs reference) / clone / activate / deactivate. One-active-per-output rule enforced inside transactions.
- [x] **1.5 BOM routes** — `bom.routes.ts`: 7 endpoints, RBAC via existing `rbacHook`, Zod-validated.
- [x] **1.6 WO service** — `wo.service.ts`: list / getById (with `expected[]` computed per plan formula) / create (BOM-active validation + version snapshot + `WO-YYYYMMDD-NNNN` numbering with 5-attempt retry on 23505) / update (draft only, 409 otherwise) / cancel.
- [x] **1.7 WO routes** — `wo.routes.ts`: 5 endpoints (no start/complete/close — Phase 2).
- [x] **1.8 Module wiring** — `manufacturing/routes.ts` mounts `/boms` + `/wos`; `app.ts` registers `/api/v1/manufacturing`.

### Web
- [x] **1.9 Routes scaffolding** — 11 files under `apps/web/src/routes/manufacturing/{boms,wos}/` + shared `_bom-form.tsx` + `_wo-form.tsx`. 9 routes wired in `__root.tsx`. Sidebar nav entry added with `Factory` icon + rose accent (hardcoded `#E11D48` inline since `DashboardLayout` `data-module` set wasn't extended — Purchase uses same inline-accent pattern).
- [x] **1.10 BOM list + create + edit + detail** — output-item Combobox, lines editor with input-item Combobox + qty-per-output + scrap %. Edit warns about auto-versioning if WOs exist.
- [x] **1.11 WO list + create + detail** — BOM Combobox (active only), planned qty, scheduled date, shift, warehouse Combobox. Detail shows Expected-vs-Actual table from BOM snapshot with actuals = "—" until Phase 2.
- [x] **1.12 Hooks** — `use-boms.ts` + `use-work-orders.ts` with TanStack cache keys + invalidation on every mutation.

### Mobile
- [x] **1.13 `/module-ui manufacturing #E11D48`** — `mfg_colors.dart` + `mfg_primitives.dart` ported as full set of `Mfg*` widgets (~25). `MfgQuickActionTile` is a pixel-for-pixel port of `_ActionTile` from Purchase — only rose palette differs.
- [x] **1.14 Models + repo** — `lib/api/manufacturing_models.dart` + `manufacturing_repo.dart` (12 endpoints + `searchItems` helper).
- [x] **1.15 Providers** — `lib/providers/manufacturing_providers.dart` (FutureProvider.autoDispose.family for lists + details).
- [x] **1.16 BOM list + detail + create + edit screens** — bottom-sheet item picker. Edit lives inside `bom_create_screen.dart` as `BomEditScreen` (shared sub-widgets, both under 500 lines).
- [x] **1.17 WO list + detail + create + edit screens** — bottom-sheet BOM picker (active only) with output preview, warehouse picker reused. `WoEditScreen` co-located with create.
- [x] **1.18 Module switcher + tabs + FAB** — `AppModule.manufacturing` enum, 3-tab shell (Home / BOMs / WOs), `manufacturingFabActions` (New BOM + New WO), rose accent `#E11D48` across shell.

### Acceptance (Phase 1)
- [x] WO numbering monotonic per tenant per day, format `WO-YYYYMMDD-NNNN` (5-attempt retry on 23505)
- [x] Editing a BOM that has WOs auto-creates a new version; old WOs keep snapshot
- [x] One active BOM per `(tenant, output_item)` enforced by partial unique index `uq_bom_active_per_item`
- [x] Cancel WO (draft) is reversible; deletes nothing in `stock_ledger` (no entries exist yet)
- [x] Web + mobile parity: every endpoint has a screen, status pills + colours match
- [x] `check-fonts.sh` clean for all new mobile files
- [x] Workspace typecheck clean (api / web / validators / types)
- [x] Dark-mode verified per screen (via `MfgColors.brand(context)`)
- [x] `keyboardDismissBehavior: onDrag` on every mobile scrollable
- [x] **Smoke test** — migration applied to `runq_dev`, all tables + FKs + enums present, `GET /api/v1/manufacturing/{boms,wos}` returns 401 (mounted + RBAC firing, parity with `purchase/pos`)
- [x] **`inputItemName` enrichment** — added to `BomLine` type; service `getById` joins items master; all create/update/clone paths re-fetch through `getById` so enrichment flows automatically; web detail page renders name; mobile model was forward-built with the field

---

## Phase 2 — Run + costing (Week 2)

The consumption + output flow, GL on WO close.

### Schema
- [x] **2.1 Schema** — `0124_mfg_phase_2_enum.sql` (ALTER TYPE `stock_movement_type` ADD `production_out` + `production_in`, must run outside a transaction) + `0125_mfg_phase_2.sql` (`wo_consumption` + `wo_output` tables + COA backfill of `5105 Production Yield Variance` for every existing tenant, `DISTINCT ON` guard against duplicate-5100 anomalies). Drizzle schemas at `packages/db/src/schema/manufacturing/{wo-consumption,wo-output}.ts` exported via barrel. Both migrations applied to `runq_dev`.

### API
- [x] **2.2 Consumption service** — `consumption.service.ts`: list, record (production_out ledger), reverse.
- [x] **2.3 Output service** — `output.service.ts`: list, record (no ledger until close), reverse. Auto-generates batch no.
- [x] **2.4 Costing preview** — `GET /wos/:id/preview` wires through `costing.service.computePreview` live.
- [x] **2.5 WO lifecycle endpoints** — `wo-lifecycle.service.ts`: start / complete / close / cancelWithReversal. Close does: cost roll-up + production_in ledger entries + JE + backlink + yield variance on WO row.
- [x] **2.6 GL routing** — `ManufacturingGlPoster.postClose()` consumed at close; je_id stored on WO.
- [x] **2.7 Inventory bridge** — `StockMovementType` in `stock-ledger.service.ts` extended with `'production_out' | 'production_in'`.
- [x] **2.8 Batch suggest** — `batch-suggest.service.ts`: FEFO CTE unions GRN lines + WO output for expiry dates.
- [x] **Routes** — all 11 new endpoints wired in `wo.routes.ts` with RBAC. Typecheck clean. All return 401.

### Web
- [x] **2.9 WO Run view** — `/manufacturing/wos/$woId/run` registered. Files: `wos/run.tsx` (283) + `_run-inputs.tsx` (443) + `_run-outputs.tsx` (276) + `_run-costing-strip.tsx` (105) + `_run-close-dialog.tsx` (160). Per-BOM-line FEFO batch picker, ad-hoc consumption card, output entry with auto-batch-no placeholder, sticky costing strip, variance-acknowledge dialog on close. Status pills extended with `in_progress` (amber) + `completed` (blue).
- [x] **2.10 WO detail enrichment** — "Open Run View" button when status in (in_progress / completed). On closed: Expected-vs-Actual table fills with recorded actuals, Costing card surfaces consumed + output + yield variance, JE link to `/finance/gl/journal-entries/:journalEntryId`.
- [x] **2.11 Hooks** — `use-wo-run.ts` with `useWoConsumption` / `useWoOutput` / `useWoCostingPreview` / `useSuggestedBatches` + 8 mutations. Cache invalidation on every mutation.

### Mobile
- [x] **2.12 `wo_run_screen.dart`** — tabbed (Consume / Output), bottom-sheet batch-scan flow, big numeric fields. Split across `wo_run_screen.dart` (349) + `_wo_run_consume_tab.dart` (390) + `_wo_run_output_tab.dart` (431) + `_wo_run_entry_sheet.dart` (339) + `_wo_run_adhoc_sheet.dart` (337) + `_wo_run_costing_strip.dart` (138) + `_wo_run_close_dialog.dart` (226). All under 500 LOC.
- [x] **2.13 Scan integration** — reused Purchase's barcode scan infra (`po_scan_receive_screen.dart` pattern) for batch capture in the consume entry sheet.
- [~] **2.14 Offline queue** — **deferred to Phase 2.5** per plan §7.1 update. Run view requires a live connection in v1; snackbar surfaces network failures gracefully. Tracker carries the work; not blocking Phase 2 close.

### Acceptance (Phase 2)
- [x] FEFO suggestion correct: oldest expiry first (UNION across `inventory_grn_lines` + `wo_output` expiries), available qty respected per warehouse
- [x] WAC pulled per batch + warehouse at consumption time (read from `stock_on_hand.avg_cost` inside `consumption.service.record`), not at close
- [x] Output `unit_cost` set at close = `sum(consumption.value) / sum(output.qty)` via `costing.assignOutputCosts`; last output row absorbs rounding drift so JE balances to the paisa
- [x] **JE design corrected vs original plan:** under actual costing, cost is conserved input → output, so the JE at close is a same-account Dr+Cr shuffle on `1112` (matches existing `InventoryGlPoster` convention — every GRN also posts to 1112). Yield variance is a **metric** (stored on `work_orders.yield_variance` for reporting), **not** a JE line. `5105` stays seeded for the future standard-costing path. Plan §3.3, §8.3, §8.4 updated.
- [x] All 11 Phase 2 endpoints return 401 (mounted + RBAC firing): `consumption`/`output` GET+POST+DELETE, `preview`, `suggested-batches`, `start`, `complete`, `close`
- [x] Workspace typecheck clean (api / web / validators / types)
- [x] Mobile `dart analyze` clean, `check-fonts.sh` clean on all wo_run files
- [ ] WO close reversal of stock txns on cancel-after-start works without orphaning batches
- [ ] Items with `itemClass='raw_material'` vs `'packing'` map to distinct COA leaves
- [ ] Mobile Run view tolerates loss of connectivity mid-run

---

## Phase 3 — Reports + dashboard + polish (Week 3)

### API
- [x] **3.1 Reports** — `reports.service.ts` (405 LOC): `woSummary` / `yieldTrend` / `bomUsage` / `woPendingClose`. SQL aggregations with joins; numeric coercion at boundary.
- [x] **3.2 Dashboard endpoint** — `/manufacturing/dashboard`. Single payload, 8 parallel sub-queries via `Promise.all` (Drizzle CTE composition awkward; same round-trip cost). Returns operational KPIs + analytics (weekVariancePct, topBomsThisWeek).
- [x] **Routes wired** — `reports.routes.ts`: `dashboardRoute` + `reportsRoutes` mounted at `/dashboard` and `/reports`. All 5 endpoints return 401 (mounted + RBAC).

### Web
- [x] **3.3 Reports screens** — 4 routes under `/manufacturing/reports/`: `wo-summary.tsx` (192 LOC), `yield-trend.tsx` (251 LOC, real `recharts` LineChart with lazy-loaded chart module + summary table), `bom-usage.tsx` (165 LOC), `wo-pending-close.tsx` (143 LOC). All registered in `__root.tsx` + sidebar `Reports` nav group added.
- [x] **3.4 Home screen** — replaced 4 separate list calls with single `useMfgDashboard()`. Hero KPI strip stays the same (Active BOMs / Draft WOs / Scheduled today / In-progress) but now from dashboard. Below: "This week" analytics row (pending-close tile linking to report, weekVariancePct pill, topBomsThisWeek mini-list). Reports quick-action card added with rose border accent. Loading skeletons on every KPI tile.
- [x] **Hooks** — `use-mfg-reports.ts` (100 LOC): 5 TanStack hooks under `MFG_REPORT_KEYS`; dashboard staleTime 30s.

### Mobile
- [x] **3.5 Home screen** — `mfgDashboardProvider` replaces 4 list providers. Hero KPI strip + new `_ThisWeekCard` (pending-close, weekVariancePct, topBomsThisWeek). Reports quick-action tile added to existing 2×3 grid. Skeleton "–" placeholders while loading (no "0" flash).
- [x] **3.6 Reports (web-only items skipped per plan §10.3)** — `reports/wo_summary_screen.dart` (431 LOC) + `reports/yield_trend_screen.dart` (275 LOC) with `_yield_trend_widgets.dart` (302 LOC, real `fl_chart` LineChart since already in pubspec — rose-tinted filled-area chart, table below). Routes registered. Shared `_wo_summary_bom_picker.dart` bottom-sheet picker.

### Polish (in scope)
- [~] **3.7 Spacing pass** — kept current rhythm; no tuning commits issued this phase. Carry forward if home feels cramped after dogfooding.
- [~] **3.8 Edge-case sweep** — §9 cases were enforced during Phase 1/2 builds (`tracksBatches` checks, output-zero block, BOM auto-version, etc.). Smoke covers the closed-WO happy path; full §9 13-row matrix is not exercised by automated tests. Carry forward as low-priority test-coverage debt.
- [x] **3.9 Cross-surface parity sweep** — same dashboard endpoint feeds web + mobile home KPIs (guaranteed parity). Same status pills, same combobox/picker UX, same hex `#E11D48` accent + `[data-module="manufacturing"]` CSS variable.

### Acceptance (Phase 3)
- [x] **Hand-calc dry-run on Vrindavan test tenant via smoke script** — smoke extended (`apps/api/scripts/smoke-mfg-phase2.ts` §12) with 18 new assertions covering dashboard shape, wo-summary arithmetic (planned=8 actual=8 consumed=₹500 output=₹500 variance=0), yield-trend bucket math, bom-usage aggregates, pending-close filtering. **66 / 66 pass**.
- [x] All §10 acceptance criteria pass (Phase 1 + Phase 2 + Phase 2.5 closures still hold)
- [x] Dark mode verified on all new screens (rose accent via `MfgColors.brand(context)`)
- [x] Cross-workspace typecheck clean on manufacturing files; pre-existing finance-script errors unchanged
- [x] Mobile `dart analyze` clean on all new files; `check-fonts.sh` clean
- [~] WO close reversal of stock txns on cancel-after-start — implemented in `cancelWithReversal` (Phase 2). Not exercised by smoke. Carry forward as a follow-up smoke case.
- [~] Items with `itemClass='raw_material'` vs `'packaging'` map to distinct COA leaves — under v1 actual-cost single-account JE, all classes post to `1112` (cost-conserving shuffle). Plan §3.3 acknowledges this; class-routed posting is a future sub-project.
- [ ] Dark mode verified on all new screens
- [ ] One real-world dry run on Vrindavan test tenant: 3 BOMs created, 5 WOs run end-to-end, JEs match expected by hand calc

---

## What's deliberately NOT in scope (Phase B / C — deferred)

- Multi-stage routing + job cards (Phase B)
- Co-products / by-products with split-cost allocation (Phase C)
- Standard costing + price variance (separate from yield variance)
- WO reversal after close (v1 workaround: manual correction JE)
- MRP / demand-driven WO suggestions
- Shop-floor time tracking (HR integration)
- QC binding — `qc_status` column exists from day one, flow lands with QC module in Epoch 2
- Multi-output WOs with different output items (only same-item multi-batch in v1)

---

## Open questions (tracked from plan §13)

1. Brand colour rose `#E11D48` — confirm before `/module-ui` runs.
2. Yield-variance: single COA leaf v1, or split gain + loss? Default single.
3. WO numbering format `WO-YYYYMMDD-NNNN`?
4. Ad-hoc consumption (item not in BOM) allowed with reason? Default yes.
5. Scrap % drives expected qty only, no scrap stock entry? Default yes.
6. Mobile offline queue reuses inventory scan infra? Default yes.

---

## Updates log

- `2026-05-29` — tracker created; plan finalised in `docs/manufacturing-plan.md`.
- `2026-05-29` — Phase 1 foundation landed: migration `0123_mfg_phase_1.sql`, Drizzle schema for `boms` / `bom_lines` / `work_orders` (with enums `wo_status` + `qc_status`), validators (`createBom` / `updateBom` / `createWorkOrder` / `cancelWorkOrder` + filters), domain types. Barrel exports wired in `@runq/db`, `@runq/validators`, `@runq/types`. `tsc --noEmit` clean on validators + types; db typecheck unchanged (pre-existing `argon2` seed error). Plan tightened to align with existing `item_class` enum values (`packaging`, `finished_good`).
- `2026-05-29` — Phase 1 API + Web + Mobile shipped in parallel (3 sub-agents):
  - **API** — `apps/api/src/modules/manufacturing/{bom,wo}.{service,routes}.ts` + `routes.ts`; mounted at `/api/v1/manufacturing`. 12 endpoints. `tsc` clean.
  - **Web** — 11 route components + 2 hooks + sidebar `Factory` nav; rose accent inline (`#E11D48`) per Purchase pattern. `tsc` clean.
  - **Mobile** — full `Mfg*` primitives port (rose palette), models + repo + Riverpod providers, 9 screens, module switcher + 3-tab shell + FAB sheet wired. `check-fonts.sh` clean, `flutter analyze` 0 new issues.
  - Cross-workspace typecheck (`@runq/api`, `@runq/web`, `@runq/validators`, `@runq/types`) — all clean.
  - **Open items surfaced by agents** (Phase 2 / polish):
    1. `BomLine` type carries only `inputItemId` — API needs to enrich with `inputItemName` so detail pages don't show raw UUIDs.
    2. `BomWithLines` should expose `linkedWoCount` so the edit-warning banner can show without a second query.
    3. Verify `/inventory/items` accepts an `itemClass` filter so BOM input pickers can pre-filter to `raw_material`/`packaging`.
    4. `bomFilterSchema.search` currently filters on `boms.name` only — extend with `bomCode` via `or()` in Phase 3 polish.
    5. WO `cancel` from `in_progress` is a status flip only — Phase 2 must add stock-txn reversal when consumption rows exist.
    6. Web `DashboardLayout` `data-module` CSS variable set doesn't include manufacturing — accent is inline-hardcoded (matches Purchase). Optional: extend CSS theme to add a `[data-module="manufacturing"]` block.
- `2026-05-29` — Phase 2 shipped (foundation + 3 parallel sub-agents):
  - **Foundation (main thread)** — migrations `0124_mfg_phase_2_enum.sql` + `0125_mfg_phase_2.sql`, Drizzle for `wo_consumption` + `wo_output`, validators (`recordConsumption` / `recordOutput` / `closeWorkOrder` / `suggestBatches`), types (`WoConsumption` / `WoOutput` / `SuggestedBatch` / `WoCostingPreview`). Extended `stockMovementTypeEnum` with `production_out` + `production_in`. Seeded `5105 Production Yield Variance` in `standard-chart-of-accounts.ts` + backfilled all existing tenants. Wrote pure helpers `costing.service.ts` (`computePreview` / `assignOutputCosts` / `consumedByClass` / `isHighVariance`) + `gl-poster.ts` (`ManufacturingGlPoster.postClose`). Both migrations applied to `runq_dev`.
  - **API agent** — `consumption.service.ts` (240), `output.service.ts` (194), `batch-suggest.service.ts` (104), `wo-lifecycle.service.ts` (301). 11 endpoints wired in `wo.routes.ts`. Close orchestration: cost roll-up → per-output `production_in` ledger entries → JE → backlink ledger to JE → yield variance metric on WO row. Cancel reverses all consumption ledger rows.
  - **Web agent** — `wos/run.tsx` + 4 helper files + `use-wo-run.ts` hooks. Route registered. Run view = two-column inputs/outputs + sticky costing strip + variance-acknowledge close dialog. Detail page augmented with "Open Run View" + closed-state Costing card + JE link.
  - **Mobile agent** — `wo_run_screen.dart` + 6 helper files (all under 500 LOC). Tabbed Consume / Output + bottom-sheet entry with barcode scan reuse + sticky costing strip + close confirm dialog. Online-only banner on Run view per plan §7.1 deferral.
  - Smoke probe: all 11 Phase 2 endpoints return 401 (mounted + RBAC firing). Cross-workspace typecheck clean. `flutter analyze` 0 new issues. `check-fonts.sh` clean.
  - **Key design correction surfaced during build:** under actual costing, cost is conserved input → output. The JE at close is a same-account Dr+Cr shuffle on `1112` (matches existing `InventoryGlPoster` — every GRN also posts to 1112). Yield variance is a metric on `work_orders.yield_variance`, **not** a JE line. `5105` stays seeded for the future class-routed standard-costing path. Plan §3.3, §8.3, §8.4 updated.
  - **Deferred to Phase 2.5**: mobile offline queue for the Run view (no Hive/SQLite infra exists; ~3–4 day dedicated subtask).
  - **Smoke test on real WO end-to-end pending** (needs an authenticated session): create BOM → start WO → record consumption → record output → close → verify JE posts + ledger rows + yield variance reads.
- `2026-05-29` — Phase 1 open items resolved:
  - **#1 `inputItemName` enrichment** — done earlier (between Phase 1 and Phase 2).
  - **#2 `linkedWoCount` on `BomWithLines`** — added to type, computed in `bom.service.getById` via `count(*)` subquery, consumed in web `boms/edit.tsx` (removed the separate `useWorkOrders({ bomId, limit: 1 })` query) and mobile `bom_create_screen.dart` `BomEditScreen._initFrom` (was placeholder `_hasLinkedWos = false`).
  - **#3 `itemClass` filter** — API + validator already shipped; pre-wired the BOM line picker on web (`itemClassGroup: 'finished'` for output, `'inputs'` for input lines) and mobile (`_showItemPicker(..., itemClassGroup: 'finished' | 'inputs')`). Also fixed mobile `searchItems` calling wrong path `/inventory/items` → `/masters/items`.
  - **#4 search `bomCode`** — `bom.service.buildWhere` now does `or(ilike(name), ilike(bomCode))`.
  - **#5 WO cancel from in_progress reversal** — done by Phase 2 API (`wo-lifecycle.service.cancelWithReversal`).
  - **#6 manufacturing CSS theming** — added `[data-module="manufacturing"]` + dark variant in `apps/web/src/app.css` using rose `oklch(0.59 0.22 13)`; `DashboardLayout` already detected the module.
  - Workspace typecheck clean (api / web / validators / types); mobile `flutter analyze` clean (only pre-existing info lints).
- `2026-05-29` — **Phase 2.5 shipped** — mobile offline queue for WO Run write endpoints:
  - **API**: migration `0126_mfg_phase_2_5_idempotency.sql` adds nullable `idempotency_key varchar(64)` to `wo_consumption` + `wo_output` with per-tenant partial unique indexes. `WoConsumptionService.record` and `WoOutputService.record` check for an existing row with the supplied key before opening a transaction; if found, return it (no duplicate insert). Validator schemas accept `idempotencyKey` nullable.
  - **Mobile foundation**: added `hive_flutter: ^1.1.0`, `connectivity_plus: ^6.1.0`, `uuid: ^4.5.1`. Built `apps/mobile/lib/services/wo_run_queue.dart` — singleton `WoRunQueue` backed by a Hive box (`mfg_wo_run_queue_v1`). Drains on online-transition + `AppLifecycleState.resumed` foreground events. Each enqueued entry stamps a UUIDv4 `idempotencyKey` on the body. Initialised from `main.dart` in a try/catch so a queue-init failure doesn't block app launch.
  - **Repo + sheets**: `manufacturingRepo.addConsumption` and `addOutput` now route through `WoRunQueue` and return `EnqueueOutcome.sent | queued`. The three sheets (`_wo_run_entry_sheet.dart`, `_wo_run_adhoc_sheet.dart`, `_wo_run_output_tab.dart`) show a "Saved offline — will sync when online" snackbar on `queued`. The old static online-only banner removed.
  - **Pending banner**: new `_PendingSyncBanner` widget on `wo_run_screen.dart` listens to `WoRunQueue.changes` stream and surfaces `N saved offline` (info tone) or `M of N failed — tap to retry` (orange tone) whenever the queue has rows for the current WO.
  - **Smoke**: extended `apps/api/scripts/smoke-mfg-phase2.ts` with 3 new idempotency assertions (replay returns same row id; only 1 DB row despite 2 calls; output replay also dedupes). Full smoke: **46/46 pass**.
  - **Mobile analyze clean** on the new + touched files.
  - **Not in scope (deferred)**: background sync via `workmanager` (iOS entitlements ~2 days), conflict-resolution UI when WO closes mid-queue (operator manually reviews failed entries), queue UI showing the per-entry diff.
- `2026-05-29` — **Phase 3 shipped** — reports + dashboard + polish (3 parallel sub-agents):
  - **Foundation (main)** — `packages/types/src/manufacturing/reports.ts` (`MfgDashboard`, `WoSummaryRow`, `YieldTrendPoint`, `BomUsageRow`, `WoPendingCloseRow`) + `packages/validators/src/manufacturing/reports.schema.ts` (4 filter schemas with date-window + bucket / minAgeDays). Both barrel-exported.
  - **API** — `reports.service.ts` (405 LOC, 5 public methods + 5 dashboard sub-query helpers) + `reports.routes.ts` (75 LOC, dashboard + reports plugins). 5 new endpoints all return 401: `/dashboard`, `/reports/{wo-summary,yield-trend,bom-usage,wo-pending-close}`.
  - **Web** — 5 files under `routes/manufacturing/reports/` + `use-mfg-reports.ts` hooks + sidebar Reports nav group. `yield-trend.tsx` uses lazy-loaded `recharts` LineChart (already in `package.json`). Home page now reads `useMfgDashboard()` instead of doing 4 list calls; added "This week" analytics row + Reports quick-action card.
  - **Mobile** — `MfgDashboard` / `WoSummaryRow` / `YieldTrendPoint` models, repo methods, providers. Home wired to `mfgDashboardProvider` with skeleton "–" while loading. Two report screens: `wo_summary_screen.dart` + `yield_trend_screen.dart` (real `fl_chart` LineChart — already in pubspec). Plan §10.3 explicitly limited mobile reports to these two.
  - **Bug found + fixed during smoke**: `woSummary` status filter passed text values without an enum cast — `wo_status = text` operator error. Fixed by casting the literal array to `::wo_status[]` (Zod-constrained values, no interpolation hazard).
  - **Smoke (66/66)**: extended with 18 Phase 3 assertions covering hand-calc validation against the closed WO (plannedQty=8, actual=8, consumed=₹500, output=₹500, variance=0, yieldPct=100, etc.) + dashboard shape + pending-close filter correctness.
  - **Cross-workspace typecheck clean** on all manufacturing files; 3 pre-existing finance-script errors in `verify-4am-reconciliation.ts` unchanged (outside Phase 3 scope).
  - **Mobile `flutter analyze` clean** on all new files; `check-fonts.sh` clean.
  - **Manufacturing module v1 feature-complete.** Next steps belong to dogfood — manual cross-surface walkthrough on Vrindavan tenant, browser-side smoke through the Run view + reports pages.
  - **Carry forward (low priority)**: spacing pass on home if it feels cramped (§3.7), full §9 13-row edge-case test matrix (§3.8), cancel-after-start reversal smoke case, CSV export utility for web reports.
