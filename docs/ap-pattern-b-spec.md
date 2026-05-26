# AP Pattern-B Foundation — Spec (v2)

> **Goal:** Make the dominant Indian-SME procurement pattern — *"goods + invoice arrive together, no PO"* — end-to-end correct in runq. Today AP creates bills and posts a JE, but bills never touch inventory. After this spec, the small set of bill lines that *are* tracked inventory items also update `stock_on_hand` and post to the correct inventory account in one transactional shot. The vast majority of bill lines (services, generic supplies, freight) stay 100% free-text — no regression.
>
> **Scope:** AP module + new `vendor_catalog_items` shared infra. No PO, no PP, no 3-way match.
>
> **Non-goals:** RFQ, vendor performance, landed cost, batch revaluation, payment-side changes, foreign currency.
>
> **Target ship:** ~10 working days, single phase.

---

## 1. Architectural principle

Three concerns, three table groups, no coupling between them except via explicit, optional FKs:

| Concern | Owns | Notes |
|---|---|---|
| **Commercial** | `purchase_invoice_items` (+ future `purchase_order_items`) | Free-text, vendor-facing. **No FK to items master, ever.** What the vendor billed us. |
| **Physical** | `inventory_grn_lines` | The only place inventory data lives. FK to `items` master + warehouse + batch + serial. |
| **Vendor catalog** | `vendor_catalog_items` (new) | Per-vendor reuse aid. Bridges commercial ↔ physical via optional `inventory_item_id` FK. |

**Items master holds only what you genuinely track in inventory** (or sell). Generic vendor SKUs never auto-populate it.

---

## 2. Schema changes

### 2.1 `purchase_invoices` — bill-level inventory metadata

```sql
ALTER TABLE purchase_invoices
  ADD COLUMN warehouse_id   uuid REFERENCES warehouses(id),
  ADD COLUMN goods_received boolean NOT NULL DEFAULT false,
  ADD COLUMN linked_grn_id  uuid REFERENCES inventory_grns(id);
```

- `warehouse_id` — default warehouse for the items-received sub-form. Per-line override possible.
- `goods_received` — toggle on the bill UI; default false. When true *and* the sub-form has rows, an inline GRN is created on post.
- `linked_grn_id` — back-reference set on post; used for idempotency and cancel-reversal.

### 2.2 `purchase_invoice_items` — UNCHANGED

Intentionally left alone. No `item_id`, no `warehouse_id`, no batch fields. Bill lines remain free-text, exactly as today.

### 2.3 `inventory_grns` — bill-origin discriminator

```sql
ALTER TABLE inventory_grns
  ADD COLUMN source         varchar(20) NOT NULL DEFAULT 'po',  -- 'po' | 'bill' | 'direct'
  ADD COLUMN source_bill_id uuid REFERENCES purchase_invoices(id);

ALTER TABLE inventory_grns
  ADD CONSTRAINT chk_grn_source CHECK (
    (source = 'po'     AND po_id          IS NOT NULL AND source_bill_id IS NULL) OR
    (source = 'bill'   AND source_bill_id IS NOT NULL AND po_id          IS NULL) OR
    (source = 'direct' AND po_id          IS NULL     AND source_bill_id IS NULL)
  );

CREATE UNIQUE INDEX uq_grn_source_bill ON inventory_grns (source_bill_id)
  WHERE source = 'bill';   -- DB-level idempotency: at most one GRN per bill
```

### 2.4 `vendor_catalog_items` — NEW

```sql
CREATE TABLE vendor_catalog_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  vendor_id              uuid NOT NULL REFERENCES vendors(id),

  description            varchar(255) NOT NULL,
  normalized_description varchar(255) NOT NULL,  -- lowercased + whitespace-collapsed
  default_uom            varchar(20),
  default_rate           numeric(15,2),
  hsn_sac_code           varchar(8),
  default_tax_rate       numeric(5,2),

  inventory_item_id      uuid REFERENCES items(id),  -- optional bridge to items master

  use_count              integer NOT NULL DEFAULT 0,
  last_used_at           timestamptz,
  is_active              boolean NOT NULL DEFAULT true,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_vci_vendor_norm
  ON vendor_catalog_items (vendor_id, normalized_description)
  WHERE is_active = true;

CREATE INDEX idx_vci_tenant_vendor ON vendor_catalog_items (tenant_id, vendor_id);
CREATE INDEX idx_vci_inventory_item ON vendor_catalog_items (inventory_item_id)
  WHERE inventory_item_id IS NOT NULL;
```

