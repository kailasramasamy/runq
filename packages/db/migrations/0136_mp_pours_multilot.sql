-- Multi-lot pours: a farmer may have several recorded pours per shift (multiple
-- cans, or cow + buffalo in one shift). Drop the one-recorded-per-(farmer,date,
-- shift) guard. Replace-vs-add is now an explicit operator choice
-- (RecordPourInput.asNewLot); same-slot replacement is milk-type-scoped in the
-- service (pour.service.ts).
DROP INDEX IF EXISTS uq_mp_pours_active_slot;
