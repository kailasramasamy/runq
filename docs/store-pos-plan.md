# Store (POS) Module — Counter Billing for Retail Stores

> **Status (2026-07-13): 📝 Plan.** Analysis done, architecture agreed in principle. Two open decisions (§8) to settle before build.

> **Problem:** hardware / paint / electrical stores run checkout through a dedicated "billing person" on a desktop billing app. Salesperson relays items verbally, billing person searches each item and prepares the bill. Slow, error-prone, and the bill lives outside the books — the CA re-enters everything into Tally later.

> **Goal:** all-mobile counter billing with minimal human intervention. Item search on the phone, cart, discounts, tender (cash / UPI QR / credit), invoice WhatsApped to the customer — and every sale **is** a ledger entry that flows into GSTR-1 automatically.

---

## 1. Overview

### Core architectural stance — decided

**A POS sale IS a sales invoice.** The Store module is a *workflow layer* (fast-capture billing UI, tender flow, day-close), not a *data layer*. No separate `store_sales` table. The moment Store gets its own sales records that "sync" to finance, we've rebuilt the two-system problem we're killing (Vyapar bills → CA re-enters into Tally). Same pattern as Dhenu: vertical UX on shared finance rails.

- Sale → existing AR invoice service (`gl.postSalesInvoice`), create+send in one step (revenue posts on send).
- Stock-out → existing inventory stock ledger / delivery service.
- GST → nothing to build; GSTR-1 generator already reads from `salesInvoices`. Counter sales land in B2CS; optional GSTIN capture flips to B2B.

**Why a module and not screens inside Finance (settled 2026-07-13):** mobile Finance is gated admin-only — `apps/mobile/lib/providers/app_role_provider.dart` (`canAccessFinance => AppRole.admin`). A salesperson billing at the counter must NOT need admin (bank balances, P&L, GST). A `store` module code rides the existing tenant-ceiling × per-user-grant access system, exactly like HR walls off non-admins. The module is thin — navigation + access scoping over reused rails — not a parallel data model.

### Target ICP
- Hardware, paint, electrical, sanitary, general trade stores
- 500–10,000 SKUs, 1–3 counters, 1 location (multi-location later)
- Owner + 1–3 salespeople; the "billing person + desktop" is the role being displaced
- Heavy contractor/painter/electrician clientele buying on running credit (khata)

### Reuse map (verified 2026-07-13)

| Capability | Status | Entry point |
|---|---|---|
| Module framework + per-user access | ✅ exists | `apps/api/src/hooks/module-access.ts`, `plugins/tenant-context.ts` |
| Module switcher web/mobile | ✅ exists | `web .../layout/sidebar.tsx` (`ModuleSwitcher`), `mobile .../app_module_provider.dart` |
| Inventory (items, batches, warehouses, stock ledger) | ✅ shipped | `apps/api/src/modules/inventory/` |
| Sales invoice → GL | ✅ exists | `ar/invoice.service.ts` → `gl.postSalesInvoice` |
| UPI QR + pending_payments auto-match | ✅ exists | `utils/upi/upi-link.ts`, `banking/pending-payment-match.service.ts` |
| Cash receipt | ✅ exists | `ar/receipt.service.ts` |
| Invoice PDF (Puppeteer) | ✅ exists | `ar/invoice-pdf.ts` |
| WhatsApp send (Interakt/Gupshup) | ✅ exists | `utils/messaging/`, `invoice.service.ts sendInvoiceWhatsApp()` |
| GSTR-1/3B from invoices | ✅ exists | `gst/gstr1-generator.ts` |
| Barcode scanning (ML Kit) | ✅ in app | mobile (R8 keep rules already landed) |
| Mobile offline write queue | ⚠️ mfg only | `mobile/lib/services/wo_run_queue.dart` — copyable pattern |
| **Fast counter-billing UI / tender / day-close** | ❌ missing | **this module** |

### Explicit non-goals (v1)
- Gateway dynamic QR / real-time payment webhook (Phase 2, opt-in — has per-txn cost)
- Voice search (Phase 3 experiment), image search (probably never — fuzzy text + aliases beats it)
- Thermal printer support (Phase 2)
- Multi-counter sessions / shift handover (Phase 3)
- Loyalty, promotions engine, e-commerce
- Weighing-scale / cut-length (wire, pipe) UoM automation — sell as decimal qty in v1

