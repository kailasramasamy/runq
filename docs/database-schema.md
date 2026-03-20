# RunQ Finance-Accounting Module — Database Schema

## Design Principles

1. **Tenant isolation via RLS**: Every table has `tenant_id UUID NOT NULL`. PostgreSQL session variable `app.current_tenant_id` is set on every connection, and RLS policies filter all reads/writes.
2. **UUIDs everywhere**: All primary keys are `UUID DEFAULT gen_random_uuid()`.
3. **Money as DECIMAL(15,2)**: Supports up to ₹999,99,99,99,999.99.
4. **Timestamps**: All tables carry `created_at TIMESTAMPTZ DEFAULT now()` and `updated_at TIMESTAMPTZ DEFAULT now()`. Soft-deletable tables add `deleted_at TIMESTAMPTZ NULL`.
5. **PostgreSQL enums** for status fields.
6. **Composite indexes** on `(tenant_id, ...)` for RLS performance.

---

## 0. RLS Infrastructure

### Session Variable Setup

Every database connection must execute:

```sql
SET app.current_tenant_id = '<tenant-uuid>';
```

In Fastify, this happens in a `preHandler` hook that extracts `tenant_id` from the JWT.

### RLS Policy Template

Applied to every table except `tenants`:

```sql
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table_name> FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <table_name>
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### Superuser Bypass

```sql
CREATE ROLE runq_admin BYPASSRLS;
```

Application connections use `runq_app` (non-bypass).

---

## 1. Core / Multi-Tenancy

### `tenants`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| name | VARCHAR(255) | NOT NULL | Company name |
| slug | VARCHAR(100) | NOT NULL, UNIQUE | URL-safe identifier |
| settings | JSONB | NOT NULL DEFAULT '{}' | Invoice numbering, defaults |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**No RLS** — accessed before tenant context is set.

`settings` JSONB structure:
```json
{
  "invoice_prefix": "INV",
  "invoice_format": "{prefix}-{fy}-{seq}",
  "financial_year_start_month": 4,
  "default_payment_terms_days": 30,
  "currency": "INR"
}
```

**Indexes:** `UNIQUE (slug)`

### `users`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| email | VARCHAR(255) | NOT NULL | |
| name | VARCHAR(255) | NOT NULL | |
| role | user_role | NOT NULL DEFAULT 'viewer' | |
| password_hash | VARCHAR(255) | NOT NULL | argon2 hash |
| is_active | BOOLEAN | NOT NULL DEFAULT true | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

```sql
CREATE TYPE user_role AS ENUM ('owner', 'accountant', 'viewer');
```

**Indexes:** `UNIQUE (tenant_id, email)`, `(tenant_id)`

---

## 2. AP — Accounts Payable

### Enums

```sql
CREATE TYPE po_status AS ENUM ('draft', 'confirmed', 'partially_received', 'fully_received', 'cancelled');
CREATE TYPE grn_status AS ENUM ('draft', 'confirmed', 'cancelled');
CREATE TYPE purchase_invoice_status AS ENUM ('draft', 'pending_match', 'matched', 'approved', 'partially_paid', 'paid', 'cancelled');
CREATE TYPE match_status AS ENUM ('unmatched', 'matched', 'mismatch');
CREATE TYPE payment_method AS ENUM ('bank_transfer');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'reversed');
CREATE TYPE debit_note_status AS ENUM ('draft', 'issued', 'adjusted', 'cancelled');
```

### `vendors`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| name | VARCHAR(255) | NOT NULL | |
| gstin | VARCHAR(15) | NULL | |
| pan | VARCHAR(10) | NULL | |
| email | VARCHAR(255) | NULL | |
| phone | VARCHAR(20) | NULL | |
| address_line1 | VARCHAR(255) | NULL | |
| address_line2 | VARCHAR(255) | NULL | |
| city | VARCHAR(100) | NULL | |
| state | VARCHAR(100) | NULL | |
| pincode | VARCHAR(10) | NULL | |
| bank_account_name | VARCHAR(255) | NULL | |
| bank_account_number | VARCHAR(30) | NULL | |
| bank_ifsc | VARCHAR(11) | NULL | |
| bank_name | VARCHAR(255) | NULL | |
| payment_terms_days | INTEGER | NOT NULL DEFAULT 30 | |
| wms_vendor_id | VARCHAR(100) | NULL | External ID from WMS |
| is_active | BOOLEAN | NOT NULL DEFAULT true | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| deleted_at | TIMESTAMPTZ | NULL | Soft delete |

**Indexes:** `(tenant_id)`, `(tenant_id, gstin) WHERE gstin IS NOT NULL`, `(tenant_id, wms_vendor_id) WHERE wms_vendor_id IS NOT NULL`

### `purchase_orders`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| po_number | VARCHAR(50) | NOT NULL | From WMS |
| vendor_id | UUID | NOT NULL, FK → vendors(id) | |
| order_date | DATE | NOT NULL | |
| expected_delivery_date | DATE | NULL | |
| status | po_status | NOT NULL DEFAULT 'confirmed' | |
| total_amount | DECIMAL(15,2) | NOT NULL DEFAULT 0 | |
| notes | TEXT | NULL | |
| wms_po_id | VARCHAR(100) | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `UNIQUE (tenant_id, po_number)`, `(tenant_id, vendor_id)`, `(tenant_id, wms_po_id) WHERE wms_po_id IS NOT NULL`

### `purchase_order_items`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| po_id | UUID | NOT NULL, FK → purchase_orders(id) | |
| item_name | VARCHAR(255) | NOT NULL | |
| sku | VARCHAR(100) | NULL | |
| quantity | DECIMAL(12,3) | NOT NULL | Supports fractional (kg, litres) |
| unit_price | DECIMAL(15,2) | NOT NULL | |
| amount | DECIMAL(15,2) | NOT NULL | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, po_id)`

