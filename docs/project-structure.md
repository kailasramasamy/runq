# RunQ — Project Structure

## Overview

Turborepo monorepo with two apps (`api`, `web`) and four packages (`db`, `validators`, `types`, `ui`).

## Root Structure

```
runq/
├── .github/workflows/
│   ├── ci.yml
│   └── deploy.yml
├── apps/
│   ├── api/                          — Fastify backend
│   └── web/                          — Next.js 15 admin panel
├── packages/
│   ├── db/                           — Drizzle schema, migrations, RLS
│   ├── validators/                   — Shared Zod schemas
│   ├── types/                        — Shared TypeScript types
│   └── ui/                           — Shared UI components (DataTable, MoneyDisplay, StatusBadge)
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
└── .nvmrc                            — Node 20 LTS
```

## turbo.json

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] },
    "db:generate": { "cache": false },
    "db:migrate": { "cache": false },
    "db:seed": { "cache": false }
  }
}
```

## pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

## Package Dependency Graph

```
apps/api  → @runq/db, @runq/validators, @runq/types
apps/web  → @runq/validators, @runq/types, @runq/ui
packages/ui         → @runq/types
packages/validators → @runq/types
packages/db         → @runq/types
packages/types      → (no internal deps — leaf package)
```

---

## `packages/types/`

```
packages/types/src/
├── index.ts
├── tenant.ts                     — TenantId, TenantContext
├── auth.ts                       — User, Role, Session, JWTPayload
├── ap/
│   ├── vendor.ts
│   ├── purchase-invoice.ts
│   ├── payment.ts
│   ├── debit-note.ts
│   └── three-way-match.ts
├── ar/
│   ├── customer.ts
│   ├── invoice.ts
│   ├── receipt.ts
│   ├── credit-note.ts
│   └── dunning.ts
├── banking/
│   ├── bank-account.ts
│   ├── bank-transaction.ts
│   ├── reconciliation.ts
│   └── petty-cash.ts
├── common/
│   ├── pagination.ts             — PaginatedResponse<T>, PaginationParams
│   ├── money.ts
│   ├── address.ts                — IndianAddress
│   └── api-response.ts           — ApiSuccess<T>, ApiError
└── webhook/
    └── wms.ts
```

- String unions for statuses (not TypeScript enums) — better Zod compat and tree-shaking.
- Zero runtime dependencies.

---

## `packages/validators/`

```
packages/validators/src/
├── index.ts
├── ap/
│   ├── vendor.schema.ts
│   ├── purchase-invoice.schema.ts
│   ├── payment.schema.ts
│   └── debit-note.schema.ts
├── ar/
│   ├── customer.schema.ts
│   ├── invoice.schema.ts
│   ├── receipt.schema.ts
│   ├── credit-note.schema.ts
│   └── dunning.schema.ts
├── banking/
│   ├── bank-account.schema.ts
│   ├── transaction.schema.ts
│   ├── reconciliation.schema.ts
│   └── petty-cash.schema.ts
├── common/
│   ├── pagination.schema.ts
│   ├── id.schema.ts
│   └── money.schema.ts
├── auth/
│   └── login.schema.ts
└── settings/
    ├── company.schema.ts
    └── invoice-numbering.schema.ts
