-- SNF shown against every row of a FAT-only chart.
--
-- Display only. Cells stay at SNF 0 so nearest-floor matches every reading and
-- pricing keys on FAT alone; resolveRate never reads this. It exists so a
-- printed chart can state the SNF standard the way KMF's is headed "SNF 8.5%".
--
-- Distinct from snf_gate_min, which is the enforced anti-dilution floor.
ALTER TABLE mp_rate_charts
  ADD COLUMN IF NOT EXISTS reference_snf numeric(4,2);