### Strategic wedge

| Competitor | Where runq wins |
|---|---|
| **Vyapar / myBillBook** | Their bill is a silo; ours *is* the ledger entry *is* the GSTR-1 line. No CA re-entry. |
| **Tally + billing person** | The role we displace. Mobile at the counter, no desktop, no relay. |
| **OkCredit / Khatabook** | Khata that's actually in the books and GST-filed, with real receipts/allocation. |
| **Zoho POS-ish stack** | India-first, bundled with our finance/inventory/GST, one-tenant data. |

Wedge: **"The bill at the counter is the ledger entry is the GSTR-1 line."** Nobody serving this segment has that.

---

## 2. Architecture

### 2.1 Module boundaries

- New top-level module: `store` (mirrors `inventory`, `hr`). Add to `ModuleCode` union in `@runq/types`, web `MODULES` array, mobile `AppModule` enum.
- **Owns:** billing screen, cart, tender flow, counter sale preset, day-close (Z-report), **Sales Pulse analytics home**, store settings (default warehouse, UPI VPA, invoice series).
- **Reuses (does not duplicate):** items master, stock ledger, AR invoices/receipts, customer master, UPI link gen, pending_payments, invoice PDF, WhatsApp messaging, GST generators.

### 2.2 Code layout

```
apps/api/src/modules/store/
  routes.ts                // mounts /api/v1/store, requireModule('store')
  sale.service.ts          // orchestrator: cart → AR invoice (sent) + stock-out + receipt/pending-payment, one DB txn
  day-close.service.ts     // Z-report: bills, cash vs drawer, UPI vs matched, credit extended
  settings.service.ts      // per-store config: warehouse, VPA, series, default customer

packages/db/src/schema/store/
  store-settings.ts
  day-closes.ts            // one row per store per day: declared cash, computed totals, variance
  // NO store_sales table — sales are AR invoices tagged source='pos'

apps/web/src/routes/store/
  index.tsx                // dashboard: today's sales, tender split, day-close status
  sales/                   // list (filtered AR invoices source=pos), detail → existing invoice detail
  day-close/               // list, detail, close screen
  settings/

apps/mobile/lib/screens/store/
  store_home_screen.dart          // Sales Pulse (§3.6): live today analytics + "New Sale"; role-stripped for salesperson
  store_billing_screen.dart       // THE screen: search + scan + cart, keyboard-optimized
  store_tender_screen.dart        // cash / UPI QR / credit
  store_sale_done_screen.dart     // confirmation + WhatsApp/share/print actions
  store_day_close_screen.dart
  store_customer_khata_screen.dart // outstanding balance + receipts (reuses AR data)
  widgets/
    store_item_search_field.dart  // fuzzy text + short-code + barcode scan
    store_cart_line.dart
    store_upi_qr_sheet.dart
```

### 2.3 Sale orchestration (the only real backend work)

`POST /store/sales` — one call, one DB transaction:

1. Resolve customer: named customer (khata/B2B) or tenant's "Walk-in Customer" default; optional phone (for WhatsApp) and GSTIN (flips B2CS→B2B).
2. Create AR sales invoice via existing `invoice.service` with `source='pos'` + counter series; **create and send in one step** (revenue recognizes on send — existing behavior).
3. Stock-out through inventory delivery/stock-ledger path (COGS JE via existing `gl-poster`).
4. Tender:
   - **cash** → `ar/receipt.service` receipt, `payment_method='cash'`, allocated to the invoice.
   - **upi_qr** → create `pending_payments` row (amount + upiRef window) tied to the invoice; salesperson taps "Paid" after seeing customer's success screen; auto-match confirms at bank import, mismatches flagged (trust-but-reconcile, §8 D1).
   - **credit** → no receipt; invoice stays outstanding on the customer (khata). Settlement later through existing AR receipts/allocation.
5. Idempotency: client-generated `idempotency_key`, unique `(tenant_id, idempotency_key)` — required for the offline queue replay.
6. Post-commit (best-effort, non-blocking): WhatsApp invoice PDF via existing `sendInvoiceWhatsApp()`.

No new GL logic. No new GST logic. §2.3 step 2–4 are calls into shipped services.

### 2.4 Offline-first (non-negotiable, designed in from day one)

A counter that freezes when the network blips is a returned product.

