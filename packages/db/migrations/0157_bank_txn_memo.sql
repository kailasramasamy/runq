-- User-entered memo on bank transactions ("paid to X for Y").
-- Used for party-less categorized debits/credits where the bank narration
-- alone doesn't capture who was paid and why. When set, it becomes the
-- linked journal entry's description. The raw narration is never overwritten.
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS memo varchar(500);
