# GST Amendment System — Tracker

See `docs/gst-amendment-plan.md` for full plan.

## Phase 1 — Schema
- [ ] Add tax columns to `credit_notes`: `taxable_value`, `cgst_amount`, `sgst_amount`, `igst_amount`, `cess_amount`, `place_of_supply_code`, `is_inter_state`, `gst_rate`, `hsn_code`, `amends_invoice_number`, `amends_invoice_date`
- [ ] Create `credit_note_items` table
- [ ] Create `customer_debit_notes` table (mirror of credit_notes)
- [ ] Create `customer_debit_note_items` table
- [ ] Extend `journal_entries.source_type` enum: add `credit_note`, `customer_debit_note`
- [ ] Migration `0124_gst_amendments.sql`
- [ ] Drizzle schema files updated (`packages/db/src/schema/ar/credit-notes.ts`, new `customer-debit-notes.ts`)
- [ ] Run `pnpm db:push` on Railway prod (per CLAUDE memory: drizzle-kit push)
- [ ] Apply raw SQL on local dev via `run-sql.ts`

## Phase 2 — Backend services
- [ ] `CreditNoteService.create()` accepts items + computes tax rollup
- [ ] `CreditNoteService.issue()` posts tax-split JE via updated `GLService.postCreditNote()`
- [ ] `CreditNoteService.apply()` — surplus → customer advance (no cap to invoice balance)
- [ ] New `CustomerDebitNoteService` (create, issue, apply, void)
- [ ] New `GLService.postCustomerDebitNote()`
- [ ] Validators in `packages/validators/src/`
- [ ] Types in `packages/types/src/`

## Phase 3 — GSTR-1 generator
- [x] Wire CN tax from new columns + items (replaced hardcoded zeros)
- [x] Include `customer_debit_notes` issued in period → CDN section with `noteType='D'`
- [x] Missed-invoice detection — invoices with `invoice_date < periodStart` absent from any filed return → Table 9A (`b2ba`)
- [x] Extend `Gstr1Data` type with optional `b2ba` section
- [x] Existing 10 generator tests still pass

**Deferred to Phase 3.5 (not blocking 4am reconciliation):**
- [ ] Amendment detection of edited invoices — diff current vs snapshot in filed return → Table 9A
- [ ] `customer_debit_note_id` column on `gst_return_invoices` for linkage
- [ ] Populate `gst_return_invoices.amendment_of_return_id`
- [ ] Tests for `b2ba` missed-invoice + customer-DN-in-CDN cases

## Phase 4 — Guards & void
- [x] `InvoiceService.isInFiledReturn()` helper (queries gst_return_invoices + gst_returns.status='filed')
- [x] `InvoiceService.update()` — blocks if invoice in filed GSTR-1
- [x] `InvoiceService.hardDelete()` — blocks if in filed return
- [x] `InvoiceService.voidInvoice(id, {reason, issueDate?})` — auto-CN mirrors invoice items + tax, sets status='cancelled', receipt allocations untouched (customer left with credit)
- [x] `POST /invoices/:id/void` route (owner-only)
- [ ] Tests for guard + void (deferred to Phase 7 verification)

## Phase 5 — UI
- [x] CN form: multi-line items, HSN, tax-rate, place of supply, amends-invoice fields
- [x] Customer DN form (reuses CN form with docLabel override)
- [x] Customer DN routes: `/ar/customer-debit-notes/{index,new,detail}` (wired into __root.tsx + sidebar)
- [x] `useCustomerDebitNotes` hooks (full CRUD + issue/apply)
- [x] Invoice detail: Void button (sent/partially_paid/paid/overdue) wired to `useVoidInvoice` mutation

**Deferred to follow-up:**
- [ ] "In filed return" banner on invoice detail (cosmetic; functionality is backend-enforced)
- [ ] GSTR-1 preview Amendments tab visualization (data is in `gst_returns.data.b2ba` — can verify via API)
- [ ] Mobile parity for CN/DN list + detail
- [ ] Replace `window.prompt()` Void flow with a proper modal

## Phase 6 — 4am reconciliation
Executed via `apps/api/src/scripts/reconcile-4am.ts` on 2026-05-29.
- [x] Invoice 260142 created (April 22, ₹14,570)
- [x] CN-0001 ₹144 on 260130 issued & applied
- [x] CN-0002 ₹64.50 on 260207 issued & applied
- [x] CN-0003 ₹211.43 on 260373 issued & applied
- [x] CDN-0001 ₹55.09 on 260067 issued & applied
- [x] CDN-0002 ₹54.00 on 260253 issued & applied
- [x] 260291 voided → CN-0004 ₹1,840.49 auto-issued; invoice status=cancelled
- [ ] Send reconciliation letter to 4am (manual follow-up)
- Note: 260047 → 260044 is clerical fix on 4am side, no runq change

**Generator follow-up applied during verification:**
- [x] `fetchMissedInvoices` now honors `tenant.settings.gstFilingStartPeriod` so opening-balance entries (OB-*) before the filing start aren't misclassified as missed invoices.

**Pre-existing data issue resolved:**
- [x] HSN drift across May 2026 lines fixed via `apps/api/src/scripts/fix-vrindavan-hsn.ts` (160 lines re-tagged from item master + 1 line UoM normalised on 260142).
- [x] Generator bug: `notInArray(filedInvoiceIds)` was excluding everything because `gst_return_invoices.invoice_id` can be NULL — added `isNotNull` to the subquery.
- [x] Reconcile script tweak: 260142 line `tax_category` cleared to NULL (matches existing milk-line convention; was 'nil_rated' which mis-classified the whole invoice as Nil instead of B2B).

## Phase 7 — Verify & file
- [ ] Generate May GSTR-1 preview
- [ ] Verify Table 9A: 260142 + 260130/260207/260373/260067/260253/260291
- [ ] Verify Table 9B: 3 CNs + 2 customer DNs
- [ ] Net taxable delta ≈ ₹12,418.68
- [ ] File May GSTR-1 (by 11-Jun)
- [ ] File May GSTR-3B (by 20-Jun) with interest on 260142 portion
