-- Performance review enhancements.
--   * performance_goals.progress_pct — mid-cycle progress (0-100), updatable
--     by the employee any time during the cycle. Kills recency bias.
--   * perf_review_status gains 'acknowledged' — the employee formally signs
--     off on the finalised review.
--   * performance_reviews.acknowledged_at + employee_ack_comment — sign-off
--     timestamp + an optional employee remark.

ALTER TABLE performance_goals
  ADD COLUMN IF NOT EXISTS progress_pct integer;

DO $$ BEGIN
  ALTER TYPE perf_review_status ADD VALUE IF NOT EXISTS 'acknowledged';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE performance_reviews
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS employee_ack_comment text;
