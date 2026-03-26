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
- ⬜ (#16) Live bank feeds (ICICI/HDFC/Axis APIs — auto-import transactions)
- ⬜ (#17) Payment initiation via bank APIs (approve in runq → payment goes out)
- ⬜ (#19) Multi-bank cash position dashboard (all balances in one view)
- ⬜ (#20) Auto-reconciliation improvements (match PG settlements, bank charges, TDS deductions)
- ⬜ (#22) Bank charge reconciliation (auto-identify fees, interest, penalties)

### Collections Acceleration
- ⬜ (#18) UPI collection links on invoices (send invoice → customer pays → auto-reconcile)
- ⬜ (#23) Customer payment portal (shared link — view outstanding, pay online)
- ⬜ (#25) Advanced dunning rules (escalation: email → WhatsApp → call task → stop supply)
- ⬜ (#26) Customer credit scoring (internal score based on payment history)
- ⬜ (#28) Interest/penalty calculation on overdue invoices
- ⬜ (#29) Collection agent assignment (assign overdue accounts, track follow-ups)

### Cheque & PDC
- ⬜ (#21) Cheque tracking & post-dated cheque (PDC) management

---

## Phase 4 — Scale Features

### Reporting & Dashboards
- ⬜ (#36) P&L statement (management view — real-time operational, not statutory)
- ⬜ (#37) Cash flow statement (direct method — where money comes from / goes)
- ⬜ (#38) Expense analytics by category / vendor / period
- ⬜ (#39) Revenue analytics by customer / product / period
- ⬜ (#40) Configurable dashboard widgets (user builds their own view)
- ⬜ (#41) Scheduled report emails (daily cash position, weekly AR aging)
- ⬜ (#42) Comparison reports (MoM, YoY, budget vs actual)
- ⬜ (#12) Cash flow forecasting (AI — predict 30/60/90 day cash position)

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

## Won't Build (Tally's Job)

- 🚫 GST return filing (GSTR-1, GSTR-3B)
- 🚫 E-invoicing IRN generation
- 🚫 E-way bill generation
- 🚫 TDS/TCS return filing
- 🚫 Statutory financial statements (Schedule III P&L, Balance Sheet)
- 🚫 Audit-ready reports for statutory compliance

---

## Summary

| Phase | Features | Focus |
|-------|----------|-------|
| 1 | 10 | GST-aware invoicing + quick wins — make Tally export production-ready |
| 2 | 7 | AI automation — the "wow" factor, demo-ready differentiation |
| 3 | 12 | Banking + collections — biggest daily time-saver for finance teams |
| 4 | 24 | Reporting, workflows, integrations — scale to larger teams |
| **Total** | **53** | |
