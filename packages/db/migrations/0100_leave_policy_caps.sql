-- Per-tenant leave-policy knobs. All three are additive and default to the
-- behaviour that was already in place, so existing tenants are unaffected
-- until someone sets them on a leave type.
--
--   leave_types.max_balance     — ceiling on available balance (opening +
--                                 accrued − used) for monthly accrual.
--                                 NULL = uncapped (every existing row).
--   leave_types.overflow_unpaid — approve past the balance as a paid/unpaid
--                                 split instead of letting it go negative.
--   leave_requests.unpaid_days  — how much of an approved request was unpaid.

ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS max_balance numeric(5, 2);

ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS overflow_unpaid boolean NOT NULL DEFAULT false;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS unpaid_days numeric(5, 2) NOT NULL DEFAULT 0;
