/**
 * Canonical module registry — the single source of truth for which functional
 * areas a tenant can enable and a user can be granted access to.
 *
 * Consumed by the API (effective-module computation + `requireModule` route
 * guards) and the web app (sidebar + route gating). The mobile app keeps a
 * thin Dart mirror of these codes (see app_module_provider.dart).
 *
 * Access is three-tiered and only partly orthogonal to role:
 *   - tenant.enabled_modules → the ceiling (what the tenant has turned on)
 *   - roleAllowedModules()   → what the role may hold at all (hr → HR,
 *                              farmer → Milk Procurement, technician →
 *                              Manufacturing + Inventory, field_operator →
 *                              Milk Procurement + plant modules), each with
 *                              the HR floor added for employee roles
 *   - user_tenants.modules   → the per-user grant; null means "role default"
 *                              (see defaultModulesForRole), NOT "everything"
 *   - effective = (enabled ∩ roleAllowed ∩ (grant ?? roleDefault)) ∪ HR floor
 *     …with owner/client_owner short-circuiting to all enabled.
 *
 * The HR floor (see withHrFloor) is the one part that is *not* grantable:
 * every employee holds HR self-service, so it survives a grant that omits it.
 * Farmers are excluded — they are suppliers, not staff.
 * Computed in the API's tenant-context plugin; that function is the contract
 * this file documents, so keep the two in step.
 *
 * Note the role ceiling is applied to stored grants at read time, so a grant
 * carrying modules the role can't hold is silently dropped — and a grant that
 * lists *only* such modules leaves the user with no access at all.
 *
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
// Farmers only ever see their own milk procurement surface.
const MILK_ONLY_ROLES = new Set<string>(['farmer']);
// Shop-floor technicians live on the plant side only — they run production and
// need to see the stock behind it, but never Finance/HR/Purchase.
const PLANT_ROLES = new Set<string>(['technician']);
const PLANT_MODULES = new Set<string>(['manufacturing', 'inventory']);
// A field operator runs a collection centre, and at a small dairy the same
// person often also works the plant — and is an employee of it besides. They
// may therefore be granted the plant modules and HR self-service on top of
// milk procurement, but only by explicit per-user grant: `defaultModulesForRole`
// still gives them milk procurement alone, so nobody picks up the extra access
// merely by being an operator. HR is reachable because `rbacHook` treats
// field_operator as a viewer, which is the role an ordinary employee logs in as.
const OPERATOR_ROLES = new Set<string>(['field_operator']);
const OPERATOR_MODULES = new Set<string>(['milk_procurement', 'manufacturing', 'inventory', 'hr']);
// Roles that are not employees of the tenant. A farmer supplies milk under their
// own Dhenu credentials and has no employment relationship, so the HR floor
// below must never reach them. Every other role is somebody on the payroll.
const NON_EMPLOYEE_ROLES = new Set<string>(['farmer']);

/**
 * HR self-service (own attendance, leave, payslip) is a floor, not a grant:
 * every employee holds it regardless of role or per-user grant, because they
 * are an employee before they are an operator or a technician. Privileged HR
 * work — payroll runs, salary structures, statutory challans — is gated
 * separately by role inside the HR module's own rbac lists, so widening the
 * module here confers self-service only.
 *
 * Still bounded by the tenant ceiling: a tenant without HR enabled grants
 * nobody HR. Applied to defaults, role ceilings and stored grants alike, so a
 * grant that predates this rule (or simply omits `hr`) still resolves to HR
 * access without needing a backfill.
 */
export function withHrFloor(
  role: string | null | undefined,
  enabled: readonly ModuleCode[],
  codes: readonly ModuleCode[],
): ModuleCode[] {
  if (NON_EMPLOYEE_ROLES.has(role ?? '')) return [...codes];
  if (!enabled.includes('hr') || codes.includes('hr')) return [...codes];
  return sanitizeModuleCodes([...codes, 'hr']);
}

/**
 * Which enabled modules a role is *permitted* to access at all — the ceiling
 * for any explicit per-user grant. `hr` is limited to HR & Payroll; `farmer`
 * to Milk Procurement; `technician` to the plant modules; `field_operator` to
 * Milk Procurement plus the plant modules. Every employee role additionally
 * carries the non-grantable HR floor. Every other role may be granted any
 * enabled module (read access is open to owner/accountant/viewer across all
 * modules at the rbac layer). Keeps the per-user grant in lockstep with API
 * rbac so a granted module never 403s — widening a ceiling here without adding
 * the role to that module's rbac lists just buys a 403 one layer deeper.
 */
export function roleAllowedModules(
  role: string | null | undefined,
  enabled: readonly ModuleCode[],
): ModuleCode[] {
  if (HR_ONLY_ROLES.has(role ?? '')) return enabled.filter((code) => code === 'hr');
  if (MILK_ONLY_ROLES.has(role ?? '')) return enabled.filter((code) => code === 'milk_procurement');
  const ceiling = PLANT_ROLES.has(role ?? '')
    ? enabled.filter((code) => PLANT_MODULES.has(code))
    : OPERATOR_ROLES.has(role ?? '')
      ? enabled.filter((code) => OPERATOR_MODULES.has(code))
      : [...enabled];
  return withHrFloor(role, enabled, ceiling);
}

/**
 * Default module access for a user with no explicit grant (`null`):
 *   owner/client_owner → all enabled · accountant → finance + HR ·
 *   field_operator → Milk Procurement + HR · technician → plant + HR ·
 *   farmer → Milk Procurement · hr & viewer → HR & Payroll only.
 * Every employee starts with HR checked and keeps it; an owner ticks on any
 * other module the role is allowed (see `roleAllowedModules`) per user.
 */
export function defaultModulesForRole(
  role: string | null | undefined,
  enabled: readonly ModuleCode[],
): ModuleCode[] {
  if (role === 'owner' || role === 'client_owner') return [...enabled];
  // Farmers are not employees, so they never pick up the HR floor.
  if (MILK_ONLY_ROLES.has(role ?? '')) return enabled.filter((code) => code === 'milk_procurement');
  // Every branch below is an employee, so each carries HR on top of its own
  // default. The plant modules sit inside an operator's ceiling but never their
  // default — an owner grants those per person.
  const base = role === 'accountant'
    ? enabled.filter((code) => code === 'finance')
    : OPERATOR_ROLES.has(role ?? '')
      ? enabled.filter((code) => code === 'milk_procurement')
      : PLANT_ROLES.has(role ?? '')
        ? enabled.filter((code) => PLANT_MODULES.has(code))
        : [];
  return withHrFloor(role, enabled, base);
}
