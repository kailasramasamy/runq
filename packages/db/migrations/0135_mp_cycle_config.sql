-- Dhenu: tenant-wide collection/payout cycle config on mp_gl_settings.
-- cycle_days + cycle_anchor_date define the cadence (e.g. 10 or 15 days);
-- auto_generate_cycle toggles the daily scheduler that rolls cycles forward.
ALTER TABLE mp_gl_settings
  ADD COLUMN IF NOT EXISTS cycle_days integer,
  ADD COLUMN IF NOT EXISTS cycle_anchor_date date,
  ADD COLUMN IF NOT EXISTS auto_generate_cycle boolean NOT NULL DEFAULT false;
