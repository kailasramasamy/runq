-- Milk refused for quality, recorded instead of erased.
--
-- Until now the app had two states for milk: collected, or never happened.
-- A rejection is neither, so the only way to reflect one was to cancel the
-- whole chain back to the pour — which withholds the money but destroys the
-- evidence. A farmer whose milk is refused every week then looks identical to
-- one whose never is, and the QC reading that justified the refusal goes with
-- it.
--
-- So the pour or receipt STAYS, with its reading, and a rejection sits beside
-- it carrying the litres, the reason and who is out of pocket.
--
-- Settlement is deliberately thin, because two of the three cases already have
-- a rail:
--   * gate rejection  — no pour is created, so nothing ever accrues
--   * VMCC's milk     — billed off mp_consignments.receipt_qty, and a rejection
--                       is received NET, so the litres never reach the bill
--   * farmer's milk rejected downstream — the only case needing a deduction,
--                       and it rides the same farmer-ledger waterfall that
--                       mp_farmer_sales already uses
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so the enum
-- extensions come first and stand alone.

ALTER TYPE mp_deduction ADD VALUE IF NOT EXISTS 'quality_rejection';
ALTER TYPE mp_ledger_entry ADD VALUE IF NOT EXISTS 'quality_rejection';

DO $$ BEGIN
  CREATE TYPE mp_rejection_stage AS ENUM ('gate', 'cc_receipt', 'pp_receipt');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mp_rejection_reason AS ENUM (
    'sour', 'adulterated', 'temperature', 'cob_positive', 'antibiotic',
    'foreign_matter', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mp_rejection_disposition AS ENUM ('returned', 'destroyed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mp_rejection_bearer AS ENUM ('farmer', 'vmcc', 'company');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS mp_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  stage mp_rejection_stage NOT NULL,
  -- Same polymorphic pair mp_qc_tests uses, so the reading that justified the
  -- refusal and the refusal itself hang off one id.
  subject_type VARCHAR(20) NOT NULL,
  subject_id UUID,
  node_id UUID NOT NULL REFERENCES mp_nodes(id),
  -- Null at the gate: the source there is a farmer, not a node.
  from_node_id UUID REFERENCES mp_nodes(id),
  collection_date DATE NOT NULL,
  shift mp_shift,
  milk_type mp_milk_type,
  qty_litres DECIMAL(12,3) NOT NULL,
  reason mp_rejection_reason NOT NULL,
  notes VARCHAR(500),
  disposition mp_rejection_disposition NOT NULL DEFAULT 'returned',
  borne_by mp_rejection_bearer NOT NULL,
  journal_entry_id UUID REFERENCES journal_entries(id),
  rejected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rejected_by UUID REFERENCES users(id),
  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_mp_rejections_subject CHECK (subject_type IN ('pour', 'consignment')),
  -- Refusing zero litres is not a rejection; a negative one is a data error.
  CONSTRAINT chk_mp_rejections_qty CHECK (qty_litres > 0),
  -- 'other' without a note is unauditable a month later, when the reason is
  -- the only thing anyone wants to know.
  CONSTRAINT chk_mp_rejections_other_note
    CHECK (reason <> 'other' OR (notes IS NOT NULL AND btrim(notes) <> ''))
);

CREATE INDEX IF NOT EXISTS idx_mp_rejections_node_date
  ON mp_rejections (tenant_id, node_id, collection_date);
CREATE INDEX IF NOT EXISTS idx_mp_rejections_from_date
  ON mp_rejections (tenant_id, from_node_id, collection_date);
CREATE INDEX IF NOT EXISTS idx_mp_rejections_subject
  ON mp_rejections (tenant_id, subject_type, subject_id);

-- What one rejection costs and to whom. Its own table because a rejected can
-- can trace back to several farmers' pours and splits across them by volume,
-- one charge each at that pour's own rate — so what is withheld matches what
-- would have been paid.
CREATE TABLE IF NOT EXISTS mp_rejection_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  rejection_id UUID NOT NULL REFERENCES mp_rejections(id) ON DELETE CASCADE,
  farmer_id UUID REFERENCES mp_farmers(id),
  vmcc_node_id UUID REFERENCES mp_nodes(id),
  pour_id UUID REFERENCES mp_pours(id),
  qty_litres DECIMAL(12,3) NOT NULL,
  rate_per_litre DECIMAL(8,2) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  -- Farmer charges only: the quality_rejection debit on the running ledger that
  -- the payout waterfall recovers. A VMCC charge needs no equivalent — its milk
  -- is billed off receipt_qty, and a rejection is received net.
  ledger_entry_id UUID REFERENCES mp_farmer_ledger(id),
  reversed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A charge lands on exactly one party. Both set would double-count the
  -- rejection; neither leaves litres nobody is answerable for.
  CONSTRAINT chk_mp_rej_charge_party CHECK (
    (farmer_id IS NOT NULL AND vmcc_node_id IS NULL)
    OR (farmer_id IS NULL AND vmcc_node_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_mp_rej_charges_rejection
  ON mp_rejection_charges (tenant_id, rejection_id);
CREATE INDEX IF NOT EXISTS idx_mp_rej_charges_farmer
  ON mp_rejection_charges (tenant_id, farmer_id);
CREATE INDEX IF NOT EXISTS idx_mp_rej_charges_vmcc
  ON mp_rejection_charges (tenant_id, vmcc_node_id);