```

Schemas are the single source of truth. Fastify uses them via `fastify-type-provider-zod`. React Hook Form uses them via `@hookform/resolvers/zod`.

---

## `packages/db/`

```
packages/db/
├── src/
│   ├── index.ts
│   ├── client.ts                     — Drizzle client factory
│   ├── schema/
│   │   ├── index.ts
│   │   ├── tenant.ts
│   │   ├── user.ts
│   │   ├── ap/
│   │   │   ├── vendors.ts
│   │   │   ├── purchase-orders.ts
│   │   │   ├── grns.ts
│   │   │   ├── purchase-invoices.ts
│   │   │   ├── payments.ts
│   │   │   └── debit-notes.ts
│   │   ├── ar/
│   │   │   ├── customers.ts
│   │   │   ├── invoices.ts
│   │   │   ├── receipts.ts
│   │   │   ├── credit-notes.ts
│   │   │   └── dunning.ts
│   │   ├── banking/
│   │   │   ├── bank-accounts.ts
│   │   │   ├── bank-transactions.ts
│   │   │   ├── reconciliation.ts
│   │   │   └── petty-cash.ts
│   │   └── pg-recon/
│   │       ├── settlements.ts
│   │       └── settlement-lines.ts
│   ├── rls/
│   │   └── policies.ts
│   ├── relations.ts
│   └── helpers/
│       ├── tenant-scope.ts           — withTenant(pool, tenantId, fn)
│       └── pagination.ts
├── drizzle/
│   ├── migrations/
│   └── meta/
├── seeds/
│   ├── index.ts
│   └── demo-tenant.ts
├── drizzle.config.ts
└── package.json
```

### RLS Helper (`tenant-scope.ts`)

```typescript
export async function withTenant<T>(
  pool: Pool,
  tenantId: string,
  fn: (db: DrizzleDb) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SET app.current_tenant_id = '${tenantId}'`);
    const db = drizzle(client, { schema });
    return await fn(db);
  } finally {
    await client.query(`RESET app.current_tenant_id`);
    client.release();
  }
}
```

---

## `packages/ui/`

```
packages/ui/src/
├── index.ts
├── data-table/
│   ├── data-table.tsx                — TanStack Table wrapper
│   ├── data-table-toolbar.tsx
│   ├── data-table-pagination.tsx
│   └── data-table-column-header.tsx
├── money-display.tsx                 — ₹ with Indian numbering (12,34,567.89)
├── status-badge.tsx                  — Color-coded status pill
├── date-range-picker.tsx
└── empty-state.tsx
```

Only genuinely shared components. shadcn/ui installed directly in `apps/web`.

---

## `apps/api/`

```
apps/api/src/
├── index.ts                          — Entry: create server, start
├── app.ts                            — buildApp() factory
├── config/
│   ├── env.ts                        — Zod-validated env vars
│   └── constants.ts
├── plugins/
│   ├── auth.ts                       — JWT verify, decorates req.user/tenantId
│   ├── tenant-context.ts             — Sets RLS via withTenant()
│   ├── db.ts                         — pg Pool + Drizzle
│   ├── redis.ts                      — ioredis
│   ├── error-handler.ts              — Domain errors → HTTP codes
│   └── request-logger.ts
├── modules/
│   ├── auth/
│   │   ├── routes.ts
│   │   └── auth.service.ts
│   ├── ap/
│   │   ├── routes.ts                 — Registers all AP sub-routes
│   │   ├── vendor.routes.ts
│   │   ├── vendor.service.ts
│   │   ├── purchase-invoice.routes.ts
│   │   ├── purchase-invoice.service.ts
│   │   ├── payment.routes.ts
│   │   ├── payment.service.ts
│   │   ├── debit-note.routes.ts
│   │   ├── debit-note.service.ts
│   │   └── three-way-match.ts        — Matching algorithm
│   ├── ar/
│   │   ├── routes.ts
│   │   ├── customer.routes.ts
│   │   ├── customer.service.ts
│   │   ├── invoice.routes.ts
│   │   ├── invoice.service.ts
│   │   ├── receipt.routes.ts
│   │   ├── receipt.service.ts
│   │   ├── credit-note.routes.ts
│   │   ├── credit-note.service.ts
│   │   ├── dunning.routes.ts
│   │   └── dunning.service.ts
│   ├── banking/
│   │   ├── routes.ts
│   │   ├── bank-account.routes.ts
│   │   ├── bank-account.service.ts
│   │   ├── transaction.routes.ts
│   │   ├── transaction.service.ts    — CSV parsing
│   │   ├── reconciliation.routes.ts
│   │   ├── reconciliation.service.ts — UTR + amount/date matching
│   │   ├── petty-cash.routes.ts
│   │   └── petty-cash.service.ts
│   ├── pg-recon/
│   │   ├── routes.ts
│   │   └── pg-recon.service.ts
│   ├── dashboard/
│   │   ├── routes.ts
│   │   └── dashboard.service.ts
│   ├── settings/
│   │   ├── routes.ts
│   │   └── settings.service.ts
│   └── webhook/
│       ├── routes.ts
│       └── wms.service.ts
├── hooks/
│   ├── rbac.ts                       — Role check preHandler
│   └── rate-limit.ts
└── utils/
    ├── errors.ts                     — NotFoundError, MatchError, etc.
    └── csv-parser.ts
```

### Plugin Wiring (`app.ts`)

```typescript
export async function buildApp() {
  const app = Fastify({ logger: true });

  // Infrastructure
  await app.register(errorHandlerPlugin);
  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);
  await app.register(tenantContextPlugin);

  // Public routes
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(webhookRoutes, { prefix: "/api/v1/webhooks" });

  // Protected routes
  await app.register(async (scope) => {
    scope.addHook("onRequest", scope.authenticate);
    await scope.register(apRoutes, { prefix: "/api/v1/ap" });
    await scope.register(arRoutes, { prefix: "/api/v1/ar" });
    await scope.register(bankingRoutes, { prefix: "/api/v1/banking" });
    await scope.register(pgReconRoutes, { prefix: "/api/v1/pg-recon" });
    await scope.register(dashboardRoutes, { prefix: "/api/v1/dashboard" });
    await scope.register(settingsRoutes, { prefix: "/api/v1/settings" });
  });

  return app;
}
```

### Request Flow

1. Request → Fastify
2. `auth` plugin verifies JWT → decorates `request.user`, `request.tenantId`
3. `tenant-context` → `SET app.current_tenant_id` on PG connection
4. Route handler calls service
5. Service uses Drizzle — RLS filters by tenant automatically
6. Response returned
7. Connection released, `RESET app.current_tenant_id`

---

## `apps/web/`

```
apps/web/src/
├── app/
│   ├── layout.tsx                    — Root: QueryProvider, ThemeProvider
│   ├── page.tsx                      — Redirect → /dashboard
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── layout.tsx                — Centered card, no sidebar
│   └── (dashboard)/
│       ├── layout.tsx                — Sidebar + topbar + content
│       ├── dashboard/page.tsx        — 5 metric cards
│       ├── ap/
│       │   ├── layout.tsx            — Sub-nav: Bills, Vendors, Payments, Debit Notes
│       │   ├── bills/
│       │   │   ├── page.tsx          — List (TanStack Table)
│       │   │   ├── new/page.tsx      — Create
│       │   │   └── [id]/
│       │   │       ├── page.tsx      — Detail + match status + payments
│       │   │       └── edit/page.tsx
│       │   ├── vendors/
│       │   │   ├── page.tsx
│       │   │   ├── new/page.tsx
│       │   │   └── [id]/page.tsx
│       │   ├── payments/
│       │   │   ├── page.tsx
│       │   │   └── new/page.tsx      — Partial payment UI
│       │   └── debit-notes/
│       │       ├── page.tsx
│       │       └── new/page.tsx
│       ├── ar/
│       │   ├── layout.tsx            — Sub-nav: Invoices, Customers, Receipts, Credit Notes
│       │   ├── invoices/
│       │   │   ├── page.tsx
│       │   │   ├── new/page.tsx      — Auto-numbering preview
│       │   │   └── [id]/
│       │   │       ├── page.tsx
│       │   │       └── edit/page.tsx
│       │   ├── customers/
│       │   │   ├── page.tsx
│       │   │   ├── new/page.tsx
│       │   │   └── [id]/page.tsx
│       │   ├── receipts/
│       │   │   ├── page.tsx
│       │   │   └── new/page.tsx
│       │   └── credit-notes/
│       │       ├── page.tsx
│       │       └── new/page.tsx
│       ├── banking/
│       │   ├── layout.tsx            — Sub-nav: Accounts, Transactions, Reconciliation, Petty Cash
│       │   ├── accounts/
│       │   │   ├── page.tsx
│       │   │   └── new/page.tsx
│       │   ├── transactions/
│       │   │   ├── page.tsx
│       │   │   └── import/page.tsx   — CSV upload + preview
│       │   ├── reconciliation/page.tsx — Split view: unmatched ↔ suggested matches
│       │   └── petty-cash/
│       │       ├── page.tsx
│       │       └── new/page.tsx
│       └── settings/
│           ├── layout.tsx
│           ├── company/page.tsx
│           ├── invoice-numbering/page.tsx
│           └── users/page.tsx
├── components/
│   ├── ui/                           — shadcn/ui (installed here)
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── top-bar.tsx
│   │   └── sub-nav.tsx
│   ├── forms/
│   │   ├── vendor-form.tsx
│   │   ├── bill-form.tsx
│   │   ├── invoice-form.tsx
│   │   ├── customer-form.tsx
│   │   ├── payment-form.tsx
│   │   └── bank-account-form.tsx
│   ├── tables/
│   │   ├── bills-table.tsx
│   │   ├── invoices-table.tsx
│   │   ├── vendors-table.tsx
│   │   ├── customers-table.tsx
│   │   ├── transactions-table.tsx
│   │   └── payments-table.tsx
│   └── dashboard/
│       ├── metric-card.tsx
│       ├── overdue-list.tsx
│       └── upcoming-payments.tsx
├── hooks/
│   ├── use-auth.ts
│   └── queries/
│       ├── use-bills.ts
│       ├── use-invoices.ts
│       ├── use-vendors.ts
│       ├── use-customers.ts
│       ├── use-bank-accounts.ts
│       ├── use-transactions.ts
│       ├── use-reconciliation.ts
│       ├── use-dashboard.ts
│       └── use-settings.ts
├── lib/
│   ├── api-client.ts                 — Fetch wrapper with auth
│   ├── query-client.ts               — TanStack Query config
│   └── utils.ts                      — cn() + helpers
└── providers/
    ├── query-provider.tsx
    └── auth-provider.tsx
```

---

## Implementation Phases

### Phase 0 — Scaffolding (Day 1)
1. Init Turborepo with pnpm
2. Set up packages/types, packages/validators, packages/db
3. Fastify skeleton with all plugins
4. Next.js 15 with shadcn/ui + auth flow
5. Verify `turbo dev` runs both apps

### Phase 1 — AP (Week 1-2)
1. Vendor CRUD
2. Bill CRUD + 3-way matching
3. Payments (partial)
4. Debit notes

### Phase 2 — AR (Week 2-3)
1. Customer CRUD
2. Invoice creation + FY numbering
3. Receipts
4. Credit notes
5. Dunning

### Phase 3 — Banking (Week 3-4)
1. Bank accounts
2. CSV import
3. Auto-reconciliation
4. Manual reconciliation UI
5. Petty cash

### Phase 4 — Dashboard + Settings (Week 4)
1. Dashboard metrics
2. Company settings
3. Invoice numbering config
4. User/RBAC management
