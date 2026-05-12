export function SectionLabel({ id, title, sub }: { id?: string; title: string; sub?: string }) {
  return (
    <div id={id} className="mb-3.5 flex items-center gap-3" style={{ scrollMarginTop: 100 }}>
      <span
        className="font-bold uppercase whitespace-nowrap"
        style={{ fontSize: 10.5, letterSpacing: '0.09em', color: 'var(--text-3)' }}
      >
        {title}
      </span>
      {sub && (
        <span className="whitespace-nowrap" style={{ fontSize: 11, color: 'var(--text-3)', opacity: 0.75 }}>
          · {sub}
        </span>
      )}
      <div className="h-px flex-1" style={{ background: 'var(--border-soft)' }} />
    </div>
  );
}
