/**
 * Canonical module registry — the single source of truth for which functional
 * areas a tenant can enable and a user can be granted access to.
 *
 * Consumed by the API (effective-module computation + `requireModule` route
 * guards) and the web app (sidebar + route gating). The mobile app keeps a
 * thin Dart mirror of these codes (see app_module_provider.dart).
 *
 * Access is two-tiered and orthogonal to role:
 *   - tenant.enabled_modules  → the ceiling (what the tenant has turned on)
 *   - user_tenants.modules     → per-user subset (null = inherit all enabled)
 *   - effective = enabled ∩ (user ?? enabled); owners always get all enabled.
 * Role still governs read vs write *within* a module the user can see.
 */

export const MODULE_CODES = [
  'finance',
  'hr',
  'inventory',
  'purchase',
  'manufacturing',
  'milk_procurement',
] as const;

export type ModuleCode = (typeof MODULE_CODES)[number];

export interface ModuleDef {
  code: ModuleCode;
  label: string;
  /** Web route prefixes this module owns — drives nav + route-guard gating. */
  routePrefixes: string[];
}

export const MODULES: readonly ModuleDef[] = [
  { code: 'finance', label: 'Finance', routePrefixes: ['/finance'] },
  { code: 'hr', label: 'HR & Payroll', routePrefixes: ['/hr'] },
  { code: 'inventory', label: 'Inventory', routePrefixes: ['/inventory'] },
  { code: 'purchase', label: 'Purchase', routePrefixes: ['/purchase'] },
  { code: 'manufacturing', label: 'Manufacturing', routePrefixes: ['/manufacturing'] },
  // Dhenu milk procurement — premium add-on, NOT in the tenant default set.
  { code: 'milk_procurement', label: 'Milk Procurement', routePrefixes: ['/milk-procurement'] },
] as const;

export function isModuleCode(value: string): value is ModuleCode {
  return (MODULE_CODES as readonly string[]).includes(value);
}

/** Keep only valid, de-duplicated module codes from an arbitrary input. */
export function sanitizeModuleCodes(input: readonly string[]): ModuleCode[] {
  return MODULE_CODES.filter((code) => input.includes(code));
}

// Roles confined to HR only. Mirrors the API's rbac: the `hr` role is absent
// from every finance/ops module's READ_ROLES, so it can never be granted them.
// Every other role (owner, accountant, viewer) is a READ_ROLE everywhere, so it
// may be granted any module — write is gated separately inside each module.
const HR_ONLY_ROLES = new Set<string>(['hr']);
// Dhenu personas are confined to milk_procurement, just as `hr` is to HR.
const MILK_ONLY_ROLES = new Set<string>(['field_operator', 'farmer']);

/**
 * Which enabled modules a role is *permitted* to access at all — the ceiling
 * for any explicit per-user grant. `hr` is limited to HR & Payroll;
 * `field_operator`/`farmer` to Milk Procurement; every other role may be
 * granted any enabled module (read access is open to owner/accountant/viewer
 * across all modules at the rbac layer). Keeps the per-user grant in lockstep
 * with API rbac so a granted module never 403s.
 */
export function roleAllowedModules(
  role: string | null | undefined,
  enabled: readonly ModuleCode[],
): ModuleCode[] {
  if (HR_ONLY_ROLES.has(role ?? '')) return enabled.filter((code) => code === 'hr');
  if (MILK_ONLY_ROLES.has(role ?? '')) return enabled.filter((code) => code === 'milk_procurement');
  return [...enabled];
}

/**
 * Default module access for a user with no explicit grant (`null`):
 *   owner/client_owner → all enabled · accountant → finance ·
 *   hr & viewer → HR & Payroll only.
 * Viewers start with just HR checked; an owner ticks on any other module
 * the role is allowed (see `roleAllowedModules`) per user.
 */
export function defaultModulesForRole(
  role: string | null | undefined,
  enabled: readonly ModuleCode[],
): ModuleCode[] {
  if (role === 'owner' || role === 'client_owner') return [...enabled];
  if (role === 'accountant') return enabled.filter((code) => code === 'finance');
  if (MILK_ONLY_ROLES.has(role ?? '')) return enabled.filter((code) => code === 'milk_procurement');
  return enabled.filter((code) => code === 'hr');
}
