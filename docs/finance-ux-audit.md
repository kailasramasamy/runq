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

### 5. GST hub answers "am I ready?" but not "how much do I owe?" — ✅ DONE (2026-07-10)
The GST hub's readiness card now shows a **"TAX TO PAY · <period>"** block with the net **cash payable** (from `gstLiabilityProvider` — the same provider the analytics GST-liability card uses, so no new backend). It's labelled with the *liability's own* period (the current filable 3B), which can differ from the readiness target period. Renders only once a GSTR-3B exists; shows "Nothing to pay / ITC covers it" (green) when fully offset, and "after ₹X ITC" context otherwise. Added to pull-to-refresh.
Verified: `flutter analyze` clean, font guard clean.

### 6. Dead taps on activity rows — ✅ DONE (2026-07-10)
`payment` / `receipt` / `credit_note` / `debit_note` rows silently did nothing on tap. These entities carry no linked invoice/customer id and have no mobile detail screen, so there's no honest destination. Added a shared `activityRoute()` in `activity_spec.dart`; both the activity screen and the dashboard activity list now render those rows **non-tappable** (no ripple) instead of a dead tap — invoices/bills/bank rows still navigate. Verified: analyze + font guard clean.

<details><summary>Original finding</summary>
`activity_screen.dart:172-177` — `payment` / `receipt` / `credit_note` / `debit_note` activity types silently do nothing on tap.
</details>

---

## P1 — Mental-model confusion (the "which button do I press?" problem)

### 7. Four overlapping payment-ish FAB entries — ✅ DONE (2026-07-10)
The FAB is now grouped by money direction with **Money in / Money out** headers, and the confusable payment entries are relabelled so each reads distinctly:
- **Money in:** Create invoice · Collect payment (UPI QR)
- **Money out:** Add a bill · Pay a vendor · **Payment made** (was "Quick payments" — "log a UPI/QR payment you made, matches your bank") · **Expense claim** (was "Expenses" — "out-of-pocket to reimburse")

`FabAction` gained an optional `section`; `FabSheet` renders a group label once per run. The **share-destination sheet** was aligned to match: renamed "Quick payment" → "Payment made" (+matching teal tint) and standardized to the app sheet chrome (transparent barrier, hero radius, hairline border, sheet shadow).

