// AR/AP aging side-by-side
function AgingBlock({ data, label, tone, icon }) {
  const total = data.reduce((s, b) => s + b.amount, 0);
  const max = Math.max(...data.map((b) => b.amount));
  const colorMap = {
    ar: ["var(--pos)", "oklch(0.75 0.15 110)", "var(--warn)", "oklch(0.65 0.18 45)", "var(--neg)"],
    ap: ["var(--accent)", "oklch(0.7 0.15 250)", "var(--warn)", "oklch(0.65 0.18 45)", "var(--neg)"],
  };
  const colors = colorMap[tone] || colorMap.ar;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon name={icon} size={13} className="text-2" />
          <span className="text-[12px] font-semibold text-1">{label}</span>
        </div>
        <span className="num text-[12px] text-2">{formatINR(total, { short: true })}</span>
      </div>
      <div className="space-y-2">
        {data.map((b, i) => {
          const pct = (b.amount / max) * 100;
          return (
            <div key={b.label}>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-2">{b.label}</span>
                <span className="text-3">
                  <span className="num text-2">{formatINR(b.amount, { short: true })}</span>
                  <span className="ml-1.5 text-3">· {b.count}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full surface-2 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colors[i] }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgingPanel() {
  return (
    <Card>
      <CardTitle
        icon="bar-chart-3"
        title="Aging"
        sub="Receivables and payables by bucket"
        action={
          <div className="flex items-center gap-1 text-[11px]">
            <button className="px-1.5 py-0.5 rounded text-2 hover:surface-2">By customer</button>
            <button className="px-1.5 py-0.5 rounded accent-soft-bg accent-text">By bucket</button>
          </div>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AgingBlock data={RUNQ.AGING_AR} label="Receivables (you're owed)" tone="ar" icon="trending-up" />
        <AgingBlock data={RUNQ.AGING_AP} label="Payables (you owe)" tone="ap" icon="trending-down" />
      </div>
    </Card>
  );
}
window.AgingPanel = AgingPanel;
