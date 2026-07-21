-- Enforce one live payout cycle per (tenant, CC, period).
--
-- Cycles are CC-scoped, and a second cycle over the same CC+period doubles the
-- farmer lines and the lock accrual. The application guard in
-- PayoutService.createCycle checked for a duplicate *outside* the insert
-- transaction, so two concurrent "Generate" requests could both pass the check
-- and both insert. This DB-level partial unique index closes that race.
--
-- 'reversed' cycles are excluded so a period can legitimately be re-cycled
-- after a reversal. scope_node_id NULL (legacy whole-tenant cycles) is not
-- constrained — NULLs are distinct in a unique index, matching the app guard
-- which only fires when a scope is set.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_cycle_scope_period
  ON mp_payout_cycles (tenant_id, scope_node_id, period_start, period_end)
  WHERE status <> 'reversed';
