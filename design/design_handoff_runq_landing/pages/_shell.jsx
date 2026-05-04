// Shared shell for all sub-pages — Nav + Footer + page CSS/fonts.
// Each sub-page imports this then renders its own <main>.

const { I } = window;
const { useState, useEffect } = React;

function PageNav({ active }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const links = [
    ['Features',  '../runQ Landing.html#features'],
    ['Mobile',    '../runQ Landing.html#mobile'],
    ['For CAs',   '../runQ Landing.html#for-cas'],
    ['Pricing',   'pricing.html'],
    ['About',     'about.html'],
  ];
  return (
    <nav className={`sticky top-0 z-40 transition-all ${scrolled ? 'nav-blur bg-white/75 border-b border-zinc-200/70' : 'bg-white/40 border-b border-transparent'}`}>
      <div className="mx-auto flex h-14 max-w-[1200px] items-center px-5 lg:px-8">
        <a href="../runQ Landing.html" className="flex items-center gap-2">
          <img src="../assets/runq-dark.png" alt="runQ" className="h-6" />
          <span className="rounded border border-brand-500/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-600">Finance</span>
        </a>
        <div className="ml-10 hidden items-center gap-7 lg:flex">
          {links.map(([l, h]) => (
            <a key={l} href={h} className={`text-sm transition-colors ${active === l ? 'text-zinc-900 font-medium' : 'text-zinc-600 hover:text-zinc-900'}`}>{l}</a>
          ))}
        </div>
        <div className="ml-auto hidden items-center gap-3 lg:flex">
          <a href="#" className="text-sm text-zinc-600 hover:text-zinc-900">Sign in</a>
          <a href="#" className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-800">
            Get started free <I.Arrow size={14} />
          </a>
        </div>
        <button className="ml-auto lg:hidden" onClick={() => setOpen(!open)}>{open ? <I.X /> : <I.Menu />}</button>
      </div>
      {open && (
        <div className="border-t border-zinc-200 bg-white px-5 py-4 lg:hidden">
          {links.map(([l, h]) => <a key={l} href={h} className="block py-2 text-sm">{l}</a>)}
          <a href="#" className="mt-2 block rounded-md bg-zinc-900 px-3 py-2 text-center text-sm font-medium text-white">Get started free</a>
        </div>
      )}
    </nav>
  );
}

function PageFooter() {
  const cols = [
    { title: 'Product', items: [
      ['Invoicing', 'invoicing.html'],
      ['Bank reconciliation', 'bank-reconciliation.html'],
      ['GST filing', 'gst-filing.html'],
      ['Bills & expenses', 'bills-expenses.html'],
      ['Reports', 'reports.html'],
      ['Mobile apps', 'mobile-apps.html'],
    ]},
    { title: 'For', items: [
      ['SME owners', 'for-sme-owners.html'],
      ['Chartered accountants', 'for-cas.html'],
      ['Manufacturers', 'for-manufacturers.html'],
      ['Service businesses', 'for-service.html'],
    ]},
    { title: 'Company', items: [
      ['About Quartex', 'about.html'],
      ['Careers', 'careers.html'],
      ['Press', 'press.html'],
      ['Contact', 'contact.html'],
    ]},
    { title: 'Legal', items: [
      ['Privacy', 'privacy.html'],
      ['Terms', 'terms.html'],
      ['Security', 'security.html'],
      ['GST compliance', 'gst-compliance.html'],
    ]},
  ];
  return (
    <footer className="relative overflow-hidden bg-zinc-950 pt-20 pb-8 text-zinc-400">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
      <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="grid grid-cols-12 gap-10">
          <div className="col-span-12 lg:col-span-4">
            <div className="flex items-center gap-2">
              <img src="../assets/runq-light.png" alt="runQ" className="h-7" />
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
                  {c.items.map(([label, href]) => (
                    <li key={label}><a href={href} className="text-zinc-500 hover:text-zinc-200 transition-colors">{label}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 flex flex-col items-start justify-between gap-3 border-t border-zinc-800 pt-6 text-xs text-zinc-500 sm:flex-row sm:items-center">
          <div>© 2026 Quartex Technologies Pvt Ltd · runq.in</div>
          <div className="flex items-center gap-1.5">Made with <I.Heart size={11} className="text-rose-400" /> in Bangalore, India</div>
        </div>
      </div>
    </footer>
  );
}

// Reveal hook
function usePageReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// Standard hero/header for sub-pages
function PageHero({ eyebrow, title, titleItalic, subtitle, accent = 'brand' }) {
  const accentMap = { brand: 'text-brand-600', emerald: 'text-emerald-700', amber: 'text-amber-600', violet: 'text-violet-600', blue: 'text-blue-600', rose: 'text-rose-600' };
  return (
    <section className="relative overflow-hidden">
      <div className="aurora" />
      <div className="absolute inset-0 line-grid-light opacity-50" style={{ maskImage: 'radial-gradient(ellipse at 50% 30%, black 0%, transparent 70%)', WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%, black 0%, transparent 70%)' }} />
      <div className="relative mx-auto max-w-[1200px] px-5 pt-16 pb-10 lg:px-8 lg:pt-24 lg:pb-14">
        {eyebrow && <div className={`reveal text-xs font-semibold uppercase tracking-[0.18em] text-center ${accentMap[accent] || accentMap.brand}`}>{eyebrow}</div>}
        <h1 className="reveal mx-auto mt-3 max-w-4xl text-center text-[clamp(2rem,5.4vw,4.4rem)] leading-[1.05] tracking-tight text-zinc-900" style={{ textWrap: 'balance' }}>
          <span className="font-semibold">{title}</span>{titleItalic && <> <span className="font-display italic grad-text">{titleItalic}</span></>}
        </h1>
        {subtitle && <p className="reveal mx-auto mt-5 max-w-2xl text-center text-base text-zinc-600 lg:text-lg" style={{ textWrap: 'pretty' }}>{subtitle}</p>}
      </div>
    </section>
  );
}

// Footer CTA strip used at end of every sub-page
function FooterCTA() {
  return (
    <section className="relative overflow-hidden bg-zinc-950 py-20 text-zinc-100">
      <div className="aurora aurora-dark" />
      <div className="absolute inset-0 dot-grid opacity-40" />
      <div className="relative mx-auto max-w-[1200px] px-5 text-center lg:px-8">
        <h2 className="reveal text-3xl tracking-tight lg:text-5xl">
          <span className="font-semibold">Run your business,</span> <span className="font-display italic grad-text-light">not your books.</span>
        </h2>
        <div className="reveal mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href="#" className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-zinc-900 shadow-lg shadow-brand-500/20">Get started free <I.Arrow size={15} /></a>
          <a href="pricing.html" className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-200">See pricing</a>
        </div>
      </div>
    </section>
  );
}

window.Shell = { PageNav, PageFooter, usePageReveal, PageHero, FooterCTA };
