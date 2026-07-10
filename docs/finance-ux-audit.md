# runq Finance — Usability Audit (Owner-first lens)

**Date:** 2026-07-08
**Persona:** Indian SME business owner, NOT an accountant. Daily jobs: see cash/bank position, know who owes me, raise an invoice fast, capture a bill/expense, pay vendors, know GST status & amount owed.
**Primary scope:** Flutter mobile app (`apps/mobile`). Web findings in Appendix.
**Method:** 8 parallel code-audit agents over shell/nav, dashboard, AR, AP/banking, reports/GST — every finding has a file:line reference.

---

## Verdict in one paragraph

The bones are excellent — the mobile dashboard's cash hero ("To collect (AR)" / "To pay (AP)"), one-tap invoice filters, the collections chase screen with real WhatsApp/call actions, camera-to-draft bill scanning, and Indian ₹ formatting are all genuinely owner-grade. But the app breaks its own promises in the money-in loop (FAB says "Record payment" but dumps you on a list; UPI QR data is fetched but never rendered), hides urgency data (no due date / days-overdue on invoice or bill rows), and leaks accountant internals ("owner-injection journal entry", "3-WAY MATCHED", "Trial balance", raw `$e` exceptions) into flows an owner touches daily.

---

## P0 — Broken promises & dead ends (fix first)

### 1. FAB "Record payment" contradicts the product's money-in model — ✅ DONE (2026-07-10)

**Shipped:** FAB "Record payment" → **"Collect payment"** (routes to unpaid invoices → tap → per-invoice UPI QR). New `payment_qr_sheet.dart` renders the invoice's `qrData` as a scannable QR (black-on-white for scanner contrast, Share + Copy link, "not set up" state when tenant has no UPI ID). Invoice-detail footer button "Record payment" → **"Payment QR"**. Manual mark-paid demoted into the "…" menu as **"Record offline payment (cash / personal a/c)"** with a caution that bank payments reconcile themselves. This also delivers P0 #2 (QR display).

**Still open (separate follow-up):** the backend `markPaid` (`invoice.service.ts:1135`) still hardcodes `paymentMethod: 'bank_transfer'` and posts to bank GL — for the offline escape hatch it should store the real method and post to petty cash / owner-funds so it can never collide with statement recon. Tracked below.

---

<details><summary>Original finding (for reference)</summary>
`lib/shell/fab_sheet.dart:47` — label promises "Mark a payment received" but routes to `ctx.push('/invoices')`, the plain invoices list.

**Product reality (confirmed 2026-07-10):** AR receipts are reconciliation-driven — invoices go out as Sent, and payment is recorded when the bank txn is imported and matched. Manual mark-paid is never used in practice; the only legit scenario is cash/personal-account receipts, which is rare.

**Why the current path is a footgun, not just unused** (`apps/api/src/modules/ar/invoice.service.ts:1135-1207`):
- `markPaid` books a real `paymentReceipts` row + GL posting into the bank account. If tapped for a customer who paid the business account, the later bank txn has no open invoice to match → unmatchable credit or double-counted income.
- The mobile payment-method sheet (UPI/Cash/Cheque/Card) is cosmetic — the service hardcodes `paymentMethod: 'bank_transfer'` (`:1159`). Even genuine cash receipts get recorded as bank transfers into bank GL.

