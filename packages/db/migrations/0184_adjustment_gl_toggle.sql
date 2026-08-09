-- Adjustments that unwind stock the GL never capitalised.
--
-- MP posts raw milk to stock_ledger at a pour-derived cost but posts no
-- journal entry (docs/dhenu-raw-milk-valuation.md §3 — step 2 is unbuilt), and
-- the milk is already expensed to 5050 at cycle lock. Writing that stock off
-- through the normal path would credit an inventory asset that was never
-- debited and expense the milk a second time.
--
-- post_gl = false suppresses only the journal entry. The adjustment document,
-- its lines, and the stock_ledger rows are still written, so the quantity
-- trail is unchanged. Defaults true — every pre-existing path keeps posting.
ALTER TABLE inventory_adjustments
  ADD COLUMN post_gl BOOLEAN NOT NULL DEFAULT TRUE;
