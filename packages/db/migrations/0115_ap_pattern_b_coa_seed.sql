-- 0115_ap_pattern_b_coa_seed.sql
--
-- Seeds the four inventory accounts not already in the standard COA,
-- so AP Pattern-B's GL routing has a complete itemClass → accountCode map.
--
-- Existing inventory accounts (from standard-chart-of-accounts.ts):
--   1111  Inventory — Raw Materials       → item_class = raw_material
--   1112  Inventory — Finished Goods      → item_class = finished_good
--   1113  Inventory — Packing Material    → item_class = packaging
--
-- New accounts added here (parent = 1100 Current Assets):
--   1118  Inventory — Semi-Finished Goods → item_class = semi_finished
--   1119  Inventory — Trading Stock       → item_class = trading_good
--   1120  Inventory — Consumables         → item_class = consumable
--   1121  Inventory — Spare Parts         → item_class = spare_part
--
-- Codes 1114–1117 are already taken (Short-Term Investments, Accrued Revenue,
-- Bank Suspense, Inter-Bank Transfer Clearing).
--
-- Spec had originally proposed 1201–1207 but those are Fixed Assets in the
-- standard COA. Spec doc updated in the same commit.
--
-- Anti-join INSERT is used instead of ON CONFLICT because the
-- (tenant_id, code) unique constraint declared in the Drizzle schema never
-- materialised in the DB (`db:push` quirk on dev). Anti-join is constraint-
-- agnostic and idempotent regardless.

BEGIN;

INSERT INTO accounts (tenant_id, code, name, type, parent_id, is_system_account, description)
SELECT
  t.id,
  v.code,
  v.name,
  'asset'::account_type,
  parent.id,
  true,
  v.description
FROM tenants t
CROSS JOIN (
  VALUES
    ('1118', 'Inventory — Semi-Finished Goods', 'Semi-finished goods in WIP; cleared to FG on production close.'),
    ('1119', 'Inventory — Trading Stock',       'Trading goods held for resale; not consumed in production.'),
    ('1120', 'Inventory — Consumables',         'Indirect materials consumed in operations (lubes, sanitisers, lab reagents).'),
    ('1121', 'Inventory — Spare Parts',         'Maintenance spares for plant & machinery.')
) AS v(code, name, description)
LEFT JOIN accounts parent ON parent.tenant_id = t.id AND parent.code = '1100'
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a
  WHERE a.tenant_id = t.id AND a.code = v.code
);

COMMIT;
