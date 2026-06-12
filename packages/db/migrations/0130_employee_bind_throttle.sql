-- Mobile first-login throttle. The one-time /auth/social/bind step verifies an
-- employee's date of birth (DDMMYY) before linking their Google/Apple account.
-- Each failed DOB attempt increments this counter; reaching 5 locks the bind
-- until an admin resets it (Settings → Users → Reset mobile login). A
-- successful bind resets it to 0.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS mobile_bind_attempts integer NOT NULL DEFAULT 0;
