-- Responsible person for a node-operator: display name + mobile.
-- The mobile doubles as the Dhenu app login phone (DOB stays in mp_credentials).
ALTER TABLE mp_node_operators ADD COLUMN IF NOT EXISTS name  varchar(255);
ALTER TABLE mp_node_operators ADD COLUMN IF NOT EXISTS phone varchar(20);
