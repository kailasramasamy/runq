-- 0128_batch_code_template.sql
--
-- PP — Direct Receipt batch picker (slice 1: schema).
--
-- Adds a per-item template used by the Direct Receipt UI to pre-fill a
-- new batch code for batch-tracked items. Plant operators were typing
-- codes like A1-POOL-20260531 by hand and making mistakes; the template
-- + an "open batches" picker (next slice) eliminates the typing.
--
-- Tokens rendered by the API: {SKU}, {YYYY}, {MM}, {DD}, {YYYYMMDD}.
-- Unknown tokens are left as literals. NULL = no auto-suggest.
--
-- Nullable, no backfill — items without a template fall back to the
-- UI's generic "+ Start new batch" path (manual entry).

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS batch_code_template VARCHAR(80);
