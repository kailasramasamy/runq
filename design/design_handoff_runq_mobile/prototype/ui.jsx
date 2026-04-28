// ui.jsx — small primitives shared across screens
// Indian formatting, status badges, currency, sparkline, etc.

window.RunQUI = (() => {
  const C = window.RunQTheme; // injected by app.jsx

  // ── Indian rupee formatter — lakh/crore grouping ─────────────────
  function formatINR(n, opts = {}) {
    const { compact = false, signed = false, currency = true } = opts;
    if (n == null || isNaN(n)) return '—';
    const neg = n < 0;
    const abs = Math.abs(n);
    let body;
    if (compact) {
      if (abs >= 10000000) body = (abs / 10000000).toFixed(2).replace(/\.?0+$/, '') + 'Cr';
      else if (abs >= 100000) body = (abs / 100000).toFixed(2).replace(/\.?0+$/, '') + 'L';
      else if (abs >= 1000) body = (abs / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
      else body = abs.toFixed(0);
    } else {
      // Indian grouping: 12,34,567
      const s = Math.round(abs).toString();
      if (s.length <= 3) body = s;
      else {
        const last3 = s.slice(-3);
        const rest = s.slice(0, -3);
        body = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
      }
    }
    const sign = neg ? '−' : signed ? '+' : '';
    return (currency ? '₹' : '') + sign + body;
  }

  // Relative date label
  function fromNow(iso) {
    const d = new Date(iso);
    const now = new Date('2026-04-28T12:00:00');
    const diff = (now - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function dueLabel(iso) {
    const d = new Date(iso);
    const today = new Date('2026-04-28');
    const ms = d - today;
    const days = Math.round(ms / 86400000);
    if (days === 0) return 'due today';
    if (days < 0) return Math.abs(days) + 'd overdue';
    if (days <= 7) return 'due in ' + days + 'd';
    return 'due ' + d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  // ── Status pill ──────────────────────────────────────────────────
  const STATUS = {
    paid:           { bg: '#E8F6EE', fg: '#11763B', label: 'Paid' },
    sent:           { bg: '#EEF1FE', fg: '#3D44C5', label: 'Sent' },
    partially_paid: { bg: '#FFF6E0', fg: '#8A5A00', label: 'Part-paid' },
    overdue:        { bg: '#FCEAEA', fg: '#B42318', label: 'Overdue' },
    draft:          { bg: '#EEEDEA', fg: '#605A52', label: 'Draft' },
    pending_match:  { bg: '#FFF2E5', fg: '#9A4B00', label: 'Match needed' },
    matched:        { bg: '#EAF1FB', fg: '#1F4DA8', label: '3-way matched' },
    approved:       { bg: '#EEF1FE', fg: '#3D44C5', label: 'Approved' },
  };
  function StatusPill({ status, dense }) {
    const s = STATUS[status] || { bg: '#EEEDEA', fg: '#605A52', label: status };
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center',
        background: s.bg, color: s.fg,
        fontSize: dense ? 10 : 11, fontWeight: 600,
        padding: dense ? '2px 6px' : '3px 8px',
        borderRadius: 6, letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
      }}>{s.label}</span>
    );
  }

  // ── Avatar (mono initials, deterministic color) ──────────────────
  const AV_HUES = [232, 12, 156, 268, 38, 198, 88];
  function Avatar({ short, name, size = 36, square = false }) {
    const seed = (short || name || '?').charCodeAt(0) + (short || name || '?').charCodeAt(1 || 0);
    const h = AV_HUES[seed % AV_HUES.length];
    return (
      <div style={{
        width: size, height: size,
        borderRadius: square ? 8 : '50%',
        background: `oklch(0.94 0.04 ${h})`,
        color: `oklch(0.4 0.13 ${h})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 600, fontSize: size * 0.36,
        flexShrink: 0,
        letterSpacing: '0.01em',
      }}>{(short || name || '?').slice(0, 2).toUpperCase()}</div>
    );
  }

  // ── Sparkline ────────────────────────────────────────────────────
  function Sparkline({ data, w = 220, h = 48, stroke = '#4F46E5', fill = '#EEF1FE' }) {
    if (!data || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const step = w / (data.length - 1);
    const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 4) - 2]);
    const d = 'M ' + pts.map(p => p.join(' ')).join(' L ');
    const dF = d + ` L ${w} ${h} L 0 ${h} Z`;
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
        <path d={dF} fill={fill} />
        <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r={3.5} fill={stroke} />
        <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r={6} fill={stroke} fillOpacity={0.18} />
      </svg>
    );
  }

  // ── Card ─────────────────────────────────────────────────────────
  function Card({ children, style, padded = true, onClick }) {
    return (
      <div onClick={onClick} style={{
        background: '#fff',
        borderRadius: 16,
        padding: padded ? 16 : 0,
        boxShadow: '0 1px 0 rgba(20,18,16,0.04), 0 1px 3px rgba(20,18,16,0.05)',
        border: '0.5px solid rgba(20,18,16,0.08)',
        ...style,
      }}>{children}</div>
    );
  }

  // ── Section header (above list) ─────────────────────────────────
  function SectionHead({ title, action, onAction }) {
    return (
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        padding: '0 4px 10px',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#9C9489' }}>{title}</span>
        {action && (
          <button onClick={onAction} style={{
            background: 'none', border: 0, padding: 0,
            color: '#4F46E5', fontWeight: 500, fontSize: 13, cursor: 'pointer',
          }}>{action}</button>
        )}
      </div>
    );
  }

  // ── AI sparkle icon ──────────────────────────────────────────────
  function Sparkle({ size = 14, color = '#7C3AED' }) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6L8 1z" fill={color}/>
        <path d="M13 11l.6 1.4L15 13l-1.4.6L13 15l-.6-1.4L11 13l1.4-.6L13 11z" fill={color} opacity="0.6"/>
      </svg>
    );
  }

  // ── Lucide-style icons (stroke 1.75) ─────────────────────────────
  const Icon = (paths, vb = 24) => ({ size = 22, color = 'currentColor', strokeWidth = 1.75, fill = 'none', ...rest } = {}) => (
    <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} fill={fill} stroke={color}
         strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {paths}
    </svg>
  );
  const I = {
    home:    Icon(<><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></>),
    receipt: Icon(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h4"/></>),
    bill:    Icon(<><path d="M5 3h11l3 3v15H5z"/><path d="M16 3v3h3"/><path d="M9 12h6M9 16h6"/></>),
    bank:    Icon(<><path d="M3 10l9-6 9 6"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8"/><path d="M3 21h18"/></>),
    inbox:   Icon(<><path d="M3 13l3-9h12l3 9"/><path d="M3 13v6a2 2 0 002 2h14a2 2 0 002-2v-6"/><path d="M3 13h5l1 3h6l1-3h5"/></>),
    sparkle: Icon(<><path d="M12 3l1.8 5L19 10l-5.2 2L12 17l-1.8-5L5 10l5.2-2z"/></>),
    plus:    Icon(<><path d="M12 5v14M5 12h14"/></>),
    camera:  Icon(<><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></>),
    chev:    Icon(<><path d="M9 6l6 6-6 6"/></>),
    chevD:   Icon(<><path d="M6 9l6 6 6-6"/></>),
    bell:    Icon(<><path d="M6 16V11a6 6 0 0112 0v5l1.5 2H4.5z"/><path d="M10 21a2 2 0 004 0"/></>),
    search:  Icon(<><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></>),
    filter:  Icon(<><path d="M3 5h18M6 12h12M10 19h4"/></>),
    check:   Icon(<><path d="M5 12l4 4 10-10"/></>),
    x:       Icon(<><path d="M6 6l12 12M6 18L18 6"/></>),
    arrowUp: Icon(<><path d="M12 19V5M5 12l7-7 7 7"/></>),
    arrowDn: Icon(<><path d="M12 5v14M19 12l-7 7-7-7"/></>),
    arrowR:  Icon(<><path d="M5 12h14M12 5l7 7-7 7"/></>),
    flash:   Icon(<><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></>),
    upload:  Icon(<><path d="M12 17V3M5 10l7-7 7 7"/><path d="M3 21h18"/></>),
    wa:      Icon(<><path d="M21 12a9 9 0 11-3.5-7.1L21 3l-1.9 3.6A9 9 0 0121 12z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5L13 12l-1 1c-1.2-.4-2.1-1.3-2.5-2.5l1-1L9 8.5z" fill="currentColor" stroke="none"/></>),
    user:    Icon(<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></>),
    paper:   Icon(<><path d="M5 5h11l3 3v11H5z"/><path d="M16 5v3h3"/></>),
    list:    Icon(<><path d="M4 6h16M4 12h16M4 18h10"/></>),
    moreH:   Icon(<><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></>),
    activity:Icon(<><path d="M3 12h4l3-8 4 16 3-8h4"/></>),
    refresh: Icon(<><path d="M3 12a9 9 0 0115-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/><path d="M3 21v-5h5"/></>),
    link:    Icon(<><path d="M9 15l6-6"/><path d="M11 6l1.5-1.5a4 4 0 015.5 5.5L16.5 11.5"/><path d="M13 18l-1.5 1.5a4 4 0 01-5.5-5.5L7.5 12.5"/></>),
    send:    Icon(<><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></>),
    eye:     Icon(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>),
  };

  return { formatINR, fromNow, dueLabel, StatusPill, Avatar, Sparkline, Card, SectionHead, Sparkle, I };
})();
