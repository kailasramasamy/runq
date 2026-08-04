-- Reclaim: record what the recovered material is earmarked for.
--
-- The morning teardown is a technician counting unsold packets and saying
-- "these go to curd". The curd itself is produced hours later as its own run,
-- so this column carries intent only — no stock moves and no GL posts against
-- it. Nullable because a reclaim with no decision attached is still valid.

ALTER TABLE mfg_reclaim_lines
  ADD COLUMN IF NOT EXISTS destination_item_id UUID REFERENCES items (id);

CREATE INDEX IF NOT EXISTS idx_mfg_reclaim_lines_destination
  ON mfg_reclaim_lines (tenant_id, destination_item_id)
  WHERE destination_item_id IS NOT NULL;