### `goods_receipt_notes`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| grn_number | VARCHAR(50) | NOT NULL | |
| po_id | UUID | NOT NULL, FK → purchase_orders(id) | |
| received_date | DATE | NOT NULL | |
| status | grn_status | NOT NULL DEFAULT 'confirmed' | |
| notes | TEXT | NULL | |
| wms_grn_id | VARCHAR(100) | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `UNIQUE (tenant_id, grn_number)`, `(tenant_id, po_id)`

### `grn_items`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| grn_id | UUID | NOT NULL, FK → goods_receipt_notes(id) | |
| po_item_id | UUID | NULL, FK → purchase_order_items(id) | |
| item_name | VARCHAR(255) | NOT NULL | |
| sku | VARCHAR(100) | NULL | |
| ordered_quantity | DECIMAL(12,3) | NOT NULL | |
| received_quantity | DECIMAL(12,3) | NOT NULL | |
| accepted_quantity | DECIMAL(12,3) | NOT NULL | |
| rejected_quantity | DECIMAL(12,3) | NOT NULL DEFAULT 0 | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, grn_id)`

### `purchase_invoices`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| invoice_number | VARCHAR(50) | NOT NULL | Vendor's invoice number |
| vendor_id | UUID | NOT NULL, FK → vendors(id) | |
| po_id | UUID | NULL, FK → purchase_orders(id) | |
| grn_id | UUID | NULL, FK → goods_receipt_notes(id) | |
| invoice_date | DATE | NOT NULL | |
| due_date | DATE | NOT NULL | |
| subtotal | DECIMAL(15,2) | NOT NULL | |
| tax_amount | DECIMAL(15,2) | NOT NULL DEFAULT 0 | |
| total_amount | DECIMAL(15,2) | NOT NULL | |
| amount_paid | DECIMAL(15,2) | NOT NULL DEFAULT 0 | Denormalized |
| balance_due | DECIMAL(15,2) | NOT NULL | |
| status | purchase_invoice_status | NOT NULL DEFAULT 'draft' | |
| match_status | match_status | NOT NULL DEFAULT 'unmatched' | |
| match_notes | TEXT | NULL | |
| approved_by | UUID | NULL, FK → users(id) | |
| approved_at | TIMESTAMPTZ | NULL | |
| wms_invoice_id | VARCHAR(100) | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `UNIQUE (tenant_id, vendor_id, invoice_number)`, `(tenant_id, status)`, `(tenant_id, due_date)`, `(tenant_id, match_status)`, `(tenant_id, vendor_id)`

**3-Way Matching Logic:**
1. PO vs GRN: Every PO line item quantity matches GRN accepted_quantity
2. PO vs Invoice: Every PO line item unit_price and quantity matches invoice line items
3. GRN vs Invoice: Invoiced quantity does not exceed accepted quantity

All pass → `match_status = 'matched'`, `status = 'matched'`
Any fail → `match_status = 'mismatch'`, `status = 'pending_match'` — **hard block, no payment**

### `purchase_invoice_items`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| invoice_id | UUID | NOT NULL, FK → purchase_invoices(id) | |
| po_item_id | UUID | NULL, FK → purchase_order_items(id) | |
| item_name | VARCHAR(255) | NOT NULL | |
| sku | VARCHAR(100) | NULL | |
| quantity | DECIMAL(12,3) | NOT NULL | |
| unit_price | DECIMAL(15,2) | NOT NULL | |
| amount | DECIMAL(15,2) | NOT NULL | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, invoice_id)`

