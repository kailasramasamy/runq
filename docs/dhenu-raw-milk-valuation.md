# Raw milk valuation — interim accrual

Status: step 1 built, steps 2–3 specified (not built).
Owner decision needed on §5 before step 2 starts.

## 1. Why

Milk reaches the plant as stock (`postRawMilkReceipt` writes a `stock_ledger`
batch keyed on the consignment number). Manufacturing consumes from that ledger
at weighted-average cost — `consumption.service.ts` reads `cachedWAC`. Until
step 1 the raw milk landed at `unit_cost = 0`, so a work order consumed its main
input for nothing and every finished product's cost was understated by roughly
its whole input cost.

The financial side has the opposite problem: milk cost is recognised **after**
the milk physically arrives, and possibly after it has been manufactured and
sold.

```
postAccrual         (cycle lock)   Dr 5050 Milk Purchases   Cr 2150 Farmer Payable
                                                            Cr 1150/1151 recoveries
postPayment         (pay)          Dr 2150                  Cr bank
postBillMilkPayment (VMCC bill)    Dr 2150   already-accrued farmer milk
                                   Dr 5050   unaccrued VMCC milk
                                                            Cr bank
postBillCommission                 Dr 5060                  Cr bank
```

Nothing is posted at receipt, so there is no liability for a payout to settle
and no cost sitting on the stock. The gap between the physical event and the
financial one is what the interim accrual closes.

## 2. Shape

Mirrors the purchase GRNI flow already in `inventory/gl-poster.ts`
(`postPoReceive`: `Dr Inventory / Cr 2115 GR/IR Clearing`, cleared later by the
vendor bill), with a **separate clearing account** for milk.

```
PP receipt          Dr 1111 Inventory — Raw Materials     (estimated)
                    Cr 21xx Milk Received Not Billed

Cycle lock / bill   Dr 21xx Milk Received Not Billed      (what was capitalised)
                    Dr/Cr price variance → P&L            (the difference)
                    Cr 2150 Farmer Payable                (actual)
```

5050 stops being the milk expense. COGS then arrives through manufacturing
consumption, which is the point of the exercise.

**Why not reuse 2115.** Purchase GRNI clears on a three-way vendor-bill match;
milk clears on a payout cycle or a VMCC bill. Sharing the account makes the
GR/IR ageing report unreadable for both, and milk volume would swamp the
purchase balance.

## 3. Step 1 — value at receipt (built)

`ConsignmentService.rawMilkUnitCost` returns the volume-weighted
`line_amount / qty_litres` of the pours behind a leg: the source CC's child
VMCCs (or the VMCC itself when it ships direct), for the leg's collection date,
scoped to the leg's milk type. `postRawMilkReceipt` passes it as `unitCost`.

Verified against 30 Jul data: cow_a1 ₹5,170.10 / 143.7 L = **₹35.98/L**;
buffalo ₹7,046.00 / 108.4 L = **₹65.00/L**.

Deliberately excluded: quarterly bonus, advance and feed-loan recoveries. They
are not per-litre purchase cost; they land as variance when the cycle clears.

**No GL entry is posted.** Stock now carries a value the ledger does not mirror.
That is the whole of step 2.

### Known gap

The twelve VMCCs under Indus CC record no pours — they are entered as manual
receipts at the CC. Nothing knows their rate until the VMCC bill, so their legs
value at **0**. Step 3 has to give them a bill-derived or standard rate.

## 4. Step 2 — post the receipt entry

Add `MpGlPoster.postRawMilkReceipt`:

```
Dr  inventoryAccountFor(item.itemClass)   qty x unitCost
Cr  <milk clearing>                       qty x unitCost
```

- Source: `sourceType: 'mp_receipt'`, `sourceId: consignment.id`, mirroring how
  `postPoReceive` links `inventory_grn`.
- Write the resulting `journal_entry_id` back onto the `stock_ledger` row, which
  `postPoReceive` already does for GRNs — today the milk row leaves it null, so
  inventory value cannot be tied to the ledger.
- Skip entirely when `unitCost` is 0, so an unvalued Indus leg posts stock
  without a meaningless zero-value JE.
- Reversal: `deleteReceipt` already reverses the stock movement
  (`adjustRawMilkStock`); it must reverse this JE too.

## 5. Step 3 — clear the accrual

The hard part, and the reason this is specified rather than built.

`postAccrual` currently debits 5050 for the cycle's gross. It should instead
debit the clearing account for **the portion of that cycle's milk already
capitalised at the plant**, with the remainder to variance.

### The linkage problem

A payout cycle is scoped to a CC and a date range over **pours**. Capitalisation
happens on **consignments received at the plant**. The chain
pour → VMCC→CC leg → CC→PP leg is not 1:1:

- a VMCC pools many pours into one leg,
- a CC pools many legs into one tanker,
- milk can sit at a CC across a date boundary,
- dispatch/receipt variance means litres in ≠ litres out.

So "how much of this cycle was capitalised" cannot be read off directly. Naively
clearing the cycle's full gross would over-clear the account for milk that never
reached the plant.

### Options

1. **Recompute the same basis.** At lock, recompute the pour-derived value for
   the cycle's pours and clear that amount. Simple and symmetric with step 1,
   but over-clears when milk was lost or is still sitting at a CC.
2. **Track capitalised value per pour-date/node.** Sum `stock_ledger` value where
   the receipt traces back to the cycle's nodes and dates, and clear exactly
   that. Accurate; needs the trace to be recorded at receipt (store the source
   node set and date on the ledger row or a side table).
3. **Clear at the leg, not the cycle.** Give each `cc_to_pp` receipt its own
   clearing balance and settle it when the cycle or bill covering that date
   locks. Most precise, most bookkeeping.

Recommendation: **(2)**. Step 2 should therefore record enough provenance on the
receipt to make it possible, even though nothing consumes it yet.

### Variance

`capitalised − actual accrued` goes to a P&L variance account (new; a
`5xxx Milk Price Variance`). Expected sources: quarterly bonus, advance and
feed-loan recoveries, dispatch/receipt shrinkage, and the estimated rate used
for non-pour centres.

### VMCC-bill path

`postBillMilkPayment` splits Dr 2150 (accrued) / Dr 5050 (unaccrued). The
unaccrued branch is exactly the Indus case — milk that was never priced at pour
time. That branch should debit the clearing account for whatever was capitalised
and route the rest to variance, which also gives those legs a rate to be valued
at on the next receipt.

## 6. Open decisions

1. Clearing account code and name — `2116 Milk Received Not Billed` suggested;
   needs a COA migration for the standard seed and existing tenants.
2. Variance account code.
3. Step 3 option (1 / 2 / 3 above).
4. What non-pour centres value at before their first bill: 0 (today), a standard
   rate per node, or the previous bill's realised rate.

## 7. Backfill

Existing raw-milk `stock_ledger` rows sit at zero value with no JE:

```
A1 Milk (Raw)       CON/2026-27/00831   260.1 L   0.0000
A1 Milk (Raw)       CON/2026-27/00847   143.7 L   0.0000
Buffalo Milk (Raw)  CON/2026-27/00848   108.4 L   0.0000
```

They predate valuation. Restating them changes WAC for anything already
consumed, so leave them unless a work order has already consumed against them —
decide when step 2 ships.
