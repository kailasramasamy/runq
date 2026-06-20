-- Tenant-asserted ineligible ITC on GSTR-2B inward supplies. Covers Sec 17(5)
-- blocked credits, personal/non-business use, and "not our supply" (a partner
-- billed a shared GSTIN). Keyed by the STABLE 2B identity (period + supplier
-- GSTIN + doc no) so the decision survives reconcile()/pull2b deleting and
-- re-inserting gstr2b_matches on every run. Presence of a row = ineligible;
-- the 3B generator reverses these in Table 4(B):
--   sec_17_5 / personal      -> 4(B)(1) (rules 38/42/43 & section 17(5))
--   not_our_supply / other   -> 4(B)(2) (others)

DO $$ BEGIN
  CREATE TYPE gst_itc_inelig_reason AS ENUM ('sec_17_5', 'personal', 'not_our_supply', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS gst_itc_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  period varchar(6) NOT NULL,
  supplier_gstin varchar(15) NOT NULL,
  doc_no varchar(50) NOT NULL,
  reason gst_itc_inelig_reason NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_itc_decision UNIQUE (tenant_id, period, supplier_gstin, doc_no)
);

CREATE INDEX IF NOT EXISTS idx_itc_decision_tenant_period ON gst_itc_decisions (tenant_id, period);
