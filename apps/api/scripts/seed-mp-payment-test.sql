-- Test-data seed for the Dhenu payments overhaul (dev only).
-- Clears existing payout cycles for Vrindavan Dairy LLP, adds 9 farmers and
-- seeds AM/PM pours across the May 16–31 and June 1–15 cycles at Kadod VMCC.
--   tenant = a0365382-afa0-48b6-92cd-4db615a7d98b (Vrindavan Dairy LLP)
--   node   = 7fd4554c-3ec5-4179-9a43-c760cb793c27 (Kadod VMCC)

BEGIN;

-- ── 1. Clear existing payout cycles (+ dependent rows + lock side-effects) ──
DELETE FROM mp_payout_deductions
WHERE payout_line_id IN (
  SELECT id FROM mp_payout_lines WHERE payout_cycle_id IN (
    SELECT id FROM mp_payout_cycles WHERE tenant_id = 'a0365382-afa0-48b6-92cd-4db615a7d98b'));

DELETE FROM mp_farmer_ledger
WHERE entry_type = 'repayment'
  AND ref_id IN (
    SELECT id FROM mp_payout_lines WHERE payout_cycle_id IN (
      SELECT id FROM mp_payout_cycles WHERE tenant_id = 'a0365382-afa0-48b6-92cd-4db615a7d98b'));

DELETE FROM mp_payout_lines
WHERE payout_cycle_id IN (
  SELECT id FROM mp_payout_cycles WHERE tenant_id = 'a0365382-afa0-48b6-92cd-4db615a7d98b');

DELETE FROM mp_payout_cycles WHERE tenant_id = 'a0365382-afa0-48b6-92cd-4db615a7d98b';

-- ── 2. Add 9 farmers (vendor + farmer + primary VMCC membership) ────────────
WITH nf(code, name, phone) AS (
  VALUES
    ('F004', 'Kiran Desai',       '9000000004'),
    ('F005', 'Mahesh Solanki',    '9000000005'),
    ('F006', 'Bhavna Patel',      '9000000006'),
    ('F007', 'Jayesh Chaudhary',  '9000000007'),
    ('F008', 'Dinesh Rabari',     '9000000008'),
    ('F009', 'Hardik Prajapati',  '9000000009'),
    ('F010', 'Nilesh Thakor',     '9000000010'),
    ('F011', 'Pravin Makwana',    '9000000011'),
    ('F012', 'Geeta Vasava',      '9000000012')
),
ins_vendor AS (
  INSERT INTO vendors (tenant_id, name)
  SELECT 'a0365382-afa0-48b6-92cd-4db615a7d98b', name FROM nf
  RETURNING id, name
),
ins_farmer AS (
  INSERT INTO mp_farmers (tenant_id, vendor_id, code, name, phone, default_milk_type, cattle_count)
  SELECT 'a0365382-afa0-48b6-92cd-4db615a7d98b', v.id, nf.code, nf.name, nf.phone,
         'cow', (3 + (random() * 6)::int)
  FROM nf JOIN ins_vendor v ON v.name = nf.name
  RETURNING id, code
)
INSERT INTO mp_farmer_memberships (tenant_id, farmer_id, node_id, is_primary, joined_on)
SELECT 'a0365382-afa0-48b6-92cd-4db615a7d98b', f.id,
       '7fd4554c-3ec5-4179-9a43-c760cb793c27', true, '2026-01-01'
FROM ins_farmer f;

-- ── 3. Seed AM/PM pours for the new farmers across both cycles ───────────────
-- ~85% fill so some farmer/day/shift slots are naturally empty.
INSERT INTO mp_pours (
  tenant_id, node_id, farmer_id, collection_date, shift, milk_type,
  qty_litres, fat, snf, rate_per_litre, base_amount, bonus_amount, line_amount, status)
SELECT
  'a0365382-afa0-48b6-92cd-4db615a7d98b',
  '7fd4554c-3ec5-4179-9a43-c760cb793c27',
  f.id, d::date, s.shift, 'cow',
  q.qty, q.fat, q.snf, q.rate,
  round(q.qty * q.rate, 2), 0, round(q.qty * q.rate, 2), 'recorded'
FROM mp_farmers f
CROSS JOIN generate_series('2026-05-16'::date, '2026-05-31'::date, interval '1 day') AS d
CROSS JOIN (VALUES ('am'::mp_shift), ('pm'::mp_shift)) AS s(shift)
CROSS JOIN LATERAL (
  SELECT round((5 + random() * 25)::numeric, 1) AS qty,
         round((3.5 + random() * 1.5)::numeric, 2) AS fat,
         round((8.0 + random() * 1.0)::numeric, 2) AS snf,
         round((36 + random() * 7)::numeric, 2) AS rate
) AS q
WHERE f.tenant_id = 'a0365382-afa0-48b6-92cd-4db615a7d98b'
  AND f.code BETWEEN 'F004' AND 'F012'
  AND random() < 0.85;

INSERT INTO mp_pours (
  tenant_id, node_id, farmer_id, collection_date, shift, milk_type,
  qty_litres, fat, snf, rate_per_litre, base_amount, bonus_amount, line_amount, status)
SELECT
  'a0365382-afa0-48b6-92cd-4db615a7d98b',
  '7fd4554c-3ec5-4179-9a43-c760cb793c27',
  f.id, d::date, s.shift, 'cow',
  q.qty, q.fat, q.snf, q.rate,
  round(q.qty * q.rate, 2), 0, round(q.qty * q.rate, 2), 'recorded'
FROM mp_farmers f
CROSS JOIN generate_series('2026-06-01'::date, '2026-06-15'::date, interval '1 day') AS d
CROSS JOIN (VALUES ('am'::mp_shift), ('pm'::mp_shift)) AS s(shift)
CROSS JOIN LATERAL (
  SELECT round((5 + random() * 25)::numeric, 1) AS qty,
         round((3.5 + random() * 1.5)::numeric, 2) AS fat,
         round((8.0 + random() * 1.0)::numeric, 2) AS snf,
         round((36 + random() * 7)::numeric, 2) AS rate
) AS q
WHERE f.tenant_id = 'a0365382-afa0-48b6-92cd-4db615a7d98b'
  AND f.code BETWEEN 'F004' AND 'F012'
  AND random() < 0.85;

COMMIT;