Normalisation rule (server-side, before insert/lookup):
```ts
norm(s) = s.toLowerCase().replace(/\s+/g, ' ').trim()
```

### 2.5 `vendor_bill_item_aliases` — DEPRECATE

Already-existing table, sparsely used. One-shot migration:
1. INSERT existing alias rows into `vendor_catalog_items` (with `inventory_item_id` set, no rate/uom).
2. Drop the old table.

### 2.6 Optional sidecar: `vendor_catalog_item_price_history`

```sql
CREATE TABLE vendor_catalog_item_price_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid NOT NULL REFERENCES vendor_catalog_items(id),
  rate            numeric(15,2) NOT NULL,
  source_doc_type varchar(20) NOT NULL,   -- 'po' | 'bill' | 'manual'
  source_doc_id   uuid,
  changed_at      timestamptz NOT NULL DEFAULT now()
);
```

Written on every catalog rate update. Lightweight, useful for vendor negotiation later.

### 2.7 COA seed — inventory account per item class

Tenant COA gets (idempotent insert):

**Existing accounts reused** (no change):

| Code | Name | Item class |
|------|------|------------|
| 1111 | Inventory — Raw Materials | raw_material |
| 1112 | Inventory — Finished Goods | finished_good |
| 1113 | Inventory — Packing Material | packaging |

**New accounts added by migration `0115_ap_pattern_b_coa_seed.sql`** (parent = 1100 Current Assets):

| Code | Name | Item class |
|------|------|------------|
| 1118 | Inventory — Semi-Finished Goods | semi_finished |
| 1119 | Inventory — Trading Stock | trading_good |
| 1120 | Inventory — Consumables | consumable |
| 1121 | Inventory — Spare Parts | spare_part |

(Original spec proposed 1201–1207 but those codes are Fixed Assets in the standard COA. 1114–1117 are also taken — Short-Term Investments, Accrued Revenue, Bank Suspense, Inter-Bank Clearing.)

Mapping `itemClass → accountCode` lives in `apps/api/src/modules/gl/inventory-accounts.ts` (new file).

---

## 3. Bill intake UX

### 3.1 Layout

