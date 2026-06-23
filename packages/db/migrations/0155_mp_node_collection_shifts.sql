-- Which shifts a VMCC collects in (both | am | pm). Drives the CC receive-screen
-- VMCC list: only sources active for the current shift are shown. Default both.
DO $$ BEGIN
  CREATE TYPE mp_collection_shifts AS ENUM ('both', 'am', 'pm');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE mp_nodes
  ADD COLUMN IF NOT EXISTS collection_shifts mp_collection_shifts NOT NULL DEFAULT 'both';
