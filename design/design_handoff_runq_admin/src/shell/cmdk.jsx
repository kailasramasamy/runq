// Command palette (⌘K)
function CommandPalette({ open, onClose }) {
  const [query, setQuery] = React.useState("");
  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  if (!open) return null;

  const groups = [
    {
      label: "Quick actions",
      items: [
        { icon: "plus", label: "New invoice", kbd: ["N", "I"] },
        { icon: "plus", label: "New bill", kbd: ["N", "B"] },
        { icon: "credit-card", label: "Record payment", kbd: ["N", "P"] },
        { icon: "scan-line", label: "Scan a document", kbd: ["S"] },
        { icon: "upload", label: "Import bank statement", kbd: ["I", "B"] },
      ],
    },
    {
      label: "Navigate",
      items: [
        { icon: "layout-dashboard", label: "Dashboard", kbd: ["G", "D"] },
        { icon: "file-text", label: "Invoices", kbd: ["G", "I"] },
        { icon: "file-input", label: "Bills", kbd: ["G", "B"] },
        { icon: "landmark", label: "Banking", kbd: ["G", "K"] },
        { icon: "shield-check", label: "GST filing", kbd: ["G", "T"] },
      ],
    },
    {
      label: "Ask runQ",
      items: [
        { icon: "sparkles", label: "How much cash do I have right now?", agent: true },
        { icon: "sparkles", label: "Show overdue invoices over 30 days", agent: true },
        { icon: "sparkles", label: "Draft GSTR-1 for last month", agent: true },
      ],
    },
  ];

  const filtered = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase())),
    }))
    .filter((g) => g.items.length);

  return (
    <div className="fixed inset-0 z-50 cmdk-backdrop flex items-start justify-center pt-[12vh]" onClick={onClose}>
      <div className="surface border border-app rounded-xl w-[640px] max-w-[92vw] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 h-12 border-b border-soft">
          <Icon name="search" size={15} className="text-3" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, search anywhere, or ask runQ…"
            className="flex-1 bg-transparent text-[13px] text-1 placeholder:text-3 outline-none"
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="max-h-[420px] overflow-y-auto scrollbar-thin py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12px] text-3">No matches. Try "ask runQ to draft GSTR-1"…</div>
          ) : (
            filtered.map((g) => (
              <div key={g.label} className="py-1">
                <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-3">{g.label}</div>
                {g.items.map((it, i) => (
                  <button key={i} className="w-full flex items-center gap-3 px-4 py-2 text-[12.5px] text-2 hover:text-1 hover:surface-2 group">
                    <div className={`h-6 w-6 rounded flex items-center justify-center ${it.agent ? "accent-soft-bg accent-text" : "surface-2 border border-app text-2"}`}>
                      <Icon name={it.icon} size={12} />
                    </div>
                    <span className="flex-1 text-left">{it.label}</span>
                    {it.kbd && (
                      <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        {it.kbd.map((k, j) => <Kbd key={j}>{k}</Kbd>)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
        <div className="border-t border-soft px-4 h-9 flex items-center justify-between text-[10px] text-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
            <span className="flex items-center gap-1"><Kbd>tab</Kbd> ask runQ</span>
          </div>
          <span className="flex items-center gap-1.5">
            <Icon name="sparkles" size={10} className="accent-text" />
            powered by runQ Agent
          </span>
        </div>
      </div>
    </div>
  );
}

window.CommandPalette = CommandPalette;
