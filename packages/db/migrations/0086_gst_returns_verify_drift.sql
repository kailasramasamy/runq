-- Post-save verification of GST returns. After SAVE to GSTN, we
-- re-fetch the stored summary and diff against what we sent — drift
-- captured here so the UI can warn before the user clicks File and
-- hits an opaque compute-step rejection (e.g. RT-3BGC-9017).

ALTER TABLE gst_returns
  ADD COLUMN verify_drift jsonb,
  ADD COLUMN verified_at  timestamp with time zone;
