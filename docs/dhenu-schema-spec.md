# Dhenu — Backend Data Model (Schema Spec)

**Module:** `apps/api/src/modules/milk-procurement/` · **Schema:** `packages/db/src/schema/milk_procurement.ts`
**Owner:** Kailas · **Created:** 2026-06-13 · **Status:** Spec for review — no code yet.
**Scope:** Part-1 moat only — network, farmers, rate chart, collection (4 tiers), QC, payout. Part-2 (agri-services) tables out of scope.

> Companion to `docs/dhenu-design-spec.md` (UI) and §3.7 of `docs/dairy-sme-plan.md` (architecture). Encodes the §8 decisions: manual capture, app-only receipt (but stable `receipt_no`), **matrix** rate chart, **many-to-many** farmer↔centre, no Part-2 tables yet.

---

## 1. Principles & conventions

Follows runq's existing schema conventions exactly (verified against `ap/vendors`, `inventory/stock_ledger`, `gl/journal_entries`):

- **Multi-tenant:** every table has `tenant_id uuid NOT NULL → tenants.id`; every index leads with `tenant_id`.
- **Keys/timestamps:** `id uuid PK defaultRandom()`; `created_at`/`updated_at` (`withTimezone`), `deleted_at` for soft-delete on master tables.
- **Money/quantity precision:** litres `decimal(12,3)`, FAT/SNF/CLR `decimal(5,2)`, temp `decimal(4,1)`, rate `decimal(8,2)`, money `decimal(15,2)` (matches GL).
- **Table prefix `mp_`** (milk-procurement). Rationale: the entity nouns are generic (`nodes`, `pours`, `farmers`, `rate_charts`) and would collide in the shared DB; the prefix namespaces them and signals the standalone module. *(Convention call — confirm before code.)*
- **Append-only ledgers** for anything financial/auditable (`mp_pours`, `mp_farmer_ledger`) — mirror `stock_ledger`: never UPDATE a posted row; corrections are **reversal rows** pointing back via `reversal_of`.
- **Reuse, don't rebuild** (the moat = in-process calls, not a cross-product API):
  - Farmer **payout identity** = a `vendors` row (bank details, AP sub-ledger) — `mp_farmers.vendor_id`.
  - Payout **cash-out** = existing AP `payments` / `advance_payments`.
  - **GL** = `journal_entries` with `source_type = 'mp_payout' | 'mp_receipt'`.
  - **Raw-milk stock** at PP = existing `stock_ledger` (`source_type = 'mp_receipt'`, a raw-milk `item` + warehouse).
- **Offline idempotency:** capture tables carry `device_local_id`; a unique `(tenant_id, node_id, device_local_id)` makes re-sync a no-op (offline-first, per design-spec §7).

---

## 2. ERD (overview)

```
                         tenants
                            │
        ┌───────────────────┼───────────────────────┐
        ▼                   ▼                        ▼
   mp_nodes ◄──parent──┐  mp_farmers ──vendor_id──► vendors (AP)
   (vmcc/cc/pp tree)   │     │                         │
        │              │     │ M:N                      │ payout cash-out
        │              │  mp_farmer_memberships         ▼
        │              │     │                       payments / advance_payments
        │              │     ▼
        │              └─ mp_pours ───────┐  (finest grain: farmer × date × shift, +QC)
        │   (poured at vmcc)              │
        ▼                                 ▼
   mp_consignments                   mp_qc_tests (optional richer lab tests)
   (vmcc→cc, cc→pp; dispatch+receipt QC, variance)
        │ PP receipt
        ▼
   stock_ledger (raw-milk batch)            mp_rate_charts ─┬─ mp_rate_chart_cells (FAT×SNF→₹)
                                                            └─ mp_rate_chart_rules (bonus/slab)
   mp_payout_cycles ─┬─ mp_payout_lines ── mp_payout_deductions
                     │        │
                     │        └── pulls from mp_farmer_ledger (advances + feed loans)
                     └── journal_entries (Dr Milk Purchase / Cr Farmer Payable)

   mp_node_operators (operator/owner comp terms)   mp_sequences (numbering)   mp_gl_settings (account map)
```

