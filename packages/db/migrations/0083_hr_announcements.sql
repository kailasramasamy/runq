-- HR announcements — lightweight company-comms surface for the manager
-- dashboard. Admins post; managers + employees see (filtered by audience).

DO $$ BEGIN
  CREATE TYPE announcement_audience AS ENUM ('all', 'managers');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS hr_announcements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  title        VARCHAR(140) NOT NULL,
  body         TEXT         NOT NULL,
  audience     announcement_audience NOT NULL DEFAULT 'all',
  pinned       BOOLEAN      NOT NULL DEFAULT FALSE,
  posted_by_id UUID         REFERENCES users(id),
  posted_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ann_tenant_posted
  ON hr_announcements (tenant_id, posted_at);
CREATE INDEX IF NOT EXISTS idx_ann_tenant_expires
  ON hr_announcements (tenant_id, expires_at);
