// Reusable building blocks for the simpler product/for/company pages.
// Each consuming page just declares data and ContentPage handles layout.

const { PageNav, PageFooter, usePageReveal, PageHero, FooterCTA } = window.Shell;

// Feature row: alternating side-by-side text + visual block
function FeatureRow({ eyebrow, title, body, bullets, visual, flip, accent = 'brand' }) {
  const accentClass = {
    brand: 'text-brand-600', emerald: 'text-emerald-700', amber: 'text-amber-600',
    violet: 'text-violet-600', blue: 'text-blue-600', rose: 'text-rose-600',
  }[accent] || 'text-brand-600';
  return (
    <div className={`grid grid-cols-12 items-center gap-8 lg:gap-14 ${flip ? 'lg:[direction:rtl]' : ''}`}>
      <div className="reveal col-span-12 lg:col-span-5 lg:[direction:ltr]">
        {eyebrow && <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${accentClass}`}>{eyebrow}</div>}
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 lg:text-3xl" style={{ textWrap: 'balance' }}>{title}</h3>
        {body && <p className="mt-4 text-[15px] leading-relaxed text-zinc-600" style={{ textWrap: 'pretty' }}>{body}</p>}
        {bullets && (
          <ul className="mt-5 space-y-2.5 text-sm text-zinc-700">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"><I.Check size={11} strokeWidth={3} /></span>
                <span style={{ textWrap: 'pretty' }}>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="reveal col-span-12 lg:col-span-7 lg:[direction:ltr]">{visual}</div>
    </div>
  );
}

// A feature pill set
function PillRow({ items }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t, i) => (
        <span key={i} className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700">{t}</span>
      ))}
    </div>
  );
}

// Generic "stats strip" used inside feature pages
function StatsStrip({ items }) {
  return (
    <div className="reveal grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-4">
      {items.map((s, i) => (
        <div key={i} className="bg-white p-6">
          <div className="text-3xl font-semibold tracking-tight text-zinc-900 tabular">{s.v}</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{s.k}</div>
        </div>
      ))}
    </div>
  );
}

// Mini icon callout grid (for feature lists)
function IconGrid({ items, cols = 3, accent = 'brand' }) {
  const accentColor = {
    brand: 'bg-brand-500/10 text-brand-600',
    emerald: 'bg-emerald-500/10 text-emerald-600',
    amber: 'bg-amber-500/10 text-amber-700',
    violet: 'bg-violet-500/10 text-violet-600',
    blue: 'bg-blue-500/10 text-blue-600',
  }[accent] || 'bg-brand-500/10 text-brand-600';
  return (
    <div className={`grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-${cols}`}>
      {items.map(({ Ic, title, body }, i) => (
        <div key={i} className="reveal lift rounded-2xl border border-zinc-200 bg-white p-6">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accentColor}`}><Ic size={16} /></div>
          <div className="mt-4 text-base font-semibold text-zinc-900">{title}</div>
          <div className="mt-1.5 text-sm text-zinc-600" style={{ textWrap: 'pretty' }}>{body}</div>
        </div>
      ))}
    </div>
  );
}

// A simple light "section" wrapper
function Section({ id, children, className = '' }) {
  return (
    <section id={id} className={`mx-auto max-w-[1200px] px-5 py-16 lg:px-8 lg:py-24 ${className}`}>{children}</section>
  );
}
function DarkSection({ children, className = '' }) {
  return (
    <section className={`relative overflow-hidden bg-zinc-950 py-20 text-zinc-100 ${className}`}>
      <div className="absolute inset-0 dot-grid opacity-40" />
      <div className="relative mx-auto max-w-[1200px] px-5 lg:px-8">{children}</div>
    </section>
  );
}
function GreySection({ children, className = '' }) {
  return (
    <section className={`bg-zinc-50 py-16 lg:py-24 ${className}`}>
      <div className="mx-auto max-w-[1200px] px-5 lg:px-8">{children}</div>
    </section>
  );
}

// Section heading
function SectionHead({ eyebrow, title, subtitle, accent = 'brand', center }) {
  const c = { brand: 'text-brand-600', emerald: 'text-emerald-700', amber: 'text-amber-600', violet: 'text-violet-600', blue: 'text-blue-600' }[accent] || 'text-brand-600';
  return (
    <div className={`reveal max-w-2xl ${center ? 'mx-auto text-center' : ''}`}>
      {eyebrow && <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${c}`}>{eyebrow}</div>}
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 lg:text-[40px] lg:leading-[1.1]" style={{ textWrap: 'balance' }}>{title}</h2>
      {subtitle && <p className="mt-3 text-zinc-600" style={{ textWrap: 'pretty' }}>{subtitle}</p>}
    </div>
  );
}

window.Blocks = { FeatureRow, PillRow, StatsStrip, IconGrid, Section, DarkSection, GreySection, SectionHead };
