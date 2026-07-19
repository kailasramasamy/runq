# MP billing: cut over to CC-scoped cycles

Payout cycles are now **CC-scoped** — one cycle per `(CC, period)` instead of one
whole-tenant cycle. This removes cross-CC coupling: locking/paying/notifying one
CC no longer touches another CC's farmers.

Rolled out in three phases:

1. Backend cycle core (`resolveCycle`/`createCycle`/`pourAggregates`/auto-roll are
   CC-scoped). Commit `29844e0f`.
2. Web hub + duplicate-cycle guard. Commit `27d42707`.
3. **This cutover** — a one-time data step, run per environment **after deploying**
   the code above.

## What the cutover does (Option A)

Discards the **provisional (open) whole-tenant cycles** so per-CC cycles take over
from the current period forward. **Locked/paid** whole-tenant cycles are left
untouched as history (they still render via the legacy fallback in the cycle
detail page). Open cycles have posted no GL, so deleting them is safe — the pours
remain the source of truth and per-CC cycles rebuild their lines from them.

The script **aborts** if any open whole-tenant cycle has a field-paid line
(`paid_at`), since deleting it would drop operational payment state. Reconcile
those first if it fires.

## Run order

1. Deploy the API + web with commits `29844e0f` and `27d42707`.
2. Run the SQL below against that environment's DB (`psql "$DATABASE_URL" -f docs/mp-cc-cutover.sql`
   or paste into a SQL console). Idempotent — safe to re-run.
3. Verify: the Cycles list no longer shows an open "Whole tenant" row; new cycles
   appear per CC. Bill one CC and confirm only that CC's farmers are notified.

## SQL

```sql
-- Discard provisional (open) whole-tenant MP cycles; keep locked/paid as history.
DO $$
DECLARE paid_count int;
BEGIN
  SELECT count(*) INTO paid_count
  FROM mp_payout_lines l
  JOIN mp_payout_cycles c ON c.id = l.payout_cycle_id
  WHERE c.scope_node_id IS NULL AND c.status = 'open' AND l.paid_at IS NOT NULL;
  IF paid_count > 0 THEN
    RAISE EXCEPTION 'Aborting: % field-paid line(s) in open whole-tenant cycles. Reconcile before cutover.', paid_count;
  END IF;

  DELETE FROM mp_payout_deductions WHERE payout_line_id IN (
    SELECT l.id FROM mp_payout_lines l
    JOIN mp_payout_cycles c ON c.id = l.payout_cycle_id
    WHERE c.scope_node_id IS NULL AND c.status = 'open');

  DELETE FROM mp_payout_lines WHERE payout_cycle_id IN (
    SELECT id FROM mp_payout_cycles WHERE scope_node_id IS NULL AND status = 'open');

  DELETE FROM mp_payout_cycles WHERE scope_node_id IS NULL AND status = 'open';
END $$;
```
