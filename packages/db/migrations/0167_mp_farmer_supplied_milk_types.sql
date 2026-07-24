-- Capture the milk types a farmer actually supplies (a subset of the primary
-- VMCC's accepted types), so a farmer supplying e.g. both A1 and buffalo is
-- modelled explicitly and priced per type. Legacy rows are backfilled to their
-- single default_milk_type; null/empty continues to mean "just the default".

ALTER TABLE mp_farmers ADD COLUMN IF NOT EXISTS supplied_milk_types mp_milk_type[];

UPDATE mp_farmers
SET supplied_milk_types = ARRAY[default_milk_type]
WHERE supplied_milk_types IS NULL;
