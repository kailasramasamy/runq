# GSTR-9 — Specification (v1 + v2)

**v1 target ship:** end of July 2026 (well before 31-Dec-2026 statutory deadline for FY 2025-26)
**v2 target ship:** end of October 2026 (3 months after v1, before peak filing season)
**Owner:** GST module
**Status:** Draft

---

## 1. Goal

Enable runQ tenants to file GSTR-9 (annual GST return) directly from the product. Reconciles books against monthly GSTR-1/3B already filed, against GSTN auto-populated values, and produces a GSTN-compliant JSON for filing via White Books GSP.

**v1 scope:** all 19 tables, with Rule 42/43 reversal as **manual entry override** (auto-compute deferred to v2).
**v1 non-goals:** GSTR-9C (separate spec), Rule 42/43 auto-compute, capital-goods 60-month schedule.

---

## 2. User flow

1. **Open** GST module → Annual Returns → select FY → click "Prepare GSTR-9".
2. **Auto-generate:** runQ pulls GSTN auto-populated draft (via White Books) and runs the books-side computation in parallel.
3. **Review:** side-by-side reconciliation UI shows three columns per table: **Books**, **Filed (GSTR-1/3B)**, **GSTN auto-populate**. Mismatches flagged.
4. **Drilldown:** click any cell → list of source documents (invoices/bills/JEs) that contributed.
5. **Override:** user can edit any cell with a reason note (audit-logged).
6. **Adjust (Tables 10–14):** wizard for cross-FY adjustments.
7. **Sign & file:** EVC OTP (v1) or DSC (v2 — see DSC spec). White Books submits. Acknowledgement (ARN) stored.
8. **Download:** filed JSON, ARN receipt, books-vs-filed reconciliation Excel for CA records.

---

## 3. Table-by-table acceptance criteria

### Part I — Basic Details
- **Tables 1–3:** GSTIN, legal name, trade name, FY. **Auto-populated from tenant settings.** No user input.

### Part II — Outward & Inward Supplies (current FY)

#### Table 4 — Taxable outward supplies
| Row | Source | Acceptance |
|---|---|---|
| 4A B2C | Sales register, place-of-supply ≠ same state OR turnover ≤ ₹2.5L per invoice | Aggregate taxable value + IGST/CGST/SGST/Cess from filed GSTR-1 |
| 4B B2B | Sales to registered customers | Same; drilldown to invoice list |
| 4C Exports w/ payment | Invoices flagged `export_with_payment` | Reconcile against shipping bills if available |
| 4D SEZ w/ payment | SEZ invoices flagged | — |
| 4E Deemed exports | Manual flag on invoice | Manual entry if not flagged |
| 4F Advances received | Open advances at year-end (book-side) | Pull from advance-received GL |
| 4G Inward supplies under RCM | Books — bills tagged RCM | Drilldown to bills |
| 4H–4L Sub-total / amendments / credit notes / tax payable | Computed | Self-balancing |

**Acceptance:** every row matches filed GSTR-1 within ₹1 tolerance, OR a flagged variance with drilldown.

#### Table 5 — Non-taxable outward supplies
- 5A Zero-rated (exports/SEZ without payment, LUT)
- 5B Supply on which receiver pays (RCM-out)
- 5C Exempt
- 5D Nil-rated
- 5E Non-GST (alcohol/petrol)

**Acceptance:** sales invoices tagged with correct `taxCategory` flow into the right row. Manual override per row with note.

### Part III — ITC

#### Table 6 — ITC availed
| Row | Source | Acceptance |
|---|---|---|
| 6A Auto-populated (GSTR-3B) | GSTN auto-populate | Read-only |
| 6B Inward supplies (other than 6C/6D) — split into Inputs / Input Services / Capital Goods | Books, line-category column | **v1 fallback:** if `line_category` is null, lump into Inputs and prompt user to manually re-split. **v2:** auto-classify from line metadata. |
| 6C Inward from URP under RCM | Bills with RCM + unregistered vendor | Drilldown |
| 6D Inward from RP under RCM | Bills with RCM + registered vendor | Drilldown |
| 6E Imports (goods) | Bills tagged `import_of_goods` | Bill of Entry reference shown |
| 6F Imports (services) | Bills tagged `import_of_services` | — |
| 6G ISD | ISD credits received | v1: manual entry if no ISD module |
| 6H Reclaim | Manual entry with note | — |
| 6I/6J Sub-total / difference vs 6A | Computed | Variance flagged |
| 6K/6L Transition credits | Manual entry (one-time) | Pre-fill 0 |
| 6M Other ITC | Manual entry | — |

