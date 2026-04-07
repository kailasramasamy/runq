# Production Readiness — Issue Tracker

**Generated:** 2026-04-07
**Status:** Pre-production audit

---

## P0 — CRITICAL (Fix before production)

- [ ] **SEC-01** Hardcoded fallback portal secrets (`'portal-secret'`, `'ca-portal-secret'`) — `portal.service.ts:7`, `vendor-portal.service.ts:7`, `ca-portal.service.ts:20` — Remove literal fallbacks, add to env.ts validation
- [ ] **SEC-02** JWT tokens have no expiry — `auth/routes.ts:26` — Add `expiresIn: '24h'` to JWT sign, implement refresh token flow
- [ ] **SEC-03** Inbound webhook endpoint has no authentication — `webhook/routes.ts:41-81` — Add HMAC signature verification or shared secret header
- [ ] **SEC-04** Invoice print accepts arbitrary tenantId from query string — `invoice-print.routes.ts:10-19` — Use authenticated user's tenantId, not query param
- [ ] **SEC-05** CORS allows all origins (`origin: true`) — `app.ts:36` — Restrict to `CORS_ORIGIN` env var in production
- [ ] **DATA-01** GL posting is fire-and-forget, failures silently lost — `payment.routes.ts`, `invoice.routes.ts` — Await GL posting inside transaction, or use retry queue
- [ ] **DATA-02** Double GL posting race condition on concurrent approvals — `payment.service.ts:270-311` — Use `UPDATE ... WHERE status='pending' RETURNING id` atomic pattern

---

## P1 — HIGH (Fix before scaling)

### Security
- [ ] **SEC-06** No rate limiting on any endpoint — `app.ts` — Add `@fastify/rate-limit` (100 req/min general, 10 req/min on auth)
- [ ] **SEC-07** No security headers (helmet) — `app.ts` — Add `@fastify/helmet`
- [ ] **SEC-08** Portal slugs only 32 bits of entropy — `portal.service.ts:34` — Use `crypto.randomBytes(16).toString('hex')` (128 bits)
- [ ] **SEC-09** Env vars for portal secrets not validated at startup — `config/env.ts` — Add `PORTAL_JWT_SECRET` and `CA_PORTAL_SECRET` to Zod schema
- [ ] **SEC-10** JWT_SECRET minimum only 10 chars — `config/env.ts:7` — Change to `.min(32)`
- [ ] **SEC-11** GL `getAccountBalance` missing tenantId filter on journal entries join — `gl.service.ts:166` — Add `eq(journalEntries.tenantId, this.tenantId)`

### Performance
- [ ] **PERF-01** N+1: CSV bank import fires 1 query per row (1000 queries for 500 rows) — `transaction.service.ts:95` — Bulk select existing + bulk insert
- [ ] **PERF-02** N+1: Bank reconciliation match loops — `reconciliation.service.ts:259` — Bulk insert matches outside loop
- [ ] **PERF-03** N+1: processApprovedInstructions loops — `payment-instruction.service.ts:299` — Batch inserts
- [ ] **PERF-04** N+1: importBatchFromCSV loops — `payment.service.ts:424` — Pre-load vendor map, bulk insert
- [ ] **PERF-05** N+1: rejectPayment loops per allocation — `payment.service.ts:335` — Use `inArray` fetch + bulk update
- [ ] **PERF-06** N+1: autoClearCheques loops — `transaction.service.ts:182` — Bulk match query
- [ ] **PERF-07** Missing DB index on `payment_allocations.paymentId` — `schema/ap/payments.ts`
- [ ] **PERF-08** Missing DB index on `sales_invoice_items.invoiceId` — `schema/ar/invoices.ts`
- [ ] **PERF-09** Missing DB index on `purchase_invoice_items.invoiceId` — `schema/ap/purchase-invoices.ts`
- [ ] **PERF-10** Missing DB indexes on `reconciliation_matches` (bankTransactionId, paymentId, receiptId) — `schema/banking/reconciliation.ts`
- [ ] **PERF-11** Missing DB indexes on `audit_log` (tenantId+entityType+entityId, tenantId+createdAt) — `schema/audit-log.ts`
- [ ] **PERF-12** Connection pool has no size/timeout config (default 10) — `packages/db/src/client.ts:6` — Add `max: 20`, `idleTimeoutMillis`, `connectionTimeoutMillis`
- [ ] **PERF-13** `setInterval` in scheduler never cleared — `report-scheduler.ts:14` — Store handle, clear on `app.addHook('onClose')`
- [ ] **PERF-14** Unbounded query: `getOverdueInvoices` no LIMIT — `dunning.service.ts:77` — Add LIMIT 500
- [ ] **PERF-15** Unbounded query: `getUnreconciled` loads all txns — `reconciliation.service.ts:48` — Add pagination
- [ ] **PERF-16** Unbounded query: `fetchBookItems` loads all payments — `reconciliation.service.ts:239` — Add date filter + LIMIT
- [ ] **PERF-17** Correlated subquery anti-pattern in `getUnreconciled` — `reconciliation.service.ts:55` — Use LEFT JOIN anti-join

