-- 0108_reward_points.sql
-- Reward points: a third reward kind that lets a manager grant points to an
-- employee (HR-approved like other rewards). Points accumulate and can be
-- redeemed by the employee for cash at a fixed 1 point = ₹1 — a redemption
-- is stored as a kind='monetary' reward with points_used set, initiated by
-- the employee themselves, then settled via the existing monetary payout.

ALTER TYPE reward_kind ADD VALUE IF NOT EXISTS 'points';

ALTER TABLE employee_rewards
  ADD COLUMN IF NOT EXISTS points_used INTEGER;

-- A redemption row is identifiable by points_used IS NOT NULL.
CREATE INDEX IF NOT EXISTS idx_er_tenant_employee_points_used
  ON employee_rewards (tenant_id, employee_id)
  WHERE points_used IS NOT NULL;