**Acceptance:** total of 6B–6M reconciles to 6A within tolerance OR variance is flagged with drilldown.

#### Table 7 — ITC reversed & ineligible
- 7A Rule 37 (180-day non-payment) — **books query: bills unpaid > 180 days where ITC was claimed**
- 7B Rule 39 (ISD credit note) — manual
- 7C Rule 42 (proportionate, common inputs) — **v1: manual entry with helper formula shown** (exempt turnover / total turnover × common ITC). v2: auto.
- 7D Rule 43 (capital goods) — **v1: manual entry**. v2: auto with 60-month schedule.
- 7E Section 17(5) blocked credits — already tagged in bills today
- 7F Reversal of TRAN credit — manual
- 7G Other reversals — manual
- 7H Total — computed

**Acceptance:** 7E auto-computed from bills tagged blocked; 7A query implemented; 7C/7D show formula helper but accept manual entry.

#### Table 8 — Other ITC info (reconciliation with GSTR-2A)
- 8A GSTR-2A as per GSTN (auto)
- 8B ITC claimed in 6B+6H
- 8C ITC of FY claimed in next FY (Apr–Sep)
- 8D Difference (8A − [8B+8C])
- 8E ITC available but not availed
- 8F ITC available but ineligible
- 8G–8K IGST on imports / RCM not booked

**Acceptance:** 8A from GSTN auto-populate; 8B/8C computed from books; 8D auto. 8E–8K manual with helper text.

### Part IV — Tax paid

#### Table 9 — Tax paid (declared in GSTR-3B)
- Auto-populated from filed GSTR-3B (year aggregate). Read-only.
- **Acceptance:** matches sum of monthly 3Bs.

### Part V — Particulars of previous-FY transactions declared in next-FY returns

#### Tables 10–14 — Cross-FY adjustments
- 10 Supplies/tax declared through amendments (+)
- 11 Supplies/tax reduced through amendments (−)
- 12 ITC reversal of previous FY
- 13 ITC availed of previous FY
- 14 Differential tax paid

**v1 approach:** dedicated wizard. User selects: "Show all amendments and ITC entries that crossed FY boundary." runQ filters JEs/invoices where `gst_period ≠ book_period`. User confirms each row.

**Acceptance:** wizard surfaces every cross-FY entry; user can include/exclude per row with reason.

### Part VI — Other information

#### Table 15 — Demands & refunds
- 15A Demands (total, paid, pending)
- 15B Refunds (claimed, sanctioned, rejected, pending)
- **v1: manual entry.** No demands/refunds module yet.

#### Table 16 — Special supplies
- 16A Composition supplies received
- 16B Deemed supplies under section 143 (job-work non-return)
- 16C Goods sent on approval not returned
- **v1: manual entry** with helper text. ITC-04 module (separate spec) will feed 16B in future.

#### Table 17 — HSN-wise outward supplies
- Aggregate from sales invoice lines: HSN, UQC, quantity, total value, taxable value, IGST/CGST/SGST/Cess.
- **Acceptance:** auto-generated from invoice lines. Reuses existing GSTR-1 HSN logic.

#### Table 18 — HSN-wise inward supplies
- Aggregate from bill lines: HSN, UQC, quantity, total value, taxable value, IGST/CGST/SGST/Cess.
- **Acceptance:** auto-generated. **Critical dependency:** HSN coverage on bills (audit during QA — see "Risk areas to validate" below).

#### Table 19 — Late fee payable & paid
- Auto-computed if filed late (₹200/day, capped at 0.5% turnover).

---

## 4. Reconciliation UI requirements

- **Three-pane view per table:** Books / Filed / GSTN-auto-populate.
- **Variance highlighting:** red if >₹100 mismatch, amber if ₹1–100, green if exact.
- **Drilldown:** click cell → modal with source documents (invoices, bills, JEs) and per-document amount contribution.
- **Override:** "Edit value" → free-text reason required → audit log entry.
- **Save draft:** all work persisted; user can return later.
- **Lock on file:** once filed, read-only with ARN displayed.

---

## 5. Integration with White Books GSP

| Endpoint | Purpose | When |
|---|---|---|
| `GET /gstr9/auto-populate` | Pull GSTN-side draft (Tables 4, 5, 6A, 8A, 9) | On "Prepare" click |
| `POST /gstr9/save` | Save draft to GSTN | Optional intermediate save |
| `POST /gstr9/file` | Submit final return + sign (EVC/DSC) | On "File" click |
| `GET /gstr9/status/:arn` | Poll filing status | Post-file |

