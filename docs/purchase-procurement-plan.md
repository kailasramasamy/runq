# Purchase & Procurement — Implementation Plan

> **Build mandate:** ship a clean, fully working Purchase & Procurement module across API + web + mobile in one pass. Same parity bar as Inventory. Every feature must exist on all three surfaces; no surface ships partial.
>
> **Hard prerequisite:** `docs/ap-pattern-b-spec.md` must ship first. PP builds on top of vendor catalog, GRN-from-anything, and JE routing infra delivered there.
>
> **Brand:** violet — `#7C3AED` primary, `#6D28D9` deep, `#5B21B6` darkest, `#C4B5FD` light (dark-mode text/icon). Hero gradient `#5B21B6 → #8B5CF6`. Reads as "formal/procurement/contracts." Reserved peers: amber (Inventory), teal (HR), indigo (Finance).
>
> **Module slug:** `purchase`. Folder names: `apps/api/src/modules/purchase/`, `apps/web/src/routes/purchase/`, `apps/mobile/lib/screens/purchase/`. Class prefix: `Pur*` (e.g. `PurColors`, `PurDocListTile`).

---

## 1. Overview

### What PP is

The formal procurement layer for Indian SMEs that need PO discipline for *some* of their vendors (capex, scheduled supply, contract pricing) while continuing to receive goods+invoice together for most. PP wraps the AP foundation with:

1. **Purchase Order** — formal commitment to a vendor.
2. **GRN-from-PO** — receiving goods against an open PO.
3. **3-way match service** — exposed to AP so bill posting can verify PO ↔ GRN ↔ Bill consistency.
4. **Direct Receipt** — memo qty entry for inflows without bill (milk today, generic "no-vendor stock-in" tomorrow).
5. **Purchase Requisition** *(optional in v1; behind a tenant flag)* — internal request → approval → PO.
6. **Procurement reports** — open PO ageing, PO-vs-actual variance, vendor SLA.

### What PP is NOT

- **Not bill intake.** Bills live in AP, always. PP exposes a "match service" that AP calls when needed.
- **Not items master.** PP uses the existing items master (read-only) and the vendor catalog (read/write, shared infra).
- **Not GRN itself.** `inventory_grns` already exists in Inventory. PP just adds the `source='po'` flow on top.
- **Not RFQ.** Skipped in v1. Add when a customer asks.
- **Not landed cost.** Out of scope per AP Pattern-B decision.
- **Not vendor master.** Vendor master lives in `vendors` already; PP doesn't extend it.

### Target ICP

Indian SME manufacturers/traders running ~5–20 vendors with formal PO discipline (packaging supplier, capex, contracted RMs) and ~30–100 vendors as informal "goods+invoice" sources. Vrindavan Dairy is the pilot.

### Strategic wedge

The PP module's job isn't to add bureaucracy. It's to make formal procurement **as low-friction as informal procurement** — same vendor catalog, same items-received sub-form, same GRN. The only added ceremony is creating a PO upfront when you want to lock price/qty with the vendor.

---

## 2. Module dependencies

| Prereq | Status | Why |
|---|---|---|
| `docs/ap-pattern-b-spec.md` | **Required first** | Provides vendor catalog, GRN-from-bill, JE routing |
| Inventory module | ✅ Done | GRN, stock_ledger, warehouses, items master |
| AP module | ✅ Done | Bills, payments, vendor master |
| HR module | ✅ Done | Approver chain for PRs (optional v1) |
| `/module-ui` skill | ✅ Done | UI scaffolding pattern |

PP cannot start before AP Pattern-B ships. Build sequence: **AP Pattern-B (10 days) → PP Phase 1 (this plan)**.

---

## 3. Architecture

### 3.1 Module boundaries

```
                           ┌──────────────────────┐
                           │       Purchase       │
                           │     & Procurement    │
                           └──────────────────────┘
                              │           │
              owns: PR/PO,   │           │  exposes:
              GRN-from-PO,   │           │   - findOpenPosForVendor()
              Direct Receipt │           │   - matchBillToPo(billId)
                              │           │   - openPoAgeing()
                              ▼           ▼
            ┌──────────────────┐    ┌──────────────────┐
            │     Inventory     │    │        AP        │
            │ (GRN, stock,      │    │ (bills, payments)│
            │  items, catalog)  │    │                  │
            └──────────────────┘    └──────────────────┘
```

