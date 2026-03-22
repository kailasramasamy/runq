# runQ Finance Module — Audit Tracker

**Audit Date:** 2026-03-22
**Audited Against:** Indian ERP standards (Tally, Zoho Books, SAP Business One)

---

## Legend
- 🔴 CRITICAL — must fix before any client goes live
- 🟠 HIGH — must fix before production deployment
- 🟡 MEDIUM — fix before scaling to multiple clients
- 🟢 LOW — nice to have, plan for future

---

## Batch 1 — Critical (do now)

| # | Issue | Severity | Status | Description |
|---|-------|----------|--------|-------------|
| 1 | Float precision in money calculations | 🔴 | [ ] | Using `parseFloat()` for money math causes rounding errors. Must use integer paise (multiply by 100) or decimal.js library. Affects: payment.service, receipt.service, debit-note.service, credit-note.service, invoice.service |
| 2 | Payment approval workflow | 🔴 | [ ] | Payments go directly to 'completed' — no approval gate. Need: pending_approval → approved → executed. Different users for approval and execution (segregation of duties) |
| 3 | Audit trail for financial transactions | 🔴 | [ ] | No record of who created, approved, modified, deleted any financial record. Need: audit_log table with user_id, action, entity, entity_id, old_values, new_values, timestamp |
| 4 | General Ledger integration | 🔴 | [ ] | No GL posting — can't generate P&L or Balance Sheet. Every AP/AR/Banking transaction must create journal entries. This is the foundation of accounting. |

---

## Batch 2 — High (before first client)

| # | Issue | Severity | Status | Description |
|---|-------|----------|--------|-------------|
| 5 | Missing DB indexes | 🟠 | [ ] | No indexes on (tenant_id, status), (due_date), (vendor_id), (customer_id) across invoices, payments, receipts tables. Will cause slow queries at scale. |
| 6 | bankAccountId FK constraint missing | 🟠 | [ ] | payments.bankAccountId and payment_receipts.bankAccountId have no FK reference to bank_accounts. Payments can reference deleted bank accounts. |
| 7 | Customer outstanding always returns 0 | 🟠 | [ ] | Bug in customer.service.ts — outstandingAmount query exists but always returns 0. Vendor outstanding works correctly. |
| 8 | Invoice auto-overdue | 🟠 | [ ] | Invoice status never auto-transitions from 'sent' to 'overdue'. Need either: (a) cron job to mark overdue daily, or (b) compute on-the-fly when querying. |
| 9 | Bank reconciliation period locking | 🟠 | [ ] | No period-end closing. Can re-reconcile or modify past periods. bank_reconciliations table exists but is never used. Need: lock completed periods, prevent backdated changes. |
| 10 | Debit/credit notes — single invoice only | 🟠 | [ ] | DN/CN can only apply to one linked invoice. Standard ERPs allow applying one DN/CN across multiple invoices, or as general vendor/customer credit. |

---

## Batch 3 — Medium (before scaling)

| # | Issue | Severity | Status | Description |
|---|-------|----------|--------|-------------|
| 11 | 3-way match tolerance | 🟡 | [ ] | Hard binary match — no tolerance for minor variances. Real ERPs allow 0.5-2% variance threshold (configurable). Also: null-pointer risk in match logic if PO item not found. |
| 12 | Early payment discounts | 🟡 | [ ] | No support for "2/10 Net 30" discount terms. Common in Indian B2B. Need: discount_terms field on invoices, calculate discount if paid early. |
| 13 | Dunning automation | 🟡 | [ ] | Dunning is manual — requires API call to trigger reminders. Need: cron job or scheduled task to auto-send reminders based on dunning rules. |
| 14 | markPaid overrides receipts | 🟡 | [ ] | invoice.markPaid() sets amountReceived = totalAmount regardless of actual receipt amounts. Should validate sum of receipts matches before marking paid. |
| 15 | Customer credit limit | 🟡 | [ ] | No credit limit field on customers. Can't block further invoicing when customer exceeds limit. Need: credit_limit field + check on invoice creation. |
| 16 | CSV import dedup too aggressive | 🟡 | [ ] | Bank statement import considers same amount + date as duplicate, even for intentional repeat payments. Need: smarter dedup using UTR/reference as primary key. |
| 17 | Optimistic locking | 🟡 | [ ] | No version field on financial records. Concurrent edits can silently overwrite each other. Need: version/updated_at check on updates. |
| 18 | Payment instruction vendor matching | 🟡 | [ ] | Case-insensitive exact match only. No fuzzy matching for slight name variations (e.g., "Gopal Sharma" vs "Gopal Kumar Sharma"). |
| 19 | Negative/zero amount validation | 🟡 | [ ] | Negative amounts allowed in some tables. Zero-amount invoices possible. Need: CHECK constraints on DB + Zod validation. |
| 20 | Race conditions in allocation updates | 🟡 | [ ] | Payment/receipt allocation loops update invoices sequentially. If crash between updates, partial state. Should batch all invoice updates in single statement. |

---

## Batch 4 — Low (future roadmap)

| # | Issue | Severity | Status | Description |
|---|-------|----------|--------|-------------|
| 21 | Multi-currency support | 🟢 | [ ] | All amounts assumed INR. No currency field on transactions. Needed for import/export businesses. |
| 22 | Cost center / branch tracking | 🟢 | [ ] | No branch/division/department tagging on transactions. Needed for multi-location businesses. |
| 23 | Budget vs actual comparison | 🟢 | [ ] | No budgeting module. Can't compare planned vs actual spend. |
| 24 | Accrual accounting | 🟢 | [ ] | No accrual/prepaid/deferred revenue handling. Cash-basis only. |
| 25 | Statutory reporting (GST/TDS) | 🟢 | [ ] | No GSTR-1, GSTR-3B, 26Q export. No HSN code tracking. No TDS auto-deduction. |
| 26 | Tally export format | 🟢 | [ ] | No XML export compatible with Tally import. Useful for accountants who use Tally for filing. |
| 27 | Multi-company per tenant | 🟢 | [ ] | Single company per tenant. No inter-company transactions. |
| 28 | Recurring payment scheduler | 🟢 | [ ] | No auto-generation of recurring payments (rent, subscriptions). |
| 29 | Purchase requisition workflow | 🟢 | [ ] | No PR → PO conversion workflow. POs come directly from WMS. |
| 30 | Advance receipt from customers | 🟢 | [ ] | No customer advance payment tracking (only vendor advances exist). |
| 31 | Bank feed standards (OFX/MT940) | 🟢 | [ ] | CSV only. No support for standard bank feed formats. |
| 32 | Notifications (email/SMS on events) | 🟢 | [ ] | No outbound notifications when payments complete, invoices overdue, etc. |
| 33 | Segregation of duties enforcement | 🟢 | [ ] | Same user can create + approve + execute. No mandatory different-user checks. |

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 CRITICAL | 4 | 0 done |
| 🟠 HIGH | 6 | 0 done |
| 🟡 MEDIUM | 10 | 0 done |
| 🟢 LOW | 13 | 0 done |
| **Total** | **33** | **0 done** |

---

## Notes

- Items 1-4 (Critical) must be resolved before ANY client uses runQ in production
- Items 5-10 (High) should be resolved before first paying client
- Items 11-20 (Medium) can be done iteratively as clients onboard
- Items 21-33 (Low) are roadmap items for product maturity
- GL integration (#4) is the largest piece of work — it touches every module
- Float precision (#1) is the most widespread — affects every service file
