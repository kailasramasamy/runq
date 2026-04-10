-- 0015_invoice_import_aliases.sql
-- Persisted name → master mappings for the invoice import feature.
-- When a tenant uploads invoices and resolves an unmatched item or
-- customer, the chosen mapping is saved here so future imports auto-map
-- the same source name without manual intervention.
--
-- Two tables, both tenant-scoped:
--   invoice_import_item_aliases     — source item name      → items.id
--   invoice_import_customer_aliases — source customer name  → customers.id
--                                     (also used for GSTIN keys)
--
-- The matcher does exact lookups against these tables AND uses the
-- source_name/source_key column as additional fuzzy-match candidates,
-- so a typo'd or differently-formatted source name can still resolve
-- via a previously-confirmed alias.
--
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS invoice_import_item_aliases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  source_name  varchar(255) NOT NULL,
  item_id      uuid NOT NULL REFERENCES items(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_import_item_aliases_tenant_source
  ON invoice_import_item_aliases (tenant_id, lower(source_name));

CREATE INDEX IF NOT EXISTS idx_invoice_import_item_aliases_tenant
  ON invoice_import_item_aliases (tenant_id);

CREATE TABLE IF NOT EXISTS invoice_import_customer_aliases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  source_key   varchar(255) NOT NULL,
  customer_id  uuid NOT NULL REFERENCES customers(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_import_customer_aliases_tenant_source
  ON invoice_import_customer_aliases (tenant_id, lower(source_key));

CREATE INDEX IF NOT EXISTS idx_invoice_import_customer_aliases_tenant
  ON invoice_import_customer_aliases (tenant_id);

COMMIT;
