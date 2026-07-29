-- Vrindavan Dairy — A1 rate chart + quarterly bonus tiers, live 2026-08-01.
-- Plan: docs/mp-rate-chart-bonus-plan.md
--
-- Shape: FAT-only base capped at 4.5 FAT, plus a staggered quarterly lump-sum
-- bonus (Rs 3.00-7.20/L) resolved at quarter close. All-in tops out at Rs 44/L
-- at 4.5 FAT, where KMF needs 4.8.
--
-- FAT-only on the matrix engine: cells carry snf = 0, so matrixRate()'s
-- nearest-floor `snf <= input` matches every reading and pricing keys on FAT
-- alone. The Rs 44 cap needs no code — no cell rises above the 4.5 value.
--
-- Idempotent and tenant-guarded: a no-op on any DB without this tenant, or if
-- already applied.

DO $$
DECLARE
  v_tenant uuid;
  v_chart  uuid;
  v_old    uuid;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE name = 'Vrindavan Dairy LLP';
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Vrindavan Dairy LLP not present - skipping';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM mp_rate_charts
             WHERE tenant_id = v_tenant AND name = 'A1 Chart 2026-08 (FAT + Quarterly Bonus)') THEN
    RAISE NOTICE 'A1 Chart 2026-08 already present - skipping';
    RETURN;
  END IF;

  -- snf_gate_min is left NULL: the gate ships built but OFF. Setting it is a
  -- business call with real money on it, and the obvious threshold is wrong —
  -- an 8.00 floor gates 26% of all litres and 56% of Sudhakar's (4.38 FAT,
  -- 2,650 L, SNF trending 7.24 -> 8.13 over six weeks). Calibrate on live data,
  -- then:  UPDATE mp_rate_charts SET snf_gate_min = 7.20 WHERE id = ...;
  INSERT INTO mp_rate_charts (tenant_id, name, milk_type, pricing_mode, effective_from, is_active)
  VALUES (v_tenant, 'A1 Chart 2026-08 (FAT + Quarterly Bonus)', 'cow_a1', 'matrix', '2026-08-01', true)
  RETURNING id INTO v_chart;

  -- Base cells. FAT >= 3.7 -> 35.60 + (min(fat,4.5) - 3.7) * 1.50
  --             FAT 3.5-3.69 -> 35.00 + (fat - 3.5) * 3.00
  --             FAT < 3.5    -> 35.00 - (3.5 - fat) * 12.50   (anti-dilution taper)
  -- The 0.00 row is a floor so a garbage reading prices low instead of throwing
  -- NotFoundError and blocking capture at the VMCC.
  INSERT INTO mp_rate_chart_cells (tenant_id, rate_chart_id, fat, snf, rate_per_litre)
  SELECT v_tenant, c.chart, c.fat, c.snf, c.rate
  FROM (VALUES
    (v_chart, 0.00, 0.00, 20.00),
    (v_chart, 2.50, 0.00, 22.50),
    (v_chart, 2.60, 0.00, 23.75),
    (v_chart, 2.70, 0.00, 25.00),
    (v_chart, 2.80, 0.00, 26.25),
    (v_chart, 2.90, 0.00, 27.50),
    (v_chart, 3.00, 0.00, 28.75),
    (v_chart, 3.10, 0.00, 30.00),
    (v_chart, 3.20, 0.00, 31.25),
    (v_chart, 3.30, 0.00, 32.50),
    (v_chart, 3.40, 0.00, 33.75),
    (v_chart, 3.50, 0.00, 35.00),
    (v_chart, 3.60, 0.00, 35.30),
    (v_chart, 3.70, 0.00, 35.60),
    (v_chart, 3.80, 0.00, 35.75),
    (v_chart, 3.90, 0.00, 35.90),
    (v_chart, 4.00, 0.00, 36.05),
    (v_chart, 4.10, 0.00, 36.20),
    (v_chart, 4.20, 0.00, 36.35),
    (v_chart, 4.30, 0.00, 36.50),
    (v_chart, 4.40, 0.00, 36.65),
    (v_chart, 4.50, 0.00, 36.80),
    (v_chart, 4.60, 0.00, 36.80),
    (v_chart, 4.70, 0.00, 36.80),
    (v_chart, 4.80, 0.00, 36.80),
    (v_chart, 4.90, 0.00, 36.80),
    (v_chart, 5.00, 0.00, 36.80)
  ) AS c(chart, fat, snf, rate);

  -- Quarterly bonus tiers, keyed on best-two-of-three monthly weighted-avg FAT.
  -- Bands are ranges: 4.20-4.39 pays 6.90, 3.70-3.84 pays 6.00, and so on. Below
  -- 3.50 there is no row, which resolves to zero.
  INSERT INTO mp_rate_chart_rules (tenant_id, rate_chart_id, rule_type, fat_min, bonus_per_litre)
  SELECT v_tenant, v_chart, 'quarterly_fat_bonus', r.fat_min, r.bonus
  FROM (VALUES
    (4.40, 7.20),
    (4.20, 6.90),
    (4.00, 6.60),
    (3.85, 6.30),
    (3.70, 6.00),
    (3.50, 3.00)
  ) AS r(fat_min, bonus);

  -- Close the outgoing chart at 31 Jul rather than deactivating it: back-dated
  -- July corrections must still price off it, and pours already recorded keep
  -- their snapshotted rate regardless.
  SELECT id INTO v_old FROM mp_rate_charts
   WHERE tenant_id = v_tenant AND name = 'A1 Milk FAT-SNF Rate Chart';
  IF v_old IS NOT NULL THEN
    UPDATE mp_rate_charts SET effective_to = '2026-07-31', updated_at = now()
     WHERE id = v_old AND effective_to IS NULL;
  END IF;

  -- Point the tenant-wide cow_a1 slot at the new chart. Farmer- and node-scope
  -- assignments are deliberately untouched: farmer ead21d0c is on a flat Rs 45
  -- A1 deal and moving them is a separate business decision.
  UPDATE mp_rate_chart_assignments
     SET rate_chart_id = v_chart, updated_at = now()
   WHERE tenant_id = v_tenant AND scope_type = 'tenant'
     AND milk_type = 'cow_a1' AND pricing_family = 'fat_snf';

  -- Any farmer-scope assignment that merely mirrored the old tenant default
  -- moves too, so it keeps inheriting rather than pinning a retired chart.
  UPDATE mp_rate_chart_assignments
     SET rate_chart_id = v_chart, updated_at = now()
   WHERE tenant_id = v_tenant AND scope_type = 'farmer'
     AND milk_type = 'cow_a1' AND pricing_family = 'fat_snf'
     AND rate_chart_id = v_old;
END $$;