PP exposes a thin **match service**; AP calls it when posting a bill. Match outcome is advisory — AP makes the final decision whether to post.

### 3.2 Code layout

```
apps/api/src/modules/purchase/
  pr.service.ts                 # purchase requisition CRUD + approval
  pr.routes.ts
  po.service.ts                 # PO CRUD + status transitions
  po.routes.ts
  grn-from-po.service.ts        # receive against PO; wraps inventory.grn.service
  direct-receipt.service.ts     # memo qty entry, source='direct'
  match.service.ts              # 3-way match logic, exposed to AP
  reports.service.ts            # open PO ageing, variance, SLA
  routes.ts                     # register all sub-routes

packages/db/src/schema/purchase/
  purchase-orders.ts
  purchase-order-lines.ts
  purchase-requisitions.ts
  purchase-requisition-lines.ts
  pr-approvals.ts

apps/web/src/routes/purchase/
  _widgets.tsx                  # PurDocListTile etc., re-exports
  index.tsx                     # PP home (KPIs + quick actions)
  pos/                          # PO list, create, detail, edit
  prs/                          # PR list, create, detail, approve
  receive/                      # GRN-from-PO list + receive flow
  direct/                       # Direct Receipt list + entry
  reports/

apps/mobile/lib/screens/purchase/
  widgets/
    pur_colors.dart             # violet brand palette
    pur_primitives.dart         # Pur* widgets (per /module-ui skill)
  purchase_home_screen.dart
  po_list_screen.dart
  po_detail_screen.dart
  po_create_screen.dart
  receive_screen.dart           # scan PO → GRN
  direct_receipt_screen.dart    # daily memo qty entry
  pr_list_screen.dart           # behind tenant flag
```

### 3.3 Integration with Finance / GL

- PO creation: **no JE.** A PO is a commitment, not a transaction.
- GRN-from-PO post: same GRN-post JE as Inventory does — `Dr Inventory / Cr GRNI` (per item class).
- Bill matched against PO: `Dr GRNI / Cr AP-Vendor` (clears GRNI from GRN posting). Match service tells AP the GRN ids; AP's `postBill` flips routing from "Dr Inventory" to "Dr GRNI" for matched items.
- Direct Receipt: **no JE** (per AP Pattern-B decision for memo flow). Qty enters `stock_ledger` only.
- PR: no JE ever.

### 3.4 RBAC

| Role | PR | PO | Receive | Direct Receipt | Match override |
|---|---|---|---|---|---|
| `purchase_clerk` | create | create draft | create | create | — |
| `purchase_manager` | approve | send/edit/cancel | post | post | request |
| `finance_manager` | view | view | view | view | approve |
| `owner` | full | full | full | full | full |

---

## 4. Data model

### 4.1 `purchase_orders`

```sql
CREATE TABLE purchase_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  po_number       varchar(50) NOT NULL,        -- tenant-scoped sequence
  vendor_id       uuid NOT NULL REFERENCES vendors(id),

  po_date         date NOT NULL,
  expected_date   date,
  delivery_address text,
  payment_terms   varchar(100),
  notes           text,

  status          purchase_order_status NOT NULL DEFAULT 'draft',
                  -- draft → sent → partially_received → received → closed → cancelled

  source_pr_id    uuid REFERENCES purchase_requisitions(id),  -- if converted from PR

  subtotal        numeric(15,2) NOT NULL DEFAULT 0,
  tax_total       numeric(15,2) NOT NULL DEFAULT 0,
  total           numeric(15,2) NOT NULL DEFAULT 0,

  created_by      uuid REFERENCES users(id),
  approved_by     uuid REFERENCES users(id),
  approved_at     timestamptz,
  sent_at         timestamptz,
  closed_at       timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, po_number)
);
```

### 4.2 `purchase_order_lines`

Free-text, vendor-facing — same principle as `purchase_invoice_items`. No `item_id` FK.