```
┌────────────────────────────────────────────────────────────────┐
│  Vendor: Mahesh Packaging Pvt Ltd          Invoice: INV-2456   │
│  Date: 25/05/2026                          Due: 09/06/2026     │
│                                                                │
│  ─── BILL LINES (vendor's invoice, free text) ─────────────    │
│  │ # │ Description           │ HSN  │ Qty │ Rate  │ GST │ Amt │
│  │ 1 │ Pkg Film 50mic HDPE   │ 3923 │ 200 │ 45.00 │ 18% │ ... │
│  │ 2 │ Caps 38mm white       │ 3923 │ 500 │  2.50 │ 18% │ ... │
│  │ 3 │ Freight charges       │ 9965 │   1 │   500 │  5% │ ... │
│                                                                │
│  ─── ITEMS RECEIVED INTO STOCK (optional) ──────────────────   │
│  ☑ Record goods received      Warehouse: [Main ▼]              │
│                                                                │
│  │ # │ Item from master       │ Qty │ Unit cost │ Batch │ Exp │
│  │ 1 │ [RM-PKG-FILM-50MIC  ▼] │ 200 │     45.00 │ B-552 │  —  │
│  │ 2 │ [RM-PKG-CAP-38W     ▼] │ 500 │      2.50 │   —   │  —  │
│  │   │ [+ Add item to stock]   │     │           │       │     │
│                                                                │
│  [Save as draft]                              [Post bill]      │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Bill lines section — unchanged from today

Same form, same fields. Vendor catalog enhances entry behaviour only:

- **Combobox on description**: filters `vendor_catalog_items` for current vendor (using `normalized_description`). Pick → auto-fills HSN, rate, UOM, GST.
- **No mandatory pick**: typing new text and tabbing out keeps the line free-text. No prompts.
- **"☑ Save to catalog" toggle** per line (off by default; persisted on bill save).

### 3.3 Items received sub-form — new, optional

- Collapsed unless `☑ Record goods received` is checked.
- Each row: `inventory_item_id` (picker from items master), qty, unit cost, batch/expiry/serial as required by item flags.
- Unit cost defaults from the matching catalog entry (if any) or from the closest bill line by description similarity. User can override.
- **Not** required to be 1:1 with bill lines. A bill can have 10 financial lines and the user can tick only 2 items into stock.

### 3.4 Vendor catalog combobox behaviour

When user opens the bill-line description combobox or the items-received item picker:

1. Top section: items from `vendor_catalog_items` for this vendor, ordered by `use_count DESC, last_used_at DESC`.
2. Inline search filters across `normalized_description` of catalog + (for items picker) all items master entries.
3. "+ Add new" option always at the bottom.

### 3.5 Bill review extraction hookup

Existing extraction service returns parsed lines. Post-extract, the client calls a new endpoint:

```
POST /vendors/:id/catalog/resolve
Body: { descriptions: string[] }
Resp: { [description]: VendorCatalogItem | null }
```

Lines with a catalog match get the data pre-filled (rate, HSN, etc.) with a small `✓ from catalog` chip and an undo affordance. **No item_id resolution into bill lines** — that's irrelevant per the new model.

If a matched catalog entry has `inventory_item_id`, *and* `goods_received` is on, that item is pre-added to the items-received sub-form with qty copied from the bill line.

---

## 4. Vendor catalog — learning model

### 4.1 Growth: suggest-only

The catalog never auto-grows. Three explicit-action paths:

1. **PO/bill save toggle** — "☑ Save to vendor catalog" per line. Off by default.
2. **Bill review chip** — when extraction returns a description not in catalog, a small "+ Add to catalog" affordance appears beside the line.
3. **Vendor detail page batched suggestion** — runs daily: *"3 lines have appeared in 60 days but aren't in catalog. Add all / pick / dismiss."* Notification badge on vendor list.

### 4.2 Rate updates: silent ≤5%, prompt >5%

On bill/PO save, for each line that maps to a catalog entry:

```
delta = abs(new_rate - catalog.default_rate) / catalog.default_rate
if delta <= 0.05:
    catalog.default_rate = new_rate    # silent
    write price_history row
else:
    show modal: "Mahesh's Pkg Film rate changed from ₹45 → ₹52.
                 Update catalog default?  [Yes — update]  [No — keep ₹45]"
    if yes: update + history row
    if no: no change to catalog; this bill stands with its own rate
```

### 4.3 Inventory linkage: explicit only

`inventory_item_id` is never inferred. User sets it once when curating the catalog entry (vendor detail page, or inline "Link to inventory item" on a catalog row). After that, every future use of the entry knows it's tracked.

### 4.4 Lifecycle: deactivate, don't delete

`is_active = false` hides the entry from comboboxes but preserves it for historical references and price history. The unique index excludes inactive rows so the same description can be re-added if the entry was deactivated by mistake.

---

## 5. Post-bill behaviour

Transactional (single DB transaction):

```
1. INSERT/UPDATE purchase_invoices, purchase_invoice_items   (financial side)

2. For each bill line with "Save to catalog" toggled:
     UPSERT vendor_catalog_items
     IF rate delta > 5% AND user confirmed update:
        update default_rate + insert price_history row

