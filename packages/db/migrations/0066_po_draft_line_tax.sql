-- 0066_po_draft_line_tax.sql
-- Capture per-line GST handling on the PO so the parser produces consistent
-- output for both inclusive-price and exclusive-price POs.
--
-- tax_rate_pct       — GST % printed on the PO for this line (e.g. 5, 12, 18).
--                      Null when the PO doesn't state it per-line.
-- price_includes_tax — 1 if the line rate/amount on the PO already includes
--                      tax (Type A), 0 if it is pre-tax (Type B), null when
--                      undetermined.

ALTER TABLE po_draft_lines
  ADD COLUMN IF NOT EXISTS tax_rate_pct       NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS price_includes_tax INTEGER;
