-- MP CC-scoped cycle cutover (Option A). Run ONCE per environment AFTER deploying
-- the CC-scoped code (commits 29844e0f, 27d42707). See docs/mp-cc-cutover.md.
-- Discards provisional (open) whole-tenant cycles; keeps locked/paid as history.
-- Aborts if an open whole-tenant cycle has a field-paid line. Idempotent.
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
