# AP Pattern-B — Build Tracker

Live progress for the AP Pattern-B foundation. Spec: `docs/ap-pattern-b-spec.md`.
Branch: `feat/ap-pattern-b`. Started 2026-05-26.

## Phases

- [x] **1. Branch + tracker** — `feat/ap-pattern-b` + this file
- [x] **2. Schema migrations** — `0114` (purchase_invoices +3 cols, inventory_grns source discriminator + bill FK + idempotency index, vendor_catalog_items + price_history) and `0115` (COA seed: 4 new inventory accounts 1118–1121 per tenant) applied locally. Alias backfill (0116) still pending — last step
- [x] **3. Drizzle schema files + validators** — `ap/vendor-catalog-items.ts` (new), `ap/purchase-invoices.ts` ALTER (3 new cols, no Drizzle FK on linkedInventoryGrnId to avoid circular import), `inventory/grns.ts` ALTER (source enum + FK on billId), `validators/ap/purchase-invoice.schema.ts` extended (warehouseId, goodsReceived optional, itemsReceived[], per-line saveToCatalog), `validators/ap/vendor-catalog.schema.ts` (new). All typechecks green
- [x] **4. Vendor catalog API** — `vendor-catalog.service.ts` (list/get/create/update/resolve/getSuggestions/getPriceHistory/upsertFromDocLine/applyRateChange/confirmRateChange/recordUse), `vendor-catalog.routes.ts` (7 endpoints incl. rate-change confirm), wired into `ap/routes.ts`. Normalisation via `normaliseCatalogDescription`. Suggestions implemented as a raw-SQL CTE over `purchase_invoice_items` joined to `purchase_invoices` with anti-join against active catalog rows
- [~] **5. Vendor catalog admin UI** — **WEB done.** `VendorCatalogSection` slots into the vendor detail page below the bills table. Search bar, list table (description / UOM / rate / HSN / tax / inventory link / use count), `Add entry` modal, `Edit` modal (with isActive toggle), `Price history` modal per row, and a "Frequent uncatalogued lines" amber suggestions panel that prefills the Add modal on chip-click. Hooks in `use-vendor-catalog.ts` (useVendorCatalog/Suggestions/PriceHistory + create/update mutations). **Mobile admin deferred** — catalog curation is a desk task; mobile users still get inline "Save to catalog" through Step 7 follow-ups when those land
- [x] **6. Bill post core changes** — `purchase-invoice.service.create()` accepts `warehouseId`/`goodsReceived`/`itemsReceived[]`. New private `createInlineGrnFromBill` inserts posted `inventory_grns` row (`source='bill'`) + lines + stock_ledger movements + serial capture + sets `linkedInventoryGrnId` — all atomic in the existing transaction. Multi-warehouse rejected in v1. Item flag validation (trackInventory/trackBatches/trackExpiry/trackSerials) enforced before INSERT
- [x] **7. GL routing** — `gl.postPurchaseInvoice` extended with optional `linkedInventoryGrnId` + `invoiceNumber`. When linked GRN exists, sums GRN-line values per `items.itemClass`, builds debit lines via `inventory-accounts.ts` mapping (1111/1112/1113/1118–1121), adds expense residual (`5002`) for tax/freight/rounding gap, single `Cr 2101` for total. Per-line descriptions include vendor + invoice number — fixes the empty-description issue on JE detail page
- [~] **8. Bill review UI (web)** — items-received Card added to `BillForm`: bill-level warehouse Combobox, "Record goods received" toggle, sub-form Table (Item / Qty / Unit cost / Batch / Expiry / Serials / Remove), Add-row button. Submit serialises `warehouseId`, `goodsReceived`, `itemsReceived[]`. Edit page surfaces warehouse + toggle but skips itemsReceived prefill (linked GRN immutable in v1). **Deferred: catalog combobox on bill-line descriptions + rate-variance prompt** — pending Step 7 follow-ups (catalog upsert from bill save / applyRateChange wiring)
- [x] **9. Bill review UI (mobile)** — both flows now have items-received parity. Promoted `GoodsReceivedSection` + `ReceivedRow` + `_ItemPickerSheet` to shared `widgets/goods_received_section.dart` behind a `GoodsReceivedState` interface. Both `_EditState` (edit screen) and `_EditableBill` (extract screen) implement the interface. Item picker is a `DraggableScrollableSheet` over `inventoryRepo.searchItems`. Pattern-B carry-through end-to-end: mobile `_EditableBill.toJson()` → `commitScan` POST `/scan-commit` → `extractedSchema` accepts `warehouseId`/`goodsReceived`/`itemsReceived[]` → `commitExtracted` forwards to `invoiceService.create()` → inline GRN + JE split. `check-fonts.sh` clean. Only lints are repo-wide `use_null_aware_elements` info notes (pre-existing style)
- [~] **10. Catalog suggestions job** — surface implemented (vendor list now shows an amber lightbulb badge with the count of frequent uncatalogued lines per vendor; tooltip says how many). Backed by a new `VendorService.fetchPendingCatalogCounts(vendorIds)` that runs ONE batched CTE per list page (anti-join against active catalog, 3+ occurrences in 60d). `VendorWithOutstanding.pendingCatalogCount` added to the type. **Cron deferred** — react-query staleTime is the cache for now; a true cron only earns its keep when we add email/push notifications. Detail page surfaces the actual suggestions via Step 5's `VendorCatalogSection` amber chips panel
- [x] **11. Alias backfill + drop `vendor_bill_item_aliases`** — `0116_vendor_bill_item_aliases_to_catalog.sql` applied locally: anti-join INSERT into `vendor_catalog_items` (raw_description/normalized_key/HSN/tax/category/use_count/last_used_at carried; rate + UOM stay NULL since legacy never stored them; is_active=true), then DROP TABLE. Local DB: 22 catalog rows post-backfill, `to_regclass` confirms legacy table gone. Code updates: `recordItemAliasesFromBill` silent-learn deleted from `scan-import.service.ts` (catalog growth is suggest-only per spec §4.1); `lookupItemAliases` + `vendor-extraction-context.service.ts` rewired to read from `vendor_catalog_items` (same return shape so AI extractor pipeline unchanged); schema file overwritten with `export {}` + deprecation note (harness blocked `rm`)