**Fix (revised):**
1. Remove "Record payment" from the FAB.
2. Replace with "Collect payment" → the UPI QR screen (P0 #2) — coherent with the recon model: money lands in the business account and auto-matches at import.
3. Keep mark-paid only on invoice detail as an explicit escape hatch, relabeled "Record offline payment (cash / personal account)"; fix the backend to store the real method and post to petty cash/owner-funds instead of bank GL (mirror the AP owner-paid pattern) so it can never collide with statement recon.
</details>

### 2. UPI QR exists in the API but is never shown — ✅ DONE (2026-07-10)
Delivered alongside #1. `payment_qr_sheet.dart` renders the invoice `qrData` as a scannable QR (black-on-white, Share + Copy link, "not set up" state). Now reachable as a **primary action on any unpaid invoice** in two places:
- Invoice detail footer → "Payment QR" button.
- **Invoices list swipe** → the old "Mark paid" swipe replaced with **"Collect"** (QR) — so from the FAB it's 2 taps (FAB → unpaid list → swipe Collect). This also removed the leftover `markPaid` footgun that still lived on the list swipe (`invoices_screen.dart` `_markPaid` deleted), matching the detail-screen demotion.

Setup: tenant sets **Settings → Company → UPI Collection → UPI ID** (web) — stored at `tenants.settings.upiId`, read live by `GET /ar/invoices/:id/upi-link`; payee name = company name.

**Not extended to Collections chase sheet:** the UPI link endpoint is per-invoice (single amount), while collections operates on a customer with N overdue invoices — no clean single-amount mapping. Left for a later "send statement + pay link" flow.

<details><summary>Original finding (for reference)</summary>
`invoice_detail_screen.dart:160-175` — "Copy UPI payment link" only copies text to clipboard, buried in the "…" overflow menu. API returns `qrData` (`models.dart:656-662`) but no QR is ever rendered (no `qr_flutter`). For an Indian SME the #1 collection move is *show a scannable QR on the spot*. Fix: "Show payment QR" as a primary action on any unpaid invoice.
</details>

### 3. Invoice rows hide the two numbers that matter — ✅ DONE (2026-07-10)
`InvoiceRow` (`invoices_screen.dart`) and `BillRow` (`bills_screen.dart`) now show:
- **Headline = balance due** (what's still owed) for any non-draft row with an open balance; drafts/paid keep the invoice/bill value.
- **Line 2 = `INV-042 · Due 20 Jan`**, with a red **`· 18d late`** (or `due today`) when past due. Lateness is **date-derived**, not status-derived, so it's honest even before the backend's overnight job flips `sent → overdue`.

Both widgets are reused by the dashboard's Recent lists, so those get the same treatment. Verified: `flutter analyze` clean, font guard clean.

### 4. Analytics drill-downs land nowhere — ✅ DONE (2026-07-10)
The three cards that pushed `/money/reports` for a view that screen doesn't contain — **Balance sheet, Trial balance, Suspense/clearing** (`section_books.dart`) — no longer drill. They stay as glanceable health indicators (accountant territory, no owner-facing mobile screen to act on; building full BS/TB screens is wrong-priority for this persona). Every remaining analytics drill was verified to land on a real route with the promised content: the surviving `/money/reports` drills are P&L / Gross-margin / Revenue-vs-expense / Top-expense (all views the reports screen actually has); others → banking / invoices / bills / approvals / collections / gst.
Verified: `flutter analyze` clean, font guard clean, all drill targets resolve.

Follow-up (P2 #13, not done): relegate the whole accountant-facing "Books health" section into a collapsed "For your accountant" group.

### 5. GST hub answers "am I ready?" but not "how much do I owe?"
`gst_hub_screen.dart:116-243` — readiness % + due-date chip, but tax payable appears nowhere on the hub; it's buried in Analytics ("Cash payable", `section_gst.dart:60-66`) and the 3B detail.
**Fix:** Add "₹X to pay this period" as the hub's second headline stat, next to the deadline.

### 6. Dead taps on activity rows
`activity_screen.dart:172-177` — `payment` / `receipt` / `credit_note` / `debit_note` activity types silently do nothing on tap.

---

## P1 — Mental-model confusion (the "which button do I press?" problem)

### 7. Four overlapping payment-ish FAB entries
`fab_sheet.dart:27-70`: "Record payment" (money in), "Pay a vendor" (money out), "Quick payments" (QR/UPI you made = money out), "Expenses" (also money out). A non-accountant cannot pick correctly. Worse, `quick_payment_screen.dart:18-20` — "Quick payment" *sounds like* receiving money but is expense capture requiring a **GL expense category** (`:225`).
**Fix:** Reframe the FAB around money direction:
- **Got paid** → receive-payment flow (P0 #1)
- **Create invoice** → direct to form (see #8)
- **Add a bill** → scan (keep, it's good)
- **I spent money** → single merged expense/quick-payment entry (see #9)

### 8. Invoice creation is 3 taps through two stacked sheets
`invoice_quick_sheet.dart:44-49` opens `invoice_create_sheet.dart` — a sheet whose only job is opening another sheet.
**Fix:** One sheet: Quick invoice (templates) / Blank / From PO / Upload. Also: quick-invoice templates can't be created on mobile (`quick_invoice_templates_screen.dart:13,76` — "Set up from web admin") — a phone-only owner can never build the fast path. Add "Save as template" after any invoice.

### 9. Expenses vs Quick payments split
Two surfaces (`/expenses`, `/quick-expenses`) with overlapping mental models and different names. Merge into one "Money I spent" surface with two capture modes (reimbursable claim vs paid-from-bank), category chips shared.

### 10. "PO Inbox" is a *sales* feature wearing a purchasing name
`po_inbox_screen.dart:132` — it ingests **customer** POs and produces sales invoices, but "PO" on the purchases side reads as *my* order to a supplier (which lives separately under `lib/screens/purchase/`).
**Fix:** Rename to "Customer orders" / "Order inbox" and house it under Sales.

### 11. Cash hero taps to the wrong place
`cash_hero_card.dart:34` — the whole card goes to `/money/analytics`. "To collect" / "To pay" mini-stats aren't individually tappable. Owner tapping "To collect ₹4.2L" expects the debtor list.
**Fix:** per-stat taps → collections / bills; card body → banking.

---

## P2 — Jargon & copy pass (cheap, high leverage)

### 12. Accountant copy in owner-critical dialogs
- `bill_detail_screen.dart:905-934` (and `bills_screen.dart:909`): *"Books a Petty Cash payment with an owner-injection journal entry so the cash trail stays balanced."* → "Record that you paid this from your own money."
- `new_invoice_screen.dart:368`: "Save & repost" → "Save changes".
- `status_pill.dart:36-41`: "3-WAY MATCHED" / "3WM" / "MATCH NEEDED" → hide behind detail, or "Verified against order".
- `bill_extract_screen.dart:812-815`: "TDS section", "HSN/SAC", "GSTIN", "PAN" shown with equal visual weight to required fields → collapse into an "Tax details (optional)" group.
- `invoice_detail_screen.dart:324-339`: sheet subtitles "GL re-posts", "keeps row for audit".
- `reports_screen.dart:297-307`: "COGS" → "Cost of goods"; gloss "Gross profit".
- `section_performance.dart:169,307`: "Days sales outstanding / DSO", "from GL".
- Banking (`banking_screen.dart:564-567`): "reconcile", "unreconciled", "Uncategorized" → "matched to your books" language.
- GST: hub tiles `gst_hub_screen.dart:298-309` say "GSTR-1 & 3B", "Reconcile 2B / Match ITC claims" with zero gloss; 2B screen (`gst_2b_screen.dart:192-193`) never explains its purpose. One-line explainers fix most of this: *"GSTR-1 — your sales report to the government"*, *"2B — what your vendors reported buying from you; matching it protects your tax credit."*

### 13. Analytics "Books health" section is accountant-internal
`section_books.dart` — Trial balance, Debits/Credits, Suspense/clearing, Unreconciled. Move to a collapsed "For your accountant" section (also solves dead drills, P0 #4).

---

## P3 — Data correctness & polish

14. **Hand-typed GST default 0%** — `new_invoice_screen.dart:733,752`: free-typed invoice lines silently default to 0% GST; easy to under-charge. Fix: default to tenant's most-common rate or force an explicit pick on non-catalog lines.
15. **Scan-review dates are raw `YYYY-MM-DD` text fields** — `bill_extract_screen.dart:813-814`. Use `showDatePicker` like everywhere else.
16. **Raw exceptions in snackbars** — `bills_screen.dart:860,894,934`, `pay_runs_screen.dart:260`, `gst_returns_screen.dart:46`, etc.: `"Couldn't approve: $e"`. Map to friendly messages.
17. **Inconsistent dashboard error handling** — SpotlightCards silently blank on error (`spotlight_cards.dart:28`); recent lists have no retry; ActivityList has full retry. Standardize on `AsyncSlot`.
18. **Header stat chips sum only the loaded page (max 50)** — `invoices_screen.dart:124-158`; understates OUTSTANDING/COLLECTED on big books. Serve true totals from the summary endpoint.
19. **Banking is web-dependent** — `banking_screen.dart:66,171`: empty states punt to "the web app" for adding accounts/importing statements. At minimum let mobile share-in a statement PDF (the share-intake pipeline already exists).
20. **Share-in always interrupts with a 4-way jargon sheet** — `share_destination_sheet.dart` forces "Vendor bill / Customer PO / Receive against PO (GRN) / Quick payment" on every share. Default to "Vendor bill" with a one-tap switch.
21. **No offline story** — all writes fail hard with a generic error; no queue/retry for shop-floor connectivity.
22. **Money hub duplication** — hero duplicates dashboard's (minus AR/AP stats); 4 top chips duplicate 4 of the 7 grid tiles (`money_hub_screen.dart:42-65` vs `:231-302`). Cut the chips, keep the grid.
23. **Reports numbers aren't tappable** — `reports_screen.dart:424,731`: P&L rows, top customers, top categories have no drill-down, while Analytics cards do. Add taps → filtered lists.
24. **No period selector on Analytics** — sections hardcode FY / 12mo / 90d / this-month; only the P&L card has its own toggle (`section_books.dart:146-151`).

---

## What's already strong (don't touch)

- Cash hero card: cash + To collect + To pay above the fold, humanised labels (`cash_hero_card.dart:227`).
- Collections screen: sorted by biggest debtor, severity-colored aging, **real** WhatsApp (`wa.me`) / call / email actions with disabled-reasons (`collections_screen.dart:478-551`).
- One-tap invoice filter tabs with live counts; swipe actions (Remind / Mark paid).
- New-invoice form: only 2 required concepts, due date auto from payment terms, HSN/place-of-supply/GL fully hidden (`new_invoice_screen.dart:16-19`).
- Bill scan: camera-first, share-to-app, duplicate guard, confidence badge.
- Expense category chips (no dropdown), auto-approve for solo owners.
- GST filing action bar as a one-button state machine (Validate → Upload → File) (`gst_return_detail_screen.dart:637-641`).
- Indian formatting everywhere: `₹1,23,456`, L/Cr compact, proper minus (`format_inr.dart`).
- Empty/loading states generally polished; `AsyncSlot` retry pattern where used.

---

## Suggested sequencing

| Phase | Items | Effort |
|---|---|---|
| 1. Money-in loop | P0 #1 QR display, #2 receive-payment flow, #3 due dates on rows | ~3-4 days |
| 2. Copy pass | P2 #12-13 jargon sweep + GST one-liners + friendly errors (P3 #16) | ~2 days |
| 3. Mental model | P1 #7-11 FAB reframe, sheet flattening, expense merge, PO inbox rename | ~3 days |
| 4. Data honesty | P3 #14, #15, #17, #18, GST payable on hub (P0 #5) | ~2-3 days |
| 5. Structural | Templates on mobile, banking import, offline queue, analytics period selector | as roadmap |

---

## Appendix — Web app findings (secondary scope)

**High severity:**
- **Mobile bottom-nav in the web app is broken** — `sidebar.tsx:876-882` uses `/ar`, `/ap`, `/banking`, `/ar/quick-templates` but all real routes live under `/finance/*`. 4 of 5 tabs (incl. the center Invoice button) 404 for phone-browser users.
- **Dashboard "Record payment" tile is a trap** — routes to `/finance/ap/payments/new` (paying a vendor), not recording customer money-in (`approvals-quick.tsx:19`, `cmdk.tsx:28`). "Record receipt" exists only in ⌘K.
- **Collections/dunning action buttons are dead** — "Log call", "Email", "Update" have no onClick (`collections/index.tsx:246-254`); "Run dunning now", "Send reminder", rule Edit/Toggle also dead (`dunning/index.tsx:70-71,419-420`); invoice-detail overdue banner buttons dead (`detail.tsx:299-300`).
- **WhatsApp/SMS reminders don't send on web** — only email actually dispatches; WhatsApp selection just logs (`dunning/index.tsx:149-151`). Mobile collections does real `wa.me` — port that.
- **Bill line editor: 11 columns** incl. HSN/SAC, Tax Category (with "Reverse Charge"/"Nil Rated"), TDS Section/% inline on every row (`bill-form.tsx:442-452`). Needs a simple mode.
- **Reconciliation fallbacks demand COA fluency** — "Book Balance", "Post as Expense" → pick GL code, "Receive on account" (`reconciliation/index.tsx`).
- **Reports have no drill-down and no insight layer** — P&L/BS/cash-flow numbers are plain spans; only Trial Balance drills (the one screen owners shouldn't need). Balance Sheet shows "Assets = Liabilities + Equity … check journal entries".
- **GSTR-1/3B details are portal replicas** — B2B/B2CS/B2CL/CDN/POS/RCM/UQC, "Rules 38/42/43 & Sec 17(5)" verbatim; the one owner number ("Total Cash to Pay") is buried at the bottom.

**Notable:**
- 37 sidebar leaf items across 7 groups; "Debit notes" appears in both Money in and Money out meaning opposite things.
- KPI cards not clickable; "Net burn (30d)"/"Revenue MTD" jargon contradicts the friendly "Money in/out" sidebar.
- 4 parallel payment creation modes (Advance/Direct/Bulk/New) with no guidance.
- 7 dashboard widgets exist but are dead code (payment-priority, pdc-calendar, expense-alerts…) — exactly the owner widgets the live dashboard lacks.
- Statement import invisible from the accounts page (lives under Transactions).
- ⌘K "Ask runQ" prompts are stubbed (`console.log` only).
- Web strengths: bill scan flow, statement import with "your books are safe" duplicate guard, GST Readiness screen, Analytics page (the real owner dashboard), customer detail hero with aging buckets.
