-- Store URLs don't belong in app_config — they're a mobile-side concern (the
-- app picks the store based on Platform.isIOS, and the URL never changes
-- once an app is listed). Removing the seeded rows.
DELETE FROM app_config WHERE key IN ('mobile.iosStoreUrl', 'mobile.androidStoreUrl');
