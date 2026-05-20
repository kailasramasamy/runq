-- Optional cover image on an announcement. Stored as the S3 key only
-- (same pattern employees.photo_url uses) — the API streams via a
-- dedicated /hr/announcements/:id/image endpoint and the response is
-- presigned per-request. NULL means text-only (current behaviour).
--
-- 500-char ceiling matches other image_key columns; well below S3's
-- 1024 path limit and never tight against generated entity prefixes.

ALTER TABLE hr_announcements
  ADD COLUMN IF NOT EXISTS image_key VARCHAR(500);
