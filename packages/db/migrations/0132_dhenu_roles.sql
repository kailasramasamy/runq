-- 0132_dhenu_roles.sql
--
-- Dhenu personas: add `field_operator` (VMCC/CC/PP collection staff) and
-- `farmer` to the user_role enum. These are confined to the milk_procurement
-- module (see @runq/types modules.ts) and row-scoped (see milk-procurement/
-- access-scope.ts): an operator writes only at their assigned node; a farmer
-- reads only their own data.
--
-- NOTE: each ALTER TYPE … ADD VALUE runs as its own autocommit statement
-- (run-sql.ts splits on ';'); ADD VALUE cannot be used in the same txn it is
-- created, but we only add here — no usage — so this is safe.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'field_operator';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'farmer';
