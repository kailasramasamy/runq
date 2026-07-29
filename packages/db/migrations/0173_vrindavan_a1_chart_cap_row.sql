-- Vrindavan A1 chart 2026-08: stop the chart at FAT 4.5.
--
-- The 4.60-5.00 rows all carried the same Rs 36.80 as 4.50, so they said nothing
-- the cap doesn't already say. Nearest-floor makes the top row unbounded above —
-- a 4.9 or 5.6 reading matches the 4.50 cell and pays Rs 36.80 either way — so
-- dropping them changes no rate, only the length of the printed chart.
--
-- Renderers label the highest FAT row "and above" for exactly this reason.

DO $$
DECLARE
  v_chart uuid;
BEGIN
  SELECT c.id INTO v_chart FROM mp_rate_charts c
    JOIN tenants t ON t.id = c.tenant_id
   WHERE t.name = 'Vrindavan Dairy LLP'
     AND c.name = 'A1 Chart 2026-08 (FAT + Quarterly Bonus)';
  IF v_chart IS NULL THEN
    RAISE NOTICE 'A1 Chart 2026-08 not present - skipping';
    RETURN;
  END IF;

  DELETE FROM mp_rate_chart_cells
   WHERE rate_chart_id = v_chart AND fat > 4.50;
END $$;