```sql
CREATE TABLE purchase_order_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  po_id           uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_no         integer NOT NULL,

  description     varchar(255) NOT NULL,
  catalog_item_id uuid REFERENCES vendor_catalog_items(id),  -- optional reuse linkage
  uom             varchar(20),
  hsn_sac_code    varchar(8),

  qty_ordered     numeric(12,3) NOT NULL,
  unit_rate       numeric(15,2) NOT NULL,
  amount          numeric(15,2) NOT NULL,
  tax_rate        numeric(5,2) DEFAULT 0,
  tax_amount      numeric(15,2) DEFAULT 0,

  qty_received    numeric(12,3) NOT NULL DEFAULT 0,  -- denormalised; updated on each GRN
  qty_billed      numeric(12,3) NOT NULL DEFAULT 0,  -- denormalised; updated on each bill match

  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pol_po ON purchase_order_lines (po_id);
CREATE INDEX idx_pol_catalog ON purchase_order_lines (catalog_item_id)
  WHERE catalog_item_id IS NOT NULL;
```

`qty_received` / `qty_billed` are running totals updated transactionally when a GRN posts / a bill matches. Drives PO status transitions and "open PO ageing" reports.

### 4.3 `purchase_requisitions` *(v1 optional, behind `tenant_features.pr_enabled`)*

```sql
CREATE TABLE purchase_requisitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  pr_number       varchar(50) NOT NULL,
  requested_by    uuid NOT NULL REFERENCES users(id),
  department      varchar(100),
  required_by     date,
  justification   text,
  status          pr_status NOT NULL DEFAULT 'draft',
                  -- draft → submitted → approved → converted → rejected → cancelled
  converted_po_id uuid REFERENCES purchase_orders(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, pr_number)
);

CREATE TABLE purchase_requisition_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  pr_id           uuid NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
  description     varchar(255) NOT NULL,
  qty             numeric(12,3) NOT NULL,
  expected_rate   numeric(15,2),
  notes           text
);

CREATE TABLE pr_approvals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id           uuid NOT NULL REFERENCES purchase_requisitions(id),
  approver_id     uuid NOT NULL REFERENCES users(id),
  decision        approval_decision NOT NULL,   -- approved | rejected
  comment         text,
  decided_at      timestamptz NOT NULL DEFAULT now()
);
```

### 4.4 GRN linkage to PO

Already in place via `inventory_grns.po_id` (existing). `source='po'` discriminator added in AP Pattern-B spec covers the constraint. `inventory_grn_lines` may carry an optional `po_line_id` FK if user explicitly maps lines on receipt (otherwise NULL — matching falls back to amount-level).

```sql
ALTER TABLE inventory_grn_lines
  ADD COLUMN po_line_id uuid REFERENCES purchase_order_lines(id);
```

### 4.5 No new tables for "match results"

Match is computed on demand by `match.service.ts`. Match outcomes (per-bill, per-line, severity) cached only inside the bill record via existing `purchase_invoices.match_status` (new column added in this spec):

```sql
ALTER TABLE purchase_invoices
  ADD COLUMN matched_po_id    uuid REFERENCES purchase_orders(id),
  ADD COLUMN match_status     match_status DEFAULT 'unmatched',
                              -- unmatched | matched | partial | override
  ADD COLUMN match_override_reason text,
  ADD COLUMN match_override_by uuid REFERENCES users(id);
```

---

## 5. API surface

### 5.1 Purchase Orders

```
POST   /purchase/pos                    create draft
PUT    /purchase/pos/:id                edit (draft only)
POST   /purchase/pos/:id/send           draft → sent (locks edits, generates PDF)
POST   /purchase/pos/:id/close          partially_received → closed (short-close)
POST   /purchase/pos/:id/cancel         any → cancelled
GET    /purchase/pos                    list with filters (status, vendor, date)
GET    /purchase/pos/:id                detail + lines + linked GRNs + linked bills
GET    /purchase/pos/:id/pdf            printable PO
```

### 5.2 GRN-from-PO

Reuses inventory GRN endpoints with `source='po'`. PP adds one helper:

