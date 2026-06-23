-- Per-CC dispatch pooling mode. When true, a CC's dispatch pool is the previous
-- day's PM collection plus today's AM (milk chilled overnight and sent with the
-- next morning's tanker) instead of the same-day AM+PM default.
ALTER TABLE mp_nodes
  ADD COLUMN IF NOT EXISTS overnight_pooling boolean NOT NULL DEFAULT false;
