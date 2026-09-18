-- 0211_mp_quality_rejection_account.sql
--
-- Seeds the milk-quality rejection contra-expense leaf 5070 for existing
-- tenants (new tenants get it via STANDARD_COA). MpGlPoster has referenced
-- 5070 since the rejection feature (0209), but nothing ever created the
-- account, so locking a cycle with a rejection failed with
-- "Account codes not found: 5070".
--
-- NOT EXISTS rather than ON CONFLICT (dev DBs may lack the (tenant_id, code)
-- unique constraint); parent resolved via a scalar subquery (LIMIT 1) to avoid
-- fan-out on tenants with duplicate parent codes. Mirrors 0151 / 0159.
--
-- Apply in native dev via scripts/run-sql.ts (drizzle-kit push is the prod path).

BEGIN;

INSERT INTO accounts (tenant_id, code, name, type, parent_id)
SELECT t.id, v.code, v.name, v.type::account_type,
  (SELECT p.id FROM accounts p
   WHERE p.tenant_id = t.id AND p.code = v.parent_code
   ORDER BY p.created_at LIMIT 1)
FROM tenants t
CROSS JOIN (VALUES
  ('5070', 'Milk Quality Rejections', 'expense', '5100')
) AS v(code, name, type, parent_code)
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.tenant_id = t.id AND a.code = v.code
);

COMMIT;
