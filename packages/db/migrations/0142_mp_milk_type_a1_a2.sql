-- Dhenu: split cow milk into A1 (crossbred/regular) and A2 (indigenous/desi).
-- Additive — existing 'cow' rows stay valid (treated as legacy); new pours and
-- rate charts use cow_a1 / cow_a2 so each variant can carry its own rate chart.
ALTER TYPE mp_milk_type ADD VALUE IF NOT EXISTS 'cow_a1';
ALTER TYPE mp_milk_type ADD VALUE IF NOT EXISTS 'cow_a2';
