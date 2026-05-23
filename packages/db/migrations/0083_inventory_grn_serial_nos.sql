-- 0083_inventory_grn_serial_nos.sql
-- Phase 4: stash serial_nos on GRN lines until POST inserts them into
-- inventory_serials. Plain jsonb array keeps the schema cheap; the
-- inventory_serials.(tenant, item, serial_no) unique index enforces
-- duplicates.

ALTER TABLE inventory_grn_lines
  ADD COLUMN IF NOT EXISTS serial_nos JSONB;
