-- Milk taken now, product recorded later.
--
-- The floor draws 40 litres "for khoa" and only knows what came out hours
-- afterwards. Today that first half posts as a bare inventory adjustment —
-- "To make Khoa", 40 litres gone, no output, no yield, nothing tying the milk
-- to the khoa it became. Three such adjustments account for 63.4 litres on one
-- consignment alone.
--
-- That shape is exactly a work order's: consume, then output, then close. The
-- only thing stopping the floor from using one is that opening a WO demands a
-- recipe and a planned quantity, and a draw has neither — nobody knows the
-- yield until the kettle is done.
--
-- So a WO may now carry no BOM. It names its own output item instead, which a
-- BOM-backed run gets from its recipe. Reads must COALESCE the two: see
-- wo.service.ts and reports.service.ts, where the joins to `boms` became LEFT
-- joins for this.

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS output_item_id uuid REFERENCES items(id),
  ADD COLUMN IF NOT EXISTS output_uom varchar(20);

-- Every existing WO has a recipe; copy what it says so the new columns are the
-- single place to read a product from, and no query has to care which era a
-- row was written in.
UPDATE work_orders w
SET output_item_id = b.output_item_id,
    output_uom     = b.output_uom
FROM boms b
WHERE b.id = w.bom_id
  AND w.output_item_id IS NULL;

-- A draw has no recipe, no version and no plan. Storing a placeholder BOM or a
-- planned quantity of zero would put a number the floor never stated into
-- every yield report; absent is the truthful value.
ALTER TABLE work_orders
  ALTER COLUMN bom_id DROP NOT NULL,
  ALTER COLUMN bom_version DROP NOT NULL,
  ALTER COLUMN planned_qty DROP NOT NULL;

-- Whichever era wrote the row, it must name its product.
ALTER TABLE work_orders
  ADD CONSTRAINT chk_wo_has_output
  CHECK (bom_id IS NOT NULL OR output_item_id IS NOT NULL);

-- Open draws are read on every load of the Manufacturing home ("milk that is
-- out and not yet accounted for"), and they are a thin slice of the table.
CREATE INDEX IF NOT EXISTS idx_wo_open_draws
  ON work_orders (tenant_id, status)
  WHERE bom_id IS NULL;

COMMENT ON COLUMN work_orders.output_item_id IS
  'The product this run makes. Copied from the BOM for recipe-backed runs; the only source for a recipe-less draw.';
