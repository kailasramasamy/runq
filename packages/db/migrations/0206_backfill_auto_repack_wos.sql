-- Relabel the repacks that already happened.
--
-- Separate file from 0205 because Postgres will not let a value added by
-- ALTER TYPE be used in the same transaction that added it.
--
-- Before this, the only trace of a repack was the note DispatchRepackService
-- writes on every run, so that exact prefix is what identifies them. The match
-- is deliberately anchored: a hand-typed note that merely mentions repacking
-- stays `unplanned`, because mislabelling a person's entry as machine-made is
-- the worse error of the two.
UPDATE work_orders
SET entry_mode = 'auto_repack'
WHERE entry_mode = 'unplanned'
  AND id IN (
    SELECT wo_id FROM wo_output
    WHERE notes LIKE 'Repacked on dispatch for %'
  );
