-- Manufacturing — interchangeable BOM inputs ("substitution pools").
--
-- Paneer is made from whatever raw milk is in the tank: A2, A1 or buffalo.
-- Without a pool every line is a separate requirement, so a run with 300 L
-- spread across the three fails three times over. Lines sharing a pool state
-- the same qty per output — that qty is what the pool needs in total, drawn
-- FEFO across every member item.
ALTER TABLE bom_lines
  ADD COLUMN IF NOT EXISTS substitute_group VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_bom_lines_substitute_group
  ON bom_lines (bom_id, substitute_group);
