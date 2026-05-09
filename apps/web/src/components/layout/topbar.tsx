import { useEffect, useRef, useState, useMemo } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  Search, Sparkles, ChevronDown, Bell, Sun, Moon, Check,
  AlertCircle, CheckCircle2, Info, LogOut, Settings, Building2,
  LifeBuoy as LifeBuoyIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../providers/theme-provider';
import { useAuth } from '../../providers/auth-provider';
import { useCompanySettings } from '../../hooks/queries/use-settings';
import {
  useNotifications, useMarkAllNotificationsRead,
  useCurrentFy, useUpdateCurrentFy,
} from '../../hooks/queries/use-dashboard';
import type { Notification as Notif } from '../../hooks/queries/use-dashboard';
import { CommandPalette, useCommandPalette } from './cmdk';
import { NAV_GROUPS } from './sidebar';

/** Build the prior 4 FY codes ending at the current FY (Apr–Mar). */
function buildFyOptions(): { value: string; label: string }[] {
  const now = new Date();
  // FY starts in April. If month < 3 (Jan–Mar), we're in the prior FY's tail.
  const fyStartYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < 4; i++) {
    const start = fyStartYear - i;
    const end = start + 1;
    const value = `${String(start).slice(2)}${String(end).slice(2)}`;
    out.push({ value, label: `FY ${start}–${String(end).slice(2)}` });
  }
  return out;
}

function defaultFyValue(): string {
  return buildFyOptions()[0]!.value;
}

const NOTIF_ICONS = { info: Info, ok: CheckCircle2, warn: AlertCircle };
const NOTIF_COLOR: Record<Notif['type'], string> = {
  info: 'var(--accent-text)',
  ok: 'var(--pos)',
  warn: 'var(--warn)',
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [active, onClose, ref]);
}

/** Resolve the current path into (group label, item label) using sidebar nav. */
function resolveCrumbs(path: string): { group: string | null; leaf: string } {
  if (path === '/') return { group: null, leaf: 'Dashboard' };

  let bestMatch: { group: string | null; leaf: string; score: number } | null = null;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.path === '/') continue; // dashboard handled above
      if (path === item.path || path.startsWith(item.path + '/')) {
        const score = item.path.length;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { group: group.label, leaf: item.label, score };
        }
      }
    }
  }
  if (bestMatch) return { group: bestMatch.group, leaf: bestMatch.leaf };

  // Fallback: title-case the first path segment
  const seg = path.split('/').filter(Boolean)[0] ?? 'Dashboard';
  return { group: null, leaf: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ') };
}

function Breadcrumb() {
  const { data: company } = useCompanySettings();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { group, leaf } = resolveCrumbs(path);
  const orgName = company?.data?.name ?? 'Your company';
  return (
    <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      <span className="truncate text-[12px]" style={{ color: 'var(--text-3)' }}>{orgName}</span>
      <ChevronDown size={12} className="-rotate-90" style={{ color: 'var(--text-3)' }} />
      {group && (
        <>
          <span className="truncate text-[12px]" style={{ color: 'var(--text-3)' }}>{group}</span>
          <ChevronDown size={12} className="-rotate-90" style={{ color: 'var(--text-3)' }} />
        </>
      )}
      <span className="truncate text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>{leaf}</span>
    </div>
  );
}

function FYSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const options = useMemo(() => buildFyOptions(), []);
  const { data } = useCurrentFy();
  const update = useUpdateCurrentFy();
  const fy = data?.data.currentFy ?? defaultFyValue();
  const current = options.find((o) => o.value === fy) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium hover:bg-[color:var(--surface-2)]"
        style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
      >
        <span className="num">{current.label}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1.5 w-44 animate-scale-in overflow-hidden rounded-md border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.25)' }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => {
                // Persist null when user re-selects the auto-default — that
                // way the dashboard tracks "today's FY" instead of pinning.
                const next = o.value === defaultFyValue() ? null : o.value;
                update.mutate(next);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-[color:var(--surface-2)]"
              style={{ color: 'var(--text-1)' }}
            >
              <span className="num">{o.label}</span>
              {o.value === fy && <Check size={13} style={{ color: 'var(--accent-text)' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const { data, isLoading } = useNotifications(20);
  const markAll = useMarkAllNotificationsRead();
  const notifs = data?.data.items ?? [];
  const unread = data?.data.unread ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        className="relative flex h-8 w-8 items-center justify-center rounded-md hover:bg-[color:var(--surface-2)]"
        style={{ color: 'var(--text-2)' }}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
            style={{ background: 'var(--neg)' }}
          />
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1.5 w-[340px] animate-scale-in overflow-hidden rounded-lg border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.25)' }}
        >
          <div
            className="flex items-center justify-between border-b px-3.5 py-2.5"
            style={{ borderColor: 'var(--border-soft)' }}
          >
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
              Notifications
            </span>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="text-[11px] hover:underline disabled:opacity-50"
                style={{ color: 'var(--accent-text)' }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto scrollbar-thin">
            {isLoading && (
              <div className="space-y-1 px-3.5 py-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded"
                    style={{ background: 'var(--surface-2)' }}
                  />
                ))}
              </div>
            )}
            {!isLoading && notifs.length === 0 && (
              <div className="px-4 py-8 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>
                You're all caught up.
              </div>
            )}
            {!isLoading && notifs.map((n) => {
              const Icon = NOTIF_ICONS[n.type];
              const clickable = !!n.targetUrl;
              return (
                <button
                  key={n.id}
                  disabled={!clickable}
                  onClick={() => {
                    if (n.targetUrl) {
                      setOpen(false);
                      navigate({ to: n.targetUrl as '/' });
                    }
                  }}
                  className={cn(
                    'block w-full border-b px-3.5 py-2.5 text-left',
                    clickable && 'hover:bg-[color:var(--surface-2)]',
                  )}
                  style={{
                    borderColor: 'var(--border-soft)',
                    borderLeft: n.unread ? `2px solid var(--accent)` : '2px solid transparent',
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <Icon size={14} style={{ color: NOTIF_COLOR[n.type], marginTop: 2 }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="mt-0.5 text-[12px]" style={{ color: 'var(--text-2)' }}>
                          {n.body}
                        </div>
                      )}
                      <div className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                        {relativeTime(n.createdAt)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const { user, logout } = useAuth();
  const initials = (user?.name ?? user?.email ?? 'U').slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
        title={user?.name ?? user?.email ?? 'Account'}
      >
        {initials}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1.5 w-60 animate-scale-in overflow-hidden rounded-lg border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.25)' }}
        >
          <div className="border-b px-3 py-2.5" style={{ borderColor: 'var(--border-soft)' }}>
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
              {user?.name ?? 'You'}
            </div>
            <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
              {user?.email ?? ''}
            </div>
            {user?.role && (
              <div className="mt-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
                {user.role.replace('_', ' ')}
              </div>
            )}
          </div>
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[color:var(--surface-2)]"
            style={{ color: 'var(--text-1)' }}
          >
            <Settings size={14} /> Org settings
          </Link>
          <Link
            to="/settings/client-invites"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[color:var(--surface-2)]"
            style={{ color: 'var(--text-1)' }}
          >
            <Building2 size={14} /> Invite a client / CA
          </Link>
          <button
            onClick={() => { setOpen(false); logout(); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-[color:var(--surface-2)]"
            style={{ color: 'var(--neg)' }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function AskRunqMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  function pick(target: 'finance' | 'support') {
    setOpen(false);
    const evt = target === 'finance' ? 'runq:open-finance-agent' : 'runq:open-support';
    window.dispatchEvent(new Event(evt));
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium hover:opacity-90"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
      >
        <Sparkles size={13} />
        <span>Ask runQ</span>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1.5 w-[280px] animate-scale-in overflow-hidden rounded-lg border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.25)' }}
        >
          <div className="border-b px-3 py-2 text-[11px]" style={{ borderColor: 'var(--border-soft)', color: 'var(--text-3)' }}>
            What would you like help with?
          </div>
          <button
            onClick={() => pick('finance')}
            className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-2)]"
          >
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
            >
              <Sparkles size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
                Finance question
              </span>
              <span className="mt-0.5 block text-[11.5px]" style={{ color: 'var(--text-3)' }}>
                Ask the finance agent — invoices, GST, reconciliation, ledgers.
              </span>
            </span>
          </button>
          <button
            onClick={() => pick('support')}
            className="flex w-full items-start gap-3 border-t px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-2)]"
            style={{ borderColor: 'var(--border-soft)' }}
          >
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
            >
              <LifeBuoyIcon size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
                Help & support
              </span>
              <span className="mt-0.5 block text-[11.5px]" style={{ color: 'var(--text-3)' }}>
                How-to questions, account issues, contact our team.
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function TenantSwitcher() {
  const { tenants, activeTenantId, switchTenant, refreshTenants } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  // Hide entirely if the user has zero or one tenant — nothing to switch to.
  if (tenants.length < 2) return null;

  const active = tenants.find((t) => t.tenantId === activeTenantId) ?? tenants[0];

  function handleOpen() {
    setOpen((v) => {
      const next = !v;
      // Refresh memberships when opening so freshly accepted invites appear.
      if (next) void refreshTenants();
      return next;
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium hover:bg-[color:var(--surface-2)]"
        style={{ borderColor: 'var(--border)', color: 'var(--text-1)', maxWidth: 220 }}
        title="Switch client"
      >
        <Building2 size={13} style={{ color: 'var(--text-3)' }} />
        <span className="truncate">{active?.tenantName ?? 'Select tenant'}</span>
        <ChevronDown size={13} style={{ color: 'var(--text-3)' }} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1.5 w-72 animate-scale-in overflow-hidden rounded-lg border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.25)' }}
        >
          <div
            className="flex items-center justify-between border-b px-3 py-2"
            style={{ borderColor: 'var(--border-soft)' }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              Switch client
            </span>
            <kbd
              className="rounded border px-1.5 py-0.5 text-[10px]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
              title="Open command palette"
            >
              ⌘K
            </kbd>
          </div>
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {tenants.map((t) => {
              const isActive = t.tenantId === activeTenantId;
              return (
                <button
                  key={t.tenantId}
                  onClick={() => {
                    setOpen(false);
                    if (!isActive) switchTenant(t.tenantId);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-[color:var(--surface-2)]"
                  style={{ color: 'var(--text-1)' }}
                >
                  <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                    {isActive
                      ? <Check size={13} style={{ color: 'var(--accent)' }} />
                      : <Building2 size={12} style={{ color: 'var(--text-3)' }} />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{t.tenantName}</span>
                    <span className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
                      {t.tenantSlug} · {t.role}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function Topbar() {
  const { theme, toggleTheme } = useTheme();
  const [cmdkOpen, setCmdkOpen] = useCommandPalette();

  return (
    <>
      <header
        className="hidden h-[52px] shrink-0 items-center gap-3 border-b px-4 md:flex"
        style={{ background: 'var(--surface)', borderColor: 'var(--border-soft)' }}
      >
        <Breadcrumb />

        <div className="flex flex-1 items-center justify-end gap-2">
          <TenantSwitcher />

          {/* Search trigger */}
          <button
            onClick={() => setCmdkOpen(true)}
            className={cn(
              'group flex h-8 items-center gap-2 rounded-md border px-2.5 text-[12px]',
              'hover:bg-[color:var(--surface-2)]',
            )}
            style={{ borderColor: 'var(--border)', color: 'var(--text-3)', minWidth: 280 }}
          >
            <Search size={14} />
            <span className="flex-1 text-left">Search</span>
            <kbd
              className="rounded border px-1.5 py-0.5 text-[10px]"
              style={{ borderColor: 'var(--border)' }}
            >
              ⌘K
            </kbd>
          </button>

          {/* Ask runQ pill — opens chooser between finance agent and support */}
          <AskRunqMenu />


          <FYSwitcher />
          <Notifications />

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[color:var(--surface-2)]"
            style={{ color: 'var(--text-2)' }}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <ProfileMenu />
        </div>
      </header>

      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} />
    </>
  );
}