### `payments`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| vendor_id | UUID | NOT NULL, FK → vendors(id) | |
| bank_account_id | UUID | NULL, FK → bank_accounts(id) | |
| payment_date | DATE | NOT NULL | |
| amount | DECIMAL(15,2) | NOT NULL | |
| payment_method | payment_method | NOT NULL DEFAULT 'bank_transfer' | |
| utr_number | VARCHAR(50) | NULL | |
| status | payment_status | NOT NULL DEFAULT 'pending' | |
| notes | TEXT | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, vendor_id)`, `(tenant_id, payment_date)`, `(tenant_id, utr_number) WHERE utr_number IS NOT NULL`

### `payment_allocations`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| payment_id | UUID | NOT NULL, FK → payments(id) | |
| invoice_id | UUID | NOT NULL, FK → purchase_invoices(id) | |
| amount | DECIMAL(15,2) | NOT NULL | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, payment_id)`, `(tenant_id, invoice_id)`, `UNIQUE (payment_id, invoice_id)`

### `advance_payments`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| vendor_id | UUID | NOT NULL, FK → vendors(id) | |
| payment_id | UUID | NULL, FK → payments(id) | |
| amount | DECIMAL(15,2) | NOT NULL | Original advance |
| balance | DECIMAL(15,2) | NOT NULL | Remaining unadjusted |
| advance_date | DATE | NOT NULL | |
| notes | TEXT | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, vendor_id)`, `(tenant_id, vendor_id) WHERE balance > 0`

### `advance_adjustments`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| advance_id | UUID | NOT NULL, FK → advance_payments(id) | |
| invoice_id | UUID | NOT NULL, FK → purchase_invoices(id) | |
| amount | DECIMAL(15,2) | NOT NULL | |
| adjusted_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, advance_id)`, `(tenant_id, invoice_id)`

### `debit_notes`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| debit_note_number | VARCHAR(50) | NOT NULL | |
| vendor_id | UUID | NOT NULL, FK → vendors(id) | |
| invoice_id | UUID | NULL, FK → purchase_invoices(id) | |
| issue_date | DATE | NOT NULL | |
| amount | DECIMAL(15,2) | NOT NULL | |
| reason | TEXT | NOT NULL | |
| status | debit_note_status | NOT NULL DEFAULT 'draft' | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `UNIQUE (tenant_id, debit_note_number)`, `(tenant_id, vendor_id)`

---

## 3. AR — Accounts Receivable

### Enums