```
GET    /purchase/pos/:id/receive-template   returns sub-form rows pre-filled from PO open lines
POST   /inventory/grns                       (existing) — body includes po_id + items-received lines
```

### 5.3 3-way match (called by AP)

```
POST   /purchase/match/preview           body: { billId } → { matchedPoId?, status, lineMatches, totalDelta }
POST   /purchase/match/commit            body: { billId, matchedPoId, lineMappings, overrideReason? }
                                         → updates purchase_invoices.match_* + po line qty_billed
```

### 5.4 Direct Receipt (memo)

```
POST   /purchase/direct-receipts         body: { itemId, warehouseId, qty, unitRate, receivedAt, sourceLabel, notes }
GET    /purchase/direct-receipts         list with date / warehouse / item filters
GET    /purchase/direct-receipts/:id     detail
DELETE /purchase/direct-receipts/:id     reverse stock_ledger (audited)
```

Posts a GRN with `source='direct'`. No JE. No bill linkage.

### 5.5 Purchase Requisitions *(v1 optional)*

```
POST   /purchase/prs                     create draft
PUT    /purchase/prs/:id                 edit
POST   /purchase/prs/:id/submit          draft → submitted (triggers approver notification)
POST   /purchase/prs/:id/approve         submitted → approved
POST   /purchase/prs/:id/reject          submitted → rejected (with reason)
POST   /purchase/prs/:id/convert         approved → converted (creates PO)
GET    /purchase/prs                     list with filters (status, requester, date)
GET    /purchase/prs/:id                 detail + lines + approvals
```

### 5.6 Reports

```
GET    /purchase/reports/open-po-ageing       bucketed by 0-30/30-60/60-90/90+ days since send
GET    /purchase/reports/po-vs-actual         price + qty variance per PO
GET    /purchase/reports/vendor-sla           on-time delivery %, qty fill rate per vendor
GET    /purchase/reports/grn-without-bill     GRNs posted but no bill matched yet (≥X days)
GET    /purchase/reports/catalog-rate-trends  per catalog item, rate history with min/max/avg
```

### 5.7 Dashboard

```
GET    /purchase/dashboard
  → { openPoCount, openPoValue, lateDeliveriesThisMonth,
      pendingPrCount, unbilledGrnCount, topVendorsByValue }
```

---

## 6. Web surface — per `/module-ui` skill

Brand: violet. Spacing rhythm per skill (32px between KPI strip and Quick actions). Every API endpoint above has a corresponding screen.

| Route | Purpose |
|---|---|
| `/purchase` | PP home — KPI strip (Open POs, Pending receipts, Pending PRs, Unmatched bills) + quick actions (Create PO, Receive against PO, Direct Receipt, Create PR) + recent activity |
| `/purchase/pos` | PO list with status tabs (Draft / Sent / Partial / Received / Closed / Cancelled), vendor filter, date range |
| `/purchase/pos/new` | Create PO — vendor picker, line entry with vendor catalog combobox, totals, save/send |
| `/purchase/pos/:id` | PO detail — header, lines, linked GRNs, linked bills, status timeline, actions (Send / Close / Cancel) |
| `/purchase/pos/:id/edit` | Edit PO (draft only) |
| `/purchase/pos/:id/receive` | Receive flow — items-received sub-form pre-filled from PO open lines |
| `/purchase/prs` | PR list (feature-flagged) |
| `/purchase/prs/new` | Create PR |
| `/purchase/prs/:id` | PR detail + approvals + convert-to-PO action |
| `/purchase/direct` | Direct Receipt list (date + warehouse filter) |
| `/purchase/direct/new` | Direct Receipt entry — item + qty + rate + source label |
| `/purchase/reports/open-po-ageing` | Bucketed table with drill-through |
| `/purchase/reports/po-vs-actual` | Variance table |
| `/purchase/reports/vendor-sla` | Vendor scorecard |
| `/purchase/reports/grn-without-bill` | Action list (chase the bill) |

### 6.1 Web quality bar (per skill)

