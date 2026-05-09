// Tiny primitives: Card, Sparkline, Pill, Avatar

function Card({ className = "", children, padded = true, bodyClassName = "" }) {
  return (
    <div className={`surface border border-app rounded-xl ${className}`}>
      {padded ? <div className={`p-5 ${bodyClassName}`}>{children}</div> : children}
    </div>
  );
}

function CardTitle({ icon, title, sub, action }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-start gap-2.5">
        {icon ? (
          <div className="h-7 w-7 rounded-md surface-2 border border-app flex items-center justify-center text-2 mt-0.5">
            <Icon name={icon} size={14} />
          </div>
        ) : null}
        <div>
          <h3 className="text-[13px] font-semibold text-1 leading-tight">{title}</h3>
          {sub ? <p className="text-[11px] text-3 mt-0.5">{sub}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function Pill({ children, tone = "neutral", className = "" }) {
  const tones = {
    neutral: "surface-2 text-2 border border-app",
    accent: "accent-soft-bg accent-text",
    pos: "pos-soft-bg pos-text",
    neg: "neg-soft-bg neg-text",
    warn: "warn-soft-bg warn-text",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

function Sparkline({ data, tone = "accent", height = 28, width = 120 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => [i * stepX, height - ((v - min) / range) * height]);
  const d = "M " + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ");
  const fillD = d + ` L ${width},${height} L 0,${height} Z`;
  const colorVar =
    tone === "pos" ? "var(--pos)" :
    tone === "neg" ? "var(--neg)" :
    tone === "warn" ? "var(--warn)" :
    tone === "neutral" ? "var(--text-3)" :
    "var(--accent)";
  const fillId = `sf-${tone}-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="spark overflow-visible">
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={colorVar} stopOpacity="0.18" />
          <stop offset="100%" stopColor={colorVar} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#${fillId})`} stroke="none" />
      <path d={d} fill="none" stroke={colorVar} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="2.5" fill={colorVar} />
    </svg>
  );
}

function Avatar({ name, size = 28, src, color }) {
  const initials = (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const bg = color || "linear-gradient(135deg, oklch(0.7 0.16 268), oklch(0.6 0.2 305))";
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38, background: bg, lineHeight: 1 }}
    >
      {src ? <img src={src} alt={name} className="w-full h-full rounded-full" /> : initials}
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd className="num inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded border border-app surface-2 text-[10px] font-medium text-2">
      {children}
    </kbd>
  );
}

function Dot({ tone = "neutral", className = "" }) {
  const colors = { ok: "var(--pos)", warn: "var(--warn)", err: "var(--neg)", info: "var(--accent)", neutral: "var(--text-3)" };
  return <span className={`inline-block rounded-full ${className}`} style={{ width: 6, height: 6, background: colors[tone] || colors.neutral }} />;
}

window.Card = Card;
window.CardTitle = CardTitle;
window.Pill = Pill;
window.Sparkline = Sparkline;
window.Avatar = Avatar;
window.Kbd = Kbd;
window.Dot = Dot;