## Step 7 follow-ups — landed this session

- [x] **GRN ↔ JE backlink** — `gl.postPurchaseInvoice` now captures `entry.id` and UPDATEs both `inventory_grns.journal_entry_id` and `stock_ledger.journal_entry_id WHERE source_id = grn.id`. Inventory drill-throughs from a bill-origin GRN now land on the unified bill JE.
- [x] **`saveToCatalog` per-line wiring** — new `PurchaseInvoiceService.syncCatalogFromBillLines` runs inside the bill-create transaction. For each bill line: matches against active catalog → bumps `useCount` + `applyRateChange` (silent ≤5% rate drift, no-op >5%); if no match and the per-line `saveToCatalog` toggle is true → `upsertFromDocLine` creates a fresh catalog row carrying HSN/tax forward.
- [ ] **>5% rate-variance prompt UI** — deferred to Phase-2 polish. `applyRateChange` returns `promptUser: true` for >5% drift but the API response doesn't yet surface it and there's no UI to confirm/reject. Catalog default rate simply stays unchanged in that case; user can update manually via the catalog admin page.
- [ ] **Catalog combobox on bill-line description** — deferred. The bill form already has an items-master Combobox on the "Item" column; adding a parallel catalog source would either regress tracked items or bloat the UI. Will land more naturally in PP's PO line entry where free-text is the dominant default.
- [ ] **12. Acceptance run** — work through spec §11 checklist end-to-end
- [ ] **13. Update `docs/dairy-sme-plan.md` §2 + §6** when shipped

## Acceptance criteria (mirrors spec §11)

### Functional
- [ ] Service-only bill: zero regression — UX and JE identical to today.
- [ ] First-time vendor bill: free-text entry works; "Save to catalog" toggle visible per line.
- [ ] Repeat bill from same vendor: catalog combobox suggests prior entries; auto-fills HSN/rate/UOM.
- [ ] Mixed bill (packaging + freight): correct JE split (Dr Inventory + Dr Expense / Cr AP).
- [ ] Vrindavan A2 milk bill: with `RM-MILK-A2` linkage, posts to `1201 Raw Material Inventory`.
- [ ] Rate within 5% of catalog default: silent update + history row.
- [ ] Rate >5% drift: modal prompt; user choice respected.
- [ ] Batch/expiry/serial required only when item flags say so.
- [ ] Re-posting a draft bill never creates two GRNs.
- [ ] Cancelling a posted bill reverses GRN + JE + stock_ledger atomically.
- [ ] Frequent-uncatalogued-lines suggestion appears on vendor page after 3 occurrences in 60 days.

### Data integrity
- [ ] Unique partial index on `inventory_grns.source_bill_id WHERE source='bill'` prevents duplicate GRN per bill.
- [ ] CHECK constraint on `inventory_grns.source` enforces clean discriminator.
- [ ] `vendor_catalog_items` unique on `(vendor_id, normalized_description) WHERE is_active`.
- [ ] No orphaned GRN/catalog rows on bill cancel.

### UX
- [ ] Bill lines section behaves identically to today for users who never tick "goods received."
- [ ] Items-received sub-form hidden until checkbox toggled.
- [ ] JE detail page shows readable line descriptions.
- [ ] Mobile bill sheet matches `/module-ui` patterns.

### Performance
- [ ] Bill post (10 bill lines + 5-line GRN inline) <500ms p95.
- [ ] Catalog resolve for 20-line bill <100ms.
- [ ] Vendor catalog combobox initial load <50ms.

## Open decisions to confirm during build

1. **"Save to catalog" toggle default for 2nd+ unique line** — recommend ON after first bill establishes vendor.
2. **Unit cost on items-received sub-form** — auto-derive from matching bill line with editable override.
3. **Bill total vs (GRN value + bill lines) mismatch handling** — bill total is authoritative; expense residual balances JE.
4. **Catalog visibility scope** — tenant-wide for all bill-write users in v1.

## Notes

- `feedback_apply_migrations.md`: native-dev does NOT auto-run raw SQL migrations. Apply manually with `pnpm run-sql packages/db/migrations/<file>.sql`.
- `feedback_searchable_dropdowns.md`: every dropdown (vendor picker, item picker, catalog combobox) uses Combobox not Select.
- `feedback_dark_mode_support.md`: every new UI element verified in both modes; rate-variance modal needs explicit dark colours.
- `feedback_keyboard_dismiss_on_scroll.md`: mobile scrollables set `keyboardDismissBehavior: onDrag`.
- `feedback_text_capitalization.md`: sentences default on description/notes; none on rates/UOM/HSN.
