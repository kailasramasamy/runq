// Quick actions + Approvals queue + Inbox
function QuickActions() {
  const actions = [
    { icon: "file-plus-2", label: "New invoice", hint: "Sales", tone: "accent" },
    { icon: "file-input", label: "New bill", hint: "Purchase", tone: "neutral" },
    { icon: "banknote", label: "Record payment", hint: "Banking", tone: "neutral" },
    { icon: "scan-line", label: "Scan receipt", hint: "OCR", tone: "neutral" },
    { icon: "upload-cloud", label: "Import statement", hint: "Bank", tone: "neutral" },
    { icon: "send-horizontal", label: "Send reminders", hint: "Collections", tone: "neutral" },
  ];
  return (
    <Card>
      <CardTitle icon="zap" title="Quick actions" sub="Common tasks · ⌘K to search" />
      <div className="grid grid-cols-2 gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-app surface-2 hover:surface text-left group transition-colors min-w-0"
          >
            <div className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 ${a.tone === "accent" ? "accent-bg text-white" : "surface border border-app text-1 group-hover:accent-text group-hover:border-[color:var(--accent)]"}`}>
              <Icon name={a.icon} size={16} strokeWidth={1.9} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-1 leading-tight">{a.label}</div>
              <div className="text-[10.5px] text-3 leading-tight mt-0.5">{a.hint}</div>
            </div>
            <Icon name="arrow-up-right" size={12} className="text-3 opacity-0 group-hover:opacity-100 shrink-0" />
          </button>
        ))}
      </div>
    </Card>
  );
}

function Approvals() {
  return (
    <Card>
      <CardTitle
        icon="check-check"
        title="Awaiting your approval"
        sub={`${RUNQ.APPROVALS.length} items · ${formatINR(RUNQ.APPROVALS.reduce((s, a) => s + a.amount, 0), { short: true })} total`}
        action={<button className="text-[11px] accent-text hover:underline">View queue →</button>}
      />
      <div className="divide-y divide-[var(--border-soft)] -mt-1">
        {RUNQ.APPROVALS.map((a) => (
          <div key={a.id} className="py-2.5 flex items-center gap-3">
            <div className={`h-8 w-8 rounded-md flex items-center justify-center ${a.type === "bill" ? "neg-soft-bg neg-text" : "accent-soft-bg accent-text"}`}>
              <Icon name={a.type === "bill" ? "file-input" : "credit-card"} size={13} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-medium text-1 truncate">{a.who}</div>
              <div className="text-[11px] text-3"><span className="num">{a.id}</span> · waiting {a.age}</div>
            </div>
            <div className="num text-[13px] font-semibold text-1">{formatINR(a.amount, { short: true })}</div>
            <div className="flex gap-1">
              <button className="h-7 px-2 text-[11px] font-medium rounded-md border border-app surface-2 hover:surface text-2">Skip</button>
              <button className="h-7 px-2.5 text-[11px] font-medium rounded-md accent-bg text-white hover:opacity-90">Approve</button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

window.QuickActions = QuickActions;
window.Approvals = Approvals;