```sql
CREATE TYPE customer_type AS ENUM ('b2b', 'payment_gateway');
CREATE TYPE sales_invoice_status AS ENUM ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled');
CREATE TYPE credit_note_status AS ENUM ('draft', 'issued', 'adjusted', 'cancelled');
CREATE TYPE dunning_channel AS ENUM ('email', 'sms', 'whatsapp');
```

### `customers`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| name | VARCHAR(255) | NOT NULL | |
| type | customer_type | NOT NULL DEFAULT 'b2b' | |
| email | VARCHAR(255) | NULL | |
| phone | VARCHAR(20) | NULL | |
| gstin | VARCHAR(15) | NULL | |
| pan | VARCHAR(10) | NULL | |
| address_line1 | VARCHAR(255) | NULL | |
| address_line2 | VARCHAR(255) | NULL | |
| city | VARCHAR(100) | NULL | |
| state | VARCHAR(100) | NULL | |
| pincode | VARCHAR(10) | NULL | |
| payment_terms_days | INTEGER | NOT NULL DEFAULT 30 | |
| contact_person | VARCHAR(255) | NULL | |
| is_active | BOOLEAN | NOT NULL DEFAULT true | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| deleted_at | TIMESTAMPTZ | NULL | |

**Indexes:** `(tenant_id)`, `(tenant_id, type)`

### `invoice_sequences`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| financial_year | VARCHAR(10) | NOT NULL | e.g., "2526" |
| last_sequence | INTEGER | NOT NULL DEFAULT 0 | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `UNIQUE (tenant_id, financial_year)`

Next invoice: `SELECT last_sequence + 1 ... FOR UPDATE` to prevent race conditions.

### `sales_invoices`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| invoice_number | VARCHAR(50) | NOT NULL | e.g., INV-2526-0001 |
| customer_id | UUID | NOT NULL, FK → customers(id) | |
| invoice_date | DATE | NOT NULL | |
| due_date | DATE | NOT NULL | |
| subtotal | DECIMAL(15,2) | NOT NULL | |
| tax_amount | DECIMAL(15,2) | NOT NULL DEFAULT 0 | |
| total_amount | DECIMAL(15,2) | NOT NULL | |
| amount_received | DECIMAL(15,2) | NOT NULL DEFAULT 0 | |
| balance_due | DECIMAL(15,2) | NOT NULL | |
| status | sales_invoice_status | NOT NULL DEFAULT 'draft' | |
| notes | TEXT | NULL | |
| file_url | VARCHAR(500) | NULL | PDF in DO Spaces |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `UNIQUE (tenant_id, invoice_number)`, `(tenant_id, customer_id)`, `(tenant_id, status)`, `(tenant_id, due_date)`, `(tenant_id, status, due_date)`

### `sales_invoice_items`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| invoice_id | UUID | NOT NULL, FK → sales_invoices(id) ON DELETE CASCADE | |
| description | VARCHAR(500) | NOT NULL | |
| quantity | DECIMAL(12,3) | NOT NULL | |
| unit_price | DECIMAL(15,2) | NOT NULL | |
| amount | DECIMAL(15,2) | NOT NULL | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, invoice_id)`

### `payment_receipts`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| customer_id | UUID | NOT NULL, FK → customers(id) | |
| bank_account_id | UUID | NULL, FK → bank_accounts(id) | |
| receipt_date | DATE | NOT NULL | |
| amount | DECIMAL(15,2) | NOT NULL | |
| payment_method | payment_method | NOT NULL | |
| reference_number | VARCHAR(100) | NULL | |
| notes | TEXT | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, customer_id)`, `(tenant_id, receipt_date)`, `(tenant_id, reference_number) WHERE reference_number IS NOT NULL`

