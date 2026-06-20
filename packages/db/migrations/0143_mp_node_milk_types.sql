-- Dhenu: designate the milk type(s) a VMCC collects, to declutter the operator's
-- entry picker. allowed_milk_types restricts the choices (null = all types,
-- legacy behavior); default_milk_type pre-selects one. The picker hides entirely
-- when exactly one type is allowed. Resolution still keys on the chosen type.
ALTER TABLE mp_nodes
  ADD COLUMN IF NOT EXISTS allowed_milk_types mp_milk_type[],
  ADD COLUMN IF NOT EXISTS default_milk_type mp_milk_type;
