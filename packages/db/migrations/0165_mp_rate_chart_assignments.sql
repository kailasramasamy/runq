-- Rate chart assignment: one binding table replacing three rate_chart_id columns
-- and the chart's own scope_node_id. Precedence at pour time:
--   farmer → VMCC → parent CC → tenant default
--
-- Backfill reproduces exactly what pickChart()/findActiveChart() resolve today,
-- so pricing does not move on deploy. The old columns are left in place and
-- simply stop being read; drop them once this has run a full cycle.

CREATE TYPE mp_pricing_family AS ENUM ('fat_snf', 'clr');
CREATE TYPE mp_rate_scope AS ENUM ('tenant', 'node', 'farmer');

CREATE TABLE mp_rate_chart_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  scope_type mp_rate_scope NOT NULL,
  scope_id uuid NOT NULL,
  milk_type mp_milk_type NOT NULL,
  pricing_family mp_pricing_family NOT NULL,
  rate_chart_id uuid NOT NULL REFERENCES mp_rate_charts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_mp_rate_assign
  ON mp_rate_chart_assignments (tenant_id, scope_type, scope_id, milk_type, pricing_family);
CREATE INDEX idx_mp_rate_assign_scope
  ON mp_rate_chart_assignments (tenant_id, scope_type, scope_id);
CREATE INDEX idx_mp_rate_assign_chart
  ON mp_rate_chart_assignments (tenant_id, rate_chart_id);

-- 1. Tenant defaults — the chart findActiveChart() picks today: tenant-wide,
--    active, latest effective_from within each (milk type, family). This is the
--    step that makes the current accidental winner explicit.
INSERT INTO mp_rate_chart_assignments (tenant_id, scope_type, scope_id, milk_type, pricing_family, rate_chart_id)
SELECT DISTINCT ON (c.tenant_id, c.milk_type, fam.family)
  c.tenant_id, 'tenant', c.tenant_id, c.milk_type, fam.family, c.id
FROM mp_rate_charts c
CROSS JOIN LATERAL (
  SELECT (CASE WHEN c.pricing_mode = 'clr' THEN 'clr' ELSE 'fat_snf' END)::mp_pricing_family AS family
) fam
WHERE c.scope_node_id IS NULL AND c.is_active
ORDER BY c.tenant_id, c.milk_type, fam.family, c.effective_from DESC, c.created_at DESC;

-- 2. Charts scoped to a node (chart → node) become node assignments (node → chart).
INSERT INTO mp_rate_chart_assignments (tenant_id, scope_type, scope_id, milk_type, pricing_family, rate_chart_id)
SELECT DISTINCT ON (c.tenant_id, c.scope_node_id, c.milk_type, fam.family)
  c.tenant_id, 'node', c.scope_node_id, c.milk_type, fam.family, c.id
FROM mp_rate_charts c
CROSS JOIN LATERAL (
  SELECT (CASE WHEN c.pricing_mode = 'clr' THEN 'clr' ELSE 'fat_snf' END)::mp_pricing_family AS family
) fam
WHERE c.scope_node_id IS NOT NULL AND c.is_active
ORDER BY c.tenant_id, c.scope_node_id, c.milk_type, fam.family, c.effective_from DESC, c.created_at DESC
ON CONFLICT DO NOTHING;

-- 3. Existing node overrides (mp_nodes.rate_chart_id). A node override wins over
--    a chart merely scoped to that node, so it overwrites step 2's row.
INSERT INTO mp_rate_chart_assignments (tenant_id, scope_type, scope_id, milk_type, pricing_family, rate_chart_id)
SELECT n.tenant_id, 'node', n.id, c.milk_type,
       (CASE WHEN c.pricing_mode = 'clr' THEN 'clr' ELSE 'fat_snf' END)::mp_pricing_family, c.id
FROM mp_nodes n
JOIN mp_rate_charts c ON c.id = n.rate_chart_id
ON CONFLICT (tenant_id, scope_type, scope_id, milk_type, pricing_family)
DO UPDATE SET rate_chart_id = EXCLUDED.rate_chart_id, updated_at = now();

-- 4. Existing farmer overrides (mp_farmers.rate_chart_id).
INSERT INTO mp_rate_chart_assignments (tenant_id, scope_type, scope_id, milk_type, pricing_family, rate_chart_id)
SELECT f.tenant_id, 'farmer', f.id, c.milk_type,
       (CASE WHEN c.pricing_mode = 'clr' THEN 'clr' ELSE 'fat_snf' END)::mp_pricing_family, c.id
FROM mp_farmers f
JOIN mp_rate_charts c ON c.id = f.rate_chart_id
ON CONFLICT DO NOTHING;
