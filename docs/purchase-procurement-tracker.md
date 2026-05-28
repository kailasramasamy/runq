# Purchase & Procurement — Build Tracker

Live progress for the PP module. Plan: `docs/purchase-procurement-plan.md`.
Branch: `feat/pp-phase-1`. Started 2026-05-26.

Hard prereq: AP Pattern-B foundation — **shipped to main** (commit `28682e1`).

## Pre-flight (PP plan §13)

- [x] AP Pattern-B shipped end-to-end (4 follow-ups deferred with clear next-home)
- [x] `inventory_grns.po_id` + `source='po'` round-trip supported (migration 0114)
- [x] Items master has `raw_material` / `packaging` entries (A1/A2/Buffalo + packaging in prod)
- [x] At least 1 active vendor with populated catalog (22 backfilled rows from aliases)
- [x] `/module-ui purchase #7C3AED` invoked → `pur_colors.dart` + `pur_primitives.dart` scaffolded
- [x] `docs/purchase-procurement-tracker.md` created (this file)

## Phase 1 — PO core (Week 1–2)

PO commitment doc only. **No GRN, no match, no PR** — those land in Phase 2+.

### Schema
- [x] **1.1 Schema** — migration `0117_pp_phase_1.sql` applied locally; Drizzle schema at `packages/db/src/schema/purchase/purchase-orders.ts`. Tables `purchase_orders_v2` + `purchase_order_lines_v2` (`_v2` suffix avoids collision with legacy `ap/purchase-orders` WMS tables; clean export names via Drizzle).
- [x] **1.2 Validators** — `packages/validators/src/purchase/po.schema.ts` (create / update / send / close / cancel / filter).
- [x] **1.3 Types** — `packages/types/src/purchase/po.ts` (`PurchaseOrder`, `PurchaseOrderLine`, `PurchaseOrderWithLines`, `PurchaseOrderStatus`). Legacy `ap/purchase-order` re-export dropped from types index (zero callers) to avoid name collision.

### API
- [x] **1.4 PO service** — `apps/api/src/modules/purchase/po.service.ts`: list (filters + page count + per-row line count), getById (with lines), create (auto-numbers `PO-YYYY-NNNN`, draft status), update (draft-only), send (locks edits + sets sentAt/approvedBy/approvedAt), close (with reason), cancel (with optional reason).
- [x] **1.5 PO routes** — `apps/api/src/modules/purchase/po.routes.ts`: 7 endpoints (GET list / GET detail / POST create / PUT update / POST send / POST close / POST cancel) + PDF 501 stub.
- [x] **1.6 Module wiring** — `apps/api/src/modules/purchase/routes.ts` mounts `/pos`; `app.ts` mounts `/api/v1/purchase`.
- [~] **1.7 PO PDF** — endpoint returns 501. Deferred to Phase 5's email-send polish pass since there's no email/print harness yet.

### Web
- [x] **1.8 Routes scaffolding** — `apps/web/src/routes/purchase/pos/` (index / new / edit / detail). 5 child routes registered under `financeRoute` in `__root.tsx` (`purchaseRoute` + 4 children + index redirect).
- [x] **1.9 PO list** — status-tab pill bar (All / Draft / Open / Received / Closed / Cancelled), vendor filter Combobox, search, status badges, empty state.
- [x] **1.10 PO create/edit form** — shared `po-form.tsx`. Vendor Combobox + dates + payment terms + delivery address. **Vendor catalog combobox on line description** lands here (Step 7/8 follow-up from AP Pattern-B); pick → auto-fills description/UOM/rate/HSN/tax. Free-text entry stays available.
- [x] **1.11 PO detail** — header + line items table + totals card + linked-docs placeholder ("Phase 2") + closed-reason card. Action bar: Edit (draft) / Send (draft) / Close / Cancel.
- [x] **1.12 Hooks** — `use-purchase-orders.ts`: usePurchaseOrders / usePurchaseOrder + 5 mutations with proper cache invalidation.

### Mobile
- [x] **1.13 Models + repo** — `lib/api/purchase_models.dart` + `lib/api/purchase_repo.dart` (7 endpoints).
- [x] **1.14 Providers** — `lib/providers/purchase_providers.dart` (autoDispose.family for list params + detail by id).
- [x] **1.15 PO list screen** — `PurPlainAppBar` + `PurSearchBar` + horizontal `PurFilterPill` row + `PurDocListTile` rows + `PurEmptyState` + FAB. Pull-to-refresh.
- [x] **1.16 PO detail screen** — header pill + cards (info / lines / totals / linked-docs / closed reason). Bottom action bar with Cancel / Close / Send. Send/Close/Cancel use the repo with optimistic refresh.
- [x] **1.17 PO create screen** — line cards with description + qty + rate + tax + HSN. `PurPrimaryButton` Save as draft.

### Mobile deferred (called out)

