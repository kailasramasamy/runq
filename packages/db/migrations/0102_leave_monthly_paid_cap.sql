-- Cap on paid leave days within one calendar month, per leave type.
--
-- max_balance limits how much leave can be *banked*; this limits how much can
-- be *spent at once*. An employee holding the maximum balance could otherwise
-- take the lot in a single month, which is what the balance cap was meant to
-- prevent. Days beyond the cap follow the same path as days beyond the
-- balance: unpaid when overflow_unpaid is set, so payroll deducts them.
--
-- NULL (every existing row) = no monthly limit, the behaviour up to now.

ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS max_paid_days_per_month numeric(5, 2);