3. IF goods_received = true AND items_received_subform.length > 0:
     3a. INSERT inventory_grns (source='bill', source_bill_id, warehouse, …)
     3b. INSERT inventory_grn_lines (one per items-received row)
     3c. UPDATE purchase_invoices SET linked_grn_id = grn.id
     3d. StockLedgerService.postGrnEntries(grn.id)
         → writes stock_ledger and stock_on_hand

4. Post JE via gl.postBill(bill.id):
     Dr Inventory  = Σ(grn_line.qty * grn_line.unit_cost) split by item class
     Dr Expense    = bill.total - Σ(GRN value)            (default account, current behaviour)
     Cr AP-Vendor  = bill.total
```

If any step fails, the whole transaction rolls back. No partial state.

---

## 6. Account routing

`gl.postBill()` logic (new):

```ts
function postBill(bill: Bill): JournalEntry {
  const grn = bill.linked_grn_id ? loadGrnWithLines(bill.linked_grn_id) : null;

  const inventoryDebits = new Map<string, number>();  // account code → amount
  let grnValueTotal = 0;

  if (grn) {
    for (const line of grn.lines) {
      const item = loadItem(line.item_id);
      const acc  = inventoryAccountFor(item);          // by item.class
      const amt  = line.qty * line.unit_cost;
      inventoryDebits.set(acc, (inventoryDebits.get(acc) ?? 0) + amt);
      grnValueTotal += amt;
    }
  }

  const expenseDebit = bill.total - grnValueTotal;     // residual (services, freight, tax mismatches)

  return createJournalEntry({
    lines: [
      ...[...inventoryDebits].map(([acc, amt]) => ({ accountCode: acc, debit: amt,  description: ... })),
      ...(expenseDebit > 0 ? [{ accountCode: DEFAULT_EXPENSE_ACCOUNT, debit: expenseDebit, description: ... }] : []),
      { accountCode: AP_ACCOUNT, credit: bill.total, description: ... },
    ],
  });
}
```

Examples:

**Service-only bill (CA fees ₹15,000):**
```
Dr  5001 Raw Material Purchases  ₹15,000     (default expense; unchanged behaviour)
Cr  2101 Accounts Payable        ₹15,000
```

**Mahesh Packaging bill (₹10,750 = ₹10,250 goods + ₹500 freight):**
```
Dr  1113 Inventory — Packing Material  ₹10,250
Dr  5001 Raw Material Purchases        ₹   500    (the freight residual)
Cr  2101 Accounts Payable              ₹10,750
```

**Vrindavan A2 milk bill (₹3,821, all goods after linkage):**
```
Dr  1111 Inventory — Raw Materials  ₹ 3,821
Cr  2101 Accounts Payable           ₹ 3,821
```

JE line descriptions: `"<vendor> — <invoice no> — <item or expense>"`. Fixes the empty-description issue currently visible on JE detail pages.

---

## 7. Mobile parity

Same flow on mobile. Bottom-sheet pickers for description (vendor catalog) + item (items master). Match `/module-ui` skill patterns — search bar with magnifier, "+ Add new" footer, ordered by recent usage. Inline batch/expiry/serial fields appear only when item flags require them.

---

## 8. Validation & edge cases

| # | Scenario | Behaviour |
|---|---|---|
| 1 | Bill posted with `goods_received=true` but empty sub-form | Soft warning; post anyway with no GRN. |
| 2 | Sub-form has item with `trackBatches=true` but no `batch_no` | Block post; field error. |
| 3 | Sub-form has `trackSerials=true` item; `serial_nos.length != qty` | Block post. |
| 4 | Duplicate serial number already in `inventory_serials` | Block post; conflict error. |
| 5 | Sub-form item missing warehouse, bill warehouse also missing | Block post; force pick. |
| 6 | Item class has no mapped inventory account | Fall back to `DEFAULT_INVENTORY_ACCOUNT (1200)`; log warning for admin. |
| 7 | Bill cancelled while linked GRN exists | Reverse JE + cancel GRN + reverse stock_ledger atomically. |
| 8 | Re-running extraction overwrites manually-resolved catalog match | Don't — preserve if `normalized_description` matches. |
| 9 | `expiry_date` in past | Soft warning ("This item is already expired"); don't block. |
| 10 | Same `(vendor, description)` already in catalog as inactive | Reactivate row instead of inserting duplicate. |
| 11 | Catalog rate update prompt: user dismisses without choosing | Treat as "No — keep catalog rate." |
| 12 | Bill in foreign currency | Out of scope v1 (INR only). |

---

## 9. Migration / backfill

Two migrations:

1. **`0NNN_ap_pattern_b_schema.sql`**
   - ALTER `purchase_invoices` (warehouse_id, goods_received, linked_grn_id).
   - ALTER `inventory_grns` (source, source_bill_id + CHECK + unique index).
   - CREATE `vendor_catalog_items` + `vendor_catalog_item_price_history`.
   - INSERT COA accounts (1201–1207) where missing per tenant.

2. **`0NNN_alias_to_catalog_backfill.sql`**
   - For each row in `vendor_bill_item_aliases`: INSERT into `vendor_catalog_items` (with `inventory_item_id` set, normalized_description computed, rate/UOM NULL).
   - DROP TABLE `vendor_bill_item_aliases`.

Existing bills untouched. No retroactive JE rewrites.

---

## 10. API surface

### Changed

| Endpoint | Change |
|---|---|
| `POST /ap/bills` / `PUT /ap/bills/:id` | Accept `warehouse_id`, `goods_received`, `items_received[]` (sub-form), per-line `save_to_catalog`. |
| `POST /ap/bills/:id/post` | Triggers catalog upserts, inline GRN, JE per §5. Returns `linked_grn_id`, GRN number, JE number. |
| `POST /ap/bills/:id/cancel` | Cancels linked GRN; reverses stock_ledger; reverses JE. |

### New

| Endpoint | Purpose |
|---|---|
| `GET /vendors/:id/catalog?q=&limit=` | Vendor catalog picker source. Returns active rows ordered by use_count + last_used_at. |
| `POST /vendors/:id/catalog` | Manual add (Settings → Vendor → Catalog). |
| `PATCH /vendors/:id/catalog/:itemId` | Edit (rate, UOM, link to inventory item, deactivate). |
| `POST /vendors/:id/catalog/resolve` | Bulk-resolve descriptions → catalog matches (post-extract). |
| `GET /vendors/:id/catalog/suggestions` | Returns recently-frequent uncatalogued lines for the batched-suggestion prompt. |
| `GET /vendors/:id/catalog/:itemId/price-history` | For vendor detail page. |

---

## 11. Acceptance criteria

**Functional**
- [ ] Service-only bill (no goods received): UX and JE identical to today. **Zero regression.**
- [ ] First-time vendor bill: free-text entry works; "Save to catalog" toggle visible per line.
- [ ] Repeat bill from same vendor: catalog combobox suggests prior entries, auto-fills HSN/rate/UOM.
- [ ] Mixed bill (packaging + freight): user adds packaging items to sub-form; freight stays expense. JE has correct split.
- [ ] Vrindavan A2 milk bill: with catalog entry linked to `RM-MILK-A2`, sub-form pre-populates; JE posts to `1201 Raw Material Inventory`.
- [ ] Rate within 5% of catalog default: silent update + history row.
- [ ] Rate >5% drift: modal prompt; user choice respected.
- [ ] Batch/expiry/serial required when item flags say so; otherwise hidden.
- [ ] Re-posting a draft bill never creates two GRNs.
- [ ] Cancelling a posted bill reverses GRN + JE + stock_ledger atomically.
- [ ] Frequent-uncatalogued-lines suggestion appears on vendor page after 3 occurrences in 60 days.

**Data integrity**
- [ ] DB unique index prevents duplicate GRN per bill.
- [ ] CHECK constraint on `inventory_grns.source` enforces clean discriminator.
- [ ] `vendor_catalog_items` unique on `(vendor_id, normalized_description) WHERE is_active`.
- [ ] No orphaned GRN/catalog rows on bill cancel.

**UX**
- [ ] Bill lines section behaves identically to today for users who never tick "goods received."
- [ ] Items-received sub-form is hidden until checkbox toggled on.
- [ ] JE detail page shows readable line descriptions.
- [ ] Mobile bill sheet matches `/module-ui` patterns.

**Performance**
- [ ] Bill post (10 bill lines + 5-line GRN inline) <500ms p95.
- [ ] Catalog resolve for 20-line bill <100ms.
- [ ] Vendor catalog combobox initial load <50ms (indexed query).

---

## 12. File touch list

**Schema**
- `packages/db/src/schema/ap/purchase-invoices.ts`
- `packages/db/src/schema/inventory/grns.ts`
- `packages/db/src/schema/vendors/vendor-catalog-items.ts` (new)
- `packages/db/src/schema/vendors/vendor-catalog-item-price-history.ts` (new)
- `packages/db/migrations/0NNN_ap_pattern_b_schema.sql`
- `packages/db/migrations/0NNN_alias_to_catalog_backfill.sql`

**API**
- `apps/api/src/modules/ap/bill.service.ts` (catalog upsert + inline GRN + JE routing)
- `apps/api/src/modules/ap/bill.routes.ts`
- `apps/api/src/modules/vendors/catalog.service.ts` (new — resolve, suggestions, price history)
- `apps/api/src/modules/vendors/catalog.routes.ts` (new)
- `apps/api/src/modules/gl/gl.service.ts` (`postBill` per-line routing)
- `apps/api/src/modules/gl/inventory-accounts.ts` (new — itemClass→accountCode map)
- `apps/api/src/modules/inventory/grn.service.ts` (accept `source='bill'` path)
- `apps/api/src/jobs/catalog-suggestions.ts` (new — daily batched scan)

**Validators**
- `packages/validators/src/ap/bill.schema.ts` (new bill-level + sub-form fields)
- `packages/validators/src/vendors/catalog.schema.ts` (new)

**Web**
- `apps/web/src/routes/ap/bills/create.tsx` (catalog combobox, items-received sub-form, warehouse picker)
- `apps/web/src/routes/ap/bills/edit.tsx`
- `apps/web/src/routes/vendors/$id/catalog.tsx` (new — vendor catalog management page)
- `apps/web/src/hooks/queries/use-vendor-catalog.ts` (new)

**Mobile**
- `apps/mobile/lib/widgets/bill_entry_sheet.dart` (combobox, items-received sub-form, batch/expiry pickers)
- `apps/mobile/lib/api/vendor_catalog_repo.dart` (new)

---

## 13. Open questions

1. **Should "Save to catalog" toggle default to ON for the 2nd+ unique line from a vendor?** Recommend ON to reduce friction once a vendor is established. First bill = OFF default, subsequent = ON default.
2. **Unit cost on items-received sub-form**: derive from matching bill line, or always require explicit entry? Recommend auto-derive (closest description match) with an editable override.
3. **What happens to bill total ≠ sum(GRN value) + sum(bill lines)?** Tax + rounding mismatches can create small deltas. Recommend: GRN debit + expense residual JE balances to bill total exactly; never to extracted line sum. Bill total is authoritative.
4. **Catalog visibility across users**: tenant-wide visible to all users with bill-write role. No per-user catalog filtering in v1.

---

## 14. What this unlocks for PP

- PP will use the **same `vendor_catalog_items` table** for PO line entry — no duplicate concept needed.
- PP's GRN-from-PO path uses the same items-received sub-form pattern (refactor for reuse).
- 3-way match in PP becomes amount-level by default (PO total vs Bill total) with line-level match only for lines on both sides where the user explicitly links a catalog entry that has `inventory_item_id`.
- Direct Receipt (milk memo) reuses GRN with `source='direct'`, items-received sub-form pattern, no bill linkage.

PP becomes a thin layer on top of this foundation instead of having to re-invent vendor catalogs, GRN-from-anything, or items-received UX.
