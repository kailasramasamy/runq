-- 0126_gst_amendments.sql
--
-- GST Amendment System — Phase 1 (schema).
-- Spec: docs/gst-amendment-plan.md, tracker docs/gst-amendment-tracker.md.
--
-- What this migration does:
--   1. Extends credit_notes with full GST tax fields + amendment metadata.
--   2. Adds credit_note_items (line-item breakdown, mirrors sales_invoice_items).
--   3. Creates customer_debit_notes + customer_debit_note_items.
--      (Existing debit_notes table stays vendor-side; the new table covers the
--      customer/sales side, e.g. raising a DN on a customer who underpaid or
--      where we under-billed an invoice already in a filed GSTR-1.)
--   4. Extends journal_entries.source_type with `credit_note` + `customer_debit_note`.
--
-- Existing rows in credit_notes: tax columns default to 0 so existing CNs
-- continue to balance (they'll be treated as zero-tax adjustments in GSTR-1,
-- which matches today's behaviour where CN tax was hardcoded to 0 anyway).
-- The amends_invoice_number / _date columns default NULL — backfill happens
-- in Phase 2 when the service starts populating them from invoice_id.

BEGIN;

-- ─── 1. credit_notes: tax + amendment metadata ──────────────────────────

ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS taxable_value      numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount        numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount        numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount        numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cess_amount        numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS place_of_supply         varchar(100),
  ADD COLUMN IF NOT EXISTS place_of_supply_code    varchar(2),
  ADD COLUMN IF NOT EXISTS is_inter_state          boolean,
  ADD COLUMN IF NOT EXISTS reverse_charge          boolean NOT NULL DEFAULT false,
  -- Identity of the original invoice this CN amends. Captured as text so the
  -- record survives rename/delete of the original sales_invoices row.
  ADD COLUMN IF NOT EXISTS amends_invoice_number   varchar(50),
  ADD COLUMN IF NOT EXISTS amends_invoice_date     date;

-- ─── 2. credit_note_items ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS credit_note_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  credit_note_id  uuid NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  item_id         uuid,
  description     varchar(500) NOT NULL,
  uom             varchar(20),
  pack_size_value numeric(12,4) NOT NULL DEFAULT 1,
  pack_size_uqc   varchar(10),
  quantity        numeric(12,3) NOT NULL,
  unit_price      numeric(15,2) NOT NULL,
  amount          numeric(15,2) NOT NULL,
  hsn_sac_code    varchar(8),
  tax_category    tax_category,
  tax_rate        numeric(5,2),
  cgst_rate       numeric(5,2) NOT NULL DEFAULT 0,
  cgst_amount     numeric(15,2) NOT NULL DEFAULT 0,
  sgst_rate       numeric(5,2) NOT NULL DEFAULT 0,
  sgst_amount     numeric(15,2) NOT NULL DEFAULT 0,
  igst_rate       numeric(5,2) NOT NULL DEFAULT 0,
  igst_amount     numeric(15,2) NOT NULL DEFAULT 0,
  cess_rate       numeric(5,2) NOT NULL DEFAULT 0,
  cess_amount     numeric(15,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cni_credit_note_id ON credit_note_items(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_cni_tenant         ON credit_note_items(tenant_id);

ALTER TABLE credit_note_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_note_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_credit_note_items ON credit_note_items;
CREATE POLICY tenant_isolation_credit_note_items ON credit_note_items
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ─── 3. customer_debit_notes ────────────────────────────────────────────

-- Reuse the existing debit_note_status enum (draft/issued/adjusted/cancelled).
-- Mirrors credit_notes structure so the GSTR-1 generator can treat both
-- uniformly under the CDN (credit-debit note) section.

CREATE TABLE IF NOT EXISTS customer_debit_notes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  debit_note_number      varchar(50) NOT NULL,
  customer_id            uuid NOT NULL REFERENCES customers(id),
  invoice_id             uuid REFERENCES sales_invoices(id),
  issue_date             date NOT NULL,
  amount                 numeric(15,2) NOT NULL,
  reason                 text NOT NULL,
  status                 debit_note_status NOT NULL DEFAULT 'draft',
  taxable_value          numeric(15,2) NOT NULL DEFAULT 0,
  cgst_amount            numeric(15,2) NOT NULL DEFAULT 0,
  sgst_amount            numeric(15,2) NOT NULL DEFAULT 0,
  igst_amount            numeric(15,2) NOT NULL DEFAULT 0,
  cess_amount            numeric(15,2) NOT NULL DEFAULT 0,
  place_of_supply        varchar(100),
  place_of_supply_code   varchar(2),
  is_inter_state         boolean,
  reverse_charge         boolean NOT NULL DEFAULT false,
  amends_invoice_number  varchar(50),
  amends_invoice_date    date,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, debit_note_number)
);
CREATE INDEX IF NOT EXISTS idx_cdn_tenant_customer ON customer_debit_notes(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_cdn_tenant_issue    ON customer_debit_notes(tenant_id, issue_date);
CREATE INDEX IF NOT EXISTS idx_cdn_invoice         ON customer_debit_notes(invoice_id);

ALTER TABLE customer_debit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_debit_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_customer_debit_notes ON customer_debit_notes;
CREATE POLICY tenant_isolation_customer_debit_notes ON customer_debit_notes
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ─── 4. customer_debit_note_items ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_debit_note_items (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id),
  customer_debit_note_id  uuid NOT NULL REFERENCES customer_debit_notes(id) ON DELETE CASCADE,
  item_id                 uuid,
  description             varchar(500) NOT NULL,
  uom                     varchar(20),
  pack_size_value         numeric(12,4) NOT NULL DEFAULT 1,
  pack_size_uqc           varchar(10),
  quantity                numeric(12,3) NOT NULL,
  unit_price              numeric(15,2) NOT NULL,
  amount                  numeric(15,2) NOT NULL,
  hsn_sac_code            varchar(8),
  tax_category            tax_category,
  tax_rate                numeric(5,2),
  cgst_rate               numeric(5,2) NOT NULL DEFAULT 0,
  cgst_amount             numeric(15,2) NOT NULL DEFAULT 0,
  sgst_rate               numeric(5,2) NOT NULL DEFAULT 0,
  sgst_amount             numeric(15,2) NOT NULL DEFAULT 0,
  igst_rate               numeric(5,2) NOT NULL DEFAULT 0,
  igst_amount             numeric(15,2) NOT NULL DEFAULT 0,
  cess_rate               numeric(5,2) NOT NULL DEFAULT 0,
  cess_amount             numeric(15,2) NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cdni_dn_id   ON customer_debit_note_items(customer_debit_note_id);
CREATE INDEX IF NOT EXISTS idx_cdni_tenant  ON customer_debit_note_items(tenant_id);

ALTER TABLE customer_debit_note_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_debit_note_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_customer_debit_note_items ON customer_debit_note_items;
CREATE POLICY tenant_isolation_customer_debit_note_items ON customer_debit_note_items
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- journal_entries.source_type is varchar(50), no schema change needed.
-- New values 'credit_note' and 'customer_debit_note' are controlled in
-- application code (GLService).

COMMIT;
