-- Clamp per-user module grants to what the user's role can actually hold.
--
-- Effective access is `enabled ∩ roleAllowedModules(role) ∩ grant`, so any
-- module in a grant that sits outside the role ceiling is dead weight — and
-- when a grant lists *only* such modules the intersection is empty and the
-- user loses access to everything, including the module their role exists for.
--
-- That is what happened to at least one Dhenu operator: role `field_operator`
-- (ceiling = milk_procurement) carrying a grant of hr/inventory/purchase/
-- manufacturing, which resolved to no modules at all and 403'd every
-- /milk-procurement call.
--
-- Dropping the out-of-ceiling entries is a no-op for effective access today.
-- It matters later: if such a user is moved to a role that *does* permit those
-- modules, the leftover grant would silently switch them on. A grant left with
-- nothing becomes NULL, i.e. "use the role default" (defaultModulesForRole),
-- which for each of these roles is exactly its permitted set.
--
-- Roles absent from the ceiling list (owner, client_owner, accountant, viewer)
-- may be granted any enabled module, so their grants are left untouched.
--
-- The field_operator ceiling below is deliberately milk_procurement alone,
-- narrower than roleAllowedModules() now allows that role. Every grant this
-- migration touches predates operators being grantable the plant modules, and
-- all of them are junk written by a UI that offered modules the role could not
-- hold. Clearing them back to the role default is the intent; genuine plant
-- grants are made after this runs and are never seen by it.

WITH ceiling(role_name, allowed) AS (
  VALUES
    ('field_operator', ARRAY['milk_procurement']),
    ('farmer',         ARRAY['milk_procurement']),
    ('hr',             ARRAY['hr']),
    ('technician',     ARRAY['manufacturing', 'inventory'])
)
UPDATE user_tenants ut
SET modules = NULLIF(
      COALESCE(
        (SELECT jsonb_agg(entry)
           FROM jsonb_array_elements_text(ut.modules) AS t(entry)
          WHERE entry = ANY(c.allowed)),
        '[]'::jsonb
      ),
      '[]'::jsonb
    )
FROM ceiling c
WHERE ut.role::text = c.role_name
  AND ut.modules IS NOT NULL
  -- Skip rows already equal to their clamped form, so re-runs touch nothing.
  AND EXISTS (
    SELECT 1
      FROM jsonb_array_elements_text(ut.modules) AS t(entry)
     WHERE entry <> ALL(c.allowed)
  );
