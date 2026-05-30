# GST Amendment & Reconciliation System — Plan

## Goal
Make runq a clean, audit-grade system for **invoice corrections after GSTR-1 has been filed**, so that:
- Books always reflect truth (no fake-dated entries)
- Every correction flows automatically into the next month's GSTR-1 as a Table 9A (invoice amendment) / Table 9B (CN-DN amendment) entry
- CN/DN carry proper tax breakdown
- Customer-side debit notes exist (currently only vendor-side)
- Already-filed invoices cannot be edited silently — corrections force a CN/DN/amendment flow

Driver: 4am reconciliation surfaced 8 discrepancies that can't be fixed cleanly today because the CN module lacks tax columns and the GSTR-1 generator doesn't detect amendments.

---

## Current gaps (from survey)

| # | Gap | File |
|---|---|---|
| 1 | `credit_notes` has no tax columns (only `amount`) — GSTR-1 emits CN with ₹0 CGST/SGST | `packages/db/src/schema/ar/credit-notes.ts` |
| 2 | No customer-side debit notes — `debit_notes` is vendor-side only | `packages/db/src/schema/ap/debit-notes.ts` |
| 3 | GSTR-1 generator uses `invoiceDate` only — no amendment detection of edits to invoices in already-filed returns | `apps/api/src/modules/gst/gstr1-generator.ts:180` |
| 4 | GSTR-1 generator hardcodes CN tax to 0 | `gstr1-generator.ts:326-333` |
| 5 | No missed-invoice detection (April-dated invoice created in May won't auto-flow into May as amendment) | `gstr1-generator.ts` |
| 6 | `InvoiceService.update()` has no guard against editing invoices already in a filed GSTR-1 | `apps/api/src/modules/ar/invoice.service.ts:531` |
| 7 | `cancel()` only allows draft invoices — no void flow for sent/paid invoices already in filed GSTR-1 | `invoice.service.ts:693` |
| 8 | CN `apply()` caps to invoice balance — can't issue CN that creates customer advance (post-payment correction) | `credit-note.service.ts:186` |

---

## Phases

### Phase 1 — Schema
- [ ] Add to `credit_notes`: `taxable_value`, `cgst_amount`, `sgst_amount`, `igst_amount`, `cess_amount`, `place_of_supply_code`, `is_inter_state`, `gst_rate`, `hsn_code`
- [ ] Create `credit_note_items` table (mirrors `sales_invoice_items`): `credit_note_id`, `item_id` (nullable), `description`, `hsn_code`, `quantity`, `unit_price`, `discount_percent`, `taxable_value`, `gst_rate`, `cgst_amount`, `sgst_amount`, `igst_amount`, `cess_amount`, `line_total`
- [ ] Roll up totals from items → header tax fields on `credit_notes`
- [ ] Create `customer_debit_notes` table (mirror of `credit_notes`, references `customer_id` + optional `invoice_id`) with same tax columns
- [ ] Create `customer_debit_note_items` table (mirrors `credit_note_items`)
- [ ] Add `amends_invoice_number` (varchar) + `amends_invoice_date` (date) to both CN and customer-DN — captures the original invoice identity even if invoice is later renumbered/deleted, and is what GSTR-1 amendment payload needs
- [ ] Migration `0124_gst_amendments.sql`

### Phase 2 — Backend services
- [ ] Update `CreditNoteService.create()` + `issue()` to accept + persist tax fields
- [ ] Update `GLService.postCreditNote()` to split debit between Sales / Output CGST / Output SGST / Output IGST (currently lumps to Sales)
- [ ] New `CustomerDebitNoteService` mirroring `CreditNoteService` (create, issue, apply, void). Reuse `debit_note_status` enum.
- [ ] New `GLService.postCustomerDebitNote()` — Dr Customer / Cr Sales + Cr Output GST
- [ ] Modify CN `apply()` to support **post-payment correction mode**: if CN issued against an already-paid invoice, leave the over-allocation as customer advance instead of capping
- [ ] Add `journal_entries.source_type` values: `credit_note`, `customer_debit_note` (extend enum)

### Phase 3 — GSTR-1 generator
- [ ] Generator must accept a **prior-period filed-return snapshot** as input
- [ ] **Amendment detection**: for each invoice in the current generation window, check if its `invoice_number` appears in any prior `gst_returns.data.b2b` (status = `filed`). If yes AND current values differ from snapshot → emit Table 9A amendment instead of normal B2B
- [ ] **Missed invoice detection**: scan all `sales_invoices` with `invoice_date < periodStart` that are NOT in any filed return → emit as Table 9A new-invoice amendment in current period
- [ ] **CN tax wiring**: read `cgst_amount` / `sgst_amount` / `igst_amount` / `taxable_value` / `gst_rate` from `credit_notes` (replace hardcoded zeros at gstr1-generator.ts:326-333)
- [ ] **Customer DN**: include `customer_debit_notes` issued in period as Table 9B-equivalent (CDN section, debit-note flag)
- [ ] Populate `gst_return_invoices.amendment_of_return_id` so audit trail links amendment ↔ original return
- [ ] Tests: amendment-detection cases in `gstr1-generator.test.ts`

### Phase 4 — Guards & void flow
- [ ] `InvoiceService.update()` — if invoice is in a filed return, block edit and return error directing user to issue CN/DN
- [ ] `InvoiceService.void()` — new method: allows voiding a sent/paid invoice by (a) reversing receipt allocations to advance, (b) issuing an auto-CN for full amount + tax, (c) setting status to `cancelled`. Only path to "delete" an invoice that's in a filed return.
- [ ] UI: invoice detail page shows "in filed return" badge + disables Edit, exposes Void / Issue CN / Issue DN buttons

### Phase 5 — UI
- [ ] CN create form: add tax-rate dropdown (auto-splits CGST/SGST/IGST based on invoice's place of supply), HSN, place-of-supply override
- [ ] Customer DN: clone CN routes under `/ar/customer-debit-notes/` (index, new, detail)
- [ ] CN/DN detail: show "appears in GSTR-1 [period] as [section]"
- [ ] GSTR-1 preview page: new "Amendments" tab showing Table 9A/9B entries with link back to original return

### Phase 6 — 4am reconciliation (the test case)
Once Phases 1-5 ship, apply all 7 fixes via the new flows:
- [ ] Create invoice 260142 with April date — generator auto-emits as Table 9A new-invoice amendment in May
- [ ] Issue CN ₹144 against 260130 (April date intent, May issue date) → generator amendment for 260130
- [ ] Issue CN ₹64.50 against 260207
- [ ] Issue CN ₹211.43 against 260373
- [ ] Issue customer DN ₹55.09 against 260067
- [ ] Issue customer DN ₹54 against 260253
- [ ] Void 260291 (auto-CN ₹1840.49, un-allocates receipt, customer left with ₹1840.49 advance)
- [ ] Confirm with 4am: clerical fix for 260047 → 260044 on their side (no runq change)
- [ ] Re-allocate any orphan receipts to clear customer advances

### Phase 7 — Verify
- [ ] Generate May GSTR-1 preview, confirm Table 9A contains 260142 + 5 amended invoices + 260291 void
- [ ] Confirm Table 9B contains the 3 CNs + 2 customer DNs
- [ ] Net taxable value in amendments ≈ ₹12,418.68 (the original mismatch)
- [ ] File May GSTR-1 + 3B via existing GSP flow
- [ ] Send 4am the reconciliation letter

---

## Decisions (locked)
- **CN/DN line items**: full line-item tables in v1 (multi-line, multi-rate supported)
- **Edit guard**: hard block on invoices in filed GSTR-1; UI shows CN/DN/Void buttons instead
- **Post-payment CN surplus**: converts to customer advance (unallocated credit), apply to next invoice manually or automatically

## Out of scope (v1)
- Amendment of amendments (revisiting a Table 9A entry filed last month)
- B2C amendments (currently no customer-DN equivalent on B2C side; tracked separately)
- GSTR-3B auto-amendment payload (handled by existing 3B generator pulling from corrected ledger)

## Tracker
See `docs/gst-amendment-tracker.md` for per-task progress checkboxes.
