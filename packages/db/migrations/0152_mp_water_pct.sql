-- Water % — analyzer milk-quality parameter, sibling of fat/snf. Record/display
-- only; not a pricing axis (rate charts untouched). Nullable everywhere.

ALTER TABLE mp_pours
  ADD COLUMN IF NOT EXISTS water numeric(5,2);

ALTER TABLE mp_consignments
  ADD COLUMN IF NOT EXISTS dispatch_water numeric(5,2),
  ADD COLUMN IF NOT EXISTS receipt_water  numeric(5,2);
