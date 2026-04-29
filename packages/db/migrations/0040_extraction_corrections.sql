-- Generic extraction-corrections log: every time a user saves a document
-- that was AI/locally extracted, we capture the AI's raw output, the
-- user's final saved values, and a field-level diff. Used for:
--   1. Per-tenant analytics: where is AI weakest?
--   2. Per-vendor template / alias auto-population
--   3. Few-shot examples in future extraction prompts
-- Shared across AP bills, AR POs, and bank statement parsing.

DO $$ BEGIN
  CREATE TYPE extraction_doc_type AS ENUM ('ap_bill', 'ar_po', 'bank_statement');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE extraction_method AS ENUM ('local', 'ai', 'template', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS extraction_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  document_type extraction_doc_type NOT NULL,
  source_entity_type VARCHAR(40),
  source_entity_id UUID,
  vendor_id UUID,
  customer_id UUID,
  ai_output JSONB NOT NULL,
  user_output JSONB NOT NULL,
  diff JSONB NOT NULL,
  ai_confidence NUMERIC(5,2),
  extraction_method extraction_method NOT NULL DEFAULT 'ai',
  fields_changed_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ext_corr_tenant_vendor ON extraction_corrections (tenant_id, vendor_id, created_at DESC) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ext_corr_tenant_customer ON extraction_corrections (tenant_id, customer_id, created_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ext_corr_tenant_doctype ON extraction_corrections (tenant_id, document_type, created_at DESC);
