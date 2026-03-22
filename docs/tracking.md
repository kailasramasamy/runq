# RunQ Finance-Accounting — Master Checklist

**Legend:** ✅ Done | ⬜ TBD | 🚧 Deferred (post-MVP)

---

## Product Scope

- ✅ Target: SMEs and mid-market Indian businesses
- ✅ Industry-agnostic
- ✅ Works alongside Tally (not a replacement)
- ✅ Multi-tenant SaaS, shared infrastructure
- ✅ Single company per tenant
- 🚧 Multi-company per tenant
- 🚧 Inter-company transactions

---

## AP — Accounts Payable

### Vendors
- ✅ Full onboarding: name, GSTIN, PAN, bank details, address
- ✅ Vendor categories (raw_material, service_provider, logistics, utilities, equipment, other)
- ✅ Soft delete (blocked if unpaid invoices)
- ✅ Vendor sync via API (`POST /vendors/sync` — upsert by wmsVendorId or name)
- ✅ Vendor CSV import (`POST /vendors/import`)
- ✅ Vendor webhook handler (vendor.created / vendor.updated events)
- ✅ Quick vendor creation from payment queue (inline form for unmatched)

### Purchase Orders & GRN
- ✅ Received from WMS webhook (read-only in runQ)
- ✅ Line items with fractional quantities
- ⬜ WMS webhook payload spec — *blocked on Vaidehi*

### Purchase Invoices (Bills)
- ✅ Create manually OR receive from WMS webhook
- ✅ 3-way matching: PO vs GRN vs Invoice — hard block on mismatch
- ✅ Optional matching: bills without PO can be approved directly
- ✅ Status lifecycle: draft → pending_match → matched → approved → partially_paid → paid
- ✅ Cancel pending_match bills (for revised invoices)
- ✅ Single approver (owner role)

### Vendor Payments
- ✅ Regular payment (against approved bills, with allocation)
- ✅ Partial payments with allocation tracking
- ✅ Advance payments (before invoice, adjust later)
- ✅ Direct payment (skip bill — for payments without invoices)
- ✅ Bulk payment — manual batch (multiple vendors at once)
- ✅ Bulk payment — CSV import (vendor name matching)
- ✅ Payment instruction queue (external system → pending approval → execute)
- ✅ Bank account dropdown (not UUID text input)
- ✅ Newest payments shown first
- 🚧 Payment integration — ICICI/Axis direct API
- 🚧 Payment integration — RazorpayX/Cashfree
- 🚧 Payment file export (CSV for net banking upload)

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
- ✅ Create invoices in runQ
- ✅ Auto-numbering: VMP-2526-0001 (FY-prefixed, tenant-customizable)
- ✅ Race-safe sequence (atomic upsert)
- ✅ Status: draft → sent → partially_paid → paid → overdue → cancelled
- ✅ Send invoice (mark as sent)
- ✅ Mark as paid (manual)
- 🚧 Invoice PDF generation

### Payment Receipts
- ✅ Record incoming customer payments
- ✅ Partial payments with allocation
- ✅ Link to bank account

### Credit Notes
- ✅ Against invoice or standalone
- ✅ Status: draft → issued → adjusted → cancelled
- ✅ Apply credit note to invoice (adjusts balance)

### Dunning
- ✅ Configurable rules (days after due, channel, template)
- ✅ Overdue invoice detection
- ✅ Send reminders (email/SMS/WhatsApp — logged)
- ✅ Dunning log with invoice number, customer name, email

---

## Banking & Reconciliation

### Bank Accounts
- ✅ Unlimited per tenant
- ✅ Types: current, savings, overdraft, cash_credit
- ✅ Opening balance + running balance

### Bank Transactions
- ✅ CSV upload import (HDFC/SBI/ICICI formats)
- ✅ Dedup on import
- ✅ Auto-select first account on transactions page
- 🚧 Bank API integration (auto-import statements)

### Reconciliation
- ✅ Auto-match by UTR number
- ✅ Auto-match by amount + date (±1 day)
- ✅ Manual reconciliation UI
- ✅ Unmatch (undo) capability

### Petty Cash
- ✅ Per-location accounts with limits
- ✅ Expense + replenishment transactions
- ✅ Category tracking
- ✅ Approval workflow
- ✅ Full-width table layout

### PG Reconciliation
- ✅ Import settlements from Razorpay, PhonePe, Paytm
- ✅ Per-gateway CSV parsers
- ✅ Auto-match settlement lines against AR receipts
- ✅ Unmatched line review

---

## Dashboard & Settings

### Dashboard
- ✅ 5 key metrics (payables, receivables, cash position, overdue, upcoming 7d)
- ✅ Payables aging chart (current → 90+ days, color-coded bars)
- ✅ Receivables aging chart
- ✅ Quick actions (new bill, invoice, payment, receipt, bank import)

### Settings
- ✅ Company settings (FY start month, payment terms, currency)
- ✅ Invoice numbering customization (prefix, format, live preview)
- ✅ User management (create, edit role, delete with guards)
- ✅ RBAC: owner (full), accountant (create/edit), viewer (read-only)

### Auth
- ✅ Login with tenant slug + email + password
- ✅ JWT tokens (user + service)
- ✅ Argon2 password hashing
- ✅ Dev auto-login (skip login page in development)
- ✅ Auth provider with token persistence

