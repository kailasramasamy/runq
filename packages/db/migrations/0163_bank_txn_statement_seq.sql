-- Statement row position for bank transactions.
-- Bank statements are date-only (no per-txn time) and created_at is identical
-- for every row of a bulk import, so neither can order same-day transactions.
-- statement_seq captures the row's position within its source statement (file
-- order, oldest-first), giving a stable chronological tiebreaker within a day.
-- Sorted desc alongside transaction_date so the latest same-day txn is on top.
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS statement_seq integer;

-- Backfill existing rows: per account+day, order by import time then id so the
-- assignment is deterministic. Historical same-day rows share created_at, so
-- this is best-effort ordering — new imports capture true statement order.
WITH seq AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY bank_account_id, transaction_date
           ORDER BY created_at, id
         ) - 1 AS rn
  FROM bank_transactions
  WHERE statement_seq IS NULL
)
UPDATE bank_transactions bt
SET statement_seq = seq.rn
FROM seq
WHERE bt.id = seq.id;
