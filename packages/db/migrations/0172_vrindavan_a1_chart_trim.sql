-- Vrindavan A1 chart 2026-08: show SNF 8.2 on every row, and start the chart at
-- FAT 2.8. Adjusts the chart created in 0170 rather than editing that file, so
-- a DB that already applied 0170 and a fresh one end up identical.
--
-- The FAT 0.00 floor row stays: it is what stops a garbage analyzer reading
-- throwing NotFoundError and blocking capture at the VMCC. It does mean FAT
-- below 2.8 drops from Rs 26.25 to the Rs 20.00 floor in one step — intended,
-- since cow milk under 2.8 FAT is not a poor herd, and the chart deliberately
-- does not price for it.

DO $$
DECLARE
  v_tenant uuid;
  v_chart  uuid;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE name = 'Vrindavan Dairy LLP';
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Vrindavan Dairy LLP not present - skipping';
    RETURN;
  END IF;

  SELECT id INTO v_chart FROM mp_rate_charts
   WHERE tenant_id = v_tenant AND name = 'A1 Chart 2026-08 (FAT + Quarterly Bonus)';
  IF v_chart IS NULL THEN
    RAISE NOTICE 'A1 Chart 2026-08 not present - skipping';
    RETURN;
  END IF;

  UPDATE mp_rate_charts SET reference_snf = 8.20, updated_at = now()
   WHERE id = v_chart AND reference_snf IS NULL;

  -- Drop the 2.50-2.70 rows. The 0.00 floor is kept (fat > 0).
  DELETE FROM mp_rate_chart_cells
   WHERE rate_chart_id = v_chart AND fat > 0 AND fat < 2.80;
END $$;
