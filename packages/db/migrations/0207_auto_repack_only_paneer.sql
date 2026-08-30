-- Late differentiation applies to two SKUs, not thirteen.
--
-- `allow_auto_repack` means "this SKU holds no standing stock; backflush it
-- out of the pool item when a dispatch line comes up short". At Vrindavan
-- that is true of exactly two packs — Farm Fresh Paneer 200g and A2 Desi Cow
-- Paneer 200g, both labelled off one vat of unpacked paneer on the loading
-- bay. The flag had been switched on for eleven more: the oils, the jaggery.
-- Those are produced to plan and stocked, and most of them have never once
-- repacked.
--
-- Coconut Oil 1L had, seven times in the five days before this ran, which is
-- why it sat at zero. Cleared deliberately all the same: it is meant to be a
-- planned, stocked SKU, so a dispatch that cannot be covered should fail and
-- say so rather than quietly convert bulk oil into 1L packs nobody scheduled.
-- Whoever runs dispatch needs to know it will now short.
--
-- Scoped by SKU rather than by id so it reads as what it means, and left
-- narrow: only currently-flagged BOMs are touched, so re-enabling one later
-- is a deliberate act this migration will not undo.
UPDATE boms b
SET allow_auto_repack = false,
    updated_at = now()
FROM items i
WHERE i.id = b.output_item_id
  AND b.allow_auto_repack = true
  AND i.sku NOT IN ('A1-PANEER-200G', 'A2-PANEER-200G');
