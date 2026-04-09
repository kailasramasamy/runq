-- 0003_po_inbox.sql
-- PO Inbox foundation: tables for the share-sheet / drop / paste flow that
-- ingests customer purchase orders, drafts an invoice from them via Claude,
-- and feeds the human review-and-approve queue.
--
-- Four new tables:
--   po_uploads             — raw inbound file or pasted text + storage info
--   po_drafts              — extracted/normalized PO ready for review
--   po_draft_lines         — line items from the parsed PO
--   customer_sku_aliases   — per-customer "their name → our SKU" memory
--
-- All idempotent. RLS is applied separately by `pnpm db:rls`.

BEGIN;

-- ─── Enums ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE po_source_channel AS ENUM (
    'share_sheet', 'web_drop', 'web_upload', 'paste_image', 'paste_text', 'email_forward'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE po_upload_status AS ENUM (
    'pending', 'parsing', 'parsed', 'parse_error', 'discarded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE po_draft_review_status AS ENUM (
    'parsing', 'ready', 'needs_review', 'error', 'approved', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE po_customer_match_source AS ENUM (
    'gstin', 'phone', 'name_fuzzy', 'manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE po_item_match_source AS ENUM (
    'alias', 'name_fuzzy', 'manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── po_uploads ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS po_uploads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  uploaded_by     uuid REFERENCES users(id),

  source          po_source_channel NOT NULL,
  source_metadata jsonb,

  -- File storage (nullable for paste_text)
  storage_key     varchar(500),
  file_name       varchar(255),
  file_size       integer,
  file_mime       varchar(100),
  file_hash       varchar(64),

  -- Pasted text (nullable for file uploads)
  raw_text        text,

  -- Pipeline state
  status          po_upload_status NOT NULL DEFAULT 'pending',
  error_message   text,
  parsed_at       timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_uploads_tenant_status
  ON po_uploads (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_po_uploads_tenant_created
  ON po_uploads (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_po_uploads_tenant_hash
  ON po_uploads (tenant_id, file_hash);

-- ─── po_drafts ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS po_drafts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id),
  po_upload_id                uuid NOT NULL REFERENCES po_uploads(id) ON DELETE CASCADE,

  -- Customer match
  customer_id                 uuid REFERENCES customers(id),
  customer_match_source       po_customer_match_source,
  customer_match_confidence   numeric(3, 2),
  buyer_gstin_raw             varchar(15),
  buyer_name_raw              varchar(255),

  -- Header fields extracted from PO
  po_number_extracted         varchar(100),
  po_date                     date,
  delivery_date               date,

  -- Totals
  subtotal                    numeric(15, 2),
  tax_total                   numeric(15, 2),
  grand_total                 numeric(15, 2),

  -- Audit / reprocessing
  raw_extraction              jsonb,
  llm_model                   varchar(100),

  -- Review state
  review_status               po_draft_review_status NOT NULL DEFAULT 'parsing',
  review_flags                jsonb,

  -- Approval
  approved_invoice_id         uuid REFERENCES sales_invoices(id),
  approved_at                 timestamptz,
  approved_by                 uuid REFERENCES users(id),

  -- Rejection
  rejected_reason             text,
  rejected_at                 timestamptz,
  rejected_by                 uuid REFERENCES users(id),

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_drafts_tenant_status
  ON po_drafts (tenant_id, review_status);
CREATE INDEX IF NOT EXISTS idx_po_drafts_tenant_customer
  ON po_drafts (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_po_drafts_upload
  ON po_drafts (po_upload_id);

-- ─── po_draft_lines ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS po_draft_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  po_draft_id       uuid NOT NULL REFERENCES po_drafts(id) ON DELETE CASCADE,

  line_index        integer NOT NULL,

  -- Raw extraction
  raw_description   text NOT NULL,
  raw_qty           numeric(12, 3),
  raw_uom           varchar(20),
  raw_rate          numeric(15, 2),

  -- Item match
  matched_item_id   uuid REFERENCES items(id),
  match_source      po_item_match_source,
  match_confidence  numeric(3, 2),

  -- Resolved (PriceResolverService output)
  resolved_rate     numeric(15, 2),
  resolved_uom      varchar(20),
  tax_category      varchar(50),
  amount            numeric(15, 2),

  review_flag       varchar(50),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_draft_lines_draft
  ON po_draft_lines (po_draft_id);
CREATE INDEX IF NOT EXISTS idx_po_draft_lines_tenant_item
  ON po_draft_lines (tenant_id, matched_item_id);

-- ─── customer_sku_aliases ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_sku_aliases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  alias_text    varchar(255) NOT NULL,
  item_id       uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_by    uuid REFERENCES users(id),
  use_count     integer NOT NULL DEFAULT 1,
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_csa_tenant_customer_alias
  ON customer_sku_aliases (tenant_id, customer_id, alias_text);
CREATE INDEX IF NOT EXISTS idx_csa_tenant_customer
  ON customer_sku_aliases (tenant_id, customer_id);

COMMIT;
