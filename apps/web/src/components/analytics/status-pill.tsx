export function StatusPill({ tone, children }: { tone: 'ok' | 'warn' | 'neg' | 'muted'; children: React.ReactNode }) {
  const palette = {
    ok:    { color: 'var(--pos)',  bg: 'var(--pos-soft)'  },
    warn:  { color: 'var(--warn)', bg: 'var(--warn-soft)' },
    neg:   { color: 'var(--neg)',  bg: 'var(--neg-soft)'  },
    muted: { color: 'var(--text-3)', bg: 'var(--surface-2)' },
  }[tone];

  return (
    <span
      className="inline-flex items-center whitespace-nowrap"
      style={{
        fontSize: 11,
        fontWeight: 600,
        gap: 4,
        padding: '2px 8px',
        borderRadius: 99,
        color: palette.color,
        background: palette.bg,
      }}
    >
      <span className="inline-block" style={{ width: 5, height: 5, borderRadius: 99, background: palette.color }} />
      {children}
    </span>
  );
}
