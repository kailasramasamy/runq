// ─── Shared AR primitives — PageHeader, Table, Badge, EmptyState, Pagination, filter inputs ─

function PageHeader({ breadcrumbs = [], title, description, titleBadge, actions }) {
  return (
    <div className="mb-5">
      {breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-[11px] text-3 mb-2">
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Icon name="chevron-right" size={11} />}
              {b.href ? (
                <a className="hover:text-1 transition-colors">{b.label}</a>
              ) : (
                <span className="text-2">{b.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[22px] font-semibold text-1 leading-tight">{title}</h1>
            {titleBadge}
          </div>
          {description && <p className="text-[13px] text-3 mt-1">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}

// ─── Buttons ────────────────────────────────────────────────────────────────
function Button({ variant = "primary", size = "md", children, onClick, type = "button", className = "", icon, disabled, loading }) {
  const base = "inline-flex items-center justify-center gap-1.5 font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";
  const sizes = {
    sm: "h-7 px-2.5 text-[12px]",
    md: "h-9 px-3.5 text-[13px]",
    lg: "h-10 px-4 text-[14px]",
  };
  const variants = {
    primary: "accent-bg text-white hover:opacity-90 shadow-sm",
    outline: "border border-app surface hover:surface-2 text-1",
    ghost: "text-2 hover:text-1 hover:surface-2",
    danger: "text-white hover:opacity-90 shadow-sm",
  };
  const style = variant === "danger" ? { background: "var(--neg)" } : undefined;
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} style={style} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {loading ? <Icon name="loader-2" size={14} className="animate-spin" /> : icon ? <Icon name={icon} size={size === "sm" ? 13 : 14} /> : null}
      {children}
    </button>
  );
}

// ─── Badge / Status ──────────────────────────────────────────────────────────
function Badge({ children, variant = "default", className = "" }) {
  const variants = {
    default: "surface-2 text-2 border border-app",
    primary: "accent-soft-bg accent-text",
    info: "border",
    success: "pos-soft-bg pos-text",
    warning: "warn-soft-bg warn-text",
    danger: "neg-soft-bg neg-text",
    cyan: "border",
    outline: "border border-app text-3",
  };
  const style =
    variant === "info" ? { background: "color-mix(in oklab, var(--accent-soft) 70%, transparent)", color: "var(--accent-text)", borderColor: "color-mix(in oklab, var(--accent-text) 18%, transparent)" } :
    variant === "cyan" ? { background: "color-mix(in oklab, oklch(0.92 0.06 220) 50%, transparent)", color: "oklch(0.45 0.14 220)", borderColor: "color-mix(in oklab, oklch(0.45 0.14 220) 18%, transparent)" } :
    undefined;
  return (
    <span style={style} className={`inline-flex items-center gap-1 px-1.5 py-[3px] rounded text-[10px] font-semibold uppercase tracking-wider ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}

// Maps invoice status → badge variant + label
const INV_STATUS_BADGE = {
  draft: { v: "default", label: "Draft" },
  sent: { v: "info", label: "Sent" },
  viewed: { v: "primary", label: "Viewed" },
  partially_paid: { v: "warning", label: "Partial" },
  paid: { v: "success", label: "Paid" },
  overdue: { v: "danger", label: "Overdue" },
  cancelled: { v: "outline", label: "Cancelled" },
  // quotes
  accepted: { v: "success", label: "Accepted" },
  rejected: { v: "danger", label: "Rejected" },
  expired: { v: "outline", label: "Expired" },
  // SO
  open: { v: "info", label: "Open" },
  fulfilled: { v: "success", label: "Fulfilled" },
  // CN
  issued: { v: "info", label: "Issued" },
  adjusted: { v: "success", label: "Adjusted" },
  // collections
  contacted: { v: "info", label: "Contacted" },
  promised: { v: "cyan", label: "Promised" },
  resolved: { v: "success", label: "Resolved" },
  escalated: { v: "danger", label: "Escalated" },
  // dunning log
  delivered: { v: "success", label: "Delivered" },
  failed: { v: "danger", label: "Failed" },
};

function StatusBadge({ status }) {
  const cfg = INV_STATUS_BADGE[status] ?? { v: "default", label: status };
  return <Badge variant={cfg.v}>{cfg.label}</Badge>;
}

// ─── Table ───────────────────────────────────────────────────────────────────
function Table({ children, className = "" }) {
  return (
    <div className={`surface border border-app rounded-xl overflow-hidden ${className}`}>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-[13px]">{children}</table>
      </div>
    </div>
  );
}

function Th({ children, align = "left", className = "" }) {
  const a = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`px-4 py-2.5 font-semibold text-[10.5px] uppercase tracking-wider text-3 ${a} surface-2 border-b border-app whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
}

function TableHeader({ children }) { return <thead>{children}</thead>; }
function TableBody({ children }) { return <tbody>{children}</tbody>; }

function TableRow({ children, className = "", onClick, selected }) {
  return (
    <tr
      onClick={onClick}
      className={`${onClick ? "cursor-pointer" : ""} hover:surface-2 transition-colors border-b border-soft last:border-b-0 ${selected ? "" : ""} ${className}`}
      style={selected ? { background: "var(--accent-soft)" } : undefined}
    >
      {children}
    </tr>
  );
}

function TableCell({ children, className = "", align = "left", numeric = false, onClick }) {
  const a = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const num = numeric ? "num tabular-nums" : "";
  return (
    <td onClick={onClick} className={`px-4 py-2.5 text-[12.5px] text-1 ${a} ${num} ${className}`}>{children}</td>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ icon = "inbox", title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="h-12 w-12 rounded-full surface-2 border border-app flex items-center justify-center text-3 mb-3">
        <Icon name={icon} size={20} />
      </div>
      <div className="text-[14px] font-medium text-1 mb-1">{title}</div>
      {description && <div className="text-[12px] text-3 max-w-[360px] mb-3">{description}</div>}
      {action}
    </div>
  );
}

// ─── Pagination ──────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, total, limit, onPageChange }) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return (
    <div className="flex items-center justify-between text-[12px] text-3">
      <div>Showing <span className="num text-1">{start}</span>–<span className="num text-1">{end}</span> of <span className="num text-1">{total}</span></div>
      <div className="flex items-center gap-1">
        <button
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          className="h-7 w-7 rounded-md border border-app hover:surface-2 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        ><Icon name="chevron-left" size={13} /></button>
        <span className="num text-2 px-2">Page {page} / {totalPages}</span>
        <button
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-7 w-7 rounded-md border border-app hover:surface-2 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        ><Icon name="chevron-right" size={13} /></button>
      </div>
    </div>
  );
}

// ─── Form inputs (filters) ───────────────────────────────────────────────────
function Input({ icon, ...props }) {
  return (
    <div className="relative">
      {icon && <Icon name={icon} size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-3 pointer-events-none" />}
      <input
        {...props}
        className={`h-9 ${icon ? "pl-8" : "pl-3"} pr-3 rounded-md border border-app surface text-[13px] text-1 placeholder-text-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] w-full ${props.className || ""}`}
      />
    </div>
  );
}

function Select({ value, onChange, options, className = "" }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className={`h-9 pl-3 pr-8 rounded-md border border-app surface text-[13px] text-1 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] appearance-none cursor-pointer ${className}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <Icon name="chevron-down" size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-3 pointer-events-none" />
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
function Tabs({ tabs, active, onChange }) {
  return (
    <div className="border-b border-app mb-5">
      <nav className="flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`relative -mb-px px-3 py-2 text-[13px] font-medium transition-colors border-b-2 ${
              active === t.id ? "text-1" : "border-transparent text-3 hover:text-1"
            }`}
            style={active === t.id ? { borderBottomColor: "var(--accent)", color: "var(--accent-text)" } : undefined}
          >
            {t.label}
            {t.count != null && (
              <span className="ml-1.5 num text-[10px] surface-2 border border-app rounded px-1 py-0.5 text-2">{t.count}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ─── Stats card (mini) ───────────────────────────────────────────────────────
function StatTile({ label, value, sub, tone = "neutral" }) {
  const toneCls = tone === "pos" ? "pos-text" : tone === "neg" ? "neg-text" : tone === "warn" ? "warn-text" : "text-1";
  return (
    <div className="surface border border-app rounded-xl p-4">
      <div className="text-[11px] text-3 font-medium uppercase tracking-wider">{label}</div>
      <div className={`num text-[22px] font-semibold mt-1 ${toneCls} tabular-nums`}>{value}</div>
      {sub && <div className="text-[11px] text-3 mt-0.5">{sub}</div>}
    </div>
  );
}

window.PageHeader = PageHeader;
window.Button = Button;
window.Badge = Badge;
window.StatusBadge = StatusBadge;
window.Table = Table;
window.Th = Th;
window.TableHeader = TableHeader;
window.TableBody = TableBody;
window.TableRow = TableRow;
window.TableCell = TableCell;
window.EmptyState = EmptyState;
window.Pagination = Pagination;
window.Input = Input;
window.Select = Select;
window.Tabs = Tabs;
window.StatTile = StatTile;
