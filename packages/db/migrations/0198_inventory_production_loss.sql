-- Wastage write-offs raised from a work order.
--
-- `production_loss` is its own reason because the goods were never damaged or
-- stolen — they evaporated into the process (fill variation, line residue,
-- spillage during packing). Keeping it out of `damage` keeps 5104 readable and
-- lets the wastage register separate process loss from handling loss. It also
-- matters for GST: normal loss inherent in manufacture does not attract an
-- ITC reversal under §17(5)(h), unlike destroyed or stolen goods.
ALTER TYPE inv_adjustment_reason ADD VALUE IF NOT EXISTS 'production_loss';

-- Backlink to the run that caused the loss. Nullable: wastage found outside a
-- work order (cold-room spillage, a leaking crate) is still recorded here.
ALTER TABLE inventory_adjustments
  ADD COLUMN IF NOT EXISTS source_wo_id uuid REFERENCES work_orders(id);

CREATE INDEX IF NOT EXISTS idx_inv_adj_source_wo
  ON inventory_adjustments (source_wo_id) WHERE source_wo_id IS NOT NULL;
