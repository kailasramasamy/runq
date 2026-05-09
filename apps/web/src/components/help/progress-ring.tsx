interface Props {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
  toneClass?: string;
  showLabel?: boolean;
}

export function ProgressRing({
  value,
  total,
  size = 56,
  stroke = 4,
  toneClass = 'stroke-indigo-500',
  showLabel = true,
}: Props) {
  const pct = total > 0 ? value / total : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="fill-none stroke-current text-zinc-200 dark:text-zinc-800"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className={`fill-none ${toneClass}`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {showLabel && (
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-current text-[12px] font-semibold text-zinc-900 dark:text-zinc-100"
        >
          {`${Math.round(pct * 100)}%`}
        </text>
      )}
    </svg>
  );
}
