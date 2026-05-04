// About page
const { PageNav, PageFooter, usePageReveal, PageHero, FooterCTA } = window.Shell;

function StatCard({ k, v, sub }) {
  return (
    <div className="reveal rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="text-[44px] font-semibold leading-none tracking-tight text-zinc-900 tabular">{v}</div>
      <div className="mt-2 text-sm font-semibold text-zinc-900">{k}</div>
      <div className="mt-0.5 text-sm text-zinc-500">{sub}</div>
    </div>
  );
}

function PersonCard({ name, role, blurb, initials, accent }) {
  const colors = {
    brand: 'from-brand-200 to-brand-400',
    emerald: 'from-emerald-200 to-emerald-400',
    violet: 'from-violet-200 to-violet-400',
    amber: 'from-amber-200 to-amber-400',
  };
  return (
    <div className="reveal lift rounded-2xl border border-zinc-200 bg-white p-6">
      <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${colors[accent] || colors.brand} text-sm font-semibold text-zinc-900`}>{initials}</div>
      <div className="mt-4 text-base font-semibold text-zinc-900">{name}</div>
      <div className="text-sm text-zinc-500">{role}</div>
      <div className="mt-3 text-sm leading-relaxed text-zinc-600" style={{ textWrap: 'pretty' }}>{blurb}</div>
    </div>
  );
}

function AboutPage() {
  usePageReveal();
  return (
    <>
      <PageNav active="About" />
      <main>
        <PageHero
          eyebrow="ABOUT QUARTEX"
          title="We're rebuilding"
          titleItalic="the books for India."
          subtitle="A small team in Bengaluru, building a finance and accounting platform that respects how Indian businesses actually run — mobile-first, GST-native, AI everywhere it earns its keep."
        />

        {/* Lead story */}
        <section className="mx-auto max-w-[860px] px-5 pb-20 lg:px-8">
          <div className="reveal space-y-5 text-[17px] leading-[1.7] text-zinc-700" style={{ textWrap: 'pretty' }}>
            <p>Quartex Technologies started in 2024 with a simple observation: the SME owner running a ₹15 crore business in Coimbatore is on her phone all day, but her accounting software wants her at a desktop in the back office. Her CA in Chennai is at three different clients in a single afternoon — and his books are stuck on a single Tally license.</p>
            <p>Tally has 75% of the Indian market and a generation of CAs trained on it. Zoho Books moved the file to the cloud but kept the form. Vyapar made it cheap. None of them rebuilt for the way Indian SMEs work today: GST-native, mobile-first, owner-and-CA-shared, AI-augmented.</p>
            <p>That's <span className="font-semibold text-zinc-900">runQ</span> — a finance platform that takes the most painful month-end ritual in India and quietly automates it. Bills are photographed, not typed. Bank statements reconcile themselves. GSTR-2B mismatches surface before the deadline, not after the notice. And every report that the CA needs at month-end is one click — including a Tally-compatible export.</p>
            <p>We're building it the way modern software should be built — backed by AI where AI is honest, on real bank rails (not screen-scraping), with apps you'd be happy to use on your own phone.</p>
          </div>
        </section>

        {/* Stats */}
        <section className="bg-zinc-50 py-20">
          <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
            <div className="reveal max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">BY THE NUMBERS</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 lg:text-4xl">Early, but real.</h2>
            </div>
            <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard v="6.4 cr" k="MSMEs in India" sub="Most still on Excel or Tally" />
              <StatCard v="2,400+" k="Beta businesses" sub="Across 18 states" />
              <StatCard v="₹420 cr" k="Invoiced through runQ" sub="In the last 90 days" />
              <StatCard v="6.2 hrs" k="Saved per week" sub="Median across beta cohort" />
            </div>
          </div>
        </section>

        {/* Principles */}
        <section className="py-20">
          <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
            <div className="reveal max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">HOW WE BUILD</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 lg:text-4xl">Four principles, in order.</h2>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                ['01', 'Mobile is the primary surface', 'Every feature must work on a phone first. The desktop and the iPad are useful guests; the phone is the host.'],
                ['02', 'Compliance is the floor', 'GST e-invoicing, e-Way bills, GSTR returns, MCA filings — these are not premium features. They ship to everyone.'],
                ['03', 'AI must be honest', 'We ship AI when it earns trust on real Indian data. Bill OCR, bank matching, smart reminders — measured, not hyped.'],
                ['04', 'CAs are partners, not adversaries', 'A book that the CA cannot audit and export to Tally is a book that does not get adopted. We ship for both sides.'],
              ].map(([n, t, b]) => (
                <div key={n} className="reveal lift rounded-2xl border border-zinc-200 bg-white p-7">
                  <div className="flex items-baseline gap-3">
                    <div className="font-display text-3xl text-brand-500/60">{n}</div>
                    <div className="text-lg font-semibold text-zinc-900">{t}</div>
                  </div>
                  <div className="mt-3 text-sm leading-relaxed text-zinc-600" style={{ textWrap: 'pretty' }}>{b}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Team */}
        <section className="bg-zinc-50 py-20">
          <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
            <div className="reveal max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">TEAM</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 lg:text-4xl">A small group, very online.</h2>
              <p className="mt-3 text-zinc-600">Engineers and designers in Bengaluru, with a ten-year CA from Chennai keeping us honest about what month-end actually feels like.</p>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
              <PersonCard name="Aarav Iyer" role="Co-founder, CEO" initials="AI" accent="brand" blurb="Previously product at Razorpay. Built and shipped the merchant onboarding stack." />
              <PersonCard name="Meera Kulkarni" role="Co-founder, CTO" initials="MK" accent="violet" blurb="Ex-staff engineer at Zerodha. Believes infra people should ship UI too." />
              <PersonCard name="CA Rajan Sharma" role="Head of Compliance" initials="RS" accent="emerald" blurb="Ten years in practice in Chennai. The reason our Tally export does not lie." />
              <PersonCard name="Ishaan Pillai" role="Head of Design" initials="IP" accent="amber" blurb="Ex-Atlan, ex-Browser Co. Cares deeply about typography on mobile." />
            </div>
          </div>
        </section>

        {/* Investors / partners */}
        <section className="py-20">
          <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
            <div className="reveal flex flex-col items-start justify-between gap-10 lg:flex-row">
              <div className="max-w-md">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">BACKERS</div>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 lg:text-4xl">Patient capital.</h2>
                <p className="mt-3 text-zinc-600" style={{ textWrap: 'pretty' }}>We're backed by founders and operators who've built for Indian SMEs for two decades. We don't chase quarters — we chase month-ends.</p>
              </div>
              <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
                {['Peak XV', 'Blume', 'Lightspeed', 'Angel List'].map(n => (
                  <div key={n} className="reveal flex h-20 items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-500">{n}</div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <FooterCTA />
      </main>
      <PageFooter />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<AboutPage />);
