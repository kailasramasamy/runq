-- Help / learning hub: per-user recipe progress.
-- Tracks current step + completion per recipe; streak/badges are derived
-- from completion timestamps in the API layer.

CREATE TABLE IF NOT EXISTS help_recipe_progress (
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id    varchar(80) NOT NULL,
  current_step integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS help_recipe_progress_user_idx
  ON help_recipe_progress(tenant_id, user_id, completed_at);
