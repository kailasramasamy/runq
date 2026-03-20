# RunQ Finance-Accounting — Master Checklist

**Legend:** ✅ Decided | ⬜ TBD | 🚧 Deferred (post-MVP)

---

## Product Scope

- ✅ Target: SMEs and mid-market Indian businesses
- ✅ Industry-agnostic
- ✅ Works alongside Tally (not a replacement)
- ✅ Multi-tenant SaaS, shared infrastructure
- ✅ Single company per tenant
- ✅ No inter-company transactions
- 🚧 Multi-company per tenant
- 🚧 Inter-company transactions

---

## MVP Modules

- ✅ Accounts Payable (AP)
- ✅ Accounts Receivable (AR)
- ✅ Banking & Reconciliation
- 🚧 General Ledger & Chart of Accounts
- 🚧 Tax Management (GST/TDS/TCS)
- 🚧 Budgeting & Cost Control
- 🚧 Financial Reporting (P&L, Balance Sheet)

---

## AP — Accounts Payable

### Vendors
- ✅ Full onboarding: name, GSTIN, PAN, bank details, address
- ✅ Sync vendor data from WMS via API
- ✅ Soft delete (blocked if unpaid invoices)

### Purchase Orders
- ✅ Received from WMS webhook (read-only in runq)
- ✅ Line items with fractional quantities
- ⬜ WMS webhook payload spec — *blocked on Vaidehi*
- ⬜ WMS event structure (separate or bundled) — *blocked on Vaidehi*

### GRN
- ✅ Received from WMS webhook (read-only in runq)
- ✅ Tracks ordered vs received vs accepted vs rejected

### Purchase Invoices
- ✅ Receive from WMS webhook OR create manually
- ✅ 3-way matching: PO vs GRN vs Invoice
- ✅ Hard block on mismatch — no payment until resolved
- ✅ Status: draft → pending_match → matched → approved → partially_paid → paid
- ✅ Single approver (owner role)
- ✅ Denormalized amount_paid / balance_due

### Vendor Payments
- ✅ Bank transfer only (NEFT/RTGS/IMPS)
- ✅ Partial payments with allocation tracking
- ✅ Advance payments before invoice
- ✅ Advance adjustment against invoices

### Debit Notes
- ✅ For returns, shortages, quality issues
- ✅ Linked to vendor + optionally to invoice
- ✅ Status: draft → issued → adjusted → cancelled

---

## AR — Accounts Receivable

### Customers
- ✅ Two types: B2B + payment gateways
- ✅ Payment terms per customer (Net 15/30/60/custom)
- ✅ Soft delete (blocked if unpaid invoices)

### Sales Invoices
- ✅ Create invoices in runq
- ✅ Auto-numbering: INV-2526-0001 (FY-prefixed)
- ✅ Tenant-customizable format
- ✅ Race-safe sequence (SELECT FOR UPDATE)
- ✅ Status: draft → sent → partially_paid → paid → overdue → cancelled
- ✅ PDF generation → DO Spaces

### Payment Receipts
- ✅ Record incoming customer payments
- ✅ Partial payments with allocation
- ✅ Link to bank account

### Credit Notes
- ✅ Against invoice or standalone
- ✅ Status: draft → issued → adjusted → cancelled

### Dunning
- ✅ Automated reminders for overdue invoices
- ✅ Configurable rules (days, channel, template)
- ✅ Channels: email, SMS, WhatsApp
- ✅ Dunning log with delivery status

---

## Banking & Reconciliation

### Bank Accounts
- ✅ Unlimited per tenant
- ✅ Types: current, savings, overdraft, cash_credit
- ✅ Opening balance + running balance

### Bank Transactions
- ✅ CSV upload import
- ✅ Dedup on import
- ✅ Status: unreconciled → matched → manually_matched → excluded
- 🚧 Bank API integration

### Reconciliation
- ✅ Auto-match by UTR number
- ✅ Auto-match by amount + date
- ✅ Manual reconciliation UI
- ✅ Match links to AP payment or AR receipt
- ✅ Unmatch (undo) capability

### Petty Cash
- ✅ Per-location accounts with limits
- ✅ Expense + replenishment transactions
- ✅ Category tracking
- ✅ Owner approval required
- ✅ Receipt upload

