-- Manual ("direct") receipts entered at a CC have no upstream dispatch event.
-- Flag them so the app can offer a Delete action for a mis-entry (a dispatched
-- consignment must not be deletable — that would erase the VMCC's dispatch).
ALTER TABLE mp_consignments
  ADD COLUMN IF NOT EXISTS direct_receive boolean NOT NULL DEFAULT false;
