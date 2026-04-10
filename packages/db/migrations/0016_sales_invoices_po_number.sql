-- 0016_sales_invoices_po_number.sql
-- Add a free-text customer PO number reference to sales_invoices.
--
-- Standard B2B practice: when issuing an invoice against a customer's
-- purchase order, the PO# should be visible on the invoice itself so the
-- buyer's AP team can match it to their open POs. The runq invoice
-- import flow already extracts a poNumber from source files; this column
-- gives that field a place to land. Manual create flow also gets the
-- input.
--
-- This is a free-text reference (varchar 50), not a foreign key — it's
-- not meant to enforce a join with the PO inbox feature. Tenants who
-- want strict PO matching can use the existing PO inbox / PO draft flow.
--
-- Idempotent.

BEGIN;

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS po_number varchar(50);

COMMIT;