- Item master + prices + customer list sync to local Hive cache (delta sync on app foreground).
- Sale POST goes through an offline queue: copy `wo_run_queue.dart` pattern — Hive box + `connectivity_plus` drain on reconnect/foreground + idempotency key replay.
- Offline constraints: cash + credit tenders queue freely; UPI QR works offline (static VPA QR renders locally) with the pending_payment created on drain; WhatsApp send happens on drain.
- On-hand quantities shown from cache with staleness indicator; negative-stock allowed at counter (warn, don't block — configurable).

### 2.5 RBAC

| Role | Billing | Discounts | Day-close | Khata view | Settings |
|---|---|---|---|---|---|
| owner | full | full | full | full | full |
| accountant | full | full | full | full | view |
| salesperson *(new or reuse `sales`)* | full | up to per-user cap % | declare drawer only | view | — |
| viewer | — | — | view | view | — |

Per-salesperson discount cap is a store setting; above-cap needs owner PIN/approval on device.

---

## 3. Product decisions already made

### 3.1 Item search: text + barcode first, voice later, image never
Hardware/electrical mostly barcoded (paint less so). Barcode scan is deterministic and ML Kit already ships in the app. Voice in a noisy store with Tamil/Hindi/English mixed product names is an accuracy minefield; image search on "a pipe fitting" is worse. For non-barcoded/loose items, invest in **fuzzy text search + per-store item aliases** ("2 inch elbow", "apex 1L") + short-codes. Voice = Phase 3 experiment behind a flag.

### 3.2 Credit sales (khata) are v1 — the killer feature
Hardware stores run on contractor credit; the ledger notebook is *why the billing person exists*. AR already does customer balances, receipts, allocation. Store module adds only: "Credit" tender button, customer picker with outstanding balance inline, khata screen. Differentiator: **khata that's in the books and GST-filed.** Phase 3: WhatsApp khata statement (reuse Dhenu pour-statement PDF pattern).

### 3.3 UPI confirmation: trust-but-reconcile in v1
Static VPA QR → customer pays → salesperson eyeballs success screen → taps "Paid" → `pending_payments` auto-matches at bank import, mismatches surface in day-close and banking. This is exactly today's paper-QR-on-counter behavior *plus* a reconciliation safety net they've never had — the safety net is itself a selling point. Gateway dynamic QR with webhook (Razorpay/PhonePe, ~0.2–0.3%/txn) is Phase 2 opt-in.

### 3.4 Day-close / Z-report closes the owner's trust loop
Owner's anxiety isn't billing speed — it's "did all the money reach the drawer/bank?" Daily close per store: bill count/total, cash total vs declared drawer count, UPI total vs matched pending-payments (with unmatched list), credit extended, discounts given (by salesperson). Small feature, big trust.

### 3.5 B2B capture at the counter
One optional "Add GSTIN" field on tender screen. Existing GSTR-1 classifier does the B2CS→B2B flip. Zero backend work.

### 3.6 Sales Pulse — instant analytics as the module home
The Store home screen IS the owner's live sales dashboard, refreshed after every sale (and pull-to-refresh). Because sales are AR invoices with COGS posted per line, we can show **real-time gross margin tied to the books** — something Vyapar/Khatabook structurally cannot.

**Owner view (v1):**
- Today ticker: net sales, bill count, avg bill value, hourly sparkline
- Tender split: cash / UPI (matched vs pending) / credit
- vs yesterday + vs same weekday last week
- Top 5 items and categories today (qty + value)
- Gross margin today (sales − COGS from posted JEs)
- Credit extended today + total khata outstanding
- Day-close status chip

**Salesperson view (same screen, role-stripped):** "New Sale" primary action + own bill count/value today. No margins, no totals, no khata aggregate.

**Implementation:** `GET /store/analytics/today` — direct queries over `salesInvoices` (source=pos) + receipts + pending_payments + stock-ledger COGS. No pre-aggregation tables at SME scale (<1k bills/day); revisit only if p95 exceeds ~500ms. Weekly/monthly trends live in the existing Finance analytics module (owner already has access) — Store home stays *today-focused*.

---

## 4. API surface

```
POST   /store/sales                     // §2.3 orchestrator (idempotent)
GET    /store/sales?date=&tender=       // filtered view over AR invoices source=pos
POST   /store/sales/:id/whatsapp        // resend invoice
GET    /store/analytics/today           // Sales Pulse (§3.6); role-stripped for salesperson
GET    /store/day-close/current         // running totals for today
POST   /store/day-close                 // declare drawer cash, freeze day
GET    /store/day-closes                // history
GET    /store/khata?customerId=         // outstanding + recent (proxy over AR)
GET/PUT /store/settings
GET    /store/items/search?q=           // fuzzy + alias + barcode lookup (thin over items master)
POST   /store/items/:id/aliases        // per-store search aliases
```

Mobile sync endpoints reuse existing inventory/masters list APIs with `updated_since` delta params (add if missing).

---

## 5. Surfaces

### Mobile (primary — this is the product)
Billing screen quality bar: **≤3 taps from app-open to scanning the first item; ≤10s to bill a 5-item cart with barcode.** Search field always focused, scan button thumb-reachable, qty steppers on cart lines, line + bill-level discount, running total always visible. Standard mobile rules apply: RunqText tokens, `keyboardDismissBehavior: onDrag`, dark mode, `TextCapitalization` conventions.

### Web (secondary — owner/back-office)
Dashboard, sales list (→ existing invoice detail), day-close review, settings, alias management. No web billing screen in v1.

---

## 6. Phasing

### Phase 1 — The wedge (v1)
- Module registration (types, switcher web+mobile, `requireModule('store')`)
- `sale.service` orchestrator + idempotency + `source='pos'` tagging
- Mobile billing screen (fuzzy search + aliases + barcode + cart + discounts)
- Tenders: cash, UPI static QR (trust-but-reconcile), credit/khata
- Walk-in customer default + optional phone/GSTIN capture
- WhatsApp invoice on sale
- Offline queue (item cache + sale queue) — day one, not retrofit
- Sales Pulse analytics home (owner + salesperson views)
- Day-close Z-report (mobile + web view)
- Web: dashboard, sales list, day-close, settings

### Phase 2
- Gateway dynamic QR (Razorpay) with webhook real-time confirm — opt-in per tenant
- Price tiers (contractor vs retail rate on customer)
- Thermal printer (ESC/POS over Bluetooth) receipt
- Barcode label printing for unlabeled stock
- Sales returns at counter (credit note flow — reuses GST amendment CN work)

### Phase 3
- Voice search experiment (flagged)
- Multi-counter sessions / shift handover
- WhatsApp khata statement to customer (Dhenu statement-PDF pattern)
- Reorder suggestions surfaced to owner from POS velocity

---

## 7. Acceptance criteria (v1)

- [ ] A 5-item barcode sale completes in ≤10s and produces: sent AR invoice, stock-ledger entries, COGS+sales JEs, GSTR-1 B2CS line — verified end-to-end in one flow
- [ ] Same sale with GSTIN lands in GSTR-1 B2B
- [ ] Cash sale creates allocated receipt; UPI sale creates pending_payment that auto-matches on statement import; credit sale shows in customer outstanding
- [ ] Airplane-mode sale queues and replays exactly once on reconnect (idempotency proven)
- [ ] Day-close totals reconcile against invoice/receipt/pending-payment sums; variance surfaces
- [ ] WhatsApp invoice delivers with PDF
- [ ] Sales Pulse reflects a completed sale within one refresh; salesperson view hides margins/totals; gross margin ties to posted COGS JEs
- [ ] Salesperson role cannot exceed discount cap without owner approval
- [ ] All mobile screens pass dark-mode + font-token checks

---

## 8. Open decisions

| # | Decision | Options | Leaning |
|---|---|---|---|
| D1 | v1 UPI confirmation | (a) trust-but-reconcile static QR (b) gateway dynamic QR day-one | **(a)** — ₹0/txn, matches current behavior, reuses pending_payments; (b) becomes Phase 2 opt-in |
| D2 | Khata in v1? | (a) yes (b) defer | **(a)** — near-free on AR rails, displaces the billing person's actual job |
| D3 | Salesperson role | reuse existing `sales` role vs new `salesperson` | TBD at build — check collisions with inventory RBAC |
| D4 | Negative stock at counter | warn vs block | warn (configurable), don't lose the sale |

---

## 9. Tracker

| Item | Status |
|---|---|
| Analysis + reuse map | ✅ 2026-07-13 |
| D1/D2 sign-off | ⬜ |
| Phase 1 build | ⬜ |
| Phase 2 | ⬜ |
| Phase 3 | ⬜ |
