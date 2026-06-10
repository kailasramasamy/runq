# Banking — Receipt Allocation Hardening (Plan + Tracker)

## Why

runq auto-creates an AR receipt per customer bank credit and allocates it across
that customer's open invoices via **global oldest-first FIFO** (`auto-receipt.service.ts`).
FIFO has two structural blind spots that have caused repeated mis-allocations
for 4am (Think FreshFirst):

1. **Non-invoice cash pollutes the queue.** A ₹10,000 "truck advance" (transport,
   no invoice) was FIFO-spread across invoices because nothing distinguished an
   advance from an invoice payment — even though the narration said "truck advance".
2. **FIFO can't map a multi-invoice remittance.** A ₹173,742 transfer meant for a
   specific 23-invoice set drifted onto the wrong invoices once the queue head was
   disturbed. The only ground truth is the customer's remittance advice (a sheet
   4am sends with every transfer).

Both were corrected manually via one-off scripts (`reallocate-4am-receipts.ts`,
`fix-4am-2026-06-09-txn.ts`). This plan makes the fixes structural.

## Fixes

### A — On-account guard for non-invoice credits
- `classifyCredit(narration)` → `on_account` when narration matches a keyword list
  (default: advance, truck, transport, freight, deposit, loan, security, margin).
  Bias toward on-account: **not allocating is the safe, reversible failure;
  mis-allocating is the dangerous one.**
- In `createFromBankTxn`, before FIFO: if `on_account`, create the receipt, post the
  normal Dr Bank / Cr AR JE (unchanged — `gl.postReceipt` is allocation-independent),
  set `is_on_account = true`, skip allocation, mark the bank txn matched, audit-log.
- Manual override in the reconcile UI: **"Receive on account (advance)"** action.

### B — Remittance-advice allocation
- `ReceiptService.reallocate(receiptId, lines[])` — single reusable primitive:
  wipe a receipt's allocations, insert the explicit set, recompute every touched
  invoice's `amount_received / balance_due / status`. Extracted from the proven
  fix-script SQL.
- `PUT /receipts/:id/allocations` — replace a receipt's allocation set explicitly.
  This is the missing edit capability that today forces a script for every fix.
- Remittance parse: accept a flat sheet (invoice-no + amount columns), resolve
  invoice numbers → ids, cap each at balance, reconcile sheet vs receipt total
  (warn + absorb sub-rupee rounding on the largest line). Preview diff → apply.

## Out of scope (v1)
- Reclass advances to a dedicated "Advance from customers" liability account
  (v1 leaves them as a customer AR credit, same as existing negative balances).
- Per-tenant keyword override UI (v1 ships a sensible default list in code).
- Multi-block historical sheet format (one-off, already scripted).
- Auto-FIFO guard on large/ambiguous receipts (Fix C — revisit after B).

## Tracker
- [x] Schema: `payment_receipts.is_on_account boolean not null default false` (applied to prod; truck advance backfilled)
- [x] Fix A: `looksLikeOnAccountCredit` + on-account branch in `createFromBankTxn` (`auto-receipt.service.ts`)
- [x] Fix A: manual "Receive on account" action — `POST /banking/reconciliation/receive-on-account` + reconcile-row button
- [x] Fix B: `ReceiptService.reallocate` primitive (delta-based, preserves CN/other-receipt contributions)
- [x] Fix B: `PUT /ar/receipts/:id/allocations` endpoint + `setReceiptAllocationsSchema`
- [x] Fix B: remittance paste → preview → apply UI (`remittance-allocator.tsx` on receipt detail)
- [x] Typecheck (all touched packages clean) + classifier unit test

## Implementation notes
- `reallocate` applies a per-invoice DELTA (new − old) rather than recomputing
  `amount_received` from scratch — credit_note.service.ts also writes that column,
  so a from-scratch recompute would wipe CN-applied amounts.
- On-account advances post the normal Dr Bank / Cr AR JE (a customer credit). The
  dedicated "Advance from customers" liability reclass remains a future refinement.