**Auth:** existing tenant GST credentials (already wired for GSTR-1/3B).
**Error handling:** GSTN error codes mapped to user-facing messages; retry on transient.

---

## 6. Data model additions

```sql
-- New table: gstr9_returns
id, tenant_id, fy, status (draft/filed/error), arn, filed_at,
generated_data jsonb, gstn_autopop_data jsonb, books_data jsonb,
overrides jsonb, created_by, created_at, updated_at

-- New table: gstr9_audit_log
id, gstr9_return_id, table_ref, field, old_value, new_value,
reason, user_id, created_at

-- Extend purchase_invoice_items
ALTER TABLE purchase_invoice_items
  ADD COLUMN line_category text  -- 'inputs' | 'input_services' | 'capital_goods' (nullable, for v1)
```

---

## 7. v1 — Out of scope (deferred to v2 or separate spec)

- GSTR-9C (separate spec)
- Rule 42 auto-computation (Table 7C — manual entry in v1) → **v2**
- Rule 43 auto-computation (Table 7D — manual entry in v1) → **v2**
- 60-month capital-goods reversal schedule → **v2**
- ITC line-category split (Inputs / Input Services / Capital Goods) — manual fallback in v1 → **v2**
- HSN coverage dashboard + bulk-edit → **v2**
- ISD module (Table 6G — manual entry; full ISD module is its own spec)
- Demands & refunds module (Table 15 — manual entry; full module is its own spec)
- DSC filing (EVC OTP only; DSC in separate spec)

---

## 7a. v2 — Scope

After v1 ships and we have ~3 months of real customer reconciliation data, v2 closes the auto-compute gaps and the data-quality tooling.

### v2 Feature 1: Rule 42 proportionate reversal (Table 7C)
Auto-compute reversal of common-input ITC for businesses with both taxable and exempt supplies.

- **Formula:** `(exempt turnover ÷ total turnover) × common ITC`, monthly, with year-end true-up.
- **Common-input identification:** any input where `line_category = inputs OR input_services` and the bill is not directly attributable to a single output (taxable or exempt).
- **Auto-JE:** offsetting reversal entry posted to GST liability and ITC reversal accounts; user reviews and approves.
- **Readiness flag:** GST module flags any tenant with non-zero exempt outward supplies — "Rule 42 may apply, configure common-input rules."
- **Acceptance:** matches a CA-reviewed manual computation within ₹1 across 3 design partners with mixed supply.

### v2 Feature 2: Rule 43 capital-goods reversal (Table 7D)
60-month proportionate reversal for capital-goods ITC where the asset serves both taxable and exempt supplies.

- **New table:** `capital_goods_itc_schedule` — one row per capital goods bill line, tracking purchase date, ITC claimed, monthly reversal entries for 60 months.
- **Monthly cron:** computes that month's reversal share based on current exempt/total ratio, posts JE.
- **Disposal handling:** if asset disposed before 60 months, accelerate remaining reversal.
- **Acceptance:** for a sample tenant, 60-month schedule reconciles to the manual CA computation across all open assets.

### v2 Feature 3: ITC line-category auto-classification (Table 6B split)
Replace the v1 manual fallback with automatic classification of every bill line into Inputs / Input Services / Capital Goods.

- **Classification logic:**
  - HSN code → Inputs (goods)
  - SAC code → Input Services
  - Bill line linked to a fixed-asset record → Capital Goods (overrides above)
- **Backfill:** one-time job classifies historical bill lines.
- **AI prompt update:** extraction prompt requires HSN/SAC discipline per line; extraction confidence drops when null.
- **Acceptance:** ≥95% of bill lines auto-classified for tenants on runQ for the full FY; remaining 5% surfaced in a "needs classification" queue.

### v2 Feature 4: Inward HSN coverage dashboard (supports Table 18)
Address historical HSN gaps before they break Table 18.

- **Dashboard:** "X% of bill lines have HSN/SAC. Y lines need attention." Filter by vendor, period, amount.
- **Bulk edit:** select rows → assign HSN from master → save. Shortcut: "apply this vendor's most-common HSN to all their unclassified lines."
- **Auto-populate from items master:** if a bill line references an item, inherit HSN from the item record.
- **Acceptance:** for a tenant with 1,000+ bill lines, 90%+ HSN coverage achievable in under 30 minutes of cleanup.

### v2 Schema additions

