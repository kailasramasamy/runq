// Hero — greeting + AI agent activity summary + cash banner
function DashboardHero() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="relative overflow-hidden rounded-2xl border border-app surface">
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-30" style={{ background: "radial-gradient(circle, var(--accent-soft) 0%, transparent 60%)" }} />
      <div className="relative p-6 lg:p-7 flex flex-col lg:flex-row lg:items-center gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-3 mb-2">
            <Dot tone="ok" className="pulse-soft" />
            <span>All systems healthy · {dateStr}</span>
          </div>
          <h1 className="text-[26px] font-semibold text-1 tracking-tight">
            {greeting}, {RUNQ.COMPANY.greetingFirstName}.
          </h1>
          <p className="text-[14px] text-2 mt-1.5 max-w-xl leading-relaxed">
            runQ Agent reconciled <span className="text-1 font-medium">142 transactions</span>,
            drafted <span className="text-1 font-medium">GSTR-1</span>, and flagged{" "}
            <span className="text-1 font-medium">3 items</span> for your review since last night.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button className="flex items-center gap-2 h-9 px-3.5 rounded-md accent-bg text-white text-[13px] font-medium hover:opacity-90 whitespace-nowrap">
              <Icon name="sparkles" size={14} /> <span className="whitespace-nowrap">Open agent</span>
            </button>
            <button className="flex items-center gap-2 h-9 px-3.5 rounded-md border border-app surface-2 text-[13px] font-medium text-1 hover:surface whitespace-nowrap">
              <Icon name="check-check" size={14} /> <span className="whitespace-nowrap">Review 3 items</span>
            </button>
            <button className="flex items-center gap-2 h-9 px-3 rounded-md text-[13px] text-2 hover:text-1 hover:surface-2 whitespace-nowrap">
              <Icon name="play" size={12} /> <span className="whitespace-nowrap">Watch yesterday's run</span>
            </button>
          </div>
        </div>

        <div className="lg:w-[340px] shrink-0">
          <div className="rounded-xl border border-app surface-2 p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-medium uppercase tracking-wider text-3">Total cash</div>
              <Pill tone="pos">+6.2% MoM</Pill>
            </div>
            <div className="num text-[28px] font-semibold text-1 leading-tight">{formatINR(4286400)}</div>
            <div className="text-[11px] text-3 mt-0.5">across {RUNQ.BANKS.length} accounts</div>
            <div className="mt-3 space-y-1.5">
              {RUNQ.BANKS.map((b) => {
                const pct = (b.balance / 4286400) * 100;
                return (
                  <div key={b.name} className="flex items-center gap-2 text-[11px]">
                    <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: b.color }} />
                    <span className="text-2 flex-1 truncate">{b.name} · ····{b.last}</span>
                    <span className="num text-1 whitespace-nowrap">{formatINR(b.balance, { short: true })}</span>
                    <span className="num text-3 w-9 text-right whitespace-nowrap">{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
window.DashboardHero = DashboardHero;