- **PO edit on mobile** — not in Phase-1 tracker; web edit covers the case for now. Mobile edit is a Phase-2 polish.
- **Vendor picker on mobile** — Phase-1 PO create screen uses raw vendor UUID text input (with a hint). A bottom-sheet vendor picker (same UX as the goods-received item picker) is the obvious next polish. The web PO form already has a Combobox-based picker.
- **Vendor catalog combobox on mobile PO lines** — same deferral. Reuses the catalog API; needs a bottom-sheet picker tied to the (selected) vendor.

### Acceptance (Phase 1)
- [ ] PO numbering monotonic per tenant, format `PO-YYYY-NNNN` (default; configurable later)
- [ ] Draft → Sent transition locks edits server-side and client-side
- [ ] Cancel preserves history; send-then-cancel is allowed (no GRN guard yet — that's Phase 2)
- [ ] Web + mobile parity: every endpoint has a screen, status pills + colours match
- [ ] `check-fonts.sh` clean for all new mobile files
- [ ] Workspace typecheck clean (api, web, validators, db, types)
- [ ] Dark-mode verified per screen
- [ ] `keyboardDismissBehavior: onDrag` on every mobile scrollable
- [ ] `TextCapitalization.sentences` default; none for codes/numeric

## Phase 1 — what's deliberately NOT in scope

- GRN-from-PO (Phase 2)
- 3-way match (Phase 3)
- Direct receipt for milk memo (Phase 4)
- PR (Phase 5, behind tenant flag)
- Reports / dashboard / Home screen (Phase 5)
- PO email send to vendor (Phase 5)
- Approval workflow before send (Phase 6 / deferred)

## Phase 1 open questions

1. **Vendor catalog combobox on PO lines** — implement as part of Phase 1 (this is the natural home; deferred from AP Pattern-B). Confirms catalog reuse infrastructure end-to-end.
2. **PO numbering format** — default `PO-YYYY-NNNN` (year-scoped per tenant). Tenant override (`PO-{TENANT_PREFIX}-NNNN`) is a Phase 5 polish.
3. **PO short-close** — draft+sent only? Or also partially_received? Recommend: draft → cancelled; sent / partially_received → closed (no further bills allowed); received → only closed (auto-transition).
4. **Edit window** — drafts edit freely; sent POs can be edited only via "amend" (creates new revision id; future). Phase 1 simpler: sent = locked, no amend, must cancel + recreate.

## Phase 2 — Receive against PO ✅

Ships GRN-from-PO end-to-end. Reuses inventory primitives (stock_ledger, serial capture, GL poster) so the cost basis flows naturally into Manufacturing later.

### Schema (migration 0118)
- [x] `inventory_grn_lines.po_line_id` — nullable FK to `purchase_order_lines_v2`. Drives per-line `qty_received` denormalised counter.
- [x] `inventory_grns.po_id` — promoted from bare uuid to FK on `purchase_orders_v2`.

### API
- [x] `purchase/receive.service.ts` — `getTemplate(poId)` returns open lines (qty_ordered - qty_received > 0) with suggested inventory_item_id pulled from the catalog's `inventory_item_id` bridge. `receive(poId, input)` atomically: validates PO status + item tracking flags, inserts inventory_grns (source='po', status='posted'), inserts grn_lines (with po_line_id), writes stock_ledger, captures serials, posts `Dr Inventory / Cr GRNI` via `InventoryGlPoster.postGrn`, backlinks `journal_entry_id` on GRN + stock_ledger, increments per-line `qty_received` on the PO, auto-transitions PO status (sent → partially_received → received).
- [x] `purchase/receive.routes.ts` — `GET /purchase/pos/:id/receive-template`, `POST /purchase/pos/:id/receive`. Wired via `purchase/routes.ts`.
- [x] `packages/validators/src/purchase/receive.schema.ts` — `receiveAgainstPoSchema`.

### Web
- [x] `hooks/queries/use-po-receive.ts` — `useReceiveTemplate`, `useReceiveAgainstPo`.
- [x] `routes/purchase/pos/receive.tsx` — items-received form pre-filled from template; warehouse + receivedDate + vehicle/LR; per-row item-master combobox; qty/batch/expiry/serials. Empty state when nothing is open. Posts via mutation + navigates back to PO detail.
- [x] `__root.tsx` route wiring — `/finance/purchase/pos/$poId/receive`.
- [x] PO detail page — **"Receive"** button (truck icon) visible when status ∈ {sent, partially_received}.

### Mobile
- [x] Models (`ReceiveTemplate`, `ReceiveTemplateLine`, `ReceiveResult`) + repo methods (`getReceiveTemplate`, `receive`) in `purchase_models.dart` / `purchase_repo.dart`.
- [x] Provider `poReceiveTemplateProvider` (autoDispose.family by poId).
- [x] `po_receive_screen.dart` — `PurPlainAppBar` + receipt-info card (reuses `WarehousePicker`) + per-line cards with bottom-sheet item picker + qty/batch/expiry/serials + sticky action bar. Empty-state when nothing open.
- [x] PO detail — **Receive** primary button (truck icon) when status allows. Tap → `/purchases/pos/:id/receive`.
- [x] Router wiring — new route registered.

### Phase 2 deferred (called out)

- **Barcode scan for batch capture** — the inventory module already has a scan flow we could plug in (`feedback_keyboard_dismiss_on_scroll` + the existing inventory GRN scan path). Add as polish — the screen accepts batch text manually for now.
- **Multi-warehouse split receipt** — rejected for v1 by `receive.service` (one warehouse per GRN). User splits into N receive postings if a single delivery hits multiple warehouses. Multi-warehouse is a Phase 5 polish.
- **GRN edit/cancel from PO detail** — GRNs created via PO-receive are immutable in v1. Inventory module's standard GRN cancel path works but isn't surfaced from PO detail yet.

## Phase 3 — 3-way match ✅

Adds PO-side discipline to bill posting. When a bill is matched to a PO, its JE clears the GR/IR clearing account (`2115`) that the PO-receive flow accrued, instead of debiting Inventory again. Default is amount-level match within tolerance; line-level match is opt-in.

### Schema (migration 0119)
- [x] `purchase_invoices.matched_po_id` (FK to purchase_orders_v2) + `match_override_reason` + `match_override_by` + `match_committed_at`.
- [x] `vendors.match_tolerance_pct` (nullable; tenant default hard-coded 2% for v1).

### API
- [x] `match.service.ts` — `preview(billId)` finds open POs for the bill's vendor, computes amount delta; `commit(input)` validates tolerance, requires override reason for `mismatch`, bumps per-line `qty_billed` for explicit mappings.
- [x] `match.routes.ts` — `POST /purchase/match/preview` + `POST /purchase/match/commit`.
- [x] **GL routing flipped** — `gl.postPurchaseInvoice` now takes `matchedPoId` and emits `Dr 2115 GR/IR / Cr 2101 AP-Vendor` when set.

### Web
- [x] `use-po-match.ts` hooks.
- [x] `bill-match-panel.tsx` — slots into bill detail page. Suggests open POs, "Match" / "Override & match" with required reason. Self-hides when no POs are open.

### Phase 3 deferred (called out)
- **Mobile match UI** — desk task. Web covers it.
- **Tenant-wide tolerance setting**, **auto-close PO**, **line-level deltas in preview** — Phase 5 polish.

## Phase 4 — Direct Receipt (memo qty) ✅

Memo path for "qty in without bill". Vrindavan: daily milk arrivals while Milk Procurement is pending. Generic for any vendor-less stock-in. One direct-receipt = one `inventory_grns` row (`source='direct'`) + line + stock_ledger movement. **No JE.**

### API
- [x] `direct-receipt.schema.ts` validators.
- [x] `direct-receipt.service.ts` — `create` / `list` / `cancel` (reversal movement).
- [x] `direct-receipt.routes.ts` — `GET` / `POST` / `DELETE /purchase/direct-receipts/:id`.

### Web
- [x] `use-direct-receipts.ts` hooks.
- [x] `direct/index.tsx` — filter (warehouse + date range) + table + reverse-confirm dialog.
- [x] `direct/new.tsx` — full entry form.
- [x] `__root.tsx` routes.

### Mobile
- [x] Models + repo methods.
- [x] `direct_receipt_screen.dart` — single screen, today's receipts at top, FAB → bottom-sheet entry form. Tap-to-reverse with confirm.
- [x] Router — `/purchases/direct`.

### Phase 4 deferred (called out)
- **Serial-tracked items** in direct receipt — explicitly blocked; use GRN-from-PO instead.
- **Bulk / CSV import** — Phase 5 polish.
- **Forward-compat to Milk Procurement** — `inventory_grns.milk_procurement_id` adds in that module; direct rows stay as `source='direct'`.

## Phase 5+ (out of scope for this branch, links forward)

Per plan §12: PR + reports + polish (Week 5–6).

## Notes

- Per `feedback_apply_migrations.md`: apply migrations manually via `pnpm exec tsx --env-file=../../.env scripts/run-sql.ts migrations/0117_*.sql`.
- Per `feedback_searchable_dropdowns.md`: always use `Combobox` not `Select` for vendor / item / catalog pickers.
- Per `feedback_dark_mode_support.md`: every new UI element verified in both modes.
- Per `feedback_keyboard_dismiss_on_scroll.md`: mobile scrollables set `keyboardDismissBehavior: onDrag`.
- Per `feedback_text_capitalization.md`: `sentences` default; `none` on numeric/codes/search.
- Per `feedback_hr_mobile_typography.md`: `RunqText` tokens only; guard with `check-fonts.sh`.
- `/module-ui purchase #7C3AED` skill prescription executed inline (slash command not loaded as live skill in this session — generated `pur_colors.dart` + `pur_primitives.dart` directly from the skill template).
