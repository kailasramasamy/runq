-- PP Phase 5 (part 1/2): add 'po_with_bill' to inventory_grn_source.
--
-- Postgres won't let us reference a new enum value in the same transaction
-- it was added — `ALTER TYPE ... ADD VALUE` must commit before the value is
-- usable. So the enum bump ships standalone; the CHECK constraint and
-- variance columns land in 0122.

ALTER TYPE inventory_grn_source ADD VALUE IF NOT EXISTS 'po_with_bill';
