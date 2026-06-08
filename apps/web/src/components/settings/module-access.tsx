import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { MODULES, MODULE_CODES, defaultModulesForRole, roleAllowedModules, type ModuleCode } from '@runq/types';
import { Card, CardContent, Badge, useToast } from '@/components/ui';
import {
  useEnabledModules,
  useUpdateEnabledModules,
  useUpdateUser,
  type TenantUser,
} from '@/hooks/queries/use-settings';

const moduleLabel = (code: ModuleCode) => MODULES.find((m) => m.code === code)?.label ?? code;

// ─── Tenant module ceiling ──────────────────────────────────────────────────

/** Owner-facing toggles for the workspace's enabled modules. Per-user grants
 *  (below, in the users table) can only ever grant what's switched on here. */
export function TenantModulesCard() {
  const { data, isLoading } = useEnabledModules();
  const update = useUpdateEnabledModules();
  const { toast } = useToast();
  const enabled = new Set(data?.data.enabledModules ?? []);
  const busy = update.isPending || isLoading;

  async function toggle(code: ModuleCode, on: boolean) {
    const next = MODULE_CODES.filter((c) => (c === code ? on : enabled.has(c)));
    try {
      await update.mutateAsync(next);
      toast('Modules updated', 'success');
    } catch {
      toast('Failed to update modules', 'error');
    }
  }

  return (
    <Card>
      <CardContent>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Modules</h3>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Turn modules on or off for your whole workspace. Per-user access below can only grant
          what's enabled here.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {MODULES.map((m) => (
            <label
              key={m.code}
              className={`flex items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700 ${
                busy ? 'opacity-60' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                className="rounded border-zinc-300"
                checked={enabled.has(m.code)}
                disabled={busy}
                onChange={(e) => toggle(m.code, e.target.checked)}
              />
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{m.label}</span>
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Per-user module grant ──────────────────────────────────────────────────

/** Dropdown letting an owner grant a user a subset of the modules their role
 *  may access. `null` grant = the role default (shown as "Default"); an
 *  explicit selection overrides it. Owners always see everything (static
 *  badge). Only role-allowed modules are listed, so a grant can't outrun rbac. */
export function ModuleGrantEditor({
  user,
  enabledModules,
}: {
  user: TenantUser;
  enabledModules: ModuleCode[];
}) {
  const updateUser = useUpdateUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isOwner = user.role === 'owner' || user.role === 'client_owner';
  const isDefault = user.modules === null;
  // Modules this role may access at all — the toggleable set.
  const allowed = roleAllowedModules(user.role, enabledModules);
  // What the user effectively has, for display: role default when ungranted,
  // else the explicit grant clamped to what the role allows.
  const selected = new Set<ModuleCode>(
    isDefault
      ? defaultModulesForRole(user.role, enabledModules)
      : allowed.filter((c) => user.modules!.includes(c)),
  );

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (isOwner) return <Badge variant="default">All modules</Badge>;

  async function commit(value: ModuleCode[] | null) {
    try {
      await updateUser.mutateAsync({ id: user.id, data: { modules: value } });
    } catch {
      toast('Failed to update modules', 'error');
    }
  }

  // Toggling a module makes the grant explicit (array); "Use role default"
  // clears it back to null so it tracks the role automatically.
  function toggle(code: ModuleCode) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    commit(allowed.filter((c) => next.has(c)));
  }

  const label = isDefault
    ? 'Default'
    : selected.size === 0
      ? 'None'
      : `${selected.size} of ${allowed.length}`;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={updateUser.isPending}
        className="flex items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
      >
        {label}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => commit(null)}
            className="flex w-full items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2 text-left text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
          >
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Use role default</span>
            {isDefault && <Check size={14} className="text-indigo-500" />}
          </button>
          {allowed.length === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-500">No modules available for this role.</p>
          ) : (
            allowed.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => toggle(code)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <span className="text-zinc-700 dark:text-zinc-300">{moduleLabel(code)}</span>
                {selected.has(code) && <Check size={14} className="text-indigo-500" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
