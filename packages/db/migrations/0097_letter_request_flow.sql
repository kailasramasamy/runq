-- Employee-initiated letter requests. New 'requested' status sits before
-- 'draft' in the lifecycle: employee asks for a letter → HR fulfils it by
-- picking a template (which turns the row into a 'draft') → HR issues it.
-- `requested_reason` captures the employee's stated purpose for context.

ALTER TYPE letter_status ADD VALUE IF NOT EXISTS 'requested';

ALTER TABLE employee_letters
  ADD COLUMN IF NOT EXISTS requested_reason text;
