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
- ⬜ (#36) P&L statement (management view — real-time operational, not statutory)
- ⬜ (#56) Balance Sheet (management view — assets, liabilities, equity snapshot)
- ⬜ (#37) Cash flow statement (direct method — where money comes from / goes)
- ⬜ (#57) Accrual accounting mode (currently cash-basis only — most CAs need accrual)
- ⬜ (#38) Expense analytics by category / vendor / period
- ⬜ (#39) Revenue analytics by customer / product / period
- ⬜ (#42) Comparison reports (MoM, YoY, budget vs actual)
- ⬜ (#12) Cash flow forecasting (AI — predict 30/60/90 day cash position)

### Dashboard & Notifications
- ⬜ (#40) Configurable dashboard widgets (user builds their own view)
- ⬜ (#41) Scheduled report emails (daily cash position, weekly AR aging)

### Workflow & Collaboration
- ⬜ (#43) Configurable approval workflows (multi-level, amount-based routing)
- ⬜ (#44) Mobile-optimized approval flow (one-tap approve from phone)
- ⬜ (#45) Comments & notes on transactions (in-context team communication)
- ⬜ (#46) Task assignments ("follow up with vendor X on invoice #123")
- ⬜ (#47) Activity timeline per entity (full history — who did what, when)
- ⬜ (#49) Maker-checker for high-value transactions

### Payables & Vendor Management
- ⬜ (#30) Vendor payment scheduling ("pay all approved bills due this week on Friday")
- ⬜ (#31) Early payment discount tracking (alert before discount expiry)
- ⬜ (#32) Purchase requisition → PO workflow (requestor → approver → PO)
- ⬜ (#33) Vendor rating / scorecard (delivery, quality, terms)
- ⬜ (#34) Contract & agreement management (store contracts, alert on renewal)
- ⬜ (#35) Advance payment tracking with auto-adjustment against future bills

### Integrations
- ⬜ (#50) E-commerce connectors (Shopify, WooCommerce — auto-create invoices)
- ⬜ (#51) Razorpay/Cashfree payout APIs (pay vendors from runq)
- ⬜ (#52) Tally bidirectional sync (import opening balances from Tally)
- ⬜ (#53) Google Sheets / Excel export (ad-hoc analysis, stakeholder sharing)
- ⬜ (#54) Slack/Teams notifications (payment approved, invoice overdue, cash low)
- ⬜ (#55) CA portal / shared read-only access (CA pulls reports + exports)

---

## Phase 5 — Xero-Inspired Features (from competitive analysis)

*Features inspired by Xero that strengthen runq for the Indian market.*

### Sales Workflow
- ⬜ (#58) Quote / estimate creation with branded templates
- ⬜ (#59) Quote-to-invoice conversion (one click, carry over line items)
- ⬜ (#60) Embedded "Pay Now" button on invoices (Razorpay/Cashfree checkout)

### Accounting Depth
- ⬜ (#61) Fixed asset register + depreciation schedules (straight-line, diminishing value)
- ⬜ (#62) Year-end adjustments + lock date enforcement
- ⬜ (#63) Multi-currency support (160+ currencies, auto exchange rates)
- ⬜ (#64) Cost center / branch tracking (multi-location P&L)
- ⬜ (#65) Item Master / Product Catalog (name, HSN, unit, GST rate — auto-fill on invoice)

### Expense Management
- ⬜ (#66) Employee expense claims (submit receipt → manager approves → reimburse)
- ⬜ (#67) Mileage / travel expense tracking
- ⬜ (#68) Corporate card transaction import + reconciliation

### AI — Next Level
- ⬜ (#69) Conversational AI finance assistant ("How much did we spend on logistics last month?")
- ⬜ (#70) AI cash flow forecasting (predict shortfalls 30/60/90 days out)
- ⬜ (#71) AI vendor negotiation insights (benchmark prices, suggest alternatives)
- ⬜ (#72) Auto-categorization rules that learn from manual corrections

### Platform
- ⬜ (#73) Mobile app (React Native — invoicing, approvals, dashboard on phone)
- ⬜ (#74) NEFT/RTGS batch payment file export (Indian net banking format)
- ⬜ (#75) Webhook API for external integrations (runq → your system events)
- ⬜ (#76) Multi-company per tenant (manage 2+ companies from one login)
- ⬜ (#77) White-label / reseller mode (for CAs managing multiple clients)

---

## Won't Build (Tally's Job)

- 🚫 GST return filing (GSTR-1, GSTR-3B)
- 🚫 E-invoicing IRN generation
- 🚫 E-way bill generation
- 🚫 TDS/TCS return filing
- 🚫 Statutory financial statements (Schedule III P&L, Balance Sheet)
- 🚫 Audit-ready reports for statutory compliance
- 🚫 Payroll (PF, ESI, PT — use dedicated payroll software)
- 🚫 Full app marketplace (too early — focus on core product)
- 🚫 Projects / time tracking (niche — let users use Toggl/Clockify)

---

## Summary

| Phase | Features | Status | Focus |
|-------|----------|--------|-------|
| 1 | 10 | ✅ Done | GST-aware invoicing + quick wins |
| 2 | 7 | ✅ Done | AI automation — demo-ready differentiation |
| 3 | 12 | ✅ Done | Banking + collections — daily time-saver |
| 4 | 26 | ⬜ Next | Financial statements, workflows, integrations — scale to larger teams |
| 5 | 20 | ⬜ Future | Xero-inspired — sales workflow, accounting depth, expense mgmt, AI v2, platform |
| **Total** | **75** | | |