**The "one record at four altitudes" model:** `mp_pours` is the atom (a farmer's pour at a VMCC). VMCC sees the **sum** of its pours; tier-to-tier movement is an `mp_consignments` row (VMCC→CC, CC→PP) carrying re-tested QC + variance. Farmer/VMCC/CC/PP each read the same physical milk at a coarser grain.

---

## 3. Network & masters

### 3.1 `mp_nodes` — the collection network (VMCC / CC / PP)
Self-referencing tree: VMCC `parent` = CC, CC `parent` = PP.

| Column | Type | Notes |
|---|---|---|
| id, tenant_id | uuid | |
| code | varchar(40) | tenant-unique node code |
| name | varchar(255) | |
| node_type | enum `mp_node_type` | `vmcc` \| `cc` \| `pp` |
| parent_node_id | uuid → mp_nodes | null for top (pp) |
| has_bmc | boolean | VMCC with integrated bulk-milk cooler |
| capacity_litres | decimal(12,1) | BMC / chilling-tank capacity (for `TankGauge`) |
| payout_mode | enum `mp_payout_mode` | null = inherit tenant default; `direct_to_farmer` \| `via_vmcc` (§6.5) |
| payee_vendor_id | uuid → vendors | the VMCC's own payout identity — receives the bulk settlement in `via_vmcc` mode, and commission/rent |
| address_*, lat, lng | varchar/decimal | location |
| is_active | boolean | |
| created_at, updated_at, deleted_at | timestamptz | |

Index: `(tenant_id, node_type)`, `(tenant_id, parent_node_id)`, unique `(tenant_id, code)`.

### 3.2 `mp_farmers` — farmer / society master
Dairy-specific profile; financial identity delegated to a `vendors` row.

| Column | Type | Notes |
|---|---|---|
| id, tenant_id | uuid | |
| vendor_id | uuid → vendors | **payout identity** (bank, AP ledger). 1:1 |
| code | varchar(40) | farmer/society number, tenant-unique |
| name | varchar(255) | |
| phone | varchar(20) | links to mobile OTP login |
| is_society | boolean | true = society sub-collector, false = individual farmer |
| default_milk_type | enum `mp_milk_type` | `cow` \| `buffalo` \| `mixed` |
| cattle_count | integer | optional |
| kyc_doc_id | uuid → attachments | **reference only** — never store raw Aadhaar |
| is_active | boolean | |
| created_at, updated_at, deleted_at | timestamptz | |

Index: unique `(tenant_id, code)`, `(tenant_id, vendor_id)`, `(tenant_id, phone)`.
*Bank details are NOT duplicated here — read from `vendors`.*

### 3.3 `mp_farmer_memberships` — farmer ↔ VMCC (many-to-many)
Per §8.4: M:N in schema, single-society in v1 UI.

| Column | Type | Notes |
|---|---|---|
| id, tenant_id | uuid | |
| farmer_id | uuid → mp_farmers | |
| node_id | uuid → mp_nodes | a `vmcc` node |
| is_primary | boolean | the farmer's home society |
| joined_on, left_on | date | left_on null = active |

Index: unique partial `(tenant_id, farmer_id, node_id) WHERE left_on IS NULL`.

---

## 4. Rate chart (matrix **or** flat — configurable, §8.3)

Pricing is configurable per chart: a **FAT×SNF matrix** (the §6.1 grid) **or** a **flat per-litre** rate. Both still allow `mp_rate_chart_rules` bonuses/slabs on top. Seed with industry-standard cow/buffalo matrices, refine against the pilot's chart. (Formula-coefficient mode remains out of scope.)

### 4.1 `mp_rate_charts` — header (effective-dated, scoped)
| Column | Type | Notes |
|---|---|---|
| id, tenant_id | uuid | |
| name | varchar(120) | |
| scope_node_id | uuid → mp_nodes | null = tenant-wide; else per society/tier |
| milk_type | enum `mp_milk_type` | cow/buffalo charts differ |
| pricing_mode | enum `mp_pricing_mode` | `matrix` (FAT×SNF cells) \| `flat` (single per-litre) |
| flat_rate_per_litre | decimal(8,2) | used when `pricing_mode='flat'`; null for matrix |
| season | varchar(20) | optional (`flush`/`lean`/free text) |
| effective_from, effective_to | date | to null = current |
| is_active | boolean | |
| created_at, updated_at | timestamptz | |

> Rate resolution at pour time: `flat` → `flat_rate_per_litre`; `matrix` → nearest-floor lookup in `mp_rate_chart_cells`. Then apply `mp_rate_chart_rules`. The resolved number is snapshotted onto `mp_pours.rate_per_litre` either way, so the farmer statement is identical regardless of mode.

Index: `(tenant_id, milk_type, effective_from)`, `(tenant_id, scope_node_id)`.

### 4.2 `mp_rate_chart_cells` — the FAT × SNF grid
| Column | Type | Notes |
|---|---|---|
| id, tenant_id | uuid | |
| rate_chart_id | uuid → mp_rate_charts | |
| fat | decimal(5,2) | row axis |
| snf | decimal(5,2) | col axis |
| rate_per_litre | decimal(8,2) | the cell value |

Index: unique `(rate_chart_id, fat, snf)`. Lookup = nearest-floor on (fat, snf) at pour time; resolved rate is **snapshotted** onto the pour.

### 4.3 `mp_rate_chart_rules` — bonuses & slabs
| Column | Type | Notes |
|---|---|---|
| id, tenant_id, rate_chart_id | uuid | |
| rule_type | enum `mp_rate_rule` | `quality_bonus` \| `volume_slab` |
| grade | enum `mp_grade` | for quality_bonus (`a`/`b`/`c`) |
| min_qty, max_qty | decimal(12,3) | for volume_slab (cycle volume) |
| bonus_per_litre | decimal(8,2) | added to base rate |

---

## 5. Collection (the 4 tiers)

### 5.1 `mp_pours` — farmer pour ledger (finest grain, append-only)
The single most-written table. One row per farmer × date × shift (corrections via reversal).

| Column | Type | Notes |
|---|---|---|
| id, tenant_id | uuid | |
| node_id | uuid → mp_nodes | the VMCC poured at |
| farmer_id | uuid → mp_farmers | |
| collection_date | date | |
| shift | enum `mp_shift` | `am` \| `pm` |
| milk_type | enum `mp_milk_type` | |
| qty_litres | decimal(12,3) | |
| fat, snf, clr | decimal(5,2) | QC params |
| temp_c | decimal(4,1) | |
| quality_grade | enum `mp_grade` | derived a/b/c |
| rate_chart_id | uuid → mp_rate_charts | which chart applied |
| rate_per_litre | decimal(8,2) | **snapshot** of resolved rate |
| base_amount, bonus_amount, line_amount | decimal(15,2) | computed, stored |
| capture_source | enum `mp_capture_src` | `manual` (default) \| `device` — §8.1 future-proofing |
| receipt_no | varchar(40) | stable per tenant — §8.2 (digital receipt now, print later) |
| status | enum `mp_pour_status` | `recorded` \| `reversed` |
| reversal_of | uuid → mp_pours | set on correction rows |
| device_local_id | varchar(64) | offline idempotency |
| recorded_by | uuid → users | operator |
| recorded_at, synced_at | timestamptz | |
| created_at | timestamptz | |

Indexes: `(tenant_id, node_id, collection_date, shift)`, `(tenant_id, farmer_id, collection_date)`, unique `(tenant_id, node_id, device_local_id)`, **partial unique** `(tenant_id, farmer_id, collection_date, shift) WHERE status='recorded'` (one active pour per slot; last-write-wins per design-spec §7).

### 5.2 `mp_consignments` — tier-to-tier movement (VMCC→CC, CC→PP)
Carries dispatch QC + receipt QC → variance. CC→PP rows are the tankers.

| Column | Type | Notes |
|---|---|---|
| id, tenant_id | uuid | |
| consignment_no | varchar(40) | from mp_sequences |
| kind | enum `mp_consignment_kind` | `vmcc_to_cc` \| `cc_to_pp` |
| from_node_id, to_node_id | uuid → mp_nodes | |
| collection_date | date | |
| shift | enum `mp_shift` | nullable (CC→PP may merge shifts) |
| container_no | varchar(40) | can / tanker number |
| dispatch_qty, dispatch_fat, dispatch_snf | decimal | at source |
| dispatched_at, dispatched_by | timestamptz/uuid | |
| receipt_qty, receipt_fat, receipt_snf | decimal | at destination (re-test) |
| received_at, received_by | timestamptz/uuid | |
| variance_qty, variance_pct | decimal | receipt − dispatch (stored) |
| stock_ledger_id | uuid → stock_ledger | set when PP receipt posts a raw-milk batch |
| status | enum `mp_consignment_status` | `in_transit` \| `received` \| `reversed` |
| created_at, updated_at | timestamptz | |

Index: `(tenant_id, to_node_id, collection_date)`, `(tenant_id, kind, status)`, unique `(tenant_id, consignment_no)`.

### 5.3 `mp_qc_tests` — optional richer lab tests
For PP lab params beyond FAT/SNF (adulteration, MBRT, acidity). Extensible; not required for the base flow.

| Column | Type | Notes |
|---|---|---|
| id, tenant_id | uuid | |
| subject_type | varchar(20) | `pour` \| `consignment` |
| subject_id | uuid | polymorphic ref |
| test_code | varchar(40) | e.g. `mbrt`, `acidity`, `adulteration` |
| value | varchar(60) | numeric or pass/fail |
| uom | varchar(20) | |
| verdict | enum `mp_qc_verdict` | `pass` \| `fail` \| `conditional` |
| tested_at, tested_by | timestamptz/uuid | |

---

## 6. Payout (every 10 days — §6.3 of design spec)

### 6.1 `mp_payout_cycles`
| Column | Type | Notes |
|---|---|---|
| id, tenant_id | uuid | |
| cycle_no | varchar(40) | from mp_sequences |
| scope_node_id | uuid → mp_nodes | null = whole tenant; else per VMCC/society |
| period_start, period_end | date | the 10-day window |
| status | enum `mp_cycle_status` | `open` \| `locked` \| `paid` \| `reversed` |
| total_qty, total_gross, total_deductions, total_net | decimal(15,2) | rolled up on lock |
| journal_entry_id | uuid → journal_entries | GL posting on lock |
| locked_at, paid_at | timestamptz | |
| created_at, updated_at | timestamptz | |

### 6.2 `mp_payout_lines` — per farmer per cycle
| Column | Type | Notes |
|---|---|---|
| id, tenant_id, payout_cycle_id | uuid | |
| farmer_id | uuid → mp_farmers | |
| qty_litres | decimal(12,3) | sum of active pours in window |
| gross_amount, bonus_amount | decimal(15,2) | |
| deduction_total, net_amount | decimal(15,2) | |
| payment_id | uuid → payments | AP cash-out (set on pay). In `via_vmcc` mode, many lines share the **one** payment made to the VMCC vendor |
| settled_via_node_id | uuid → mp_nodes | null = paid the farmer directly; else the VMCC that received this farmer's net on their behalf |
| statement_no | varchar(40) | printable per-farmer statement (always per-farmer, both modes) |
| created_at | timestamptz | |

Index: `(tenant_id, payout_cycle_id)`, `(tenant_id, farmer_id)`.

### 6.5 Payout routing — direct vs via-VMCC
Configurable per §point-1: tenant default in `mp_gl_settings.default_payout_mode`, overridable per VMCC in `mp_nodes.payout_mode`.

- **`direct_to_farmer`** — each `mp_payout_line` is settled by a `payment` to that **farmer's** vendor. `settled_via_node_id = null`.
- **`via_vmcc`** — per-farmer lines are still computed in full (transparency = the moat, and the farmer still gets a statement), but cash is one `payment` to the **VMCC's `payee_vendor_id`** = Σ member-farmer nets; every line points at it via `payment_id` and stamps `settled_via_node_id`. The VMCC redistributes to farmers off-platform (v1).

Both modes credit the same AP control account (farmer *and* VMCC are `vendors`), so the GL posting in §8 is uniform — only the payee differs.

### 6.3 `mp_payout_deductions` — lines on a payout line
| Column | Type | Notes |
|---|---|---|
| id, tenant_id, payout_line_id | uuid | |
| deduction_type | enum `mp_deduction` | `advance` \| `cattle_feed_loan` \| `other` |
| ledger_entry_id | uuid → mp_farmer_ledger | the source debit |
| amount | decimal(15,2) | |
| note | varchar(255) | |

### 6.4 `mp_farmer_ledger` — advances & cattle-feed loans (append-only running balance)
Per-farmer ledger; payout pulls outstanding into deductions. (Future: Part-2 feed orders post `feed_loan_given` rows — §8.5.)

| Column | Type | Notes |
|---|---|---|
| id, tenant_id, farmer_id | uuid | |
| entry_type | enum `mp_ledger_entry` | `advance_given` \| `feed_loan_given` \| `repayment` \| `adjustment` |
| amount | decimal(15,2) | signed by type |
| balance_after | decimal(15,2) | denormalised running balance |
| ref_type, ref_id | varchar/uuid | e.g. payout_line that repaid it |
| occurred_on | date | |
| created_by, created_at | uuid/timestamptz | |

Index: `(tenant_id, farmer_id, occurred_on)`.

---

## 7. Operator comp & plumbing (light — v1)

### 7.1 `mp_node_operators` — who runs a node + comp terms
Operator/rent **payouts flow through existing AP/payroll** — this table only holds the *terms*.

| Column | Type | Notes |
|---|---|---|
| id, tenant_id, node_id | uuid | |
| user_id | uuid → users | operator login (nullable for rent-only payee) |
| payee_vendor_id | uuid → vendors | for commission/rent cash-out |
| role | enum `mp_operator_role` | `operator` \| `owner` |
| comp_type | enum `mp_comp_type` | `per_litre_commission` \| `fixed_salary` |
| rate_per_litre, monthly_salary, rent_amount | decimal(15,2) | per comp_type |
| effective_from, effective_to | date | |
| is_active | boolean | |

> VMCC operator = per-litre commission **or** fixed salary (+ rent if applicable); CC operator = salary + rent; PP staff = company payroll (out of Dhenu, in HR). The actual payments reuse AP/HR — Dhenu just computes commission from `mp_pours` volume.

### 7.2 `mp_sequences` — document numbering
Mirrors `journal_sequences`. Per `(tenant_id, doc_type, financial_year)` → `last_sequence`. `doc_type` ∈ {`receipt`, `consignment`, `cycle`, `statement`}.

### 7.3 `mp_gl_settings` — tenant Dhenu config + account mapping (one row per tenant)
| Column | maps to |
|---|---|
| default_payout_mode | enum `mp_payout_mode` — `direct_to_farmer` \| `via_vmcc`; overridable per VMCC (§6.5) |
| milk_purchase_account_id | Dr on payout |
| farmer_payable_account_id | Cr on payout (AP control — covers farmer *and* VMCC payees) |
| quality_bonus_account_id | bonus expense |
| advance_account_id, feed_loan_account_id | deduction contra |
| raw_milk_inventory_account_id | Dr on PP receipt (stock_ledger valuation) |
| variance_account_id | transit loss/gain |

---

## 8. Posting flows (how it hits the books)

- **Payout cycle lock** → one `journal_entries` (`source_type='mp_payout'`): **Dr** Milk Purchases + Quality Bonus, **Cr** Payable to the AP control (per-vendor sub-ledger). Deductions net Payable against Advance / Feed-Loan accounts. **Pay** → AP `payments` → Dr Payable, Cr Bank; `mp_payout_lines.payment_id` set. Payee is the **farmer's** vendor (`direct_to_farmer`) or the **VMCC's** `payee_vendor_id` (`via_vmcc`) — GL identical, only the sub-ledger differs (§6.5).
- **PP tanker receipt** → `stock_ledger` row (`source_type='mp_receipt'`, raw-milk item) valued at procurement cost; `mp_consignments.stock_ledger_id` linked. GL: Dr Raw-Milk Inventory / Cr Milk-Purchase-Clearing.
- **⚠ Open accounting decision** (mirrors dairy-plan §7.2): exact CoA so farmer-pour cost and PP inventory-in **don't double-count**. Schema supports either via `mp_gl_settings` + the two JE hooks; the *posting rule* needs sign-off with the CA before code.

---

## 9. Open items before code

1. **Table prefix** — confirm `mp_` (vs unprefixed runq convention vs `dhenu_`).
2. **Inventory-valuation double-count** (§8 ⚠) — exact CoA so farmer-pour cost and PP inventory-in don't double-count. *Default for v1:* payout posts to Milk Purchases (P&L); PP receipt relieves it into Raw-Milk Inventory (Dr Inventory / Cr Milk-Purchase-Clearing). Still wants a CA read on the pilot CoA, but not a blocker for schema.
4. **Raw-milk item & warehouse modelling** — is each node a `warehouse`, and raw milk one `item` per milk_type? Affects the inventory bridge.

**Resolved this round (2026-06-13):**
- ✅ **Payout routing** — configurable `direct_to_farmer` \| `via_vmcc` (tenant default + per-VMCC override). Schema: `mp_gl_settings.default_payout_mode`, `mp_nodes.payout_mode`/`payee_vendor_id`, `mp_payout_lines.settled_via_node_id`. This also answers the old "society sub-collector" item — `via_vmcc` *is* the society-pays-its-members case.
- ✅ **Rate model** — configurable matrix **or** flat per-litre (`mp_rate_charts.pricing_mode` + `flat_rate_per_litre`); seed industry-standard, refine with pilot. Pilot rate chart/slip still wanted to tune seed values + deduction lines before go-live.
```
