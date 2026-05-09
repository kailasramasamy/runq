// Bottom row — close checklist + recent docs
function CloseChecklist() {
  const items = [
    { label: "Reconcile all bank accounts", done: true, sub: "4/4 · auto-matched" },
    { label: "Review flagged transactions", done: false, sub: "3 pending" },
    { label: "Approve outstanding bills", done: false, sub: `${RUNQ.APPROVALS.length} pending` },
    { label: "Run depreciation", done: true, sub: "Posted Jun 30" },
    { label: "Generate GSTR-1 draft", done: true, sub: "146 invoices" },
    { label: "Lock period & file", done: false, sub: "Due Jul 11" },
  ];
  const doneN = items.filter((i) => i.done).length;
  const pct = Math.round((doneN / items.length) * 100);
  return (
    <Card>
      <CardTitle
        icon="list-checks"
        title="Period close checklist"
        sub={`${doneN}/${items.length} complete · ${pct}%`}
        action={<button className="text-[11px] accent-text hover:underline">Customize →</button>}
      />
      <div className="h-1.5 rounded-full surface-2 overflow-hidden mb-4">
        <div className="h-full accent-bg rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-1">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-2.5 py-1.5">
            <div className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${it.done ? "pos-soft-bg" : "surface-2 border-app"}`} style={it.done ? { borderColor: "var(--pos)" } : {}}>
              {it.done && <Icon name="check" size={10} strokeWidth={3} className="pos-text" />}
            </div>
            <span className={`text-[12.5px] flex-1 ${it.done ? "text-3 line-through" : "text-1"}`}>{it.label}</span>
            <span className="text-[10.5px] text-3">{it.sub}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RecentDocs() {
  const docs = [
    { who: "Reliance Industries", what: "Bill #BILL-2412", amt: 184250, when: "5m ago", icon: "file-input", tone: "neg" },
    { who: "Sharma Steel", what: "Receipt — INV-2104", amt: 84200, when: "1h ago", icon: "receipt", tone: "pos" },
    { who: "Tata Consultancy", what: "Invoice #INV-2118", amt: 184000, when: "2h ago", icon: "file-text", tone: "accent" },
    { who: "DHL Express", what: "Bill #BILL-2419", amt: 18620, when: "Today, 9:18", icon: "file-input", tone: "neg" },
    { who: "HDFC Bank", what: "Statement imported", amt: null, when: "Today, 8:45", icon: "landmark", tone: "neutral" },
  ];
  const toneClass = {
    neg: "neg-soft-bg neg-text",
    pos: "pos-soft-bg pos-text",
    accent: "accent-soft-bg accent-text",
    neutral: "surface-2 text-2 border border-app",
  };
  return (
    <Card>
      <CardTitle
        icon="clock"
        title="Recent activity"
        action={<button className="text-[11px] accent-text hover:underline">View all →</button>}
      />
      <div className="divide-y divide-[var(--border-soft)] -mt-1">
        {docs.map((d, i) => (
          <div key={i} className="py-2.5 flex items-center gap-2.5">
            <div className={`h-7 w-7 rounded-md flex items-center justify-center ${toneClass[d.tone]}`}>
              <Icon name={d.icon} size={12} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-1 truncate">{d.who}</div>
              <div className="text-[10.5px] text-3 truncate">{d.what} · {d.when}</div>
            </div>
            {d.amt != null && <div className="num text-[12px] font-medium text-1">{formatINR(d.amt, { short: true })}</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}

window.CloseChecklist = CloseChecklist;
window.RecentDocs = RecentDocs;
