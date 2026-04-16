# GST Filing Module — Tracker

> Full plan: [gst-filing-plan.md](./gst-filing-plan.md)

---

## Pre-requisites

- [x] Sign up as ASP partner with Masters India (GST API only, Rs 25K/yr, 2.5L calls)
- [x] Get sandbox API credentials
- [ ] Test sandbox auth flow (OTP request/verify) manually

---

## Phase 1: GSTR-1 Generation & Filing ✅

- [x] 1.1 DB schema — `gst_returns`, `gst_return_invoices`, `gsp_auth_tokens` tables + Drizzle schema
- [x] 1.2 Invoice classification engine — auto-classify into B2B / B2CS / B2CL / EXP / CDN / NIL
- [x] 1.3 GSTR-1 data aggregation — HSN summary (Table 12) + document issued summary (Table 13)
- [x] 1.4 GSP client interface + Masters India implementation (auth, upload, file, fetch)
- [x] 1.5 API endpoints — generate, get/update, validate, OTP auth, upload, summary, file, list
- [x] 1.6 Validation rules — GSTIN, HSN digits, invoice format, tax rates, POS, value reconciliation
- [x] 1.7 Frontend — GSTR-1 filing wizard (select period → review sections → validate → OTP → upload → file)

---

## Phase 2: GSTR-3B Generation & Filing ✅

- [x] 2.1 Auto-generation — compute 3B tables from GSTR-1 + purchase invoices + Rule 88A ITC utilization
- [x] 2.2 API + GSP integration — generate-3b, upload-3b, auto-3b endpoints
- [x] 2.3 AI-assisted review — deferred; ITC gap detection will use 2B reconciliation data from Phase 3
- [x] 2.4 Frontend — 3B filing UI (Tables 3.1, 4, 6.1 with tax liability + cash to pay)

---

## Phase 3: GSTR-2B Reconciliation ✅

- [x] 3.1 Pull & store GSTR-2B — `gstr2b_data` table, pull via GSP, upsert per period
- [x] 3.2 Matching engine — exact + fuzzy match (normalized invoice numbers), Rs 2 tolerance
- [x] 3.3 AI-assisted reconciliation — fuzzy matching built in; vendor follow-up messaging deferred
- [x] 3.4 Frontend — reconciliation dashboard (summary cards, filter pills, match table with diff view)

---

## Phase 4: E-Invoicing (deferred — add when needed)

- [ ] 4.1 E-invoice generation — push to IRP via GSP, receive IRN + QR, store on invoice, cancellation support
- [ ] 4.2 GSTR-1 integration — detect IRN invoices, exclude from B2B upload (auto-populated by GSTN)
- [ ] 4.3 Frontend + settings — e-invoicing toggle, auto/bulk IRN generation, status on invoice list, QR on PDF

> **Note:** E-Invoice API not purchased yet. Only needed for customers with turnover > Rs 5 crore. Add later.

---

## Files Created

### Database (`packages/db/`)
- `src/schema/gst/gst-returns.ts` — all GST tables + types (returns, invoices, auth, 2B data, matches)
- `migrations/0030_gst_returns_module.sql` — returns, invoice links, auth tokens
- `migrations/0031_gstr2b_reconciliation.sql` — 2B storage + match results

### Backend (`apps/api/src/modules/gst/`)
- `gstr1-generator.ts` — classification engine + GSTR-1 data aggregation
- `gstr1-validator.ts` — pre-flight validation (GSTIN, HSN, rates, POS)
- `gstr3b-generator.ts` — 3B computation with Rule 88A ITC utilization
- `gsp-client.ts` — GSP interface + Masters India implementation
- `gst-return.service.ts` — orchestration (generate, validate, upload, file)
- `gstr2b-reconciliation.ts` — 2B pull, matching engine, reconciliation summary
- `routes.ts` — all API endpoints (returns + 2B reconciliation)
- `*.test.ts` — 20 unit tests (classification, validation, ITC utilization)

### Frontend (`apps/web/src/`)
- `hooks/queries/use-gst-returns.ts` — all TanStack Query hooks
- `routes/gst/returns.tsx` — returns list + generate actions
- `routes/gst/return-detail.tsx` — GSTR-1 filing wizard
- `routes/gst/return-3b-detail.tsx` — GSTR-3B filing page
- `routes/gst/reconciliation.tsx` — 2B reconciliation dashboard
- Sidebar: "GST Filing" nav item added
- Sub-nav: Returns | Reconciliation tabs

---

## Notes

- **GSP Provider:** Masters India (MasterGST) — GST API only
- **Plan:** Rs 25,000/year, 2.5 lakh API calls (~700 tenants capacity)
- **Sandbox OTP:** 575757, tokens expire after 6 hours
- **Env vars needed:** `MASTERS_INDIA_CLIENT_ID`, `MASTERS_INDIA_CLIENT_SECRET`, `MASTERS_INDIA_SANDBOX=true`
- **Tests:** 20 passing (classification, validation, ITC utilization)
