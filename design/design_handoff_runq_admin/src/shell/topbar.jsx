// Top bar with workspace switcher, command/search, AI ask, period, notifications, theme, avatar.

function Topbar({ theme, onToggleTheme, onOpenCmdk, onOpenAgent, page, notifs, onOpenNotif }) {
  const [showNotif, setShowNotif] = React.useState(false);
  const [showProfile, setShowProfile] = React.useState(false);

  const unread = notifs.filter((n) => n.unread).length;

  return (
    <header className="surface border-b border-app h-[52px] flex items-center px-4 gap-3 shrink-0">
      {/* page context */}
      <div className="flex items-center gap-2 min-w-0">
        <Icon name={page.icon || "layout-dashboard"} size={14} className="text-3 shrink-0" />
        <div className="text-[12px] text-3 whitespace-nowrap truncate">{page.crumb || RUNQ.COMPANY.name}</div>
        <Icon name="chevron-right" size={12} className="text-3 shrink-0" />
        <div className="text-[12px] font-medium text-1 whitespace-nowrap truncate">{page.title}</div>
      </div>

      <div className="flex-1" />

      {/* search / cmdk trigger */}
      <button
        onClick={onOpenCmdk}
        className="hidden md:flex items-center gap-2 h-8 px-2.5 rounded-md surface-2 border border-app hover:border-app text-3 hover:text-2 transition-colors min-w-[280px]"
      >
        <Icon name="search" size={13} className="shrink-0" />
        <span className="text-[12px] flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis">Search invoices, vendors, anything…</span>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </button>

      {/* AI ask pill */}
      <button
        onClick={onOpenAgent}
        className="hidden lg:flex items-center gap-2 h-8 px-3 rounded-md border border-app surface-2 hover:surface transition-colors group relative overflow-hidden"
        style={{ minWidth: 200 }}
      >
        <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "linear-gradient(90deg, var(--accent-soft), transparent)" }} />
        <span className="relative flex items-center gap-2">
          <Icon name="sparkles" size={13} className="accent-text" />
          <span className="text-[12px] text-2">Ask runQ anything</span>
        </span>
      </button>

      {/* period */}
      <button className="hidden xl:flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-app surface-2 hover:surface text-2 hover:text-1 text-[12px]">
        <Icon name="calendar" size={13} />
        <span>{RUNQ.COMPANY.fy}</span>
        <Icon name="chevron-down" size={11} className="text-3" />
      </button>

      {/* notifications */}
      <div className="relative">
        <button
          onClick={() => { setShowNotif((v) => !v); setShowProfile(false); }}
          className="h-8 w-8 rounded-md hover:surface-2 text-2 hover:text-1 flex items-center justify-center relative"
        >
          <Icon name="bell" size={15} />
          {unread > 0 && (
            <span className="absolute top-1 right-1 num text-[8px] font-bold text-white rounded-full px-[3px] py-[1px] leading-none" style={{ background: "var(--neg)" }}>
              {unread}
            </span>
          )}
        </button>
        {showNotif && (
          <NotificationPanel notifs={notifs} onClose={() => setShowNotif(false)} />
        )}
      </div>

      {/* theme */}
      <button
        onClick={onToggleTheme}
        className="h-8 w-8 rounded-md hover:surface-2 text-2 hover:text-1 flex items-center justify-center"
        title={theme === "dark" ? "Light mode" : "Dark mode"}
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
      </button>

      {/* profile */}
      <div className="relative">
        <button
          onClick={() => { setShowProfile((v) => !v); setShowNotif(false); }}
          className="flex items-center gap-2 h-8 pl-1 pr-2 rounded-md hover:surface-2"
        >
          <Avatar name={RUNQ.COMPANY.user.name} size={24} />
          <Icon name="chevron-down" size={11} className="text-3" />
        </button>
        {showProfile && <ProfileMenu onClose={() => setShowProfile(false)} />}
      </div>
    </header>
  );
}

function NotificationPanel({ notifs, onClose }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[360px] surface border border-app rounded-lg shadow-xl overflow-hidden" style={{ boxShadow: "0 12px 40px -8px rgba(0,0,0,0.15)" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-soft">
          <div className="text-[13px] font-semibold text-1">Notifications</div>
          <button className="text-[11px] accent-text hover:underline">Mark all read</button>
        </div>
        <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
          {notifs.map((n) => (
            <div key={n.id} className="px-4 py-3 border-b border-soft hover:surface-2 cursor-pointer flex gap-3">
              <div className="mt-1">
                <Dot tone={n.type === "warn" ? "warn" : n.type === "ok" ? "ok" : "info"} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                  <div className={`text-[12px] font-medium leading-snug ${n.unread ? "text-1" : "text-2"}`}>{n.title}</div>
                </div>
                <div className="text-[11px] text-3 mt-0.5">{n.body}</div>
                <div className="text-[10px] text-3 mt-1">{n.when}</div>
              </div>
              {n.unread && <div className="h-1.5 w-1.5 rounded-full mt-1 shrink-0" style={{ background: "var(--accent)" }} />}
            </div>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t border-soft text-center">
          <button className="text-[12px] accent-text hover:underline">View all activity</button>
        </div>
      </div>
    </>
  );
}

function ProfileMenu({ onClose }) {
  const items = [
    { icon: "user", label: "My account" },
    { icon: "building", label: "Workspace settings" },
    { icon: "users", label: "Invite team" },
    { icon: "keyboard", label: "Keyboard shortcuts", kbd: "?" },
    { icon: "life-buoy", label: "Help & docs" },
  ];
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[240px] surface border border-app rounded-lg shadow-xl overflow-hidden" style={{ boxShadow: "0 12px 40px -8px rgba(0,0,0,0.15)" }}>
        <div className="px-3 py-3 border-b border-soft flex items-center gap-2.5">
          <Avatar name={RUNQ.COMPANY.user.name} size={32} />
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-1 truncate">{RUNQ.COMPANY.user.name}</div>
            <div className="text-[11px] text-3 truncate">{RUNQ.COMPANY.user.email}</div>
          </div>
        </div>
        <div className="py-1">
          {items.map((it) => (
            <button key={it.label} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-2 hover:text-1 hover:surface-2">
              <Icon name={it.icon} size={13} />
              <span className="flex-1 text-left">{it.label}</span>
              {it.kbd && <Kbd>{it.kbd}</Kbd>}
            </button>
          ))}
        </div>
        <div className="border-t border-soft py-1">
          <button className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-2 hover:text-1 hover:surface-2">
            <Icon name="log-out" size={13} />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </>
  );
}

window.Topbar = Topbar;
