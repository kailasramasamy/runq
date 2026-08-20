-- 0195_mp_farmer_sales_products.sql
--
-- Generalises 0194's milk-only sale into any goods sold to a farmer. Farmers
-- who buy from us don't only buy bulk milk — they buy ghee, curd and paneer off
-- the counter, and those belong in the same place for the same reason: they are
-- recovered from the farmer's next payout, ahead of advances.
--
--   mp_farmer_milk_sales  →  mp_farmer_sales
--   kind = 'raw_milk'     — milk_type + shift, litres draw down the centre's
--                           available-to-dispatch (unchanged behaviour)
--   kind = 'product'      — an items row (ghee/curd/paneer). Money only: no
--                           stock issue and no COGS, because Dhenu has no
--                           per-centre warehouse to relieve. Revisit when it does.
--
-- Enum values are renamed to match (`milk_sale` → `farmer_sale`), which is safe
-- in place: 0194 shipped hours ago and only dev rows carry them.
--
-- Apply in native dev via scripts/run-sql.ts (drizzle-kit push is the prod path).

BEGIN;

ALTER TYPE mp_ledger_entry RENAME VALUE 'milk_sale' TO 'farmer_sale';
ALTER TYPE mp_deduction RENAME VALUE 'milk_sale' TO 'farmer_sale';

DO $$ BEGIN
  CREATE TYPE mp_sale_kind AS ENUM ('raw_milk', 'product');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE mp_farmer_milk_sales RENAME TO mp_farmer_sales;
ALTER TABLE mp_farmer_sales RENAME COLUMN qty_litres TO qty;
ALTER TABLE mp_farmer_sales RENAME COLUMN rate_per_litre TO rate_per_unit;

ALTER TABLE mp_farmer_sales
  ADD COLUMN IF NOT EXISTS kind mp_sale_kind NOT NULL DEFAULT 'raw_milk',
  ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES items(id),
  ADD COLUMN IF NOT EXISTS unit varchar(20) NOT NULL DEFAULT 'L';

-- milk_type is raw-milk-only now; a product line carries none.
ALTER TABLE mp_farmer_sales ALTER COLUMN milk_type DROP NOT NULL;
-- Rate needs room for a ₹600/kg ghee, not just a ₹45 litre.
ALTER TABLE mp_farmer_sales ALTER COLUMN rate_per_unit TYPE numeric(12,2);

-- A line is one kind or the other, never a blend of both.
ALTER TABLE mp_farmer_sales DROP CONSTRAINT IF EXISTS chk_mp_farmer_sales_kind;
ALTER TABLE mp_farmer_sales ADD CONSTRAINT chk_mp_farmer_sales_kind CHECK (
  (kind = 'raw_milk' AND milk_type IS NOT NULL AND item_id IS NULL)
  OR
  (kind = 'product' AND item_id IS NOT NULL AND milk_type IS NULL AND shift IS NULL)
);

ALTER INDEX IF EXISTS idx_mp_milk_sales_node_date RENAME TO idx_mp_farmer_sales_node_date;
ALTER INDEX IF EXISTS idx_mp_milk_sales_farmer RENAME TO idx_mp_farmer_sales_farmer;

-- The income account is no longer milk-only.
UPDATE accounts SET name = 'Sales to Farmers & Traders'
WHERE code = '4006' AND name = 'Milk Sales — Farmers & Traders';

COMMIT;
