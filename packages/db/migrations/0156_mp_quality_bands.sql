-- Dhenu: configurable milk-quality bands (good / watch / low) per milk type and
-- metric (FAT/SNF/CLR). Drive colour-coding across the app and the per-pour
-- quality grade. A node-scoped row overrides the tenant-wide default; when no
-- row exists the API falls back to seeded constants, so this table is empty by
-- default and grading is unchanged until a tenant tunes it.
CREATE TYPE mp_quality_metric AS ENUM ('fat', 'snf', 'clr');

CREATE TABLE IF NOT EXISTS mp_quality_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  node_id uuid REFERENCES mp_nodes(id),
  milk_type mp_milk_type NOT NULL,
  metric mp_quality_metric NOT NULL,
  good_min numeric(5,2) NOT NULL,
  watch_min numeric(5,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One band per (milk_type, metric) at each scope; node_id NULL = tenant default.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_quality_bands_tenant
  ON mp_quality_bands (tenant_id, milk_type, metric) WHERE node_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_quality_bands_node
  ON mp_quality_bands (tenant_id, node_id, milk_type, metric) WHERE node_id IS NOT NULL;
