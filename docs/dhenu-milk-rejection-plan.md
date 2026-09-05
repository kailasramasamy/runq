# Dhenu — Milk Rejection & Return Plan

**Owner:** Kailas · **Created:** 2026-09-05
**Trigger:** 4 Sep 2026 — 97.7 L buffalo from Farm Taste - Kishore (`VRINDAVAN-VMCC-0006`) failed at the plant and was returned to the supplier. The only way to reflect it was to cancel the whole chain (plant receipt → CC dispatch → CC receipt → VMCC dispatch → pour), which erases the QC reading, the fact of the rejection, and any trace for the farmer conversation.
**Related:** `dhenu-tracker.md` · GL `dhenu-feature-roadmap.md P1.1` · billing `mp_vmcc_bills` · farmer deductions `mp_farmer_sales` · cancel chain commit `14c5b2da`

**Legend:** ✅ done · 🔄 in progress · 🔜 next · ⬜ todo · ⏸ deferred

---

## 1. The problem

Today the app has exactly two states for milk: **collected** or **never happened**. Rejection is neither. Cancelling is a lie by omission — it says the milk was never poured, when in fact it arrived, was tested, failed, and went back.

What is lost by cancelling:

- the QC reading that justified the refusal (Kishore's was 3.5 fat / 7.4 SNF)
- the rejection itself — so a farmer whose milk is refused weekly looks identical to one who never has
- any basis for the money conversation, at the gate or on the VMCC bill

`mp_qc_tests` already carries a `pass` / `fail` / `conditional` verdict, polymorphic over a pour or a consignment. It drives nothing. That is the hook this plan builds on.

---

## 2. The rule

> **Milk rejected for quality is not paid for.** The supplier who sent it carries it.

Who the supplier *is* follows how the milk was sourced, and the network splits cleanly in two:

| Source | Backed by | Supplier | Deduction lands on |
|---|---|---|---|
| Pour-backed VMCC (Vrindavan, 1,831.9 L since 1 Sep) | farmer pours | **the farmer** | their next open payout cycle |
| Direct-receive VMCC (12 Indus centres, 3,016.9 L) | manual receipt, no pours | **the VMCC** | its next open `mp_vmcc_bills` |

Every VMCC in the network today is one or the other, and each already has a settlement vehicle. There is no third case and no company write-off in the normal path.

### 2.1 The key mechanism — deduct, don't erase

The pour or receipt **stays on record, with its reading**. A rejection adds a *deduction* that nets the payment off. This is the whole point: reversing the pour would withhold the money but destroy the evidence, which is exactly the trap that produced this plan.

`mp_farmer_sales` already does this — goods sold to a farmer net off their next cycle before advances. A rejection is the same shape with the opposite cause.

### 2.2 Other decisions

| # | Decision | Chosen | Why |
|---|---|---|---|
| D1 | Where rejection can happen | **All three points** — VMCC gate, CC receipt, PP receipt | Kishore's milk failed at the plant, three legs from where it was poured. Rejection has to be recordable wherever it's caught. |
| D3 | Stock treatment | **Receive net of rejection** | Only accepted litres post to `stock_ledger`. Nothing to write off, no phantom batch, no negative-stock risk. Mirrors how variance already works. |

---

## 3. Data model

### New: `mp_rejections`

One row per rejection event. Partial is the normal case — a farmer brings 20 L and 8 L is refused.

| Column | Notes |
|---|---|
| `id`, `tenant_id` | |
| `stage` | `gate` \| `cc_receipt` \| `pp_receipt` (new enum `mp_rejection_stage`) |
| `subject_type` / `subject_id` | `pour` \| `consignment` — matches the `mp_qc_tests` convention, so a reading and a rejection hang off the same subject |
| `node_id` | where the rejection was made |
| `from_node_id` | source node; null at the gate, where the source is a farmer |
| `collection_date`, `shift`, `milk_type` | |
| `qty_litres` | rejected litres |
| `reason` | new enum `mp_rejection_reason`: `sour`, `adulterated`, `temperature`, `cob_positive`, `antibiotic`, `foreign_matter`, `other` |
| `notes` | free text, required when reason is `other` |
| `disposition` | `returned` \| `destroyed` (new enum). Returned is the default; destroyed matters for anyone asking where the litres went. |
| `borne_by` | `farmer` \| `vmcc` \| `company` (new enum). Resolved by §4.4; `company` is an owner-only override, never a default. |
| `reversed_at`, `reversed_by` | rejections are mistakes too — correctable, never hard-deleted |
| `rejected_at`, `rejected_by`, `created_at`, `updated_at` | |

### New: `mp_rejection_charges`

A rejection can split across several farmers (§4.4), so the money is its own table rather than columns on the rejection.

| Column | Notes |
|---|---|
| `id`, `tenant_id`, `rejection_id` | |
| `farmer_id` / `vmcc_node_id` | exactly one is set |
| `qty_litres`, `rate_per_litre`, `amount` | the pour's own rate, so the deduction matches what would have been paid |
| `pour_id` | set when the charge traces to a specific pour |
| `ledger_entry_id` | farmer charges only — the `quality_rejection` debit on their running ledger, which the payout waterfall recovers. A VMCC charge needs no equivalent: its milk is billed off the receipt this rejection just reduced. |
| `reversed_at` | |

Indexes: rejections on `(tenant_id, node_id, collection_date)` and `(tenant_id, subject_type, subject_id)`; charges on `(tenant_id, farmer_id, rejection_id)` and `(tenant_id, vmcc_node_id)`.

### Touched

- `mp_consignments` — no new columns. Rejected litres live on the rejection row; `receipt_qty` stays the **accepted** figure (D3).
- `mp_qc_tests` — unchanged, but the rejection UI writes one so the reading that justified the call is on record.

---

## 4. Behaviour by stage

### 4.1 Gate (VMCC, a farmer's pour)

The operator refuses milk at the can. Instead of silently not recording it, they record a rejection: farmer, litres, reason, reading.

- **No pour is created** for the rejected litres — nothing accrues, so there is nothing to deduct.
- Partial: 20 L brought, 8 L refused → a 12 L pour **and** an 8 L rejection.
- The farmer gets a notification and sees it in their app and pour statement.

### 4.2 CC receipt (VMCC → CC)

On the receive screen the operator enters accepted litres and, if any, rejected litres with a reason.

- `receipt_qty` = accepted only. Rejected litres never join the CC's pool, so they can't be dispatched onward.
- **Variance must change.** Today `varianceQty = receiptQty − dispatchQty`. A rejection is a deliberate reduction, not leakage, so it becomes `(receiptQty + rejectedQty) − dispatchQty`. Without this every rejection reads as a short delivery and pollutes the variance report — the exact figure the CC uses to police its VMCCs.

### 4.3 PP receipt (CC → PP)

Same shape as 4.2. Accepted litres post the raw-milk batch; rejected litres never enter `stock_ledger`.

### 4.4 Attribution — who the charge lands on

Resolved from what the rejected consignment traces back to, **not** from which stage caught it. Kishore's milk failed at the plant, three legs downstream, and was still one farmer's.

1. **Direct-receive consignment** (no pours behind it) → the source **VMCC**. All 12 Indus centres.
2. **Traces to exactly one pour** → that **farmer**. Vrindavan's buffalo is a single-farmer stream, so this covers the triggering incident even though it failed at the plant.
3. **Traces to several pours** → **prorated across those farmers by volume**, one `mp_rejection_charge` each. The operator may instead **name a single farmer** when the lab can pin it — retained-sample testing is exactly how a dairy attributes adulteration to one supplier, and a named attribution beats spreading blame across six people who did nothing wrong.
4. **Nothing traces** (legacy rows) → `company`, owner override only, booked to `5070 Milk Quality Rejections` (5070 is free; 5050 purchases, 5060 commission).

The resolved default is shown to the operator and stored on the row, so the decision is auditable rather than re-derived later from rules nobody remembers.

---

## 5. Settlement

| Bearer | Mechanism | GL |
|---|---|---|
| `farmer` | Deduction line on their next open payout cycle, valued at the pour's own rate. Follows the `mp_farmer_sales` precedent — nets off before advances. | reduces `5050 Milk Purchases` against `2150 Farmer Payable` at cycle lock |
| `vmcc` | Negative line on that centre's next open `mp_vmcc_bills` | same pair, mirroring the existing bill posting |
| `company` | Write-off (override only) | Gross still debits `5050` — the milk was collected and the pour says so — and the rejected share credits `5070 Milk Quality Rejections` instead of the farmer's payable. `5050` then reads "all milk poured", `5070` "what we refused". Netting it out of 5050 silently would leave no figure anywhere for how much milk is being rejected. |

**Locked-period rule.** A deduction cannot land on a locked or paid cycle or bill; it nets off the **next open** period, with the line naming the original rejection date. If that period is also closed, the deduction is refused with a message rather than silently dropped.

**Visibility.** The deduction appears by name on the farmer's pour statement and the VMCC bill — "Rejected 8 L · sour · 2 Sep". A silent reduction in a milk cheque is how you lose a supplier.

---

## 6. Interaction with the cancel chain (`14c5b2da`)

- Cancelling a receipt must **reverse its rejections and their charges** in the same transaction, or a rejection outlives the receipt it describes.
- A rejection whose charge has settled onto a **locked or paid** cycle or bill blocks the cancel, using the same "cancel that first" wording the dispatch guards already use.
- Reversing a rejection reverses its charges.

---

## 7. Reporting — the actual prize

Rejection rate is the quality lever, and none of it exists today:

- per farmer, per VMCC, per reason, over time
- rejection rate as a column on the existing QC report and source-ranking screens
- a farmer whose rejection rate is climbing is the one to visit *before* the milk goes bad

---

## 8. Phasing

| # | Item | Status | Notes |
|---|---|---|---|
| R1 | **Schema + gate rejection** | ✅ | `mp_rejections`, `mp_rejection_charges`, 4 enums, migration. VMCC entry records a rejection alongside or instead of a pour. Farmer notification + pour-statement line. No deduction needed — the pour is never created — so this ships the quality signal with zero settlement machinery. |
| R2 | **CC + PP receipt rejection** | ✅ | Rejected litres on both receive screens, receive-net, **variance formula fix**, attribution resolver (§4.4). Records and charges computed; settlement still pending R3. Cancel-chain interaction (§6). |
| R3 | **Settlement** | ✅ | Farmer cycle deduction + VMCC bill deduction, next-open-period rule, GL, statement/bill lines. |
| R4 | **Rejection reporting** | ✅ | Rates per farmer/VMCC/reason; column on QC report + source ranking. |

All four built 2026-09-05 (migration `0209_mp_milk_rejection.sql`). API 97 tests green, `flutter analyze` clean.

### What the build changed about the plan

Two settlement paths turned out not to need building at all, which is why R3
came in far smaller than scoped:

* **VMCC chargeback needs no deduction table.** `ReportService.pricedDrGross`
  values a centre's bill straight off `mp_consignments.receipt_qty`. Receiving
  net of rejection (D3) therefore reduces the bill on its own — the litres never
  reach it. The research pass had concluded a new `mp_vmcc_bill_deductions`
  table was required; it is not, and adding one would have double-counted.
* **Farmer deduction rides the existing waterfall.** `mp_payout_deductions` and
  the `mp_deduction` enum already existed, so a rejection is one more bucket in
  `farmer-ledger.ts` — recovered ahead of milk sales, because it is not a debt
  the farmer took on but milk we never got. No cycle-targeting logic was needed:
  outstanding is summed over the whole ledger, so a rejection raised against an
  already-locked period simply comes off the next one.

One thing the build got wrong first and corrected: attribution was written to
follow the **stage** that caught the rejection, defaulting plant-stage ones to a
company write-off on the theory that a tanker blends many farmers. Kishore's
97.7 L tanker was a single-farmer stream, so it does trace — the rule now
follows traceability and `rejection-attribution.ts` exists to make that
testable in isolation.

---

## 9. Not in scope

- Re-testing and accepting previously rejected milk — a rejection is final; record a fresh receipt if it is re-presented
- Automatic rejection from QC thresholds — the quality bands warn today and should keep warning; a human refuses the can
- Rejection at dispatch — milk is refused where it is received, not where it is sent