```sql
-- Capital goods ITC reversal schedule (Rule 43)
CREATE TABLE capital_goods_itc_schedule (
  id, tenant_id, purchase_invoice_item_id, fixed_asset_id,
  purchase_date, itc_claimed, useful_life_months DEFAULT 60,
  current_month_index, reversal_history jsonb,
  status (active/disposed/completed), created_at, updated_at
);

-- Common-input rules per tenant (Rule 42)
CREATE TABLE common_input_rules (
  id, tenant_id, rule_type ('default'|'override'),
  applies_to_categories text[], -- ['inputs','input_services']
  excluded_ledger_ids uuid[], -- inputs directly attributable
  created_at, updated_at
);

-- Make line_category NOT NULL (after backfill)
ALTER TABLE purchase_invoice_items
  ALTER COLUMN line_category SET NOT NULL;
```

---

## 8. Risks & dependencies

| Risk | Mitigation |
|---|---|
| Historical HSN coverage on bills is poor → Table 18 incomplete | Run coverage SQL probe during QA; build "fix missing HSN" bulk-edit before launch |
| Cross-FY adjustments wizard surfaces too many false positives | UAT with 2–3 design partners' real FY 2024-25 data |
| White Books GSTR-9 endpoints not yet validated end-to-end | Sandbox test by week 2; have fallback to JSON download + manual upload to GSTN portal |
| Tenants on runQ for partial year (started mid-FY) | Block GSTR-9 generation if `tenant_start_date > FY start`; show "incomplete year" warning |

---

## 9. Effort & milestones

### v1 — 8 weeks build + 2 weeks buffer

| Week | Milestone |
|---|---|
| 1 | Schema migrations, gstr9_returns table, line_category column |
| 2 | Books-side computation engine (Tables 4, 5, 9 — outbound/tax-paid) |
| 3 | Books-side computation engine (Tables 6, 7, 8 — ITC) |
| 4 | Tables 10–14 cross-FY wizard, Tables 15–16 manual-entry forms |
| 5 | Tables 17–18 HSN aggregation, Table 19 late fee |
| 6 | White Books integration (auto-populate fetch + file) |
| 7 | Reconciliation UI + drilldown + override |
| 8 | UAT with design partners, bug-fix, QA, HSN coverage probe |

**v1 ship target:** end of July 2026 — gives 5 months of real-customer use before the 31-Dec-2026 deadline.

### v2 — 6 weeks build + 1 week buffer

| Week | Milestone |
|---|---|
| 1 | ITC line-category auto-classification + historical backfill |
| 2 | Inward HSN coverage dashboard + bulk-edit |
| 3 | Rule 42 engine (common-input identification, monthly reversal compute, auto-JE) |
| 4 | Rule 43 capital-goods schedule (table, monthly cron, disposal handling) |
| 5 | Reconciliation UI updates: auto-computed Tables 7C/7D shown; readiness warnings |
| 6 | UAT with mixed-supply design partners, bug-fix, QA |

**v2 ship target:** end of October 2026 — closes the auto-compute gap before peak filing.

### Combined acceptance: by 31-Dec-2026 deadline
- v1 shipped July, used by design partners to file FY 2024-25 (last year's pending) in August.
- v2 shipped October, used by all customers to file FY 2025-26 in November–December.

---

## 10. Acceptance / Definition of Done

### v1 DoD
- [ ] All 19 tables computed from books with drilldown to source documents
- [ ] GSTN auto-populate fetched and shown side-by-side
- [ ] Variance highlighting + override flow with audit log
- [ ] EVC OTP filing via White Books succeeds in production
- [ ] ARN stored and surfaced
- [ ] Filed JSON downloadable
- [ ] Reconciliation Excel export for CA review
- [ ] At least 3 design-partner tenants successfully prepare draft GSTR-9 for FY 2024-25 (dry run)
- [ ] One design-partner tenant successfully files for FY 2025-26 in production

### v2 DoD
- [ ] Rule 42 auto-computation matches CA-reviewed manual computation within ₹1 across 3 mixed-supply design partners
- [ ] Rule 43 capital-goods schedule reconciles to manual CA computation across all open assets for one design-partner tenant
- [ ] ≥95% of bill lines auto-classified into line_category for tenants on runQ for the full FY
- [ ] HSN coverage dashboard delivers ≥90% coverage in <30 min of cleanup for a tenant with 1,000+ bill lines
- [ ] Readiness warnings flag tenants with exempt supplies but no Rule 42 config
- [ ] All v1 manual-override flows for Tables 7C, 7D still work (backwards compatible)
