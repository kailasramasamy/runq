import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';

export interface DateRange {
  /** ISO yyyy-MM-dd, inclusive. Empty string = unbounded. */
  from: string;
  /** ISO yyyy-MM-dd, inclusive. Empty string = unbounded. */
  to: string;
}

const EMPTY: DateRange = { from: '', to: '' };

interface Preset {
  key: string;
  label: string;
  /** Returns the absolute range for the preset relative to today. */
  range: () => DateRange;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Indian financial year starts Apr 1 → Mar 31 of the following year. */
function fyStart(d: Date): Date {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(y, 3, 1);
}

const PRESETS: Preset[] = [
  { key: 'all', label: 'All time', range: () => EMPTY },
  {
    key: 'today',
    label: 'Today',
    range: () => {
      const t = new Date();
      const s = iso(t);
      return { from: s, to: s };
    },
  },
  {
    key: 'yesterday',
    label: 'Yesterday',
    range: () => {
      const t = new Date();
      t.setDate(t.getDate() - 1);
      const s = iso(t);
      return { from: s, to: s };
    },
  },
  {
    key: 'this_week',
    label: 'This week',
    range: () => {
      const t = new Date();
      const dow = t.getDay(); // 0 Sun..6 Sat
      const monOffset = (dow + 6) % 7; // 0 Mon..6 Sun
      const start = new Date(t);
      start.setDate(t.getDate() - monOffset);
      return { from: iso(start), to: iso(t) };
    },
  },
  {
    key: 'last_7',
    label: 'Last 7 days',
    range: () => {
      const t = new Date();
      const start = new Date(t);
      start.setDate(t.getDate() - 6);
      return { from: iso(start), to: iso(t) };
    },
  },
  {
    key: 'this_month',
    label: 'This month',
    range: () => {
      const t = new Date();
      const start = new Date(t.getFullYear(), t.getMonth(), 1);
      return { from: iso(start), to: iso(t) };
    },
  },
  {
    key: 'last_30',
    label: 'Last 30 days',
    range: () => {
      const t = new Date();
      const start = new Date(t);
      start.setDate(t.getDate() - 29);
      return { from: iso(start), to: iso(t) };
    },
  },
  {
    key: 'this_quarter',
    label: 'This quarter',
    range: () => {
      const t = new Date();
      const qStart = new Date(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1);
      return { from: iso(qStart), to: iso(t) };
    },
  },
  {
    key: 'this_fy',
    label: 'This financial year',
    range: () => ({ from: iso(fyStart(new Date())), to: iso(new Date()) }),
  },
];

function activeLabel(value: DateRange): string {
  if (!value.from && !value.to) return 'All time';
  for (const p of PRESETS) {
    if (p.key === 'all') continue;
    const r = p.range();
    if (r.from === value.from && r.to === value.to) return p.label;
  }
  // Custom range — show "from – to" or "from →" / "→ to"
  const fmt = (s: string) => {
    if (!s) return '';
    const [, mo, da] = s.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${parseInt(da, 10)} ${months[parseInt(mo, 10) - 1]}`;
  };
  if (value.from && value.to) return `${fmt(value.from)} – ${fmt(value.to)}`;
  if (value.from) return `From ${fmt(value.from)}`;
  return `Until ${fmt(value.to)}`;
}

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  const [showCustom, setShowCustom] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Reset draft when the value changes externally (e.g. URL nav).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setShowCustom(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isActive = !!(value.from || value.to);
  const label = activeLabel(value);

  function pickPreset(p: Preset) {
    onChange(p.range());
    setOpen(false);
    setShowCustom(false);
  }

  function applyCustom() {
    onChange({ from: draft.from, to: draft.to });
    setOpen(false);
    setShowCustom(false);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-[5px] text-[12.5px] font-medium transition-colors hover:bg-[color:var(--surface-2)]"
        style={{
          background: 'var(--surface)',
          borderColor: isActive ? 'var(--accent)' : 'var(--border)',
          color: isActive ? 'var(--accent-text)' : 'var(--text-1)',
        }}
      >
        <Calendar size={13} />
        {label}
        {isActive ? (
          <span
            role="button"
            aria-label="Clear date filter"
            onClick={(e) => {
              e.stopPropagation();
              onChange(EMPTY);
              setOpen(false);
              setShowCustom(false);
            }}
            className="ml-0.5 rounded p-0.5 hover:bg-[color:var(--surface-2)]"
          >
            <X size={11} />
          </span>
        ) : (
          <ChevronDown size={12} />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1.5 w-[260px] animate-scale-in overflow-hidden rounded-lg border"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            boxShadow: '0 10px 40px -10px rgba(0,0,0,0.25)',
          }}
        >
          {/* One preset per row with a clear hairline divider between
              items. Single-column reads more like a menu (the user knows
              exactly which row they're tapping) and gives every option an
              unambiguous separator. */}
          <div>
            {PRESETS.map((p, i) => {
              const r = p.range();
              const active = !showCustom && r.from === value.from && r.to === value.to;
              return (
                <button
                  key={p.key}
                  type="button"
                  role="menuitem"
                  onClick={() => pickPreset(p)}
                  className="block w-full px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-[color:var(--surface-2)]"
                  style={{
                    background: active ? 'var(--accent-soft)' : 'var(--surface)',
                    color: active ? 'var(--accent-text)' : 'var(--text-1)',
                    fontWeight: active ? 600 : 500,
                    borderBottom: i < PRESETS.length - 1 ? '1px solid var(--border-soft)' : 'none',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            className="flex w-full items-center justify-between border-t px-3 py-2 text-[12.5px] font-medium transition-colors hover:bg-[color:var(--surface-2)]"
            style={{
              borderColor: 'var(--border-soft)',
              color: showCustom ? 'var(--accent-text)' : 'var(--text-2)',
            }}
          >
            Custom range
            <ChevronDown
              size={12}
              style={{ transform: showCustom ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.12s' }}
            />
          </button>

          {showCustom && (
            <div className="space-y-2 border-t px-3 py-3"
              style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-2)' }}>
              <div className="flex items-center gap-2">
                <label className="w-10 text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>From</label>
                <input
                  type="date"
                  value={draft.from}
                  onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                  className="flex-1 rounded border px-2 py-1 text-[12.5px]"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-10 text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>To</label>
                <input
                  type="date"
                  value={draft.to}
                  onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                  className="flex-1 rounded border px-2 py-1 text-[12.5px]"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(EMPTY);
                    onChange(EMPTY);
                    setOpen(false);
                    setShowCustom(false);
                  }}
                  className="rounded px-2 py-1 text-[12px] font-medium hover:bg-[color:var(--surface)]"
                  style={{ color: 'var(--text-3)' }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={applyCustom}
                  disabled={!draft.from && !draft.to}
                  className="rounded px-3 py-1 text-[12px] font-semibold disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