### PG Reconciliation
- ✅ Import settlements from Razorpay, PhonePe, Paytm
- ✅ Per-gateway CSV parsers
- ✅ Auto-match by order_id / transaction_id
- ✅ Unmatched line tracking

---

## Integration

- ✅ Single webhook endpoint, event_type routing
- ✅ Async processing via Redis/BullMQ
- ✅ Retry failed events (max 3, exponential backoff)
- ✅ Idempotency via event_id dedup
- ✅ Inter-service auth: JWT with service signing keys (5 min TTL)
- ✅ Webhook event log with status tracking
- ⬜ WMS webhook payload spec — *blocked on Vaidehi*
- ⬜ WMS event structure — *blocked on Vaidehi*
- ⬜ Other systems in MVP (OMS, Delivery, HR) — *blocked on Vaidehi*

---

## UX / Admin Panel

- ✅ Users: business owner + accountant
- ✅ Desktop-only for MVP
- ✅ RBAC: owner (full), accountant (create/edit), viewer (read-only)
- ✅ Dashboard: 5 metrics (payables, receivables, cash, overdue, upcoming)
- ✅ Aging breakdowns (payables + receivables)
- 🚧 Mobile-responsive
- 🚧 Real-time updates (WebSocket)

---

## Tech Stack

- ✅ Monorepo: Turborepo + pnpm
- ✅ Backend: Fastify
- ✅ ORM: Drizzle ORM
- ✅ Database: PostgreSQL with RLS
- ✅ Cache/Queue: Redis + BullMQ
- ✅ Frontend: React + Vite (SPA)
- ✅ Routing: TanStack Router
- ✅ UI: shadcn/ui + Tailwind CSS
- ✅ Tables: TanStack Table
- ✅ Data fetching: TanStack Query
- ✅ Validation: Zod (shared frontend/backend)
- ✅ Process manager: PM2
- ✅ File storage: DO Spaces
- ✅ Node: 20 LTS
- ✅ Package manager: pnpm

---

## Theme & Design System

### Base
- ✅ Base background: zinc-50 (`#fafafa`) / dark: zinc-950
- ✅ Card background: white / dark: zinc-900
- ✅ Primary accent: indigo-600 (`#4f46e5`) / dark: indigo-400
- ✅ Muted: zinc-100 / dark: zinc-800
- ✅ Border: zinc-200 / dark: zinc-800
- ✅ Destructive: red-600 / dark: red-400
- ✅ Sidebar: zinc-900 (dark sidebar, light content)
- ✅ Sidebar foreground: zinc-100
- ✅ Light mode default, dark mode optional

### Status Palette
- ✅ Draft → Gray (neutral)
- ✅ Pending / Pending Match → Amber/Yellow (needs attention)
- ✅ Matched / Sent → Blue (in progress)
- ✅ Approved → Indigo (ready for action)
- ✅ Partially Paid → Cyan/Teal (partial completion)
- ✅ Paid / Completed → Green (done)
- ✅ Overdue → Red (urgent)
- ✅ Cancelled → Gray + strikethrough (inactive)

### Typography
- ✅ Body / Tables: Inter, 13-14px
- ✅ Numbers / Money: Inter with tabular figures (font-variant-numeric: tabular-nums)
- ✅ Headings: Inter Semibold, 16-20px
- ✅ Indian number formatting for ₹ (12,34,567.89)

---

## Database Design

- ✅ 29 tables across 6 modules
- ✅ RLS on all tables (except tenants)
- ✅ UUIDs for all PKs
- ✅ DECIMAL(15,2) for money
- ✅ DECIMAL(12,3) for quantities
- ✅ PostgreSQL enums for statuses
- ✅ Composite indexes for RLS performance
- ✅ updated_at trigger on all tables
- ✅ Migration sequence (24 steps)

---

## API Design

- ✅ 80 routes across 18 groups
- ✅ RESTful, `/api/v1` prefix
- ✅ JWT auth (user + service)
- ✅ RBAC matrix per endpoint
- ✅ Pagination with meta
- ✅ Zod validation on all inputs
- ✅ Webhook returns 202 (async)

---

## Architecture Docs

