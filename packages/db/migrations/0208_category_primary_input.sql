-- Which raw materials the Manufacturing home screen leads with.
--
-- A plant opens the app to answer one question — "how much milk do I have" —
-- and the raw-material card answered it alongside every drum of oil and sack
-- of jaggery. The set that matters is not derivable from item_class (all of
-- them are raw_material) and hard-coding "dairy" would be wrong for the next
-- tenant, so it is declared: flag the category the floor works out of, and the
-- home card shows that and nothing else.
--
-- Inherited down one level: flagging the group "Milk & Dairy" covers the leaf
-- "Milk" under it, so nobody has to tick every child.
--
-- Read by StockQueryService (categoryIsPrimaryInput on each on-hand row). When
-- a tenant flags nothing, the home card falls back to showing every input —
-- the behaviour before this column existed.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_primary_input boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN categories.is_primary_input IS
  'Lead this category''s items on the Manufacturing home raw-material card. Inherited by child categories.';
