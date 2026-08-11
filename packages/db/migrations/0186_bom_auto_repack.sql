-- Late differentiation: one physical pool, branded at dispatch.
--
-- Some finished goods are the same product until the moment they are labelled.
-- A dairy makes one vat of A2 paneer and decides on the loading bay whether it
-- ships as "Farm Fresh Natural Paneer 200g" or "A2 Desi Cow Paneer 200g". The
-- split is not known when the run is recorded, so stocking both SKUs means
-- guessing it — and the guess is wrong every time an order arrives.
--
-- With this flag the branded SKUs carry no standing stock at all. Only the
-- unlabelled pool item is counted. When a dispatch line is short, the DN posts
-- an unplanned work order against this BOM first (drawing the pool FEFO,
-- consuming the label), then ships what it just made. The labelling decision is
-- recorded when it is actually taken.
--
-- Defaults false — a normal BOM still refuses to ship stock that isn't there.
ALTER TABLE boms
  ADD COLUMN allow_auto_repack BOOLEAN NOT NULL DEFAULT FALSE;

-- Dispatch asks "is the short item repackable?" once per short line, so the
-- lookup rides the existing (tenant, output_item) path but only for the few
-- BOMs that opted in.
CREATE INDEX idx_bom_auto_repack
  ON boms (tenant_id, output_item_id)
  WHERE allow_auto_repack = TRUE AND is_active = TRUE;
