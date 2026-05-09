// Agent activity feed — shows what runQ AI did
function AgentFeedItem({ item }) {
  const sev = item.severity === "warn" ? "warn" : item.severity === "ok" ? "pos" : "info";
  const dotTone = sev === "warn" ? "warn" : sev === "pos" ? "ok" : "info";
  return (
    <div className="flex gap-3 py-3 group">
      <div className="relative flex flex-col items-center">
        <div className="h-7 w-7 rounded-md surface-2 border border-app flex items-center justify-center text-2 group-hover:accent-text transition-colors">
          <Icon name={item.icon} size={13} />
        </div>
        <div className="flex-1 w-px bg-[var(--border-soft)] mt-1" />
      </div>
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[12.5px] font-medium text-1 leading-snug">{item.title}</div>
          <span className="text-[10px] text-3 shrink-0">{item.when}</span>
        </div>
        <div className="text-[11.5px] text-2 mt-0.5">{item.detail}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <Dot tone={dotTone} />
          <button className="text-[11px] accent-text hover:underline font-medium">{item.cta} →</button>
        </div>
      </div>
    </div>
  );
}

function AgentFeed() {
  return (
    <Card className="h-full" bodyClassName="h-full flex flex-col">
      <CardTitle
        icon="sparkles"
        title="Agent activity"
        sub="What runQ did for you, automatically"
        action={
          <button className="text-[11px] accent-text hover:underline flex items-center gap-1">
            <Icon name="settings-2" size={11} /> Configure
          </button>
        }
      />
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin -mr-2 pr-2">
        <div className="divide-y divide-[var(--border-soft)]">
          {RUNQ.AGENT_FEED.map((it) => <AgentFeedItem key={it.id} item={it} />)}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-soft text-center shrink-0">
        <button className="text-[11px] accent-text hover:underline">View full activity log</button>
      </div>
    </Card>
  );
}
window.AgentFeed = AgentFeed;
