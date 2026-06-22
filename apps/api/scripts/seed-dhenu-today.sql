-- Seed "today's" Dhenu (milk-procurement) activity for Play Store screenshots.
--
-- Clones the fullest recent day (2026-06-19: all 14 farmers, both shifts, full
-- VMCC->CC->PP consignment chain) forward to CURRENT_DATE for the Vrindavan
-- Dairy LLP tenant. Populates every persona's home screen with fresh,
-- current-dated data: farmer, VMCC operator, CC operator, PP operator.
--
-- Idempotent: deletes CURRENT_DATE rows it owns before re-inserting, so it can
-- be re-run any day. LOCAL dev DB only (runq_dev) — never prod.
--
-- Run: psql postgresql://runq_app@localhost:5432/runq_dev \
--        -f apps/api/scripts/seed-dhenu-today.sql

\set TENANT '''a0365382-afa0-48b6-92cd-4db615a7d98b'''
\set SRC '''2026-06-19'''

BEGIN;

-- 1. Tank gauges: ensure each node has a capacity so the VMCC/CC/PP home
--    screens render the fill gauge instead of a blank.
UPDATE mp_nodes SET capacity_litres = CASE node_type
         WHEN 'vmcc' THEN 1000 WHEN 'cc' THEN 5000 WHEN 'pp' THEN 20000 END
 WHERE tenant_id = :TENANT AND capacity_litres IS NULL;

-- 2. Wipe any prior run for today (today starts with zero real pours).
DELETE FROM mp_pours       WHERE tenant_id = :TENANT AND collection_date = CURRENT_DATE;
DELETE FROM mp_consignments WHERE tenant_id = :TENANT AND collection_date = CURRENT_DATE;

-- 3. Clone the source day's pours -> today. Drop device_local_id (offline
--    dedupe key), stamp fresh timestamps, derive a quality_grade from fat so
--    the farmer Grade-A streak + coloured bars light up, and issue clean
--    seed receipt numbers.
INSERT INTO mp_pours (
  tenant_id, node_id, farmer_id, collection_date, shift, milk_type, qty_litres,
  fat, snf, clr, temp_c, quality_grade, rate_chart_id, rate_per_litre,
  base_amount, bonus_amount, line_amount, capture_source, receipt_no, status,
  reversal_of, device_local_id, recorded_by, recorded_at, synced_at, created_at)
SELECT
  tenant_id, node_id, farmer_id, CURRENT_DATE, shift, milk_type, qty_litres,
  fat, snf, clr, temp_c,
  CASE WHEN fat >= 4.0 THEN 'a'::mp_grade
       WHEN fat >= 3.5 THEN 'b'::mp_grade
       ELSE 'c'::mp_grade END,
  rate_chart_id, rate_per_litre, base_amount, bonus_amount, line_amount,
  capture_source,
  'RCP/2026-27/' || lpad((90000 + row_number() OVER (ORDER BY shift, farmer_id))::text, 5, '0'),
  'recorded'::mp_pour_status,
  NULL, NULL, recorded_by, now(), now(), now()
FROM mp_pours
WHERE tenant_id = :TENANT AND collection_date = :SRC AND status = 'recorded';

-- 4. Clone the source day's consignments -> today (VMCC->CC and CC->PP legs).
--    Keep AM + cc_to_pp as 'received' (so PP/CC show completed receives with
--    variance); leave the PM vmcc_to_cc leg 'in_transit' so the CC operator
--    home shows a live pending-receive action.
INSERT INTO mp_consignments (
  tenant_id, consignment_no, kind, from_node_id, to_node_id, collection_date,
  shift, container_no, dispatch_qty, dispatch_fat, dispatch_snf, dispatched_at,
  dispatched_by, receipt_qty, receipt_fat, receipt_snf, received_at, received_by,
  variance_qty, variance_pct, stock_ledger_id, status, created_at, updated_at)
SELECT
  tenant_id,
  'CON/2026-27/' || lpad((9000 + row_number() OVER (ORDER BY kind, shift))::text, 4, '0'),
  kind, from_node_id, to_node_id, CURRENT_DATE, shift, container_no,
  dispatch_qty, dispatch_fat, dispatch_snf, now(), dispatched_by,
  CASE WHEN pending THEN NULL ELSE receipt_qty END,
  CASE WHEN pending THEN NULL ELSE receipt_fat END,
  CASE WHEN pending THEN NULL ELSE receipt_snf END,
  CASE WHEN pending THEN NULL ELSE now() END,
  CASE WHEN pending THEN NULL ELSE received_by END,
  CASE WHEN pending THEN NULL ELSE variance_qty END,
  CASE WHEN pending THEN NULL ELSE variance_pct END,
  NULL,
  CASE WHEN pending THEN 'in_transit'::mp_consignment_status ELSE 'received'::mp_consignment_status END,
  now(), now()
FROM (
  SELECT *, (kind = 'vmcc_to_cc' AND shift = 'pm') AS pending
  FROM mp_consignments
  WHERE tenant_id = :TENANT AND collection_date = :SRC AND status = 'received'
) src;

COMMIT;

-- Report
SELECT 'pours today' AS what, count(*) AS rows, round(sum(qty_litres)) AS litres,
       round(sum(line_amount)) AS amount
  FROM mp_pours WHERE tenant_id = :TENANT AND collection_date = CURRENT_DATE
UNION ALL
SELECT 'consignments today', count(*), round(sum(coalesce(receipt_qty, dispatch_qty))), NULL
  FROM mp_consignments WHERE tenant_id = :TENANT AND collection_date = CURRENT_DATE;
