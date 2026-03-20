# Finance & Accounting Module — Decisions & TBDs

## Decisions (Locked)

### Target Market
- **Customers**: SMEs and mid-market Indian businesses
- **Industry**: Industry-agnostic (not limited to quick-commerce)
- **Positioning**: Works alongside Tally — not a replacement. Export-friendly, not competing on compliance.

### Multi-Tenancy & Company Structure
- **Multi-tenant SaaS**: Yes — each tenant is isolated, shared infrastructure
- **Multi-company per tenant**: No (single company per tenant for now)
- **Inter-company transactions**: Not in scope

### Compliance Scope — DEFERRED
- GST, TDS, TCS, RCM, E-invoicing, E-way bills — all skipped for now
- PF, ESI, Professional Tax — HR module scope
- ROC/MCA filings — not in scope

### MVP Sub-Modules (Phase 1)
| Sub-Module | Status |
|------------|--------|
| Accounts Receivable (AR) — Invoicing | **MVP** |
| Accounts Payable (AP) — Bills & Vendor Payments | **MVP** |
| Banking & Reconciliation | **MVP** |
| General Ledger & Chart of Accounts | **Deferred** |
| Tax Management (GST/TDS) | **Deferred** |
| Budgeting & Cost Control | **Deferred** |
| Financial Reporting (P&L, Balance Sheet) | **Deferred** |

### Core Flow (MVP)
1. Receive purchase invoice from WMS via API/webhook
2. Match invoice against PO + GRN (3-way matching) — **hard block on mismatch**
3. Single approver approves payment
4. Track AR (customer invoices) and AP (vendor bills)
5. Bank reconciliation — match payments with bank transactions

---

### AP — Accounts Payable
- **3-way matching**: Hard block — payment cannot proceed if PO, GRN, and Invoice don't match
- **Approval workflow**: Single approver (owner/manager clicks approve)
- **Partial payments**: Yes — pay ₹30K against a ₹50K invoice, track balance
- **Advance payments**: Yes — advance to vendors before invoice, adjust later
- **Payment methods**: Bank transfer only (NEFT/RTGS/IMPS) for MVP
- **Debit notes**: Yes — for returns/shortages/quality issues
- **Vendor onboarding**: Full — name, GSTIN, PAN, bank details (account number, IFSC), address. Can also pull vendor data from WMS via API.

### AR — Accounts Receivable
- **Customers in AR**: Both B2B clients and payment gateways
- **Invoice creation**: Create invoices in runq
- **Invoice numbering**: Default `INV-2526-0001` (FY-prefixed, auto-increment). Tenant can customize the format.
- **Payment terms**: Configurable per customer (Net 15/30/60/custom)
- **Credit notes**: Yes — in MVP
- **Dunning**: Yes — automated payment reminders for overdue invoices

### Banking & Reconciliation
- **Bank accounts per tenant**: Unlimited
- **Bank statement import**: CSV upload for MVP. Bank API integration later.
- **Auto-reconciliation**: Match by UTR number AND amount+date (both strategies)
- **Manual reconciliation UI**: Yes — for unmatched transactions the auto-matcher can't resolve
- **Petty cash**: Yes — track warehouse/office-level petty cash with limits
- **PG reconciliation**: Yes — match Razorpay/PhonePe/Paytm settlements against orders

### Integration
- **WMS webhook spec**: To be shared by Vaidehi later
- **Vendor sync**: Pull vendor master data from WMS via API
- **WMS events**: TBD (separate PO/GRN/Invoice events or bundled)
- **Other integrations in MVP**: TBD
- **Inter-service auth**: JWT with service-level signing keys — each service gets a keypair, tokens are short-lived (5 min), verified on receiving end. More secure than static API keys, no external auth server needed.

### UX / Admin Panel
- **Primary users**: Both business owner and accountant
- **RBAC**: Yes — role-based access (owner: full access, accountant: finance only, viewer: read-only)
- **Desktop-only**: Yes, for MVP
- **Dashboard**: Top 5 metrics (see below)

#### Dashboard — Top 5 Metrics
| # | Metric | What it shows |
|---|--------|--------------|
| 1 | **Total Outstanding Payables** | Sum of all unpaid vendor invoices — "how much do we owe?" |
| 2 | **Total Outstanding Receivables** | Sum of all unpaid customer invoices — "how much are we owed?" |
| 3 | **Cash Position** | Current balance across all bank accounts — "how much cash do we have?" |
| 4 | **Overdue Payables / Receivables** | Count and amount of invoices past due date — "what needs immediate attention?" |
| 5 | **Upcoming Payments (Next 7 Days)** | Bills due in the next week — "what's about to hit the bank?" |

---

### Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| **Monorepo** | Turborepo | Shared types, validation schemas between API and frontend |
| **Backend** | Fastify | Fast, lightweight, built-in validation |
| **ORM** | Drizzle ORM | Type-safe, SQL-like, lightweight — no Prisma overhead |
| **Database** | PostgreSQL | RLS (Row-Level Security) for multi-tenant isolation |
| **Cache/Queue** | Redis | Sessions, caching, background jobs |
| **Frontend** | React + Vite | SPA — no SSR needed for admin panel. Static deploy behind Nginx. |
| **Routing** | TanStack Router | Type-safe, built-in search params for table filters/pagination |
| **UI Components** | shadcn/ui + Tailwind CSS | Professional, accessible, full ownership of component code |
| **Data Tables** | TanStack Table | Sorting, filtering, pagination — critical for ERP |
| **Data Fetching** | TanStack Query | Caching, refetching, optimistic updates |
| **Validation** | Zod | Shared schemas — frontend forms + backend API |
| **Process Manager** | PM2 | Production process management |
| **File Storage** | DO Spaces (S3-compatible) | Invoice PDFs, receipts, bank statements |

### Theme & Design System

| Element | Light | Dark |
|---------|-------|------|
| Background | zinc-50 `#fafafa` | zinc-950 `#09090b` |
| Card | white | zinc-900 |
| Primary accent | indigo-600 `#4f46e5` | indigo-400 |
| Muted | zinc-100 | zinc-800 |
| Border | zinc-200 | zinc-800 |
| Destructive | red-600 | red-400 |
| Sidebar | zinc-900 | zinc-950 |
| Sidebar text | zinc-100 | zinc-100 |

**Status colors:** Draft (gray), Pending (amber), Matched/Sent (blue), Approved (indigo), Partially Paid (cyan), Paid (green), Overdue (red), Cancelled (gray+strikethrough)

**Typography:** Inter for all text, tabular figures for numbers/money, 13-14px body, Indian ₹ formatting (12,34,567.89)

**Mode:** Light default, dark optional

**References:** Zoho Books (density), Stripe Dashboard (clarity), Linear (speed/feel)

---

## TBDs (Waiting on Input)

### Integration (Blocked — need from Vaidehi)
- [ ] WMS webhook payload spec
- [ ] WMS event structure — separate events for PO, GRN, Invoice or bundled?
- [ ] Other systems pushing/pulling data in MVP? (OMS, Delivery, HR)
