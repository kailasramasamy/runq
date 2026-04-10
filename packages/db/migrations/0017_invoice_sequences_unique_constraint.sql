-- 0017_invoice_sequences_unique_constraint.sql
-- Belt-and-suspenders: ensures the unique constraint on invoice_sequences
-- (tenant_id, financial_year) exists. drizzle-kit push SHOULD create it
-- from the Drizzle schema's unique().on() definition, but it was observed
-- getting dropped on Railway deploys, causing ON CONFLICT specification
-- errors when creating invoices.
--
-- Idempotent — safe to run repeatedly.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'invoice_sequences'::regclass
      AND contype = 'u'
  ) THEN
    ALTER TABLE invoice_sequences
    ADD CONSTRAINT invoice_sequences_tenant_id_financial_year_unique
    UNIQUE (tenant_id, financial_year);
  END IF;
END
$$;
