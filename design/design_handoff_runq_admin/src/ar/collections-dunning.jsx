// ─── Collections + Dunning pages ─────────────────────────────────────────────
const { useState: useStateColl } = React;

// ─── Collections page ────────────────────────────────────────────────────────
function CollectionsPage() {
  const totalAtRisk = AR.COLLECTIONS.reduce((a, c) => a + c.balanceDue, 0);
  const byStatus = AR.COLLECTIONS.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "AR", href: "#" }, { label: "Collections" }]}
        title="Collections"
        description="Track follow-ups on overdue invoices, assign to teammates, and log outcomes."
        actions={
          <>
            <Button variant="outline" size="sm" icon="filter">Filter</Button>
            <Button variant="outline" size="sm" icon="user-plus">Assign</Button>
            <Button icon="plus">New collection</Button>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatTile label="Total at risk" value={formatINR(totalAtRisk, { short: true })} sub={`${AR.COLLECTIONS.length} cases`} tone="neg" />
        <StatTile label="Open" value={byStatus.open || 0} sub="No contact yet" tone="warn" />
        <StatTile label="Contacted" value={byStatus.contacted || 0} sub="Awaiting response" />
        <StatTile label="Promised" value={byStatus.promised || 0} sub="Payment commitment" tone="pos" />
        <StatTile label="Escalated" value={byStatus.escalated || 0} sub="Manager involved" tone="neg" />
      </div>

      {/* Cases */}
      <div className="space-y-3">
        {AR.COLLECTIONS.map((c) => {
          const inv = AR.INVOICES.find((x) => x.id === c.invoiceId);
          const overdueDays = inv ? daysBetween(inv.dueDate, "2026-05-25") : 0;
          return (
            <div key={c.id} className="surface border border-app rounded-xl p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start gap-4">
                <Avatar name={c.customerName} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-1 text-[14px]">{c.customerName}</span>
                    <span className="text-3 text-[11px]">·</span>
                    <span className="num text-[12px] accent-text font-medium hover:underline cursor-pointer">{c.invoiceNumber}</span>
                    <CollectionStatusBadge status={c.status} />
                    {overdueDays > 0 && (
                      <span className="text-[10.5px] neg-text font-medium num">{overdueDays}d overdue</span>
                    )}
                  </div>
                  <div className="text-[12px] text-2 mt-1.5">
                    {c.notes ? c.notes : <span className="text-3 italic">No notes yet — log first contact attempt to keep the case warm.</span>}
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-[11px] text-3">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="user" size={11} />
                      Assigned to <span className="text-2 font-medium">{c.assigneeName}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="calendar" size={11} />
                      Follow-up <span className="text-2 num">{formatDate(c.followUpDate)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="clock" size={11} />
                      Assigned <span className="text-2 num">{formatDate(c.assignedAt.slice(0, 10))}</span>
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10.5px] text-3 font-medium uppercase tracking-wider">Balance</div>
                  <div className="num text-[18px] font-semibold neg-text tabular-nums">{formatINR(c.balanceDue)}</div>
                  <div className="flex items-center gap-1.5 mt-2 justify-end">
                    <Button size="sm" variant="outline" icon="phone">Log call</Button>
                    <Button size="sm" variant="outline" icon="mail">Email</Button>
                    <Button size="sm" icon="pencil">Update</Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CollectionStatusBadge({ status }) {
  const map = {
    open: { v: "warning", label: "Open" },
    contacted: { v: "info", label: "Contacted" },
    promised: { v: "cyan", label: "Promised" },
    resolved: { v: "success", label: "Resolved" },
    escalated: { v: "danger", label: "Escalated" },
  };
  const cfg = map[status] ?? { v: "default", label: status };
  return <Badge variant={cfg.v}>{cfg.label}</Badge>;
}

// ─── Dunning page ────────────────────────────────────────────────────────────
function DunningPage() {
  const [tab, setTab] = useStateColl("overdue");

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "AR", href: "#" }, { label: "Dunning" }]}
        title="Dunning"
        description="Automated reminders, escalation rules, and a log of every nudge sent."
        actions={
          <>
            <Button variant="outline" size="sm" icon="play">Run dunning now</Button>
            <Button icon="plus">{tab === "rules" ? "New rule" : "Send reminder"}</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile label="Overdue invoices" value={AR.DUNNING_OVERDUE.length} sub={formatINR(AR.DUNNING_OVERDUE.reduce((a,o)=>a+o.balanceDue,0), { short: true })} tone="neg" />
        <StatTile label="Active rules" value={AR.DUNNING_RULES.filter(r => r.isActive).length} sub={`of ${AR.DUNNING_RULES.length} configured`} />
        <StatTile label="Reminders sent (30d)" value={AR.DUNNING_LOG.length} sub={`${AR.DUNNING_LOG.filter(l => l.status === "delivered").length} delivered`} />
        <StatTile label="Failed deliveries" value={AR.DUNNING_LOG.filter(l => l.status === "failed").length} sub="Need review" tone="warn" />
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "overdue", label: "Overdue invoices", count: AR.DUNNING_OVERDUE.length },
          { id: "rules", label: "Rules", count: AR.DUNNING_RULES.length },
          { id: "log", label: "Activity log", count: AR.DUNNING_LOG.length },
        ]}
      />

      {tab === "overdue" && <DunningOverdueTab />}
      {tab === "rules" && <DunningRulesTab />}
      {tab === "log" && <DunningLogTab />}
    </div>
  );
}

