-- Per-user preferred language for the HR assistant. ISO 639-1 codes
-- (en, hi, ta, te, mr, kn, gu, bn, pa, ml). Default 'en' for back-compat.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_language varchar(5) NOT NULL DEFAULT 'en';