### Race Conditions
- [ ] **RACE-01** `checkCreditLimit` outside transaction — `invoice.service.ts:128-156` — Move inside transaction with `SELECT ... FOR UPDATE`
- [ ] **RACE-02** Payment approval without `FOR UPDATE` — `payment.service.ts:272` — Use atomic `UPDATE WHERE status='pending'`
- [ ] **RACE-03** Payment balance read outside `FOR UPDATE` lock — `payment.service.ts:133` — Move `fetchAndValidateInvoices` inside transaction

### Data Integrity
- [ ] **DATA-03** `autoSendDunning` logs 'sent' but never actually sends — `dunning.service.ts:138` — Implement actual email/WhatsApp dispatch
- [ ] **DATA-04** Tally import loops not wrapped in transaction — `tally-import.service.ts:169,255` — Wrap in `db.transaction`
- [ ] **DATA-05** Deploy: migrations run AFTER API starts — `deploy/deploy.sh` — Run migrations before `pm2 reload`

### Frontend
- [ ] **FE-01** No React Error Boundary — `main.tsx` — Add `ErrorBoundary` wrapping `RouterProvider`
- [ ] **FE-02** Zero unit tests for business logic — Entire codebase — Add tests for GST calc, decimal utils, priority scoring

---

## P2 — MEDIUM (Fix for robustness)

### Security
- [ ] **SEC-12** No token invalidation on logout (no-op) — `auth/routes.ts:84` — Implement token blacklist via Redis
- [ ] **SEC-13** Login timing attack — non-existent users skip argon2 — `auth/routes.ts:9-34` — Always run argon2.verify against dummy hash
- [ ] **SEC-14** AI chat susceptible to prompt injection — `dashboard/routes.ts:18` — Add system prompt boundary, sanitize input
- [ ] **SEC-15** `verify-gstin` accepts unvalidated body (type cast) — `vendor.routes.ts:111`, `customer.routes.ts:99` — Add Zod schema
- [ ] **SEC-16** `tally/import` has no body validation — `integrations/routes.ts:87-89` — Add Zod schema

### Performance
- [ ] **PERF-18** N+1: `categorizeTransactions` N updates per match — `categorize.service.ts:58` — Bulk update with CASE WHEN
- [ ] **PERF-19** N+1: `getComparisonReport` serial P&L per month — `reports.service.ts:169` — GROUP BY month in SQL
- [ ] **PERF-20** Missing DB index on `bank_transactions.reference` — `schema/banking/bank-transactions.ts`
- [ ] **PERF-21** Missing DB indexes on `dunning_log`, `advance_payments`, `advance_adjustments` — Various schema files
- [ ] **PERF-22** `fetchVendorNames`/`fetchCustomerNames` loads all into memory — `categorize.service.ts:214` — Use Set or Redis cache
- [ ] **PERF-23** `categorizeTransactions` loads unbounded uncategorized txns — `categorize.service.ts:190` — Process in pages of 500
- [ ] **PERF-24** Redis barely used — no query caching for CoA, trial balance, dashboard — All services — Add TTL caches
- [ ] **PERF-25** Dynamic `import()` inside loop — `tally-import.service.ts:200` — Move to static import