- Searchable combobox for vendor + catalog item pickers (never plain selects).
- Status pills + match-status badges using `PurStatusPill`.
- Card-based detail layouts; section headers in UPPERCASE per skill.
- Loading skeletons, toasts, empty states, error states — all four required on every page.
- Match-mismatch warning banner uses `var(--neg-soft)` + dark variant (per `feedback-dark-mode-support`).

---

## 7. Mobile surface — per `/module-ui` skill

Run `/module-ui purchase #7C3AED` to scaffold `pur_colors.dart` + `pur_primitives.dart`. Then build:

| Screen | Purpose |
|---|---|
| `purchase_home_screen.dart` | Module home — `PurGradientHeader` + KPI strip (4 cells) + 32px gap + 2×3 quick-action grid + recent activity |
| `po_list_screen.dart` | PO list with status filter pills + search bar + `PurDocListTile` |
| `po_detail_screen.dart` | PO detail — line cards, linked GRN summary, linked bill summary, actions sheet |
| `po_create_screen.dart` | Create PO — bottom-sheet line entry, catalog combobox picker |
| `receive_screen.dart` | Scan PO QR or pick from list → items-received sub-form → post GRN. **Camera scan** for batch barcodes when item is batch-tracked (reuse inventory scan infra) |
| `direct_receipt_screen.dart` | Daily memo qty entry — item picker, qty, rate, source label. List of today's receipts at top |
| `pr_list_screen.dart` | PR list (behind tenant flag) |
| `pr_create_screen.dart` | Create PR — simple form |
| `match_review_sheet.dart` | When a vendor with open POs has a bill scanned in AP, this sheet (invoked from AP mobile) shows match preview |

### 7.1 Mobile quality bar (per skill)

- All `Text` widgets via `RunqText` tokens (guarded by `check-fonts.sh`).
- `keyboardDismissBehavior: onDrag` on every scrollable.
- `TextCapitalization.sentences` on notes/justification; `none` on numeric/codes.
- Bottom-sheet pickers for vendor + catalog (matches AP/Inventory pattern).
- Dark mode tested per screen.
- Offline-tolerant for Receive flow (queue posts on flaky godown wifi) — Phase 2.

### 7.2 Skill invocation

```
/module-ui purchase #7C3AED
```

Generates `pur_colors.dart` with the violet brand (`#7C3AED` / `#6D28D9` / `#5B21B6` / `#C4B5FD` + 3-wash alphas + status palette + `brand(context)` accessor) and stub `pur_primitives.dart` to fill with the standard ~25 `Pur*` widgets. Hero gradient is `#5B21B6 → #8B5CF6`.

---

## 8. 3-way match — design detail

### 8.1 Default match: amount-level

When AP scans a bill from a vendor with open POs, `match.service.preview` runs:

```
totalDelta   = abs(bill.total - po.open_value) / po.open_value
status       = totalDelta <= tolerance(vendor) ? 'matched' : 'partial'
lineMatches  = []  -- empty unless explicit linkage attempted
```

Default tolerance = 2% (tenant setting; override per vendor in vendor master).

### 8.2 Line-level match: opt-in

When user explicitly maps a bill line ↔ PO line via the bill review UI (catalog match suggests this when both sides share a catalog entry), match.service runs a per-line check:

```
for each mapping (billLine, poLine):
  qtyOk    = abs(billLine.qty - (poLine.qty_ordered - poLine.qty_billed)) <= qty_tol
  priceOk  = abs(billLine.rate - poLine.unit_rate) / poLine.unit_rate <= price_tol
  status   = qtyOk && priceOk ? 'matched' : 'partial'
```

### 8.3 Match outcomes → UI affordances

| Status | UI on bill review |
|---|---|
| `matched` | Green badge "✓ Matched to PO-…". Bill posts normally with `Dr GRNI / Cr AP` routing. |
| `partial` | Amber warning banner with diff. Override flow required to post. |
| `override` | Red badge "Posted with override — <reason>". Audited. |
| `unmatched` | Neutral — no PO referenced. Posts as Pattern-B (Dr Inventory or Expense). |

### 8.4 Match never blocks unless tenant explicitly enables strict mode

Default: warn + allow override. Strict mode (per-tenant setting `match_strict=true`): block partial postings entirely. Most SMEs run default.

