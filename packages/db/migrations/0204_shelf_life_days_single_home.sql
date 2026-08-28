-- Shelf life had two homes, and now that the column actually does something
-- the duplicate is a trap.
--
-- `items.shelf_life_days` is a real column that derives batch expiry for stock
-- arriving without one (raw milk off a procurement consignment — see
-- batch-suggest.service.ts and stock-query.service.ts). The dairy/FMCG
-- attribute preset also carried a free-text `shelfLifeDays` in items.attributes,
-- which nothing has ever read. Both render on the item form as "Shelf life",
-- so an operator filling the descriptive one would see no effect on expiry.
--
-- Keep the column, retire the attribute: move any value across, then drop the
-- key from both the item rows and each tenant's stored attribute schema (which
-- was lazily seeded from the preset, so removing it from the preset constant
-- alone would leave existing tenants with the duplicate field).

-- 1. Carry existing attribute values into the column, but never overwrite a
--    value already set there — the column is the authority. Non-numeric text
--    ("6 months") is left behind rather than coerced into a wrong number.
UPDATE items
SET shelf_life_days = (attributes ->> 'shelfLifeDays')::numeric
WHERE shelf_life_days IS NULL
  AND attributes ->> 'shelfLifeDays' ~ '^[0-9]+(\.[0-9]+)?$';

-- 2. Drop the attribute from the item rows.
UPDATE items
SET attributes = attributes - 'shelfLifeDays'
WHERE attributes ? 'shelfLifeDays';

-- 3. Drop the field from every tenant's stored item attribute schema.
UPDATE tenants
SET settings = jsonb_set(
      settings,
      '{itemAttributeSchema}',
      (
        SELECT COALESCE(jsonb_agg(f), '[]'::jsonb)
        FROM jsonb_array_elements(settings -> 'itemAttributeSchema') AS f
        WHERE f ->> 'key' <> 'shelfLifeDays'
      )
    )
WHERE jsonb_typeof(settings -> 'itemAttributeSchema') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(settings -> 'itemAttributeSchema') AS f
    WHERE f ->> 'key' = 'shelfLifeDays'
  );