function DunningOverdueTab() {
  return (
    <Table>
      <TableHeader>
        <tr>
          <Th>
            <input type="checkbox" className="rounded border-app accent-[var(--accent)]" />
          </Th>
          <Th>Invoice</Th>
          <Th>Customer</Th>
          <Th>Due</Th>
          <Th align="right">Days overdue</Th>
          <Th align="right">Balance</Th>
          <Th>Next rule</Th>
          <Th />
        </tr>
      </TableHeader>
      <TableBody>
        {AR.DUNNING_OVERDUE.map((o) => {
          const nextRule = AR.DUNNING_RULES.filter(r => r.isActive && r.daysAfterDue <= o.daysOverdue).sort((a,b)=>b.daysAfterDue-a.daysAfterDue)[0];
          return (
            <TableRow key={o.id}>
              <TableCell><input type="checkbox" className="rounded border-app" /></TableCell>
              <TableCell><span className="num text-[12px] accent-text font-medium">{o.invoiceNumber}</span></TableCell>
              <TableCell>
                <div className="font-medium text-1">{o.customerName}</div>
                <div className="text-[10.5px] text-3 num">{o.customerEmail}</div>
              </TableCell>
              <TableCell className="num text-2">{formatDate(o.dueDate)}</TableCell>
              <TableCell numeric align="right">
                <span className={`num font-semibold ${o.daysOverdue >= 30 ? "neg-text" : "warn-text"}`}>{o.daysOverdue}d</span>
              </TableCell>
              <TableCell numeric align="right" className="font-semibold">{formatINR(o.balanceDue)}</TableCell>
              <TableCell>
                {nextRule ? (
                  <div className="text-[11.5px] text-2">{nextRule.name}</div>
                ) : (
                  <span className="text-3 text-[11.5px]">—</span>
                )}
              </TableCell>
              <TableCell align="right">
                <Button size="sm" icon="send">Send now</Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function DunningRulesTab() {
  return (
    <div className="space-y-3">
      {AR.DUNNING_RULES.map((r) => (
        <div key={r.id} className="surface border border-app rounded-xl p-4">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}>
              <Icon name={r.channel === "whatsapp" ? "message-circle" : "mail"} size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-1 text-[14px]">{r.name}</span>
                <Badge variant={r.escalationLevel === 3 ? "danger" : r.escalationLevel === 2 ? "warning" : "info"}>
                  Level {r.escalationLevel}
                </Badge>
                <Badge variant="default">{r.channel}</Badge>
                {!r.isActive && <Badge variant="outline">Disabled</Badge>}
              </div>
              <div className="text-[12px] text-2 mt-1.5">
                Triggers <span className="num text-1 font-medium">{r.daysAfterDue}</span> day{r.daysAfterDue > 1 ? "s" : ""} after due date · Action: <span className="text-1">{r.action.replace(/_/g," ")}</span>
              </div>
              <div className="surface-2 border border-app rounded-md px-3 py-2 mt-2.5 text-[11.5px] text-2 font-mono leading-relaxed">
                {r.bodyTemplate}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Toggle on={r.isActive} />
              <Button size="sm" variant="outline" icon="pencil">Edit</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Toggle({ on }) {
  return (
    <button
      className="h-5 w-9 rounded-full p-0.5 transition-colors flex items-center"
      style={{ background: on ? "var(--accent)" : "color-mix(in oklab, var(--ink-1) 12%, transparent)" }}
    >
      <span className="h-4 w-4 rounded-full bg-white shadow-sm transition-transform" style={{ transform: on ? "translateX(16px)" : "translateX(0)" }} />
    </button>
  );
}

function DunningLogTab() {
  return (
    <Table>
      <TableHeader>
        <tr>
          <Th>Sent at</Th>
          <Th>Invoice</Th>
          <Th>Customer</Th>
          <Th>Channel</Th>
          <Th>Recipient</Th>
          <Th>Status</Th>
        </tr>
      </TableHeader>
      <TableBody>
        {AR.DUNNING_LOG.map((l) => (
          <TableRow key={l.id}>
            <TableCell className="num text-2 text-[11.5px]">{l.sentAt.slice(0,10)} <span className="text-3">{l.sentAt.slice(11,16)}</span></TableCell>
            <TableCell><span className="num text-[12px] accent-text font-medium">{l.invoiceNumber}</span></TableCell>
            <TableCell><span className="font-medium text-1">{l.customerName}</span></TableCell>
            <TableCell>
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-2">
                <Icon name={l.channel === "whatsapp" ? "message-circle" : "mail"} size={11} className="text-3" />
                {l.channel}
              </span>
            </TableCell>
            <TableCell className="num text-[11.5px] text-2">{l.customerEmail}</TableCell>
            <TableCell><StatusBadge status={l.status} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

window.CollectionsPage = CollectionsPage;
window.DunningPage = DunningPage;
