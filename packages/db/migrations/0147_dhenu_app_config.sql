-- Dhenu app version / force-update config.
-- The Dhenu milk-procurement app (apps/collect) is a separate store listing
-- from the runQ ERP mobile app, so it gets its own `dhenu.*` keys rather than
-- sharing `mobile.*`. Served via /api/v1/public/app-config, editable in the
-- super-admin App Config UI. Below `dhenu.minVersion` the app hard-blocks.
INSERT INTO app_config (key, value) VALUES
  ('dhenu.currentVersion', '"1.0.0"'::jsonb),
  ('dhenu.minVersion', '"1.0.0"'::jsonb),
  ('dhenu.forceUpdateMessage', '"A new version of Dhenu is available. Please update to continue."'::jsonb),
  ('dhenu.androidStoreUrl', '"https://play.google.com/store/apps/details?id=com.quartex.dhenu"'::jsonb),
  ('dhenu.iosStoreUrl', '"https://apps.apple.com/app/dhenu/idTBD"'::jsonb)
ON CONFLICT (key) DO NOTHING;
