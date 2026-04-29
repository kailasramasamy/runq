-- Platform announcements: in-app banners shown to all/segmented tenants.

DO $$ BEGIN
  CREATE TYPE announcement_severity AS ENUM ('info', 'warning', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  severity announcement_severity NOT NULL DEFAULT 'info',
  audience JSONB NOT NULL DEFAULT '{"all": true}'::jsonb,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  dismissible BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ann_active ON announcements (is_active, starts_at, ends_at);