### `receipt_allocations`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| receipt_id | UUID | NOT NULL, FK → payment_receipts(id) | |
| invoice_id | UUID | NOT NULL, FK → sales_invoices(id) | |
| amount | DECIMAL(15,2) | NOT NULL | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, receipt_id)`, `(tenant_id, invoice_id)`, `UNIQUE (receipt_id, invoice_id)`

### `credit_notes`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| credit_note_number | VARCHAR(50) | NOT NULL | |
| customer_id | UUID | NOT NULL, FK → customers(id) | |
| invoice_id | UUID | NULL, FK → sales_invoices(id) | |
| issue_date | DATE | NOT NULL | |
| amount | DECIMAL(15,2) | NOT NULL | |
| reason | TEXT | NOT NULL | |
| status | credit_note_status | NOT NULL DEFAULT 'draft' | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `UNIQUE (tenant_id, credit_note_number)`, `(tenant_id, customer_id)`

### `dunning_rules`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| name | VARCHAR(100) | NOT NULL | |
| days_after_due | INTEGER | NOT NULL | |
| channel | dunning_channel | NOT NULL DEFAULT 'email' | |
| subject_template | VARCHAR(500) | NULL | |
| body_template | TEXT | NOT NULL | |
| is_active | BOOLEAN | NOT NULL DEFAULT true | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, is_active, days_after_due)`

### `dunning_log`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| invoice_id | UUID | NOT NULL, FK → sales_invoices(id) | |
| rule_id | UUID | NOT NULL, FK → dunning_rules(id) | |
| sent_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| channel | dunning_channel | NOT NULL | |
| status | VARCHAR(20) | NOT NULL DEFAULT 'sent' | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, invoice_id)`, `(tenant_id, sent_at)`

---

## 4. Banking & Reconciliation

### Enums

```sql
CREATE TYPE bank_account_type AS ENUM ('current', 'savings', 'overdraft', 'cash_credit');
CREATE TYPE bank_txn_type AS ENUM ('credit', 'debit');
CREATE TYPE recon_status AS ENUM ('unreconciled', 'matched', 'manually_matched', 'excluded');
CREATE TYPE recon_match_type AS ENUM ('auto_utr', 'auto_amount_date', 'manual');
```

### `bank_accounts`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| name | VARCHAR(255) | NOT NULL | e.g., "HDFC Main" |
| bank_name | VARCHAR(255) | NOT NULL | |
| account_number | VARCHAR(30) | NOT NULL | |
| ifsc_code | VARCHAR(11) | NOT NULL | |
| account_type | bank_account_type | NOT NULL DEFAULT 'current' | |
| opening_balance | DECIMAL(15,2) | NOT NULL DEFAULT 0 | |
| current_balance | DECIMAL(15,2) | NOT NULL DEFAULT 0 | |
| is_active | BOOLEAN | NOT NULL DEFAULT true | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id)`, `UNIQUE (tenant_id, account_number)`

### `bank_transactions`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| bank_account_id | UUID | NOT NULL, FK → bank_accounts(id) | |
| transaction_date | DATE | NOT NULL | |
| value_date | DATE | NULL | |
| type | bank_txn_type | NOT NULL | |
| amount | DECIMAL(15,2) | NOT NULL | Always positive |
| reference | VARCHAR(100) | NULL | UTR / cheque number |
| narration | VARCHAR(500) | NULL | |
| running_balance | DECIMAL(15,2) | NULL | |
| recon_status | recon_status | NOT NULL DEFAULT 'unreconciled' | |
| import_batch_id | UUID | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, bank_account_id, transaction_date)`, `(tenant_id, recon_status)`, `(tenant_id, reference) WHERE reference IS NOT NULL`, `(tenant_id, bank_account_id, amount, transaction_date)`

### `bank_reconciliations`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| bank_account_id | UUID | NOT NULL, FK → bank_accounts(id) | |
| period_start | DATE | NOT NULL | |
| period_end | DATE | NOT NULL | |
| bank_closing_balance | DECIMAL(15,2) | NOT NULL | |
| book_closing_balance | DECIMAL(15,2) | NOT NULL | |
| difference | DECIMAL(15,2) | NOT NULL | |
| is_completed | BOOLEAN | NOT NULL DEFAULT false | |
| completed_at | TIMESTAMPTZ | NULL | |
| completed_by | UUID | NULL, FK → users(id) | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, bank_account_id)`, `UNIQUE (tenant_id, bank_account_id, period_start, period_end)`