- ✅ `docs/finance-accounting-decisions.md` — All business decisions
- ✅ `docs/tracking.md` — This checklist
- ✅ `docs/database-schema.md` — 29 tables, indexes, RLS
- ✅ `docs/project-structure.md` — Needs React+Vite update
- ✅ `docs/api-routes.md` — 80 routes with examples

---

## GSD Workflow

Per feature: `SCHEMA → TYPES → API → UI → VERIFY`

| Step | What | Package | Agent |
|------|------|---------|-------|
| 1. Schema | Drizzle table + migration + RLS | packages/db | Sonnet |
| 2. Types + Validators | TS types + Zod schemas | packages/types + validators | Sonnet |
| 3. API | Routes + service + tests | apps/api | Sonnet (CRUD), Opus (complex logic) |
| 4. UI | Pages + forms + tables | apps/web | Sonnet |
| 5. Verify | End-to-end flow | Manual / seed data | — |

- Always backend-first, UI last
- Batch related features (e.g., vendor CRUD + list page together)
- Flag decision points, don't guess
- Mock WMS webhooks until spec arrives

---

## Implementation Phases

### Phase 0 — Scaffolding
- [ ] Init Turborepo + pnpm workspace
- [ ] packages/types
- [ ] packages/validators
- [ ] packages/db (schema, migration, RLS, seed)
- [ ] packages/ui
- [ ] apps/api (Fastify + plugins)
- [ ] apps/web (React + Vite + shadcn + TanStack Router/Query)
- [ ] `turbo dev` runs both apps
- [ ] Demo tenant seed

### Phase 1 — AP
- [x] Vendor CRUD (API + UI)
- [x] Purchase invoice CRUD (API + UI)
- [x] 3-way matching logic + UI
- [x] Payments with partial allocation (API + UI)
- [x] Advance payments + adjustments (API + UI)
- [x] Debit notes (API + UI)
- [ ] WMS webhook handler (blocked on spec)

### Phase 2 — AR
- [x] Customer CRUD (API + UI)
- [x] Sales invoice + FY auto-numbering (API + UI)
- [ ] Invoice PDF generation (deferred — needs wkhtmltopdf or puppeteer setup)
- [x] Payment receipts with allocation (API + UI)
- [x] Credit notes (API + UI)
- [x] Dunning rules + overdue tracking + reminders (API + UI)

### Phase 3 — Banking
- [x] Bank account CRUD (API + UI — card grid with masked numbers)
- [x] CSV import (API parser for HDFC/SBI/ICICI formats + 4-step import UI)
- [x] Auto-reconciliation (API: UTR match + amount/date match + UI with results)
- [x] Manual reconciliation UI (split view: unreconciled txns ↔ payments/receipts)
- [x] Petty cash (API + UI — accounts with utilization bars, approval workflow)
- [ ] PG settlement reconciliation (deferred — needs PG-specific CSV parsers)

### Phase 4 — Dashboard + Settings
- [x] Dashboard metrics + aging (API: 6 parallel queries + UI: StatsCards, aging bars, quick actions)
- [x] Company settings (API + UI)
- [x] Invoice numbering config (API + UI with live preview)
- [x] User management + RBAC (API: argon2 hashing, self-delete guard + UI: table, invite, role edit)
- [x] Auth: Login with tenant slug + JWT + auth provider

---

## Compliance — Deferred

- 🚧 GST (CGST/SGST/IGST, HSN-based)
- 🚧 GST returns (GSTR-1, GSTR-3B)
- 🚧 GSTR-2A/2B reconciliation
- 🚧 Input Tax Credit (ITC)
- 🚧 E-invoicing (IRN)
- 🚧 E-way bills
- 🚧 TDS deduction + returns
- 🚧 TDS certificates (Form 16A)
- 🚧 TCS (e-commerce)
- 🚧 RCM (Reverse Charge)

---

## Open TBDs — 3 items, all blocked on Vaidehi

| # | Item | Impact |
|---|------|--------|
| 1 | WMS webhook payload spec | Can't build webhook handler |
| 2 | WMS event structure (separate or bundled) | Affects event routing |
| 3 | Other systems in MVP (OMS, Delivery, HR) | May add webhook event types |

**These do NOT block Phase 0 or CRUD work.** We can mock webhook payloads and finalize later.
