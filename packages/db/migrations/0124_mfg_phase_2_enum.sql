-- 0124_mfg_phase_2_enum.sql
--
-- Manufacturing Phase 2 (1/2): extend stock_movement_type enum.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block,
-- so this migration must be applied separately from 0125 (the tables
-- + COA backfill). The runner statement-splits on `;` when no BEGIN/COMMIT
-- is present, so each ADD VALUE executes in its own implicit transaction.

ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'production_out';

ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'production_in';
