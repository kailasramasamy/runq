# RunQ Feature Roadmap — Post-MVP

**Positioning:** runq for daily finance operations, Tally for CA compliance. Export as bridge.

**Legend:** ✅ Done | 🔧 In Progress | ⬜ TBD | 🚫 Won't Build (Tally's job)

---

## Phase 1 — Strengthen Tally Bridge + Quick Wins

### GST-Aware Invoicing
*Not filing — just clean data so the Tally export is useful*

- ✅ (#1) HSN/SAC code master with search
- ✅ (#2) Auto tax calculation (CGST/SGST/IGST based on buyer/seller state)
- ✅ (#3) Place of supply logic (inter-state vs intra-state)
- ✅ (#4) Tax category support (exempt, nil-rated, zero-rated, reverse charge)
- ✅ (#5) GST-compliant invoice format (IRN-ready fields, QR placeholder)
- ✅ (#6) GSTIN validation (checksum + API lookup)
- ✅ (#7) TDS section tagging on vendor bills

### Quick Wins
- ✅ (#27) Recurring invoices (auto-generate for subscription/retainer clients)
- ✅ (#24) WhatsApp invoice delivery + payment reminders
- ✅ (#48) Document attachments on transactions (PO PDF, invoice scan, GRN photo)

### Follow-up (from Phase 1 testing)
- ⬜ Item Master / Product Catalog (name, HSN, unit, GST rate per product — auto-fill on invoice)

---

## Phase 2 — AI Differentiation

### AI-Powered Automation
- ✅ (#8) AI invoice data extraction (OCR + LLM — snap photo / upload PDF → auto-fill bill)
- ✅ (#9) AI bank transaction categorization (auto-suggest ledger account)
- ✅ (#15) Duplicate invoice detection (fuzzy match on vendor + amount + date)
- ✅ (#13) AI financial summaries (daily/weekly digest for business owner)
- ✅ (#10) Smart reconciliation suggestions (ML-based, learn from user corrections)
- ✅ (#11) Anomaly detection on expenses (flag unusual spends)
- ✅ (#14) Smart vendor payment prioritization (terms, discounts, relationship)

---

## Phase 3 — Banking & Payments

### Bank Integration
- ✅ (#16) Live bank feeds (mock/sandbox — auto-import transactions)
- ✅ (#17) Payment initiation via bank APIs (mock — approve → payment goes out)
- ✅ (#19) Multi-bank cash position dashboard (all balances in one view)
- ✅ (#20) Auto-reconciliation improvements (TDS deduction matching, PG settlement auto-match)
- ✅ (#22) Bank charge reconciliation (auto-identify fees, interest, penalties)

### Collections Acceleration
- ✅ (#18) UPI collection links on invoices (UPI deep link + copy button)
- ✅ (#23) Customer payment portal (token-based public page — outstanding + history)
- ✅ (#25) Advanced dunning rules (escalation levels: send → stop supply → escalate)
- ✅ (#26) Customer credit scoring (internal score based on payment history)
- ✅ (#28) Interest/penalty calculation on overdue invoices
- ✅ (#29) Collection agent assignment (assign overdue accounts, track follow-ups)

### Cheque & PDC
- ✅ (#21) Cheque tracking & post-dated cheque (PDC) management

---

## Phase 4 — Scale Features

### Financial Statements & Reporting (CRITICAL — needed for serious businesses)
- ✅ (#36) P&L statement (management view — real-time operational, not statutory)
- ✅ (#56) Balance Sheet (management view — assets, liabilities, equity snapshot)
- ✅ (#37) Cash flow statement (direct method — where money comes from / goes)
- ⬜ (#57) Accrual accounting mode (currently cash-basis only — most CAs need accrual)
- ✅ (#38) Expense analytics by category / vendor / period
- ✅ (#39) Revenue analytics by customer / product / period
- ✅ (#42) Comparison reports (MoM, YoY, budget vs actual)
- ✅ (#12) Cash flow forecasting (AI — predict 30/60/90 day cash position)

### Dashboard & Notifications
- ✅ (#40) Configurable dashboard widgets (user builds their own view)
- ✅ (#41) Scheduled report emails (daily cash position, weekly AR aging — with configurable email provider: Resend/SendGrid/SMTP, report renderer, background scheduler, Run Now)

### Workflow & Collaboration
- ✅ (#43) Configurable approval workflows (multi-level, amount-based routing)
- ⬜ (#44) Mobile-optimized approval flow (one-tap approve from phone)
- ⬜ (#45) Comments & notes on transactions (in-context team communication)
- ⬜ (#46) Task assignments ("follow up with vendor X on invoice #123")
- ✅ (#47) Activity timeline per entity (full history — who did what, when)
- ✅ (#49) Maker-checker for high-value transactions

### Payables & Vendor Management
- ✅ (#30) Vendor payment scheduling (batch vendor payments into scheduled runs for approval)
- ✅ (#31) Early payment discount tracking (per-vendor discount terms, savings calculator, urgency dashboard)
- ✅ (#32) Purchase requisition → PO workflow (create → edit → approve → convert to PO, pricing optional at creation)
- ✅ (#33) Vendor rating / scorecard (delivery, quality, pricing scores with period tracking)
- ✅ (#34) Contract & agreement management (store contracts, status tracking, renewal dates)
- ⬜ (#35) Advance payment tracking with auto-adjustment against future bills

### Integrations
- ⬜ (#50) E-commerce connectors (Shopify, WooCommerce — auto-create invoices)
- ⬜ (#51) Razorpay/Cashfree payout APIs (pay vendors from runq)
- ✅ (#52) Tally bidirectional sync (4-step migration wizard: Trial Balance → Outstanding AR → Outstanding AP → Bank Accounts, with CSV import, preview/mapping, auto-create customers/vendors)
- ✅ (#53) CSV export for all reports (P&L, Balance Sheet, Cash Flow, Expense/Revenue Analytics, Trial Balance, Journal Entries, Invoice Registers — from app + CA portal)
- ⬜ (#54) Slack/Teams notifications (payment approved, invoice overdue, cash low)
- ✅ (#55) CA portal / shared read-only access (slug-based link, P&L, Balance Sheet, Trial Balance, journal entries, invoice registers, Tally export)

---

## Phase 5 — Competitive Feature Gaps (from Xero + Zoho analysis)

*Features identified from Xero and Zoho Books competitive analysis that strengthen runq for the Indian market.*

### Sales Workflow
- ✅ (#58) Quote / estimate creation (create, send, accept/reject, expiry tracking)
- ✅ (#59) Quote-to-invoice conversion (one click, carry over line items) + quote-to-sales-order
- ⬜ (#60) Embedded "Pay Now" button on invoices (Razorpay/Cashfree checkout)

### Accounting Depth
- ✅ (#86) Auto-reconciliation to payment: bank recon match auto-marks invoices paid, creates receipts/payments
- ⬜ (#61) Fixed asset register + depreciation schedules (straight-line, diminishing value)
- ✅ (#62) Year-end adjustments + lock date enforcement (fiscal period lock/unlock, GL entry protection)
- ⬜ (#63) Multi-currency support (160+ currencies, auto exchange rates)
- ⬜ (#64) Cost center / branch tracking (multi-location P&L)
- ✅ (#65) Item Master / Product Catalog (name, SKU, HSN, unit, selling/purchase price, GST rate — auto-fill on invoices)

### Expense Management
- ✅ (#66) Employee expense claims (submit → approve/reject → reimburse, category-based line items)
- ⬜ (#67) Mileage / travel expense tracking
- ⬜ (#68) Corporate card transaction import + reconciliation

### AI — Next Level
- ✅ (#69) Conversational AI finance assistant (chat widget on dashboard, context-aware answers using Claude)
- ⬜ (#70) AI cash flow forecasting (predict shortfalls 30/60/90 days out)
- ⬜ (#71) AI vendor negotiation insights (benchmark prices, suggest alternatives)
- ⬜ (#72) Auto-categorization rules that learn from manual corrections

### Portals & Self-Service (from Zoho analysis)
- ✅ (#78) Vendor portal (slug-based public access — POs, outstanding bills, payment history)
- ✅ (#79) Sales orders (create, confirm, track, convert to invoice — complete Quote → SO → Invoice flow)
- ⬜ (#80) Retainer invoices (advance billing for ongoing engagements)
- ⬜ (#81) Custom report builder (slice data by any dimension — P&L by customer, expenses by category by month)

### Inventory (from Zoho analysis — for trading/distribution businesses)
- ⬜ (#82) Item master with stock tracking (qty on hand, reorder points, low-stock alerts)
- ⬜ (#83) Multi-warehouse / multi-location inventory
- ⬜ (#84) Batch and serial number tracking

### Platform
- ⬜ (#73) Mobile app (React Native — invoicing, approvals, dashboard on phone)
- ✅ (#74) NEFT/RTGS batch payment file export (standard Indian net banking CSV format)
- ✅ (#75) Webhook API for external integrations (endpoint management, HMAC signing, event subscriptions, test delivery)
- ⬜ (#76) Multi-company per tenant (manage 2+ companies from one login)
- ⬜ (#77) White-label / reseller mode (for CAs managing multiple clients)
- ⬜ (#85) Bank feed via Setu Account Aggregator (Indian RBI-approved real bank feeds)

---

## Phase 6 — Strategic Candidates (analysis 2026-07-13)

*Ranked by leverage. All ride existing rails (WhatsApp providers, UPI + pending_payments auto-match, AI extraction, agent framework, GL/GST). Full reasoning in the session that produced `store-pos-plan.md`. Not scheduled — dairy (Dhenu), GSTR-3B blockers (May deadline), and Store POS come first.*

### Tier 1 — take seriously
- ⬜ (#87) **Receivables auto-chase agent** — opt-in dunning: overdue → escalating WhatsApp reminders (7/15/30d) with UPI link → `pending_payments` auto-match on bank import stops the chase automatically. Closes the loop Vyapar can't (they can't *know* the customer paid). Extends existing #25 dunning rules from manual to autonomous. Cheap; natural fit as Store POS Phase 2/3 khata companion.
- ⬜ (#88) **CA multi-client portal** — one dashboard for a CA across all runq clients: filing readiness (GSTR-1 readiness checker exists), books-health flags, pending recon, review→file. Distinct from #55 (single-client read-only slug). This is a *distribution* play, not a feature — a CA with 50 clients is 50 warm intros; converts "clean books" into a pitch for the person who values it. Deserves a real 2026 roadmap slot. Related: #77 white-label/reseller mode.

### Tier 2 — cheap compounders
- ⬜ (#89) **WhatsApp-native operations** — (a) inbound: owner WhatsApps purchase-bill photo to a runq number → AI extract → draft AP bill (same flow as share-to-app, zero-install); (b) outbound: 8am owner digest — yesterday's sales, bank balance, receivables due this week, GST deadline countdown. Rides Interakt/Gupshup + AI extraction + report scheduler (#41). Digest = retention; inbound = habit.
- ⬜ (#90) **"Ask your books" agent on mobile** — extend #69 (web chat assistant) to mobile with action-taking: "how much does X owe me?", "items not moved in 90 days?", "send reminder to overdue customers". Owners can't read a trial balance; they can ask. Demos itself.
- ⬜ (#91) **Real bank feeds → books that write themselves** — productionize the ICICI CIB aggregator path (see `docs/icici-bank-api/`), and/or Setu AA (#85): daily auto-pull → auto-recon suggestions → owner just approves. End-state promise of the product; each bank added is moat. Slow-burn.

### Tier 3 — long-range, architect toward but don't build
- ⬜ (#92) **Embedded credit / invoice financing** — verified GST sales + real GL + bank recon + khata history = best-in-segment credit dataset; NBFC partnership for working capital is how Indian billing apps monetize beyond SaaS (Khatabook/BharatPe path). Regulatory + partnership heavy. 2027 option; keep data clean and consented so it stays open.

### Explicitly rejected (2026-07-13)
- 🚫 More horizontal modules (CRM, projects, e-commerce) — dilutes "daily ops + clean books" identity; already carrying finance/HR/inventory/manufacturing/dairy/store
- 🚫 Second vertical before dairy proves revenue (pharma distribution is the natural next — batch/expiry/FEFO already built — but *after*)

---

## Won't Build

> **Stale-list cleanup (2026-07-13):** the original "Tally's Job" list predates the strategy shift — GST filing (GSP integration, GSTR-1/3B), payroll (HR & Payroll module), and the mobile app (Flutter, not RN as #73 assumed) have all since been BUILT. Remaining true won't-builds:

- 🚫 Statutory financial statements (Schedule III P&L, Balance Sheet) — CA/Tally's job
- 🚫 Audit-ready statutory compliance reports
- 🚫 Full app marketplace (too early — focus on core product)
- 🚫 Projects / time tracking (niche — let users use Toggl/Clockify)

---

## Summary

| Phase | Features | Done | Status | Focus |
|-------|----------|------|--------|-------|
| 1 | 10 | 10 | ✅ Done | GST-aware invoicing + quick wins |
| 2 | 7 | 7 | ✅ Done | AI automation — demo-ready differentiation |
| 3 | 12 | 12 | ✅ Done | Banking + collections — daily time-saver |
| 4 | 26 | 19 | 🔧 In Progress | Financial statements, workflows, vendor management, integrations |
| 5 | 29 | 10 | 🔧 In Progress | Sales workflow, item master, expense claims, AI chat, vendor portal, webhooks, NEFT export |
| 6 | 6 | 0 | ⬜ Candidates | Auto-chase, CA multi-client portal, WhatsApp ops, mobile agent, bank feeds, embedded credit |
| **Total** | **90** | **58** | | |

**Related module plans (separate docs):** `store-pos-plan.md` (Store POS — counter billing), `dairy-sme-plan.md` + `dhenu-feature-roadmap.md` (dairy vertical), `hr-payroll-plan.md`, `inventory-plan.md`, `gst-filing-plan.md`.
