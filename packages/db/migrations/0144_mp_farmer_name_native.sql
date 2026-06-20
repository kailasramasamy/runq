-- Dhenu: native-script (regional-language) farmer name for RL display.
-- name_native is the transliterated name; name_native_verified marks whether an
-- operator has confirmed the machine-seeded transliteration. Latin `name` stays
-- the source of truth (banks/records use it); name_native is display-only.
ALTER TABLE mp_farmers
  ADD COLUMN IF NOT EXISTS name_native varchar(255),
  ADD COLUMN IF NOT EXISTS name_native_verified boolean NOT NULL DEFAULT false;