---

## 9. Direct Receipt — design detail

The memo path for stock-in without a bill. v1 use case: milk arrives from the existing ops module (or daily manual entry while Milk Procurement isn't built).

### 9.1 UX

- Mobile-first: home screen → "Direct Receipt" quick action → form sheet.
- Fields: item (picker from master), qty, unit rate, received_at (defaults now), warehouse, source_label (free-text), notes.
- N receipts per item per day. No "shift" concept, no "milk_type" — fully generic.
- Recent receipts list at top of the screen (today's entries) for quick reference.

### 9.2 Behaviour

- POST creates an `inventory_grns` row with `source='direct'`, `po_id=NULL`, `source_bill_id=NULL`.
- `inventory_grn_lines` written with the item + qty + unit_cost.
- `stock_ledger` + `stock_on_hand` updated.
- **No JE.** Inventory enters as a memo with cost basis preserved for downstream Manufacturing.
- Financial side handled separately by the ops module's bill sync (current flow) or by Milk Procurement module (future).

### 9.3 Forward compatibility

When Milk Procurement ships, Direct Receipt entries can be retro-linked to farmer records:

```sql
ALTER TABLE inventory_grns ADD COLUMN milk_procurement_id uuid REFERENCES milk_procurements(id);
```

`source` discriminator extends to `'milk_procurement'`. Existing rows stay as `'direct'` — no migration needed.

---

## 10. Validation, errors, edge cases

| # | Scenario | Behaviour |
|---|---|---|
| 1 | PO sent then vendor goes inactive | Allow receive/match against existing PO; warn on new PO create. |
| 2 | GRN qty > PO open qty | Warn ("Over-receipt: 50L over PO"); allow with reason. Updates `qty_received` past `qty_ordered`. |
| 3 | Bill matches PO but bill total > PO total | Match status = partial; require override. |
| 4 | Multiple bills against one PO | Allowed. `qty_billed` accumulates per line. PO closes when all lines fully billed. |
| 5 | PO cancelled with open GRNs | Block cancel; force user to either close PO or unlink GRNs first. |
| 6 | PR converted but PO later cancelled | PR status stays `converted`; surface a note on PR detail. |
| 7 | Direct receipt of an item with `trackBatches=true` but no batch entered | Block — same rule as GRN-from-bill. |
| 8 | Match service called for vendor with 0 open POs | Returns `{ status: 'unmatched' }`; AP posts as Pattern-B. |
| 9 | User attempts to send a PO with 0 lines | Block. |
| 10 | PO date < tenant lock date | Block (mirrors existing GL lock-date enforcement). |
| 11 | Duplicate `po_number` within tenant | DB unique constraint prevents. Sequence generator handles auto-numbering. |
| 12 | Catalog rate on PO line differs >5% from catalog default | Prompt to update catalog (per AP Pattern-B §4.2). |

---

## 11. Acceptance criteria — single source of truth

The module is **not** done until all of these pass.

### 11.1 API
- [ ] All 30+ endpoints exist, return typed JSON, validated with Zod.
- [ ] All write endpoints idempotent (status transitions are not double-applied).
- [ ] Tenant isolation verified on every query.
- [ ] RBAC enforced via `rbacHook` on every route.
- [ ] No N+1 queries on list endpoints (use joins / dataloader pattern).

### 11.2 Web
- [ ] Every API endpoint has a corresponding screen.
- [ ] CRUD + status transitions all work end-to-end.
- [ ] Loading / empty / error states on every page.
- [ ] Mobile-responsive (the web responsive layer, not the Flutter app).
- [ ] Search + filter on every list.

### 11.3 Mobile
- [ ] `/module-ui purchase` skill ran cleanly; `pur_colors.dart` + `pur_primitives.dart` exist.
- [ ] Every web screen has a mobile counterpart (except heavy reports, which can be web-only in v1).
- [ ] `check-fonts.sh` exits clean.
- [ ] Every scrollable sets `keyboardDismissBehavior: onDrag`.
- [ ] Dark mode verified per screen.
- [ ] Barcode/QR scan works on Receive flow.

### 11.4 Cross-surface parity
- [ ] Same vendor + catalog combobox UX on web and mobile.
- [ ] Same status pills, same colour semantics.
- [ ] Same KPI numbers on home (web + mobile read same dashboard endpoint).
- [ ] Match status badge on a bill renders identically across surfaces.

### 11.5 Integration
- [ ] AP bill review screen shows "Match to PO" suggestion when vendor has open POs.
- [ ] AP bill post with matched PO routes JE through GRNI.
- [ ] PO `qty_received` updates atomically when a GRN-from-PO is posted.
- [ ] PO status auto-transitions (sent → partially_received → received → closed) without user action.
- [ ] Direct Receipt posts to `stock_ledger` without touching GL.

### 11.6 Data integrity
- [ ] `purchase_orders` unique constraint on `(tenant_id, po_number)`.
- [ ] CHECK constraints on status enums.
- [ ] FK cascade on PO delete drops PO lines but not GRNs (GRNs are physical events; preserve).
- [ ] Reversal of cancelled bills + their match linkage rolls back `qty_billed`.

---

## 12. Phasing

5 phases over ~5–6 weeks. Hard prereq: AP Pattern-B shipped.

### Phase 1 — PO core (Week 1–2)
- `purchase_orders`, `purchase_order_lines` schema.
- API: PO CRUD, send, close, cancel, PDF, list/detail.
- Web: PO list, create, edit, detail.
- Mobile: PO list, detail, create (no receive yet).
- **No GRN, no match, no PR.** Just the formal commitment doc.

### Phase 2 — Receive against PO (Week 2–3)
- API: receive-template helper, GRN-from-PO path (extends inventory GRN service).
- `inventory_grn_lines.po_line_id` migration.
- Web + mobile: receive flow with items-received sub-form.
- Mobile: barcode scan for batch capture.
- PO status auto-transition logic.

### Phase 3 — 3-way match (Week 3–4)
- `purchase_invoices.matched_po_id` + match_status migration.
- API: match.service preview + commit endpoints.
- AP bill review screen: "Match to PO" panel with suggestion + override flow.
- JE routing in AP's `postBill`: switches to GRNI clearing when matched.
- Match status badges across AP screens.

### Phase 4 — Direct Receipt (Week 4)
- API: direct-receipts CRUD.
- Web + mobile: list + entry screens.
- Source `'direct'` discriminator wiring complete.
- Validate that ops module's milk sync can switch to this path (instead of inventory-adjustment).

### Phase 5 — PR + reports + polish (Week 5–6)
- PR schema + API + screens (behind `tenant_features.pr_enabled` flag; off by default for Vrindavan v1).
- Reports: open PO ageing, PO-vs-actual, vendor SLA, GRN-without-bill, catalog rate trends.
- PP dashboard endpoint + home screen KPIs.
- Polish pass: spacing tweaks per `/module-ui` skill (expect 2–3 spacing-tuning commits on PP home, same as Inventory).

### Phase 6 (deferred — not in v1)
- RFQ (skipped until customer ask)
- Multi-level PR approval chains (single approver in v1)
- Landed cost
- Vendor portal (web-facing for vendors to acknowledge POs)
- Contract management (long-term agreements that auto-spawn POs)

---

## 13. Pre-flight checklist for the build agent

Before starting Phase 1:

- [ ] AP Pattern-B has shipped end-to-end (vendor catalog table exists + populated, GRN source discriminator live, inventory accounts in COA).
- [ ] `inventory_grns.po_id` and existing GRN service support `source='po'` round-trip (already does; verify).
- [ ] Items master has at least 1 entry classified as `raw_material` or `packaging` for testing.
- [ ] At least 1 active vendor with a populated catalog for testing combobox.
- [ ] `/module-ui purchase #7C3AED` (or chosen colour) executed; `pur_colors.dart` + stub `pur_primitives.dart` committed.
- [ ] `docs/purchase-procurement-tracker.md` created with phase checklist.

---

## 14. Open questions

1. ~~Brand colour~~ — **Locked: violet `#7C3AED`** (full palette in §0 and §7.2).
2. **PR in v1?** Recommend off-by-default flag for Vrindavan (informal SME, owner does most procurement decisions). Build the schema + API anyway; flag controls UI exposure.
3. **Match tolerance default?** 2% recommended (matches industry norm). Per-vendor override in vendor master.
4. **PO numbering format?** Recommend `PO-YYYY-NNNN` (year-scoped sequence). Tenant-configurable later.
5. **Send PO via email?** Recommend yes — generate PDF, attach, send via existing notifier infra (HrNotifier pattern can be reused as `PurchaseNotifier`). PDF template uses existing print-layout primitives.
6. **Should "Send PO" require manager approval?** Recommend no in v1 (single-step send by purchase_clerk). Multi-step approval = Phase 6.
7. **GRN-from-PO: split items-received sub-form across multiple deliveries?** Yes — each delivery = separate GRN against the same PO. PO line `qty_received` accumulates.
8. **Closing a PO that's only 90% received** — short-close action with reason. Mark remaining open qty as closed (no longer receivable, no longer billable against this PO).

---

## 15. File touch list (informational)

**Schema**
- `packages/db/src/schema/purchase/purchase-orders.ts` (new)
- `packages/db/src/schema/purchase/purchase-order-lines.ts` (new)
- `packages/db/src/schema/purchase/purchase-requisitions.ts` (new)
- `packages/db/src/schema/purchase/pr-approvals.ts` (new)
- `packages/db/src/schema/inventory/grn-lines.ts` (add `po_line_id`)
- `packages/db/src/schema/ap/purchase-invoices.ts` (add match fields)
- `packages/db/migrations/0NNN_pp_phase1.sql`
- `packages/db/migrations/0NNN_pp_phase2.sql`
- `packages/db/migrations/0NNN_pp_phase3.sql`

**API**
- `apps/api/src/modules/purchase/` (entire new module)
- `apps/api/src/modules/ap/bill.service.ts` (call match.service on post)
- `apps/api/src/modules/gl/gl.service.ts` (`postBill` routes through GRNI when matched)
- `apps/api/src/modules/inventory/grn.service.ts` (accept `source='po'` + `po_line_id`)
- `apps/api/src/modules/notifiers/purchase-notifier.ts` (PO send via email, mirrors HrNotifier)

**Validators**
- `packages/validators/src/purchase/*.schema.ts` (new)

**Web**
- `apps/web/src/routes/purchase/` (entire new route tree)
- `apps/web/src/hooks/queries/use-purchase-orders.ts` (new)
- `apps/web/src/hooks/queries/use-prs.ts` (new)
- `apps/web/src/hooks/queries/use-match.ts` (new)
- `apps/web/src/routes/ap/bills/_match-panel.tsx` (new component embedded in bill review)

**Mobile**
- `apps/mobile/lib/screens/purchase/` (entire new screen tree)
- `apps/mobile/lib/screens/purchase/widgets/pur_colors.dart` (generated by `/module-ui`)
- `apps/mobile/lib/screens/purchase/widgets/pur_primitives.dart` (generated by `/module-ui`)
- `apps/mobile/lib/api/purchase_repo.dart` (new)
- `apps/mobile/lib/api/purchase_models.dart` (new)
- `apps/mobile/lib/providers/purchase_providers.dart` (new)

**Docs**
- `docs/purchase-procurement-plan.md` (this file)
- `docs/purchase-procurement-tracker.md` (created at start of Phase 1)
- `docs/dairy-sme-plan.md` (update §6 tracker row + §2 map when shipped)

---

## 16. What this unlocks

- Vrindavan can run formal POs with their packaging supplier, contracted RM vendors, capex purchases.
- AP bill posting gains 3-way match discipline for the small slice of bills that have a PO.
- Direct Receipt path becomes the bridge for Milk Procurement until that module ships.
- PR (when enabled) gives larger SME tenants the internal-request workflow.
- The vendor catalog (built in AP Pattern-B) earns its keep — same catalog drives PO lines, bill lines, items-received sub-form.

Manufacturing module (BOM) is the next domino after this — with PP delivering reliable RM cost basis at receipt time, BOM has the input it needs for actual FG product costing.
