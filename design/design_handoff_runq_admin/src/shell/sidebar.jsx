// Sidebar — grouped sections with icon-rail collapsed mode.
const NAV_GROUPS = [
  {
    label: null,
    items: [
      { key: "dashboard", label: "Dashboard", icon: "layout-dashboard", path: "/" },
      { key: "agent", label: "Ask runQ", icon: "sparkles", path: "/agent", badge: "AI" },
      { key: "inbox", label: "Inbox", icon: "inbox", path: "/inbox", count: 4 },
      { key: "documents", label: "Documents", icon: "folder", path: "/documents" },
    ],
  },
  {
    label: "Money in",
    items: [
      { key: "invoices", label: "Invoices", icon: "file-text", path: "/ar/invoices" },
      { key: "quotes", label: "Quotes & SOs", icon: "clipboard-list", path: "/ar/quotes" },
      { key: "deliveries", label: "Delivery notes", icon: "truck", path: "/ar/deliveries" },
      { key: "creditnotes", label: "Credit notes", icon: "file-minus", path: "/ar/credit-notes" },
      { key: "receipts", label: "Receipts", icon: "receipt", path: "/ar/receipts" },
      { key: "customers", label: "Customers", icon: "users", path: "/ar/customers" },
      { key: "collections", label: "Collections", icon: "alarm-clock", path: "/ar/collections", count: 6 },
    ],
  },
  {
    label: "Money out",
    items: [
      { key: "bills", label: "Bills", icon: "file-input", path: "/ap/bills", count: 12 },
      { key: "po", label: "Purchase orders", icon: "clipboard-check", path: "/ap/po" },
      { key: "grn", label: "GRN / Receipts", icon: "package-check", path: "/ap/grn" },
      { key: "debitnotes", label: "Debit notes", icon: "file-x", path: "/ap/debit-notes" },
      { key: "payments", label: "Payments", icon: "credit-card", path: "/ap/payments" },
      { key: "vendors", label: "Vendors", icon: "building-2", path: "/ap/vendors" },
      { key: "expenses", label: "Expenses", icon: "wallet", path: "/expenses" },
      { key: "payruns", label: "Pay runs", icon: "split", path: "/ap/pay-runs" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { key: "items", label: "Items", icon: "package", path: "/inventory/items" },
      { key: "stock", label: "Stock & warehouses", icon: "warehouse", path: "/inventory/stock" },
      { key: "transfers", label: "Stock transfers", icon: "move-right", path: "/inventory/transfers" },
    ],
  },
  {
    label: "Books",
    items: [
      { key: "banking", label: "Banking", icon: "landmark", path: "/banking" },
      { key: "journal", label: "Journal entries", icon: "notebook-pen", path: "/journal" },
      { key: "ledger", label: "General ledger", icon: "book-open", path: "/gl" },
      { key: "assets", label: "Fixed assets", icon: "boxes", path: "/fa" },
      { key: "reports", label: "Reports", icon: "bar-chart-3", path: "/reports" },
      { key: "budgets", label: "Budgets", icon: "target", path: "/budgets" },
    ],
  },
  {
    label: "Compliance",
    items: [
      { key: "gst", label: "GST filing", icon: "shield-check", path: "/gst", badge: "7d" },
      { key: "einvoice", label: "e-Invoice", icon: "file-check-2", path: "/e-invoice" },
      { key: "eway", label: "e-Way bill", icon: "truck", path: "/eway" },
      { key: "tds", label: "TDS & TCS", icon: "scroll-text", path: "/tds" },
      { key: "audit", label: "Audit trail", icon: "history", path: "/audit" },
    ],
  },
  {
    label: "Setup",
    items: [
      { key: "workflows", label: "Workflows", icon: "git-branch", path: "/workflows" },
      { key: "masters", label: "Masters", icon: "layers", path: "/masters" },
      { key: "users", label: "Users & roles", icon: "user-cog", path: "/users" },
      { key: "integrations", label: "Integrations", icon: "plug", path: "/integrations" },
      { key: "settings", label: "Settings", icon: "settings", path: "/settings" },
    ],
  },
];

function NavItem({ item, active, collapsed, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-full flex items-center gap-2.5 rounded-md transition-colors text-left
        ${collapsed ? "justify-center h-9 w-9 mx-auto" : "px-2.5 py-1.5"}
        ${active
          ? "nav-active text-1 surface-2"
          : "text-2 hover:text-1 hover:surface-2"}`}
      title={collapsed ? item.label : undefined}
    >
      <Icon name={item.icon} size={16} strokeWidth={active ? 2 : 1.75} />
      {!collapsed && (
        <>
          <span className="text-[13px] flex-1 truncate">{item.label}</span>
          {item.count != null ? (
            <span className="num text-[10px] surface-2 border border-app rounded px-1 py-0.5 text-2">{item.count}</span>
          ) : item.badge ? (
            <span className="text-[9px] font-semibold uppercase tracking-wider accent-soft-bg accent-text rounded px-1 py-0.5">{item.badge}</span>
          ) : null}
        </>
      )}
    </button>
  );
}

function Sidebar({ collapsed, onToggle, active, onNavigate, theme }) {
  const logo = theme === "dark" ? "assets/runq-light.png" : "assets/runq-dark.png";
  return (
    <aside
      className={`shrink-0 h-full surface border-r border-app flex flex-col transition-[width] duration-200 ${collapsed ? "w-[60px]" : "w-[232px]"}`}
    >
      {/* logo + collapse toggle */}
      <div className={`flex items-center ${collapsed ? "justify-center px-2" : "justify-between px-4"} h-[52px] border-b border-soft`}>
        {collapsed ? (
          <button
            onClick={onToggle}
            className="h-8 w-8 rounded-md hover:surface-2 flex items-center justify-center group relative"
            title="Expand sidebar"
          >
            <img src="assets/runq-favicon.png" alt="runQ" className="h-5 w-5 group-hover:opacity-0 transition-opacity absolute" />
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-2">
              <Icon name="panel-left-open" size={15} />
            </span>
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <img src={logo} alt="runQ" className="h-[22px] shrink-0" />
              <span className="text-[9px] font-semibold uppercase tracking-[0.1em] accent-text accent-soft-bg rounded px-1 py-[1px] whitespace-nowrap">Finance</span>
            </div>
            <button
              onClick={onToggle}
              className="h-7 w-7 rounded-md text-3 hover:text-1 hover:surface-2 flex items-center justify-center shrink-0"
              title="Collapse sidebar"
            >
              <Icon name="panel-left-close" size={15} />
            </button>
          </>
        )}
      </div>

      {/* nav */}
      <nav className={`flex-1 overflow-y-auto scrollbar-thin ${collapsed ? "py-2" : "px-3 py-3"} space-y-3`}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className="space-y-0.5">
            {!collapsed && group.label ? (
              <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-3">{group.label}</div>
            ) : collapsed && gi > 0 ? (
              <div className="border-t border-soft mx-3 my-2" />
            ) : null}
            <div className={collapsed ? "space-y-0.5" : "space-y-[1px]"}>
              {group.items.map((it) => (
                <NavItem key={it.key} item={it} active={active === it.key} collapsed={collapsed} onClick={() => onNavigate(it.key)} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* upgrade card */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <div className="rounded-lg p-3 border border-app surface-2 relative overflow-hidden">
            <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full" style={{ background: "radial-gradient(circle, var(--accent-soft) 0%, transparent 70%)" }} />
            <div className="relative">
              <div className="flex items-center gap-1.5 mb-1 whitespace-nowrap">
                <Icon name="zap" size={12} className="accent-text shrink-0" />
                <span className="text-[11px] font-semibold text-1 whitespace-nowrap">runQ Agent Pro</span>
              </div>
              <p className="text-[11px] text-3 leading-snug mb-2">Auto-reconcile, draft GST, send reminders — hands-free.</p>
              <button className="w-full text-[11px] font-medium accent-bg text-white rounded-md py-1.5 hover:opacity-90">Upgrade</button>
            </div>
          </div>
        </div>
      )}

      {/* footer — help / shortcuts (no profile; that's in the topbar) */}
      <div className={`border-t border-soft ${collapsed ? "p-2 flex flex-col items-center gap-1" : "px-3 py-2 flex items-center gap-1"}`}>
        <button className={`${collapsed ? "h-8 w-8" : "h-7 px-2 flex-1 justify-start gap-2"} rounded-md text-3 hover:text-1 hover:surface-2 flex items-center text-[12px]`} title="Help & docs">
          <Icon name="life-buoy" size={13} />
          {!collapsed && <span>Help & docs</span>}
        </button>
        <button className={`${collapsed ? "h-8 w-8" : "h-7 w-7"} rounded-md text-3 hover:text-1 hover:surface-2 flex items-center justify-center`} title="Keyboard shortcuts (⌘K)">
          <Icon name="command" size={13} />
        </button>
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;
