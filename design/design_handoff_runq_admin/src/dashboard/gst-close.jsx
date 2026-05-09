// GST readiness with score ring + signals
function GstReadiness() {
  const g = RUNQ.GST;
  const r = 32;
  const c = 2 * Math.PI * r;
  const dash = (g.score / 100) * c;
  const color = g.score >= 90 ? "var(--pos)" : g.score >= 70 ? "var(--warn)" : "var(--neg)";

  return (
    <Card>
      <CardTitle
        icon="shield-check"
        title="GST readiness"
        sub={`${g.period} · runQ has prepared most of it`}
        action={<button className="text-[11px] accent-text hover:underline flex items-center gap-1"><Icon name="arrow-up-right" size={11} /> Open filing</button>}
      />
      <div className="flex items-center gap-5 mb-5">
        <div className="relative shrink-0">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={r} fill="none" stroke="var(--border-soft)" strokeWidth="6" />
            <circle
              cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
              strokeLinecap="round" strokeDasharray={`${dash} ${c}`}
              transform="rotate(-90 40 40)"
              style={{ transition: "stroke-dasharray 1s ease-out" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="num text-[20px] font-semibold text-1 leading-none">{g.score}</div>
            <div className="text-[9px] text-3 uppercase tracking-wider">ready</div>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-3">
          <div className="rounded-md border border-app surface-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-1">GSTR-1</span>
              <Pill tone="warn">{g.gstr1.days}d left</Pill>
            </div>
            <div className="text-[11px] text-3 mt-0.5">Due {g.gstr1.due} · draft ready</div>
          </div>
          <div className="rounded-md border border-app surface-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-1">GSTR-3B</span>
              <Pill tone="neutral">{g.gstr3b.days}d left</Pill>
            </div>
            <div className="text-[11px] text-3 mt-0.5">Due {g.gstr3b.due} · pending</div>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-3 font-semibold mb-1">Checks</div>
        {g.signals.map((s, i) => (
          <div key={i} className="flex items-start gap-2 text-[12px]">
            <div className={`mt-[2px] h-4 w-4 rounded-full flex items-center justify-center ${s.ok ? "pos-soft-bg pos-text" : "warn-soft-bg warn-text"}`}>
              <Icon name={s.ok ? "check" : "alert-triangle"} size={9} strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <span className={s.ok ? "text-2" : "text-1 font-medium"}>{s.label}</span>
              {s.detail && <span className="text-3 ml-1">— {s.detail}</span>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
window.GstReadiness = GstReadiness;