### Frontend
- [ ] **FE-03** Unvirtualized list in reconciliation page (5000+ DOM nodes) — `reconciliation/index.tsx:231` — Use `@tanstack/react-virtual`
- [ ] **FE-04** No lazy route loading / code splitting — `__root.tsx` — Use TanStack Router `lazy()` for admin pages
- [ ] **FE-05** `TxnRow` not memo'd — re-renders entire list on filter change — `transactions/index.tsx:43` — Wrap in `React.memo`
- [ ] **FE-06** O(N^2) `suggestedMatches.find` inside `.map` render — `reconciliation/index.tsx:416` — Pre-compute Map with useMemo
- [ ] **FE-07** No global TanStack Query `onError` — list pages show empty state instead of error — `query-client.ts`

### Reliability
- [ ] **REL-01** No webhook retry queue — failed deliveries permanently lost — `webhook-endpoint.service.ts:118` — Add retry table + background worker
- [ ] **REL-02** Scheduler has no distributed lock — duplicate reports in multi-instance — `report-scheduler.ts` — Use Redis `SET NX EX`
- [ ] **REL-03** `console.error` instead of structured Pino logging — Scheduler, services, webhooks — Thread `app.log` into services
- [ ] **REL-04** Local file storage breaks in PM2 cluster mode — `storage/local-storage.ts` — Implement S3 storage or warn at startup
- [ ] **REL-05** Mixed `return {}` vs `reply.send()` response patterns — Most route files — Standardize on `reply.status(X).send()`
- [ ] **REL-06** `recurringInvoice.generateDueInvoices` not wired to scheduler — `recurring.service.ts:107` — Add to scheduler
- [ ] **REL-07** Legacy vendor webhook silently discards bad payloads as 202 — `webhook/routes.ts:137` — Log + return 422

---

## P3 — LOW (Polish)

- [ ] **LOW-01** `noUnusedLocals`/`noUnusedParameters` not enabled in tsconfig — `tsconfig.base.json`
- [ ] **LOW-02** `SMTP_FROM_NAME` not in env.ts schema — `config/env.ts`
- [ ] **LOW-03** No ESLint or web tests configured — `apps/web/package.json`
- [ ] **LOW-04** `staleTime` constants scattered across hook files — Query hooks — Centralize in `query-constants.ts`
- [ ] **LOW-05** Nginx config has placeholder domain — `deploy/nginx/runq.conf`
- [ ] **LOW-06** No deploy rollback mechanism — `deploy/deploy.sh`
- [ ] **LOW-07** `MarkdownResponse` not memo'd in AI chat — `ai-chat.tsx`
- [ ] **LOW-08** AI summary cache no invalidation on writes — `ai-summary.service.ts:12`
- [ ] **LOW-09** Claude model name may be outdated — `claude.service.ts:3` — Verify against Anthropic API
- [ ] **LOW-10** `tx: any` type in GL, workflow, banking services — Multiple files — Extract shared `TransactionLike` type
- [ ] **LOW-11** `(res as any)?.data?.id` unnecessary casts in mutation callbacks — Multiple route pages — Remove, types already correct

---

## Completed

_Move items here as they are fixed._

- [x] **DATA-00** Accrual accounting — GL not posted for payments/receipts/bills (fixed 2026-04-07)
- [x] **SEC-00** Webhook dispatch wired for all 9 event types (fixed 2026-04-07)