### `reconciliation_matches`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| bank_transaction_id | UUID | NOT NULL, FK → bank_transactions(id) | |
| payment_id | UUID | NULL, FK → payments(id) | For outgoing (AP) |
| receipt_id | UUID | NULL, FK → payment_receipts(id) | For incoming (AR) |
| match_type | recon_match_type | NOT NULL | |
| matched_by | UUID | NULL, FK → users(id) | |
| matched_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Constraints:** `CHECK ((payment_id IS NOT NULL)::int + (receipt_id IS NOT NULL)::int = 1)`

**Indexes:** `UNIQUE (tenant_id, bank_transaction_id)`, `(tenant_id, payment_id) WHERE payment_id IS NOT NULL`, `(tenant_id, receipt_id) WHERE receipt_id IS NOT NULL`

### `petty_cash_accounts`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| name | VARCHAR(255) | NOT NULL | |
| location | VARCHAR(255) | NULL | |
| cash_limit | DECIMAL(15,2) | NOT NULL | |
| current_balance | DECIMAL(15,2) | NOT NULL DEFAULT 0 | |
| is_active | BOOLEAN | NOT NULL DEFAULT true | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id)`

### `petty_cash_transactions`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| account_id | UUID | NOT NULL, FK → petty_cash_accounts(id) | |
| transaction_date | DATE | NOT NULL | |
| type | bank_txn_type | NOT NULL | credit (replenish) / debit (spend) |
| amount | DECIMAL(15,2) | NOT NULL | |
| description | VARCHAR(500) | NOT NULL | |
| category | VARCHAR(100) | NULL | |
| approved_by | UUID | NULL, FK → users(id) | |
| receipt_url | VARCHAR(500) | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, account_id, transaction_date)`, `(tenant_id, category)`

---

## 5. PG Reconciliation

### Enums

```sql
CREATE TYPE pg_gateway AS ENUM ('razorpay', 'phonepe', 'paytm');
CREATE TYPE pg_match_status AS ENUM ('unmatched', 'matched', 'disputed');
```

### `pg_settlements`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| gateway | pg_gateway | NOT NULL | |
| settlement_id | VARCHAR(100) | NOT NULL | |
| settlement_date | DATE | NOT NULL | |
| gross_amount | DECIMAL(15,2) | NOT NULL | |
| total_fees | DECIMAL(15,2) | NOT NULL | |
| total_tax | DECIMAL(15,2) | NOT NULL DEFAULT 0 | |
| net_amount | DECIMAL(15,2) | NOT NULL | |
| bank_account_id | UUID | NULL, FK → bank_accounts(id) | |
| bank_transaction_id | UUID | NULL, FK → bank_transactions(id) | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `UNIQUE (tenant_id, gateway, settlement_id)`, `(tenant_id, settlement_date)`

