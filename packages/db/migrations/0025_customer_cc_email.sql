-- Add ccEmail column for secondary/accounts-manager contacts (comma-separated)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cc_email VARCHAR(500);

-- Also widen existing email column to support comma-separated addresses
ALTER TABLE customers ALTER COLUMN email TYPE VARCHAR(500);
