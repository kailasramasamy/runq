-- Drop the Dhenu store-URL config keys (seeded in 0147).
-- Store URLs are an app-side concern — the Dhenu app picks the store by
-- platform and the link never changes for a listing, so they live as
-- constants in the app rather than in app_config. This mirrors 0039, which
-- removed the equivalent mobile.* store-URL keys for the runQ app.
DELETE FROM app_config WHERE key IN ('dhenu.androidStoreUrl', 'dhenu.iosStoreUrl');