### `pg_settlement_lines`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| settlement_id | UUID | NOT NULL, FK → pg_settlements(id) | |
| order_id | VARCHAR(100) | NOT NULL | |
| transaction_id | VARCHAR(100) | NOT NULL | |
| transaction_date | TIMESTAMPTZ | NOT NULL | |
| gross_amount | DECIMAL(15,2) | NOT NULL | |
| fee | DECIMAL(15,2) | NOT NULL | |
| tax | DECIMAL(15,2) | NOT NULL DEFAULT 0 | |
| net_amount | DECIMAL(15,2) | NOT NULL | |
| match_status | pg_match_status | NOT NULL DEFAULT 'unmatched' | |
| receipt_id | UUID | NULL, FK → payment_receipts(id) | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, settlement_id)`, `(tenant_id, order_id)`, `(tenant_id, match_status)`

---

## 6. Webhook / Integration

### Enums

```sql
CREATE TYPE webhook_event_status AS ENUM ('received', 'processing', 'processed', 'failed');
CREATE TYPE webhook_event_type AS ENUM (
  'vendor.created', 'vendor.updated',
  'po.created', 'po.updated',
  'grn.created', 'grn.updated',
  'invoice.created', 'invoice.updated'
);
```

### `webhook_events`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| tenant_id | UUID | NOT NULL, FK → tenants(id) | |
| event_type | webhook_event_type | NOT NULL | |
| source | VARCHAR(50) | NOT NULL DEFAULT 'wms' | |
| payload | JSONB | NOT NULL | |
| status | webhook_event_status | NOT NULL DEFAULT 'received' | |
| error_message | TEXT | NULL | |
| retries | INTEGER | NOT NULL DEFAULT 0 | |
| max_retries | INTEGER | NOT NULL DEFAULT 3 | |
| processed_at | TIMESTAMPTZ | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `(tenant_id, status)`, `(tenant_id, event_type, created_at)`, `(status, retries) WHERE status = 'failed' AND retries < max_retries`

---

## Entity Relationship Summary

```
tenants
  ├── users
  ├── vendors
  │     ├── purchase_orders → purchase_order_items
  │     ├── goods_receipt_notes → grn_items
  │     ├── purchase_invoices → purchase_invoice_items
  │     ├── payments → payment_allocations → purchase_invoices
  │     ├── advance_payments → advance_adjustments → purchase_invoices
  │     └── debit_notes
  ├── customers
  │     ├── sales_invoices → sales_invoice_items
  │     ├── payment_receipts → receipt_allocations → sales_invoices
  │     ├── credit_notes
  │     └── dunning_log
  ├── bank_accounts
  │     ├── bank_transactions → reconciliation_matches
  │     └── bank_reconciliations
  ├── petty_cash_accounts → petty_cash_transactions
  ├── pg_settlements → pg_settlement_lines
  ├── dunning_rules
  ├── invoice_sequences
  └── webhook_events
```

## Key Design Decisions

1. **Denormalized balance fields** — `purchase_invoices.amount_paid`, `sales_invoices.amount_received`, `advance_payments.balance`, `bank_accounts.current_balance` are denormalized for speed. Updated transactionally. Source of truth can be recomputed from allocation tables.

2. **Soft delete is selective** — Only `vendors` and `customers` support soft delete. Financial documents use status-based lifecycle (`cancelled`).

3. **No General Ledger in MVP** — Schema is designed so GL can be layered on top later — every payment, receipt, and allocation becomes a source for double-entry postings.

4. **Quantity as DECIMAL(12,3)** — Supports fractional quantities (kg, litres) common in Indian operations.

## Migration Sequence

1. Create all ENUM types
2. `tenants` → `users`
3. `bank_accounts`
4. `vendors` → `customers`
5. `purchase_orders` → `purchase_order_items`
6. `goods_receipt_notes` → `grn_items`
7. `purchase_invoices` → `purchase_invoice_items`
8. `payments` → `payment_allocations`
9. `advance_payments` → `advance_adjustments`
10. `debit_notes`
11. `invoice_sequences` → `sales_invoices` → `sales_invoice_items`
12. `payment_receipts` → `receipt_allocations`
13. `credit_notes` → `dunning_rules` → `dunning_log`
14. `bank_transactions` → `bank_reconciliations` → `reconciliation_matches`
15. `petty_cash_accounts` → `petty_cash_transactions`
16. `pg_settlements` → `pg_settlement_lines`
17. `webhook_events`
18. Enable RLS + create policies on all tables (except `tenants`)
19. Create `updated_at` trigger function

### `updated_at` trigger

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Table Count: 29 tables

| Module | Tables |
|--------|--------|
| Core | 2 |
| AP | 12 |
| AR | 9 |
| Banking | 6 |
| PG Recon | 2 |
| Webhook | 1 |
