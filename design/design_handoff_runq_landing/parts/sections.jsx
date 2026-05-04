// Marketing sections — Hero, Pillars, Showcase, Mobile, AI, CAs, Compare, CTA, Footer.
const { I } = window;
const { DashboardMockup, InvoiceMockup, BankReconMockup, GSTR2BMockup, AIAssistantMockup, WindowChrome, inr } = window.Mockups;
const { useState, useEffect, useRef } = React;

// ─── Reveal-on-scroll hook ─────────────────────────────────────────────
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// ─── Nav ───────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const links = ['Features', 'Mobile', 'For CAs', 'Pricing', 'About'];
  return (
    <nav className={`sticky top-0 z-40 transition-all ${scrolled ? 'nav-blur bg-white/75 border-b border-zinc-200/70' : 'bg-transparent border-b border-transparent'}`}>
      <div className="mx-auto flex h-14 max-w-[1200px] items-center px-5 lg:px-8">
        <a href="#" className="flex items-center gap-2">
          <img src="assets/runq-dark.png" alt="runQ" className="h-6" />
          <span className="rounded border border-brand-500/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-600">Finance</span>
        </a>
        <div className="ml-10 hidden items-center gap-7 lg:flex">
          {links.map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/ /g,'-')}`} className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors">{l}</a>
          ))}
        </div>
        <div className="ml-auto hidden items-center gap-3 lg:flex">
          <a href="#" className="text-sm text-zinc-600 hover:text-zinc-900">Sign in</a>
          <a href="#" className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors">
            Get started free <I.Arrow size={14} />
          </a>
        </div>
        <button className="ml-auto lg:hidden" onClick={() => setOpen(!open)}>
          {open ? <I.X /> : <I.Menu />}
        </button>
      </div>
      {open && (
        <div className="border-t border-zinc-200 bg-white px-5 py-4 lg:hidden">
          {links.map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/ /g,'-')}`} className="block py-2 text-sm">{l}</a>
          ))}
          <a href="#" className="mt-2 block rounded-md bg-zinc-900 px-3 py-2 text-center text-sm font-medium text-white">Get started free</a>
        </div>
      )}
    </nav>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="aurora" />
      <div className="absolute inset-0 line-grid-light opacity-60" style={{ maskImage: 'radial-gradient(ellipse at 50% 30%, black 0%, transparent 70%)', WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%, black 0%, transparent 70%)' }} />
      <div className="relative mx-auto max-w-[1200px] px-5 pb-10 pt-16 lg:px-8 lg:pb-16 lg:pt-24">
        {/* Eyebrow */}
        <div className="reveal flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-xs text-zinc-700 shadow-sm backdrop-blur">
            <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-dot text-emerald-500" />
            Now in early access — free forever plan
            <span className="text-zinc-300">·</span>
            <span className="text-zinc-500">No credit card</span>
          </div>
        </div>

        {/* Headline */}
        <h1 className="reveal mx-auto mt-6 max-w-4xl text-center text-[clamp(2.4rem,6.4vw,5.2rem)] leading-[1] tracking-tight text-zinc-900" style={{ textWrap: 'balance' }}>
          <span className="font-semibold">Modern books for</span><br />
          <span className="font-display italic grad-text">modern Indian businesses.</span>
        </h1>

        {/* Subhead */}
        <p className="reveal mx-auto mt-6 max-w-2xl text-center text-base text-zinc-600 lg:text-lg" style={{ textWrap: 'pretty' }}>
          GST invoicing, bank reconciliation, AI bill capture — all in one mobile-first platform that owners actually open and CAs love at month-end.
        </p>

        {/* CTAs */}
        <div className="reveal mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href="#" className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-zinc-900/20 hover:bg-zinc-800 transition-colors">
            Get started free <I.Arrow size={15} />
          </a>
          <a href="#showcase" className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white/80 px-5 py-3 text-sm font-medium text-zinc-800 backdrop-blur hover:bg-white transition-colors">
            <I.Play size={11} /> See how it works
          </a>
        </div>

        {/* Trust strip */}
        <div className="reveal mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
          {[
            ['GST-ready', I.ShieldCheck],
            ['100% mobile', I.Mobile],
            ['AI-first', I.Sparkle],
            ['CA-friendly', I.Users],
          ].map(([label, Ic]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <Ic size={13} className="text-brand-500" />
              {label}
            </span>
          ))}
        </div>

        {/* Dashboard mockup */}
        <div className="reveal relative mt-14">
          {/* Glow */}
          <div className="absolute inset-x-0 -top-12 -bottom-20 -z-10 mx-auto" style={{
            background: 'radial-gradient(60% 50% at 50% 50%, oklch(0.78 0.18 264 / .35), transparent 70%)',
            filter: 'blur(40px)',
          }} />
          <div className="mx-auto max-w-[1080px]">
            <div className="mockup-shadow rounded-2xl border border-zinc-200/80 bg-zinc-950 p-1.5 ring-1 ring-zinc-200/60">
              <WindowChrome url="app.runq.in/dashboard" height={600}>
                <DashboardMockup />
              </WindowChrome>
            </div>
          </div>
        </div>
      </div>

      {/* Logo strip */}
      <div className="relative border-y border-zinc-200/60 bg-white/40 py-6 backdrop-blur-sm">
        <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-y-3 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            <span>Built for Indian SMEs from</span>
            {['Bengaluru', 'Mumbai', 'Delhi NCR', 'Chennai', 'Pune', 'Ahmedabad', 'Hyderabad'].map(c => (
              <span key={c} className="font-mono text-zinc-500">{c}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Pillars (bento) ───────────────────────────────────────────────────
function Pillars() {
  return (
    <section id="features" className="relative bg-white py-24">
      <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="reveal mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Why runQ</div>
          <h2 className="mt-3 text-4xl tracking-tight text-zinc-900 lg:text-5xl">
            Four things we got <span className="font-display italic grad-text">obsessively</span> right.
          </h2>
          <p className="mt-4 text-zinc-600">Not a list of every feature — the four bets that define why we exist.</p>
        </div>

        {/* Bento: 7-5 / 5-7 */}
        <div className="reveal mt-14 grid grid-cols-12 gap-4">
          {/* 1. Owner-friendly (7) */}
          <div className="col-span-12 lg:col-span-7 lift overflow-hidden rounded-2xl border border-zinc-200 bg-white p-7">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-blue-600">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Owner-friendly
            </div>
            <h3 className="mt-3 text-2xl tracking-tight text-zinc-900">
              Your books in <span className="font-display italic">plain English</span>. Decisions in two taps.
            </h3>
            <p className="mt-2 max-w-md text-sm text-zinc-600">No double-entry jargon. No cryptic ledger codes. Just cash-in, cash-out, and what to do next.</p>

            {/* Mini cash card */}
            <div className="mt-6 rounded-xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-zinc-500">Cash in hand · today</div>
                <div className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">+12.4%</div>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight tabular text-zinc-900">₹84,62,418</span>
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs">
                <span className="flex-1 rounded-md bg-emerald-50 px-2 py-1.5 text-center text-emerald-700">
                  <span className="block font-mono text-[10px] uppercase tracking-wider opacity-70">Coming in</span>
                  <span className="font-semibold tabular">₹2.34 Cr</span>
                </span>
                <span className="flex-1 rounded-md bg-rose-50 px-2 py-1.5 text-center text-rose-700">
                  <span className="block font-mono text-[10px] uppercase tracking-wider opacity-70">Going out</span>
                  <span className="font-semibold tabular">₹62.8 L</span>
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-800">
                <I.Sparkle size={12} className="shrink-0 text-brand-600" />
                <span><span className="font-semibold">Healthy.</span> You can clear the ₹38L vendor run on Friday and still hold 6 weeks of runway.</span>
              </div>
            </div>
          </div>

          {/* 2. CA-friendly (5) */}
          <div className="col-span-12 lg:col-span-5 lift overflow-hidden rounded-2xl border border-zinc-200 bg-white p-7">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> CA-friendly
            </div>
            <h3 className="mt-3 text-2xl tracking-tight text-zinc-900">
              <span className="font-display italic">Loved</span> at month-end.
            </h3>
            <p className="mt-2 text-sm text-zinc-600">Multi-client switcher, GSTR exports, audit trails, Tally handoff. The CA portal is read-only and built with practising CAs.</p>

            {/* Multi-client switcher dropdown */}
            <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-[10px] font-semibold text-emerald-700">BP</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">Bharat Polymers Pvt Ltd</div>
                    <div className="text-[10px] text-zinc-500">FY 2026–27 · Client #4 of 27</div>
                  </div>
                  <I.ChevronDown size={14} className="text-zinc-400" />
                </div>
              </div>
              <div className="mt-2 space-y-1">
                {[
                  ['SK', 'Sundar Steels & Alloys', 'GSTR-1 due in 3d', 'amber'],
                  ['KE', 'Kirti Enterprises', 'Books closed', 'zinc'],
                  ['RF', 'Reliance Foam Industries', '14 unmatched txns', 'rose'],
                ].map(([ini, name, sub, color]) => (
                  <div key={name} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold ${
                      color === 'amber' ? 'bg-amber-100 text-amber-700' :
                      color === 'rose' ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 text-zinc-600'
                    }`}>{ini}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs">{name}</div>
                    </div>
                    <span className={`rounded text-[9px] font-medium ${
                      color === 'amber' ? 'text-amber-600' :
                      color === 'rose' ? 'text-rose-600' : 'text-zinc-500'
                    }`}>{sub}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 3. AI automation (5) */}
          <div className="col-span-12 lg:col-span-5 lift overflow-hidden rounded-2xl border border-zinc-200 bg-white p-7">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-violet-600">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> AI automation
            </div>
            <h3 className="mt-3 text-2xl tracking-tight text-zinc-900">
              Snap a bill. Get the <span className="font-display italic">extracted entry.</span>
            </h3>
            <p className="mt-2 text-sm text-zinc-600">OCR + LLM extraction. Verifies GSTIN, matches HSN, picks the right ledger.</p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {/* Receipt photo */}
              <div className="aspect-[3/4] overflow-hidden rounded-lg border border-zinc-200 bg-gradient-to-br from-amber-50 to-orange-50 p-3">
                <div className="space-y-1 font-mono text-[8px] leading-snug text-zinc-700">
                  <div className="text-center font-bold">RELIANCE FOAM</div>
                  <div className="text-center text-[7px]">Industries Pvt Ltd</div>
                  <div className="text-center text-[7px]">GSTIN: 27AABCR1234F1Z5</div>
                  <div className="my-1 border-t border-dashed border-zinc-400" />
                  <div className="flex justify-between"><span>Inv #</span><span>RF/26/4421</span></div>
                  <div className="flex justify-between"><span>Date</span><span>28-04-26</span></div>
                  <div className="my-1 border-t border-dashed border-zinc-400" />
                  <div>PU Foam 32d</div>
                  <div className="flex justify-between"><span>10 nos × 7245</span><span>72,450</span></div>
                  <div>Adhesive HF-2</div>
                  <div className="flex justify-between"><span>5 kg × 2594</span><span>12,970</span></div>
                  <div className="my-1 border-t border-dashed border-zinc-400" />
                  <div className="flex justify-between"><span>Subtotal</span><span>85,420</span></div>
                  <div className="flex justify-between"><span>IGST 18%</span><span>15,375.6</span></div>
                  <div className="flex justify-between font-bold"><span>TOTAL</span><span>1,00,795</span></div>
                </div>
              </div>
              {/* Extracted card */}
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-700">
                  <I.Sparkle size={11} /> EXTRACTED
                </div>
                <div className="mt-2 space-y-1.5 text-[10px]">
                  {[
                    ['Vendor', 'Reliance Foam', true],
                    ['GSTIN', '27AABCR1234…', true],
                    ['Invoice', 'RF/26/4421', true],
                    ['Date', '28 Apr 2026', true],
                    ['Sub', '₹85,420.00', true],
                    ['IGST', '₹15,375.60', true],
                    ['HSN', '39074000', true],
                    ['Ledger', 'Raw Materials', true],
                  ].map(([k, v, ok]) => (
                    <div key={k} className="flex items-center justify-between gap-1">
                      <span className="text-zinc-500">{k}</span>
                      <span className="flex items-center gap-1 font-mono text-zinc-800">
                        <span className="truncate max-w-[80px]">{v}</span>
                        {ok && <I.Check size={9} className="shrink-0 text-emerald-500" />}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 rounded bg-violet-100 px-2 py-1 text-center text-[9px] font-semibold text-violet-700">2.4s · 99.2% conf</div>
              </div>
            </div>
          </div>

          {/* 4. Mobile-first (7) */}
          <div className="col-span-12 lg:col-span-7 lift relative overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-amber-50/50 via-white to-white p-7">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Mobile-first
            </div>
            <h3 className="mt-3 max-w-md text-2xl tracking-tight text-zinc-900">
              Real native apps. <span className="font-display italic">Built for thumbs</span>, not laptops.
            </h3>
            <p className="mt-2 max-w-md text-sm text-zinc-600">iOS and Android apps that stand alone — offline drafts, biometric unlock, Hindi/Tamil/Kannada, the works.</p>

            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
              <div className="rounded-md border border-zinc-200 bg-white/80 px-2 py-1">Offline drafts</div>
              <div className="rounded-md border border-zinc-200 bg-white/80 px-2 py-1">Biometric unlock</div>
              <div className="rounded-md border border-zinc-200 bg-white/80 px-2 py-1">Voice → invoice</div>
              <div className="rounded-md border border-zinc-200 bg-white/80 px-2 py-1">Push approvals</div>
            </div>

            {/* Tilted phone */}
            <div className="absolute -right-8 -bottom-12 hidden w-72 lg:block" style={{ transform: 'rotate(-6deg)' }}>
              <PhoneFrame screen={<MobileCashScreen />} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Phone frame and screens (used in pillar 4 + mobile band) ──────────
function PhoneFrame({ screen, label }) {
  return (
    <div className="phone-bezel relative rounded-[42px] p-2.5">
      <div className="overflow-hidden rounded-[34px] bg-white">
        {/* Status bar */}
        <div className="flex items-center justify-between bg-white px-5 pt-2.5 pb-1 text-[10px] font-semibold text-zinc-900">
          <span>9:41</span>
          <div className="absolute left-1/2 top-1.5 h-5 w-[88px] -translate-x-1/2 rounded-full bg-zinc-950" />
          <div className="flex items-center gap-1">
            <I.Signal size={11} />
            <I.Wifi size={11} />
            <I.Battery size={13} />
          </div>
        </div>
        {screen}
      </div>
      {label && (
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      )}
    </div>
  );
}

function MobileCashScreen() {
  return (
    <div className="bg-zinc-50 px-4 py-3" style={{ minHeight: 460 }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] text-zinc-500">Saturday</div>
          <div className="text-base font-semibold">Hi, Ananya</div>
        </div>
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center text-[10px] font-semibold text-white">AS</div>
      </div>

      <div className="mt-3 rounded-2xl bg-gradient-to-br from-zinc-900 to-brand-900 p-4 text-white">
        <div className="text-[10px] uppercase tracking-wider text-zinc-400">Cash position</div>
        <div className="mt-0.5 text-2xl font-semibold tabular">₹84,62,418</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
          <div className="rounded-lg bg-white/10 p-2">
            <div className="text-emerald-300">Coming in</div>
            <div className="font-semibold tabular">₹2.34 Cr</div>
          </div>
          <div className="rounded-lg bg-white/10 p-2">
            <div className="text-rose-300">Going out</div>
            <div className="font-semibold tabular">₹62.8 L</div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[10px]">
        {[['New invoice', I.Plus], ['Scan bill', I.Camera], ['Approve', I.CheckCircle], ['Reports', I.TrendUp]].map(([n, Ic]) => (
          <div key={n}>
            <div className="flex h-11 items-center justify-center rounded-xl bg-white shadow-sm">
              <Ic size={16} className="text-brand-600" />
            </div>
            <div className="mt-1 text-zinc-600">{n}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-2xl bg-white p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold">Today</span>
          <span className="text-[10px] text-zinc-400">5 events</span>
        </div>
        <div className="mt-2 space-y-2">
          {[
            ['INV-428 paid', 'Bharat Polymers', '+₹4.72L', 'emerald'],
            ['Bill scanned', 'Reliance Foam', '−₹85K', 'amber'],
            ['Bank matched', 'HDFC ··4521', '47 txns', 'brand'],
          ].map(([t, s, a, c]) => (
            <div key={t} className="flex items-center gap-2.5">
              <div className={`h-7 w-7 rounded-lg ${c === 'emerald' ? 'bg-emerald-100' : c === 'amber' ? 'bg-amber-100' : 'bg-brand-100'}`} />
              <div className="flex-1 min-w-0">
                <div className="truncate text-[11px] font-medium">{t}</div>
                <div className="truncate text-[9px] text-zinc-500">{s}</div>
              </div>
              <div className={`text-[10px] font-semibold tabular ${c === 'emerald' ? 'text-emerald-600' : c === 'amber' ? 'text-zinc-700' : 'text-brand-600'}`}>{a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileInvoiceScreen() {
  return (
    <div className="bg-white px-4 py-3" style={{ minHeight: 460 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-zinc-100 flex items-center justify-center"><I.Arrow size={13} className="rotate-180" /></div>
          <span className="text-sm font-semibold">Quick invoice</span>
        </div>
        <div className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-mono">3 of 4</div>
      </div>

      {/* Customer */}
      <div className="mt-4 rounded-xl border border-zinc-200 p-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">To</div>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-emerald-100 flex items-center justify-center text-[10px] font-semibold text-emerald-700">BP</div>
          <div>
            <div className="text-sm font-semibold">Bharat Polymers</div>
            <div className="font-mono text-[9px] text-zinc-500">29ABCDE1234F1Z5</div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="mt-3 rounded-xl border border-zinc-200">
        {[
          ['HDPE Granules FG-2540', '1500 × ₹78.50', '₹1,17,750'],
          ['LDPE Roll 50µ', '850 × ₹122', '₹1,03,700'],
          ['Master Batch MB-K9', '120 × ₹410', '₹49,200'],
        ].map(([n, q, a], i) => (
          <div key={i} className={`flex items-center justify-between p-2.5 ${i ? 'border-t border-zinc-100' : ''}`}>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">{n}</div>
              <div className="text-[10px] text-zinc-500">{q}</div>
            </div>
            <div className="font-mono text-[11px] font-semibold tabular">{a}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl bg-zinc-50 p-3">
        <div className="flex justify-between text-[11px] text-zinc-500"><span>Sub</span><span className="tabular">₹2,70,650</span></div>
        <div className="flex justify-between text-[11px] text-zinc-500"><span>GST 18%</span><span className="tabular">₹48,717</span></div>
        <div className="mt-1 flex items-baseline justify-between border-t border-zinc-200 pt-1.5">
          <span className="text-xs font-semibold">Total</span>
          <span className="text-lg font-bold tabular">₹3,19,367</span>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button className="flex-1 rounded-xl border border-zinc-300 py-3 text-xs font-medium">Save draft</button>
        <button className="flex-[2] rounded-xl bg-brand-500 py-3 text-xs font-semibold text-white">Generate IRN & Send</button>
      </div>

      <div className="mt-2 text-center text-[10px] text-zinc-500">Drafted in <span className="font-semibold text-zinc-700">22 seconds</span> from a saved template</div>
    </div>
  );
}

function MobileScanScreen() {
  return (
    <div className="relative overflow-hidden bg-zinc-950 text-white" style={{ minHeight: 460 }}>
      {/* Camera viewfinder area */}
      <div className="relative h-56 bg-gradient-to-b from-zinc-800 to-zinc-950">
        <div className="absolute inset-4 rounded-xl border-2 border-dashed border-white/30" />
        {/* Faux receipt overlay */}
        <div className="absolute left-1/2 top-1/2 w-32 -translate-x-1/2 -translate-y-1/2 rotate-3 rounded-md bg-amber-50 p-2 font-mono text-[7px] text-zinc-700 shadow-2xl">
          <div className="text-center font-bold">RELIANCE FOAM</div>
          <div className="text-center text-[6px]">GSTIN 27AABCR1234F1Z5</div>
          <div className="my-1 border-t border-dashed border-zinc-400" />
          <div className="flex justify-between"><span>RF/26/4421</span><span>28-04-26</span></div>
          <div className="my-1 border-t border-dashed border-zinc-400" />
          <div>PU Foam · 10×7245</div>
          <div>Adhesive · 5×2594</div>
          <div className="my-1 border-t border-dashed border-zinc-400" />
          <div className="flex justify-between font-bold"><span>TOTAL</span><span>₹1,00,795</span></div>
        </div>
        {/* Corner brackets */}
        <div className="absolute left-6 top-6 h-5 w-5 border-l-2 border-t-2 border-brand-400" />
        <div className="absolute right-6 top-6 h-5 w-5 border-r-2 border-t-2 border-brand-400" />
        <div className="absolute left-6 bottom-6 h-5 w-5 border-l-2 border-b-2 border-brand-400" />
        <div className="absolute right-6 bottom-6 h-5 w-5 border-r-2 border-b-2 border-brand-400" />

        <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-1 text-[9px] backdrop-blur">
          <I.Sparkle size={9} className="mr-1 inline text-brand-300" /> AI extracting…
        </div>
      </div>

      {/* Result panel */}
      <div className="rounded-t-3xl bg-white p-4 text-zinc-900">
        <div className="mx-auto h-1 w-10 rounded-full bg-zinc-300" />
        <div className="mt-3 flex items-center gap-2">
          <I.CheckCircle size={14} className="text-emerald-500" />
          <span className="text-sm font-semibold">Bill captured</span>
          <span className="ml-auto text-[10px] text-zinc-500">2.4s · 99% conf</span>
        </div>
        <div className="mt-3 space-y-1.5 text-[11px]">
          {[
            ['Vendor', 'Reliance Foam'],
            ['Invoice', 'RF/26/4421'],
            ['Date', '28 Apr 2026'],
            ['Total', '₹1,00,795.60'],
            ['Ledger', 'Raw Materials'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-zinc-500">{k}</span>
              <span className="font-mono font-medium tabular">{v}</span>
            </div>
          ))}
        </div>
        <button className="mt-3 w-full rounded-xl bg-brand-500 py-2.5 text-xs font-semibold text-white">Save bill</button>
      </div>
    </div>
  );
}

// ─── Product Showcase (dark, tabbed) ───────────────────────────────────
function Showcase() {
  const tabs = [
    { id: 'invoice', label: 'GST Invoice', icon: I.FileText, Mock: InvoiceMockup, copy: 'Sub-30-second flow with auto-IRN, customer GSTIN verify, HSN suggestions.' },
    { id: 'recon',   label: 'Bank Recon',  icon: I.Landmark, Mock: BankReconMockup, copy: 'Live HDFC, ICICI, Axis, SBI feeds. AI matches 90%+ on day one.' },
    { id: 'gstr',    label: 'GSTR-2B Match', icon: I.Hash, Mock: GSTR2BMockup, copy: 'Vendor-by-vendor diff against your bills. ITC mismatches surface instantly.' },
    { id: 'ai',      label: 'AI Assistant', icon: I.Sparkle, Mock: AIAssistantMockup, copy: 'Ask in English, Hindi, Tamil. Reads your books and answers with real data.' },
  ];
  const [active, setActive] = useState('invoice');
  const ActiveMock = tabs.find(t => t.id === active).Mock;
  const activeTab = tabs.find(t => t.id === active);
  return (
    <section id="showcase" className="relative overflow-hidden bg-zinc-950 py-24 text-zinc-100">
      <div className="aurora aurora-dark" />
      <div className="absolute inset-0 dot-grid opacity-50" />
      <div className="relative mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="reveal mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">The product</div>
          <h2 className="mt-3 text-4xl tracking-tight lg:text-5xl">
            One platform.<br />
            <span className="font-display italic grad-text-light">Every finance moment.</span>
          </h2>
        </div>

        {/* Pill tabs */}
        <div className="reveal mt-10 flex flex-wrap items-center justify-center gap-2">
          {tabs.map(t => {
            const isActive = t.id === active;
            return (
              <button key={t.id} onClick={() => setActive(t.id)}
                className={`group inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all ${
                  isActive ? 'border-brand-500/40 bg-brand-500/10 text-brand-100 shadow-[0_0_30px_-5px_oklch(0.59_0.20_264_/_0.4)]' : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}>
                <t.icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        <p className="reveal mx-auto mt-5 max-w-xl text-center text-sm text-zinc-400" style={{ textWrap: 'pretty' }}>
          {activeTab.copy}
        </p>

        {/* Mockup */}
        <div className="reveal relative mt-10">
          <div className="absolute inset-x-0 -top-12 -bottom-20 -z-10" style={{
            background: 'radial-gradient(50% 40% at 50% 50%, oklch(0.59 0.22 264 / .35), transparent 70%)',
            filter: 'blur(40px)',
          }} />
          <div className="mockup-shadow mx-auto max-w-[1080px] rounded-2xl border border-zinc-800 bg-zinc-950 p-1.5">
            <WindowChrome url={`app.runq.in/${active}`} height={580}>
              <ActiveMock key={active} />
            </WindowChrome>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Mobile band ───────────────────────────────────────────────────────
function MobileBand() {
  const wins = [
    { Ic: I.Plus,        title: 'Invoice from your phone', sub: 'Save templates. Generate IRN. Send WhatsApp link in 22 seconds.' },
    { Ic: I.Camera,      title: 'Snap bills, not folders', sub: 'AI reads vendor, GSTIN, HSN, totals. Drops it straight into AP.' },
    { Ic: I.CheckCircle, title: 'Approve on the go',       sub: 'Tap-through approvals with audit trail. No more "send me on email".' },
    { Ic: I.Bell,        title: 'Real-time alerts',        sub: 'Big invoice paid, bill due tomorrow, GST deadline in 3 days.' },
    { Ic: I.Cloud,       title: 'Offline drafts',          sub: 'Works in patchy Tier-2 connectivity. Syncs when you\'re back.' },
    { Ic: I.Fingerprint, title: 'Biometric security',      sub: 'Face ID / fingerprint for the app and large transactions.' },
  ];
  return (
    <section id="mobile" className="relative bg-white py-24">
      <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="grid grid-cols-12 items-center gap-10">
          {/* Phones */}
          <div className="reveal col-span-12 lg:col-span-7">
            <div className="relative h-[580px]">
              <div className="absolute left-2 top-12 w-56" style={{ transform: 'rotate(-8deg)' }}>
                <PhoneFrame screen={<MobileCashScreen />} />
              </div>
              <div className="absolute left-1/2 top-0 w-60 -translate-x-1/2" style={{ zIndex: 2 }}>
                <PhoneFrame screen={<MobileInvoiceScreen />} />
              </div>
              <div className="absolute right-0 top-16 w-56" style={{ transform: 'rotate(8deg)' }}>
                <PhoneFrame screen={<MobileScanScreen />} />
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="col-span-12 lg:col-span-5">
            <div className="reveal text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Mobile-first, not mobile-also</div>
            <h2 className="reveal mt-3 text-4xl tracking-tight text-zinc-900 lg:text-5xl">
              Real apps for <span className="font-display italic">owners on the move.</span>
            </h2>
            <p className="reveal mt-3 text-zinc-600" style={{ textWrap: 'pretty' }}>
              Tally needs a desktop. Zoho's app feels like a cramped browser. We built ours native — for the founder approving a payment from a factory in Hosur.
            </p>

            <ul className="reveal mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {wins.map(w => (
                <li key={w.title} className="flex gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                    <w.Ic size={14} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">{w.title}</div>
                    <div className="mt-0.5 text-xs text-zinc-600 leading-relaxed">{w.sub}</div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="reveal mt-7 flex flex-wrap gap-3">
              <a href="#" className="inline-flex items-center gap-2.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-white">
                <I.Apple size={20} />
                <div className="text-left">
                  <div className="text-[9px] uppercase tracking-wider opacity-70">Download on the</div>
                  <div className="-mt-0.5 text-sm font-semibold">App Store</div>
                </div>
              </a>
              <a href="#" className="inline-flex items-center gap-2.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-white">
                <div className="flex h-5 w-5 items-center justify-center text-base">▶</div>
                <div className="text-left">
                  <div className="text-[9px] uppercase tracking-wider opacity-70">Get it on</div>
                  <div className="-mt-0.5 text-sm font-semibold">Google Play</div>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── AI Band (dark) ────────────────────────────────────────────────────
function AIBand() {
  const cards = [
    { Ic: I.Camera,  title: 'OCR bill capture',       sub: 'Photograph any vendor invoice. We extract 24 fields with 99% accuracy and post the entry.' },
    { Ic: I.Refresh, title: 'Auto bank matching',     sub: 'Live feeds from HDFC, ICICI, Axis, SBI. The AI matches narrations to invoices and bills.' },
    { Ic: I.Hash,    title: 'Smart categorization',   sub: 'New vendors auto-mapped to ledgers. New expense types learn from your team in days.' },
    { Ic: I.Bell,    title: 'Payment reminders',      sub: 'Tone-tuned reminders by customer behaviour. Polite, firm, or warm — picks the right one.' },
  ];
  return (
    <section className="relative overflow-hidden bg-zinc-950 py-24 text-zinc-100">
      <div className="aurora aurora-dark" />
      <div className="absolute inset-0 dot-grid opacity-40" />
      {/* ₹ watermark */}
      <div className="rupee-watermark pointer-events-none absolute -right-10 -top-20 select-none text-[28rem] leading-none">₹</div>

      <div className="relative mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="reveal mx-auto max-w-3xl text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">AI automation</div>
          <h2 className="mt-3 text-4xl tracking-tight lg:text-6xl">
            The accountant<br />
            <span className="font-display italic grad-text-light">that never sleeps.</span>
          </h2>
        </div>

        <div className="reveal mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {cards.map((c, i) => (
            <div key={c.title} className="lift relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur">
              <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-brand-400/40 to-transparent" />
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400/20 to-brand-700/20 ring-1 ring-brand-400/20">
                <c.Ic size={18} className="text-brand-300" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{c.sub}</p>
              <div className="mt-5 text-[10px] font-mono text-zinc-600">0{i + 1} / 04</div>
            </div>
          ))}
        </div>

        {/* Big stat callout */}
        <div className="reveal mt-12">
          <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-br from-brand-950/40 via-zinc-900/40 to-zinc-950 p-8 lg:p-12">
            <div className="absolute inset-0 dot-grid opacity-30" />
            <div className="relative flex flex-col items-center justify-between gap-6 lg:flex-row">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">Average finance team</div>
                <div className="mt-2 flex items-baseline gap-3 text-[clamp(3rem,8vw,7rem)] leading-none">
                  <span className="font-display italic grad-text-light">saves</span>
                  <span className="font-bold text-white">6+</span>
                  <span className="font-display italic grad-text-light">hours/week</span>
                </div>
                <div className="mt-2 text-sm text-zinc-400">on bookkeeping, recon, and bill entry.</div>
              </div>
              <div className="flex flex-col gap-2 text-xs text-zinc-400">
                {[
                  ['90%+', 'auto-matched bank txns'],
                  ['2.4s', 'avg bill OCR extraction'],
                  ['22s', 'fastest invoice → IRN'],
                ].map(([n, l]) => (
                  <div key={l} className="flex items-baseline gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2">
                    <span className="font-mono text-base font-semibold text-brand-300 tabular">{n}</span>
                    <span>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── For CAs ───────────────────────────────────────────────────────────
function ForCAs() {
  const features = [
    { Ic: I.Users,     title: 'Multi-client switcher',    sub: 'Jump between 27 client books in one keystroke. Recent, pinned, search.' },
    { Ic: I.Download,  title: 'Tally-compatible export',  sub: 'XML and DAT exports that import cleanly into Tally Prime — no manual mapping.' },
    { Ic: I.Eye,       title: 'Read-only CA portal',      sub: 'Give your CA scoped access. They see books, you keep control of approvals.' },
    { Ic: I.FileText,  title: 'GSTR-ready bundles',       sub: 'GSTR-1, 3B, 2B, 9 with reconciliations attached. One-click filing.' },
  ];
  return (
    <section id="for-cas" className="relative ca-bg py-24">
      <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="grid grid-cols-12 gap-10">
          {/* Sticky left */}
          <div className="col-span-12 lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <div className="reveal text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">For Chartered Accountants</div>
              <h2 className="reveal mt-3 text-4xl tracking-tight text-zinc-900 lg:text-5xl">
                Built <span className="font-display italic">with</span> CAs,<br />
                not <span className="font-display italic">around</span> them.
              </h2>
              <p className="reveal mt-4 text-zinc-600" style={{ textWrap: 'pretty' }}>
                We did 80+ interviews with practising CAs in Bengaluru, Mumbai and Coimbatore before writing a line of code. The result is a portal that fits how your month-end actually flows.
              </p>

              {/* Testimonial */}
              <figure className="reveal mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <I.Sparkle size={16} className="text-brand-500" />
                <blockquote className="mt-3 text-base text-zinc-800 leading-relaxed">
                  <span className="font-display italic text-2xl text-brand-700">"</span>I closed three sets of books in the time I usually take for one. The Tally export just works — no fudging in Excel.<span className="font-display italic text-2xl text-brand-700">"</span>
                </blockquote>
                <figcaption className="mt-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-300 to-emerald-600" />
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">CA Priya Subramanian</div>
                    <div className="text-xs text-zinc-500">Partner, Subramanian & Co · Bengaluru · 14 years practice</div>
                  </div>
                </figcaption>
              </figure>
            </div>
          </div>

          {/* Right grid */}
          <div className="reveal col-span-12 lg:col-span-7">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {features.map(f => (
                <div key={f.title} className="lift rounded-2xl border border-zinc-200 bg-white p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                    <f.Ic size={16} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-zinc-900">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-zinc-600 leading-relaxed">{f.sub}</p>
                </div>
              ))}
            </div>

            {/* Workflow strip */}
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">A typical CA month-end on runQ</div>
              <div className="mt-4 flex items-center gap-2 text-xs">
                {[
                  ['1', 'Pull all 2B', 'auto'],
                  ['2', 'Reconcile bills', '12 min'],
                  ['3', 'Approve 1B/3B', 'in-app'],
                  ['4', 'Tally export', '1-click'],
                  ['5', 'Done', '🎉'],
                ].map(([n, label, t], i, arr) => (
                  <React.Fragment key={n}>
                    <div className="flex flex-1 flex-col items-center text-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-mono font-semibold text-emerald-700">{n}</div>
                      <div className="mt-1.5 text-[11px] font-medium text-zinc-800">{label}</div>
                      <div className="text-[10px] text-zinc-500">{t}</div>
                    </div>
                    {i < arr.length - 1 && <div className="h-px flex-1 border-t border-dashed border-zinc-300" />}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Comparison table ──────────────────────────────────────────────────
function CompareTable() {
  const cols = ['runQ', 'Tally', 'Zoho Books', 'Vyapar'];
  const rows = [
    ['Pricing',                     ['Free → ₹599/mo', '₹18,000/yr', '₹2,500/mo', '₹329/mo']],
    ['Native mobile apps',          [true, false, 'partial', true]],
    ['AI bill OCR',                 [true, false, 'beta', false]],
    ['AI bank matching',            [true, false, false, false]],
    ['GSTR-2B reconciliation',      [true, 'manual', true, false]],
    ['e-Invoice & e-Way bill',      [true, true, true, 'limited']],
    ['CA read-only portal',         [true, false, false, false]],
    ['Tally-compatible export',     [true, '—', false, false]],
    ['Setup time',                  ['10 min', '~2 days', '~1 hr', '20 min']],
    ['Multi-device sync',           [true, false, true, 'partial']],
  ];
  const Cell = ({ v, highlight }) => {
    const base = `px-3 py-3.5 text-sm tabular ${highlight ? 'bg-brand-50/60' : ''}`;
    if (v === true) return <td className={base}><I.CheckCircle size={16} className={`${highlight ? 'text-brand-600' : 'text-emerald-500'}`} /></td>;
    if (v === false) return <td className={base}><I.X size={16} className="text-zinc-300" /></td>;
    return <td className={`${base} text-zinc-700 ${typeof v === 'string' && v.includes('partial') ? 'text-amber-600' : ''}`}>{v}</td>;
  };
  return (
    <section id="compare" className="bg-white py-24">
      <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="reveal mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">vs the rest</div>
          <h2 className="mt-3 text-4xl tracking-tight text-zinc-900 lg:text-5xl">
            We're <span className="font-display italic grad-text">honest</span> about the tradeoffs.
          </h2>
          <p className="mt-4 text-zinc-600">Tally has 30 years and an army of CAs. Zoho has reach. Vyapar is cheap. Here's where we win, lose, and tie.</p>
        </div>

        <div className="reveal mt-12 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="bg-zinc-50">
                  <th className="w-[28%] px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500"></th>
                  {cols.map((c, i) => (
                    <th key={c} className={`px-3 py-4 text-left text-sm font-semibold ${i === 0 ? 'bg-brand-50/60 text-brand-700' : 'text-zinc-700'}`}>
                      <div className="flex items-center gap-2">
                        {i === 0 ? (
                          <>
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500 text-[11px] font-bold text-white">Q</span>
                            <span>runQ</span>
                          </>
                        ) : <span>{c}</span>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, vals], rIdx) => (
                  <tr key={label} className={rIdx ? 'border-t border-zinc-100' : ''}>
                    <td className="px-4 py-3.5 text-sm font-medium text-zinc-800">{label}</td>
                    {vals.map((v, i) => <Cell key={i} v={v} highlight={i === 0} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="reveal mt-3 text-center text-[11px] text-zinc-400">Pricing as published by competitors at the time of writing. We'll keep this page honest as they ship.</p>
      </div>
    </section>
  );
}

// ─── Final CTA (dark) ──────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-zinc-950 py-28 text-zinc-100">
      <div className="aurora aurora-dark" />
      <div className="absolute inset-0 dot-grid opacity-40" />
      <div className="relative mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="reveal mx-auto max-w-3xl text-center">
          <h2 className="text-4xl tracking-tight lg:text-7xl">
            <span className="font-semibold">Run your business,</span><br />
            <span className="font-display italic grad-text-light">not your books.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-zinc-400" style={{ textWrap: 'pretty' }}>
            Free forever for solo founders. Pro plan starts at ₹599/mo when your team grows. No credit card to start.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="#" className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-zinc-900 shadow-lg shadow-brand-500/20 hover:bg-zinc-100">
              Get started free <I.Arrow size={15} />
            </a>
            <a href="#" className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-900">
              See pricing
            </a>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
            {[
              ['Free forever plan', I.Heart],
              ['Setup in 10 minutes', I.Clock],
              ['Cancel anytime', I.ShieldCheck],
              ['India-based support', I.Globe],
            ].map(([l, Ic]) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <Ic size={12} className="text-brand-400" />
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────
function Footer() {
  const cols = [
    { title: 'Product', items: ['Invoicing', 'Bank reconciliation', 'GST filing', 'Bills & expenses', 'Reports', 'Mobile apps'] },
    { title: 'For', items: ['SME owners', 'Chartered accountants', 'Manufacturers', 'Service businesses'] },
    { title: 'Company', items: ['About Quartex', 'Careers', 'Press', 'Contact'] },
    { title: 'Legal', items: ['Privacy', 'Terms', 'Security', 'GST compliance'] },
  ];
  return (
    <footer className="relative overflow-hidden bg-zinc-950 pt-20 pb-8 text-zinc-400">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
      <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="grid grid-cols-12 gap-10">
          <div className="col-span-12 lg:col-span-4">
            <div className="flex items-center gap-2">
              <img src="assets/runq-light.png" alt="runQ" className="h-7" />
              <span className="rounded border border-brand-400/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-300">Finance</span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-zinc-500">Modern books for modern Indian businesses. Built by Quartex Technologies in Bengaluru.</p>
            <div className="mt-5 flex gap-2">
              {[I.Twitter, I.Linkedin, I.Github].map((Ic, i) => (
                <a key={i} href="#" className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 hover:border-brand-500/40 hover:text-brand-300">
                  <Ic size={14} />
                </a>
              ))}
            </div>
          </div>

          <div className="col-span-12 grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-8">
            {cols.map(c => (
              <div key={c.title}>
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-300">{c.title}</div>
                <ul className="mt-3 space-y-2 text-sm">
                  {c.items.map(i => (
                    <li key={i}><a href="#" className="text-zinc-500 hover:text-zinc-200 transition-colors">{i}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-3 border-t border-zinc-800 pt-6 text-xs text-zinc-500 sm:flex-row sm:items-center">
          <div>© 2026 Quartex Technologies Pvt Ltd · runq.in</div>
          <div className="flex items-center gap-1.5">
            Made with <I.Heart size={11} className="text-rose-400" /> in Bangalore, India
          </div>
        </div>
      </div>
    </footer>
  );
}

window.Sections = { Nav, Hero, Pillars, Showcase, MobileBand, AIBand, ForCAs, CompareTable, FinalCTA, Footer, useReveal };
