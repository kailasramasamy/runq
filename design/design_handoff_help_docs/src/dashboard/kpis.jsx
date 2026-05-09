// KPI strip with sparklines
function KpiCard({ k }) {
  const tone = k.accent === "pos" ? "pos" : k.accent === "neg" ? "neg" : k.accent === "warn" ? "warn" : "neutral";
  const deltaClass = k.delta >= 0 ? "pos-text" : "neg-text";
  return (
    <div className="surface border border-app rounded-xl p-4 relative overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-[11px] font-medium uppercase tracking-wider text-3">{k.label}</div>
        <div className={`flex items-center gap-0.5 text-[11px] font-medium ${deltaClass}`}>
          <Icon name={k.delta >= 0 ? "trending-up" : "trending-down"} size={11} />
          {Math.abs(k.delta).toFixed(1)}%
        </div>
      </div>
      <div className="num text-[22px] font-semibold text-1 leading-tight">
        {formatINR(k.value, { short: true })}
      </div>
      <div className="text-[11px] text-3 mt-0.5 truncate">{k.sub}</div>
      <div className="mt-2">
        <Sparkline data={k.spark} tone={tone} height={28} width={180} />
      </div>
    </div>
  );
}

function KpiStrip() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {RUNQ.KPIS.map((k) => <KpiCard key={k.key} k={k} />)}
    </div>
  );
}
window.KpiStrip = KpiStrip;