---

## UX / Design System

### Components (12)
- ✅ Button (5 variants, 3 sizes, loading spinner)
- ✅ Badge (8 color variants, dark mode)
- ✅ Card / CardHeader / CardContent / CardFooter
- ✅ Input / Select / Textarea / DateInput (with labels, errors, dark mode)
- ✅ Table / TableHeader / TableBody / TableRow / TableCell / Th
- ✅ PageHeader with breadcrumbs
- ✅ EmptyState with icons
- ✅ Skeleton / TableSkeleton / CardSkeleton
- ✅ Pagination (smart ellipsis)
- ✅ ConfirmationDialog (replaced all browser confirm())
- ✅ ToastProvider / useToast
- ✅ StatsCard with trend indicators

### Theme
- ✅ Dark mode default, light mode toggle
- ✅ Zinc base + indigo accent
- ✅ Status color palette (8 statuses)
- ✅ Inter font with tabular-nums for money
- ✅ Lucide React icons (professional SVG icons)
- ✅ runQ logo (SVG, League Spartan font)
- ✅ Left-aligned forms (F-pattern, not centered)
- ✅ Dark mode calendar icon fix

---

## Integration

- ✅ Webhook endpoint (`POST /webhooks/wms`) — processes vendor events
- ✅ Vendor sync API (`POST /vendors/sync`) — upsert by ID or name
- ✅ Vendor CSV import (`POST /vendors/import`)
- ✅ Payment instruction queue (`POST /payment-queue`) — external system batches
- ✅ Inter-service auth: JWT with service signing keys
- ⬜ WMS webhook payload spec for PO/GRN/Invoice events — *blocked on Vaidehi*
- 🚧 Payment provider integration (ICICI/Axis/RazorpayX)
- 🚧 Payment file export (CSV for net banking)

---

## Tech Stack

- ✅ Monorepo: Turborepo + pnpm
- ✅ Backend: Fastify
- ✅ ORM: Drizzle ORM
- ✅ Database: PostgreSQL with RLS (31+ tables)
- ✅ Cache/Queue: Redis
- ✅ Frontend: React + Vite (SPA)
- ✅ Routing: TanStack Router
- ✅ UI: shadcn-style design system + Tailwind CSS v4
- ✅ Data fetching: TanStack Query
- ✅ Validation: Zod (shared frontend/backend)
- ✅ Icons: Lucide React
- ✅ Node: 22 LTS
- ✅ Package manager: pnpm 10

---

## Testing

- ✅ 49/49 automated E2E tests passing (all 4 phases)
- ✅ Real-life scenario walkthrough (dairy business)
- ✅ PG reconciliation tested (3 gateways)
- ✅ Bulk payment CSV import tested
- ✅ Payment instruction queue tested
- ✅ Vendor sync API + CSV import tested

---

## Commits

| # | Hash | Description |
|---|------|-------------|
| 1 | 606be2b | MVP — Phase 1-4 (238 files, 27K lines) |
| 2 | edc9585 | PG reconciliation — Razorpay/PhonePe/Paytm |
| 3 | 1734c45 | Fix: PG recon hook URLs |
| 4 | dafa65b | Optional 3-way matching (bills without PO) |
| 5 | 795c123 | Fix: dropdown limit 200 → 100 |
| 6 | a3ef555 | Fix: bugs from real-life testing |
| 7 | ece8615 | Credit note adjustment |
| 8 | 2e007d5 | Direct payment, vendor categories, batch payment |
| 9 | 224232e | Fix: bulk payment limit |
| 10 | 226ddf7 | Fix: bulk payment UX, newest first |
| 11 | a8ed52e | Fix: left-align all forms |
| 12 | 1ca2faa | Docs: payment integration plan |
| 13 | 03ac4b7 | Payment instruction queue |
| 14 | 46f047f | Quick vendor creation from queue |
| 15 | 79e7ea4 | Vendor sync — API + CSV + webhook |

---

## Remaining Work

### Must do before production
- ⬜ Searchable dropdown (combobox) for vendor/customer selects
- ⬜ Invoice PDF generation
- ⬜ Payment file export (CSV for net banking upload)
- ⬜ WMS webhook spec for PO/GRN/Invoice events
- ⬜ RLS policies actually enforced (currently schema-only, not applied)
- ⬜ Production deployment config (PM2, Nginx, SSL)
- ⬜ Error monitoring (Sentry)

### Nice to have
- 🚧 Payment provider integration (ICICI/Axis/RazorpayX)
- 🚧 Searchable/filterable TanStack Table upgrade
- 🚧 Mobile-responsive layout
- 🚧 Real-time updates (WebSocket)
- 🚧 General Ledger & Chart of Accounts
- 🚧 GST/TDS compliance
- 🚧 Financial reporting (P&L, Balance Sheet)
- 🚧 Budgeting & Cost Control
- 🚧 Multi-company per tenant
- 🚧 Recurring payment scheduler
- 🚧 Tally export format
- 🚧 Notifications module (email/SMS/WhatsApp on payment.completed, invoice.sent, batch.executed)
- 🚧 Outbound webhooks (runQ → external systems for payment/invoice status updates)
