-- Add a `hr` value to the user_role enum. People Ops users land here:
-- tenant-wide read on HR data + full HR write, but no Finance write.
-- ALTER TYPE … ADD VALUE is non-transactional in PG, so it must run
-- outside any BEGIN block — our run-sql.ts driver already executes
-- raw SQL without wrapping in a transaction.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'hr'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'hr';
  END IF;
END $$;