Follow-up (#9, ✅ done 2026-07-11): the two money-out expense *screens* were **not** merged — they're distinct flows (reimbursement vs bank-recon); resolved by renaming `/quick-expenses` → `/payments-made` to kill the naming collision instead.

### 8. Invoice creation is 3 taps through two stacked sheets — ✅ DONE (2026-07-11)
The FAB's "Create invoice" row used to open a second modal chooser (`invoice_create_sheet.dart`) — a sheet whose only job was opening another sheet. The four creation modes now sit **inline in the FAB sheet** under "Money in" (**Create blank invoice · Quick invoice · Invoice from PO · Upload invoice**), so any mode is **2 taps** from the FAB instead of 3 through stacked sheets. `FabSheet` is now height-capped + scrollable so the longer list can't overflow small phones. The chooser (`invoice_create_sheet.dart`) is retained for its other callers (`sales_hub_screen`, `invoice_quick_sheet`).

**Still open (separate follow-up):** quick-invoice templates can't be created on mobile (`quick_invoice_templates_screen.dart:13,76` — "Set up from web admin") — a phone-only owner can never build the fast path. Add "Save as template" after any invoice.

### 9. Expenses vs Quick payments split — ✅ DONE (2026-07-11)
Re-scoped after audit: the two surfaces are **not** an overlap to merge — they're genuinely distinct flows with separate data models and backends (`ExpenseClaim` → `/hr/expense-claims` reimbursement vs `PendingPayment` → `/banking/pending-payments` bank-reconciliation). The only real problem was **naming**: the "Payment made" flow still carried "quick expenses" vocabulary that collided with the "Expense claim" feature. Fixed: route `/quick-expenses` → `/payments-made`, `/quick-payment` → `/payment-made`; `QuickExpensesScreen` → `PaymentsMadeScreen`, `QuickPaymentScreen` → `PaymentMadeScreen`; files renamed via `git mv`; all references updated. The FAB copy (item #7) already distinguishes them for the user ("Payment made — matches your bank" vs "Expense claim — out-of-pocket to reimburse").

### 10. "PO Inbox" is a *sales* feature wearing a purchasing name — ✅ DONE (2026-07-11)
Renamed the whole feature to **"Customer orders"** and housed it under Sales. This ingests **customer** POs and produces sales invoices; "PO" collided with the genuine purchasing module (`lib/screens/purchase/`, my order to a supplier), which was left untouched.
- **Routes** → `/sales/orders`, `/sales/orders/processing`, `/sales/orders/:id` (was `/po-inbox`, `/po/processing`, `/po-drafts/:id`); auth allowlists cleaned of dead `/po*` entries (`/sales` prefix covers the new paths); notification deep-link rewrite retargeted to `/sales/orders/<id>` (backend still emits the legacy `/ar/po-inbox/` source).
- **Files** (git mv) → `customer_orders_screen.dart`, `customer_order_processing_screen.dart`, `customer_order_review_screen.dart`, `order_intake.dart`, `order_line_edit_sheet.dart`.
- **Code** → `PoInboxScreen`→`CustomerOrdersScreen`, `startPoIntake`→`startOrderIntake`, `PoInboxRow/PoDraftDetail/PoDraftLine`→`CustomerOrder*`, `PoRepo/poRepo`→`OrderRepo/orderRepo`, plus providers/enum/private classes.
- **Copy** → "Customer orders" AppBar/chip, "Invoice from order", "Customer order" share option, "No customer orders yet", etc.

**Deliberately kept:** the customer's literal PO-**number** data fields (`PO #<n>`, `PO number (optional)`) — that's the number printed on the customer's own document, not the feature name. Backend endpoints (`/ar/po-drafts/...`) and the entire `lib/screens/purchase/` module untouched. Full-project `flutter analyze` clean (0 errors).

**Web parity — ✅ DONE (2026-07-11).** Applied the same rename to the web app (`apps/web`), matching mobile depth:
- **Route** → `/finance/ar/customer-orders` (+ `/$uploadId`), was `/finance/ar/po-inbox`; added `<Navigate>` legacy-redirect routes from the old `/po-inbox` paths so notification/bookmark links keep working.
- **Files** (git mv) → `hooks/queries/use-customer-orders.ts`, `routes/ar/customer-orders/`, `components/customer-orders/` (incl. `order-upload-zone.tsx`, `type-order-modal.tsx`).
- **Code** → `PoInboxPage`→`CustomerOrdersPage`, `usePoInbox`→`useCustomerOrders`, `PoInboxRow/PoInboxDetail`→`CustomerOrder*`, all `use*PoDraft/PoUpload` hooks → `*OrderDraft/OrderUpload`, `PO_INBOX_KEYS`→`CUSTOMER_ORDER_KEYS`, etc.
- **Copy** → "Customer orders" title/breadcrumb, "Generate from order" (New-invoice menu), "Type an order", upload-zone/first-run/install-nudge/reject copy.
- **Kept:** `/ar/po-drafts` + `/ar/po-uploads` APIs, the `PO number`/`PO date` data fields, and the `/purchase/pos` procurement module — all untouched. `tsc --noEmit` clean (0 errors). Nav placement unchanged (still reached via the "New invoice" menu; no sidebar entry, per decision).

**Items 8 & 9 web parity:** #8 (invoice-create flow) is already fine on web — single 2-option "New invoice" menu, no stacked sheets; only the "Generate from order" label rode along with #10. #9 (quick payments naming) has no web counterpart — web has no "payment made / quick payments" capture flow, so there's nothing to rename (its Expenses / AP Payments / Banking "Pending payments" surfaces are already clearly named).

### 11. Cash hero taps to the wrong place — ✅ DONE (2026-07-12)
`cash_hero_card.dart:34` — the whole card goes to `/money/analytics`. "To collect" / "To pay" mini-stats aren't individually tappable. Owner tapping "To collect ₹4.2L" expects the debtor list.
**Fix:** per-stat taps → collections / bills; card body → banking.
**Done:** card body now `→ /money/banking`; "To collect" mini-stat `→ /sales/collections`, "To pay" `→ /purchases/bills` (each intercepts its own tap via an `onTap` on `_MiniStat`).

---

## P2 — Jargon & copy pass (cheap, high leverage)

### 12. Accountant copy in owner-critical dialogs — ✅ MOSTLY DONE (2026-07-12)
- ✅ Petty-cash owner-injection copy → "…paid from your own money. This keeps your books balanced." (`bill_detail_screen.dart` markPaid dialog + CTA blurb; `bills_screen.dart` markPaid dialog).
- ✅ `new_invoice_screen.dart`: "Save & repost" → "Save changes".
- ✅ Status jargon: `status_pill.dart` "3-WAY MATCHED" → "VERIFIED"; `bills_screen.dart` match chip "3WM" → "Verified".
- ✅ `invoice_detail_screen.dart`: "…GL re-posts" → dropped; "keeps row for audit" → "kept on record for your books".
- ✅ `reports_screen.dart`: "COGS" → "Cost of goods".
- ✅ `section_performance.dart`: "DSO trend, 6 months" → "Trend over 6 months"; "This month, from GL" → "This month".
- ✅ Banking: "unreconciled rows" → "uncategorised rows"; "Unreconciled" status → "Not matched".
- ✅ GST: hub tiles "GSTR-1 & 3B" → "Your sales & tax returns", "Match ITC claims" → "Protect your tax credit"; 2B screen now opens with a one-line purpose explainer.
- ⬜ **Deferred — `bill_extract_screen.dart` tax-field regroup:** the tax fields (GSTIN/PAN, TDS section, HSN/SAC) currently sit inside their entity sections (Vendor / Invoice / line-item). Lumping them into one "Tax details (optional)" group is a layout refactor that fights the per-entity grouping — needs its own pass, not a copy swap.
- ⬜ **Deferred — "Gross profit" inline gloss:** would need a subtitle slot on the `_PnlRow` widget; skipped in the copy pass.

### 13. Analytics "Books health" section is accountant-internal — ✅ DONE (2026-07-12)
`section_books.dart` — Trial balance, Debits/Credits, Suspense/clearing, Unreconciled. Move to a collapsed "For your accountant" section (also solves dead drills, P0 #4).
**Done:** renamed "Books health" → "For your accountant", made `_Section` optionally collapsible (chevron header), and set this section `collapsible + initiallyExpanded: false`. Moved it below GST compliance so owner-facing metrics stay above the fold. `analytics_screen.dart`.

---

## P3 — Data correctness & polish

14. **Hand-typed GST default 0%** — `new_invoice_screen.dart:733,752`: free-typed invoice lines silently default to 0% GST; easy to under-charge. Fix: default to tenant's most-common rate or force an explicit pick on non-catalog lines. — ✅ DONE (2026-07-12)
    **Done:** `_LineItem.taxRate` is now nullable (unset by default); the GST dropdown shows "Select" with an amber border when unset and save is blocked until every line has a rate ("use 0% for exempt items"). "Add row" carries the previous line's chosen rate forward, so multi-line invoices pick once; catalog lines still auto-fill. Serialization coerces the (now-guaranteed) rate null-safe.
15. **Scan-review dates are raw `YYYY-MM-DD` text fields** — `bill_extract_screen.dart:813-814`. Use `showDatePicker` like everywhere else. — ✅ DONE (2026-07-12)
    **Done:** added a `_DateInput` tap-to-pick field (calendar icon, dd/mm/yyyy display, "Select date" when empty) that writes the ISO string back to the same controller, so `_save()`'s parse path is unchanged. Bill date + Due date now use it.
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
