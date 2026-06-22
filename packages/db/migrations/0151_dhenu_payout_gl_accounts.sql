-- 0151_dhenu_payout_gl_accounts.sql
--
-- P1.1 — wires Dhenu milk-procurement payouts into the GL. Adds the dedicated
-- dairy chart-of-accounts leaves so the payout poster can book:
--   • cycle lock  → Dr Milk Purchases / Cr Farmer Payable + Cr Advances + Cr Feed-Loans
--   • pay         → Dr Farmer Payable / Cr Bank
--   • adv/feed given → Dr Advances|Feed-Loans / Cr Bank
--
-- New tenants get these via the STANDARD_COA seed; this backfills every EXISTING
-- tenant, idempotently. parent_id resolves to the tenant's own group account.
--
-- Apply in native dev via scripts/run-sql.ts (drizzle-kit push is the prod path).

BEGIN;

-- NOT EXISTS rather than ON CONFLICT: dev DBs may lack the (tenant_id, code)
-- unique constraint, so we can't rely on conflict-arbiter inference here.
-- Parent resolved via a scalar subquery (LIMIT 1) — some tenant charts contain
-- duplicate parent codes, which a JOIN would fan out into duplicate inserts.
-- Codes sit in a dedicated 1150/2150/5050 block to avoid colliding with
-- tenant-customised charts (some tenants already use 1117-1121, 5007-5011).
INSERT INTO accounts (tenant_id, code, name, type, parent_id)
SELECT t.id, v.code, v.name, v.type::account_type,
  (SELECT p.id FROM accounts p
   WHERE p.tenant_id = t.id AND p.code = v.parent_code
   ORDER BY p.created_at LIMIT 1)
FROM tenants t
CROSS JOIN (VALUES
  ('1150', 'Farmer Advances',    'asset',     '1100'),
  ('1151', 'Cattle-Feed Loans',  'asset',     '1100'),
  ('2150', 'Farmer Payable',     'liability', '2100'),
  ('5050', 'Milk Purchases',     'expense',   '5100')
) AS v(code, name, type, parent_code)
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.tenant_id = t.id AND a.code = v.code
);

COMMIT;
