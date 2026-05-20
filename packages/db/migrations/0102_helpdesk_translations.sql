-- Per-comment translations for the HR helpdesk. The canonical thread is
-- stored in English (the body column); translation_text caches translations
-- into the employee's preferred language so the device TTS can read them out.
--
-- Shape: { "<iso-lang>": "<translated text>", ... }
-- Only populated for non-English target languages.

ALTER TABLE hr_ticket_comments
  ADD COLUMN IF NOT EXISTS translation_text jsonb;
