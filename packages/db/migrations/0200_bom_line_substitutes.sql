-- Manufacturing — interchangeable BOM inputs, as substitutes on a line.
--
-- Supersedes bom_lines.substitute_group (migration 0199), which spread one
-- requirement across peer lines that each carried the full qty: three raw-milk
-- lines at 7 L read as 21 L to anyone looking at the recipe. A line now keeps
-- its single qty and lists the items it will accept instead.
CREATE TABLE IF NOT EXISTS bom_line_substitutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  bom_line_id UUID NOT NULL REFERENCES bom_lines(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  priority INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uq_bom_line_subs_line_item UNIQUE (bom_line_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_bom_line_subs_line
  ON bom_line_substitutes (bom_line_id);

-- Fold any existing pool into the pool's first line: its siblings become
-- substitutes, and consumption already posted against them re-points at the
-- surviving line so plan-vs-actual keeps its grouping.
DO $$
DECLARE
  pool RECORD;
  keeper UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bom_lines' AND column_name = 'substitute_group'
  ) THEN
    RETURN;
  END IF;

  FOR pool IN
    EXECUTE 'SELECT bom_id, substitute_group FROM bom_lines
             WHERE substitute_group IS NOT NULL
             GROUP BY bom_id, substitute_group'
  LOOP
    EXECUTE 'SELECT id FROM bom_lines WHERE bom_id = $1 AND substitute_group = $2
             ORDER BY line_no LIMIT 1'
      INTO keeper USING pool.bom_id, pool.substitute_group;

    EXECUTE 'INSERT INTO bom_line_substitutes (tenant_id, bom_line_id, item_id, priority)
             SELECT tenant_id, $1, input_item_id, line_no FROM bom_lines
             WHERE bom_id = $2 AND substitute_group = $3 AND id <> $1
             ON CONFLICT (bom_line_id, item_id) DO NOTHING'
      USING keeper, pool.bom_id, pool.substitute_group;

    EXECUTE 'UPDATE wo_consumption SET bom_line_id = $1 WHERE bom_line_id IN (
               SELECT id FROM bom_lines
               WHERE bom_id = $2 AND substitute_group = $3 AND id <> $1)'
      USING keeper, pool.bom_id, pool.substitute_group;

    EXECUTE 'DELETE FROM bom_lines
             WHERE bom_id = $1 AND substitute_group = $2 AND id <> $3'
      USING pool.bom_id, pool.substitute_group, keeper;
  END LOOP;
END $$;

DROP INDEX IF EXISTS idx_bom_lines_substitute_group;
ALTER TABLE bom_lines DROP COLUMN IF EXISTS substitute_group;
