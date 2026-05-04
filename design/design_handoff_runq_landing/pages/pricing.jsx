// Pricing page content
const { PageNav, PageFooter, usePageReveal, PageHero, FooterCTA } = window.Shell;
const { useState } = React;

function PriceCard({ name, price, period, blurb, features, cta, highlight, accent }) {
  return (
    <div className={`reveal lift relative flex flex-col rounded-2xl border p-7 ${highlight ? 'border-brand-500/60 bg-gradient-to-b from-brand-50/80 to-white shadow-2xl shadow-brand-500/15' : 'border-zinc-200 bg-white'}`}>
      {highlight && (
        <div className="absolute -top-3 right-6 rounded-full bg-zinc-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">Most popular</div>
      )}
      <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${accent || 'text-zinc-500'}`}>{name}</div>
      <div className="mt-2 text-sm text-zinc-600" style={{ textWrap: 'pretty' }}>{blurb}</div>
      <div className="mt-6 flex items-baseline gap-1">
        <span className="text-[44px] font-semibold leading-none tracking-tight text-zinc-900 tabular">{price}</span>
        {period && <span className="text-sm text-zinc-500">{period}</span>}
      </div>
      <div className="mt-6 h-px bg-zinc-200/80" />
      <ul className="mt-6 flex-1 space-y-3 text-sm text-zinc-700">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className={`mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full ${highlight ? 'bg-brand-500/15 text-brand-600' : 'bg-emerald-500/15 text-emerald-600'}`}><I.Check size={11} strokeWidth={3} /></span>
            <span style={{ textWrap: 'pretty' }}>{f}</span>
          </li>
        ))}
      </ul>
      <a href="#" className={`mt-7 inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium ${highlight ? 'bg-zinc-900 text-white hover:bg-zinc-800' : 'border border-zinc-300 bg-white text-zinc-900 hover:border-zinc-400'}`}>
        {cta} <I.Arrow size={14} />
      </a>
    </div>
  );
}

function ComparisonRow({ feature, values, last }) {
  return (
    <tr className={last ? '' : 'border-b border-zinc-200'}>
      <td className="py-3.5 text-sm text-zinc-700">{feature}</td>
      {values.map((v, i) => (
        <td key={i} className="py-3.5 text-center text-sm text-zinc-700">
          {v === true ? <I.Check size={16} strokeWidth={2.5} className="mx-auto text-emerald-600" /> :
           v === false ? <I.X size={16} className="mx-auto text-zinc-300" /> :
           <span className="tabular">{v}</span>}
        </td>
      ))}
    </tr>
  );
}

function PricingPage() {
  usePageReveal();
  const [billing, setBilling] = useState('annual');

  const tiers = [
    {
      name: 'Free',
      price: '₹0',
      period: 'forever',
      blurb: 'For freelancers and side businesses just getting off Excel.',
      features: ['1 user', 'Up to 50 invoices/month', 'GST invoicing & e-Invoice', 'Bank import (CSV)', 'P&L and Balance Sheet', 'Mobile apps included'],
      cta: 'Start free',
      accent: 'text-zinc-500',
    },
    {
      name: 'Growth',
      price: billing === 'annual' ? '₹999' : '₹1,199',
      period: '/month, billed ' + (billing === 'annual' ? 'annually' : 'monthly'),
      blurb: 'For SMEs running real books — invoicing, recon, GST filing.',
      features: ['Up to 5 users', 'Unlimited invoices', 'Live bank feeds + AI matching', 'GSTR-1, 3B & 2B filing', 'AP bills with OCR', 'AI assistant (English, Hindi, Tamil)', 'Email + chat support'],
      cta: 'Start 14-day trial',
      highlight: true,
      accent: 'text-brand-600',
    },
    {
      name: 'Scale',
      price: billing === 'annual' ? '₹2,499' : '₹2,999',
      period: '/month, billed ' + (billing === 'annual' ? 'annually' : 'monthly'),
      blurb: 'For growing companies with multi-branch and approval needs.',
      features: ['Up to 20 users', 'Multi-branch / multi-GSTIN', 'Approval workflows', 'Custom roles & audit trail', 'API access (REST + webhooks)', 'Tally export + CA portal', 'Priority support, 4-hour SLA'],
      cta: 'Start 14-day trial',
      accent: 'text-violet-600',
    },
    {
      name: 'CA Practice',
      price: '₹4,999',
      period: '/month, flat',
      blurb: 'For Chartered Accountants managing 10–100 client books.',
      features: ['Unlimited CA users', 'Up to 100 client orgs', 'Multi-client switcher', 'Bulk GSTR filing', 'Read-only client logins', 'Tally-compatible export', 'Dedicated success manager'],
      cta: 'Talk to sales',
      accent: 'text-emerald-600',
    },
  ];

  const matrix = [
    { feature: 'Users', values: ['1', '5', '20', 'Unlimited (CA)'] },
    { feature: 'Invoices / month', values: ['50', 'Unlimited', 'Unlimited', 'Unlimited'] },
    { feature: 'GST e-Invoice + e-Way bill', values: [true, true, true, true] },
    { feature: 'Live bank feeds', values: [false, true, true, true] },
    { feature: 'AI bill OCR', values: [false, true, true, true] },
    { feature: 'GSTR-2B reconciliation', values: [false, true, true, true] },
    { feature: 'Multi-branch / multi-GSTIN', values: [false, false, true, true] },
    { feature: 'Approval workflows', values: [false, false, true, true] },
    { feature: 'API access', values: [false, false, true, true] },
    { feature: 'Multi-client switcher', values: [false, false, false, true] },
    { feature: 'Tally-compatible export', values: [true, true, true, true] },
    { feature: 'Support SLA', values: ['Community', 'Email + chat', 'Priority, 4 hr', 'Dedicated CSM'] },
  ];

  const faqs = [
    ['Is the free plan really free?', 'Yes — forever free for one user, up to 50 invoices a month, GST e-invoicing included. No credit card. We do not throttle or expire it.'],
    ['Do you charge per invoice?', 'No. Pricing is per user, per month. Send as many invoices, e-way bills, or GST returns as you like on Growth and above.'],
    ['Will the price change after the trial?', 'No. The trial is on Growth or Scale — at the end you choose to continue at the listed price, downgrade to Free, or cancel. No auto-charge surprises.'],
    ['Can I migrate from Tally / Zoho / Vyapar?', 'Yes. We import Tally XML, Zoho Books exports, and Vyapar JSON. Most migrations take under 30 minutes; our team will help on Growth and above.'],
    ['Do you store data in India?', 'Yes — all data is hosted on AWS Mumbai (ap-south-1), encrypted at rest with AES-256 and in transit with TLS 1.3. We are MeitY-empanelled.'],
    ['What if I have multiple GSTINs?', 'Scale and CA Practice support multi-GSTIN under one company. File GSTR-1 / 3B per GSTIN, consolidate financials at the parent.'],
    ['Is there an annual discount?', 'Yes — pay annually and save ~17% across paid plans. Toggle billing above to see annual pricing.'],
    ['Do you have an enterprise plan?', 'For >20 users, multi-entity consolidation, SSO/SAML, on-prem export, or custom SLAs — talk to sales.'],
  ];

  return (
    <>
      <PageNav active="Pricing" />
      <main>
        <PageHero
          eyebrow="PRICING"
          title="Simple pricing."
          titleItalic="Free forever, then fair."
          subtitle="No per-invoice fees. No per-GSTIN surprises. Pay only when you outgrow Free — and pay roughly half of what Tally or Zoho Books charge."
        />

        {/* Billing toggle */}
        <div className="mx-auto -mt-2 mb-10 flex justify-center">
          <div className="reveal inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white p-1 shadow-sm">
            {['monthly', 'annual'].map(b => (
              <button key={b} onClick={() => setBilling(b)}
                className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${billing === b ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'}`}>
                {b === 'monthly' ? 'Monthly' : 'Annual'}
                {b === 'annual' && <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${billing === b ? 'bg-emerald-400/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>−17%</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Tiers */}
        <section className="mx-auto max-w-[1200px] px-5 pb-20 lg:px-8">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            {tiers.map(t => <PriceCard key={t.name} {...t} />)}
          </div>
          <div className="reveal mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5"><I.CheckCircle size={13} className="text-emerald-600" /> 14-day free trial on paid plans</span>
            <span className="inline-flex items-center gap-1.5"><I.CheckCircle size={13} className="text-emerald-600" /> No credit card required</span>
            <span className="inline-flex items-center gap-1.5"><I.CheckCircle size={13} className="text-emerald-600" /> Cancel any time</span>
            <span className="inline-flex items-center gap-1.5"><I.CheckCircle size={13} className="text-emerald-600" /> GST included on Indian billing</span>
          </div>
        </section>

        {/* Comparison */}
        <section className="bg-zinc-50 py-20">
          <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
            <div className="reveal max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">COMPARE PLANS</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 lg:text-4xl">Every feature, side-by-side.</h2>
            </div>
            <div className="reveal mt-10 overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <table className="w-full min-w-[680px]">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/60">
                    <th className="w-[34%] py-4 pl-6 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Feature</th>
                    {['Free', 'Growth', 'Scale', 'CA Practice'].map((p, i) => (
                      <th key={p} className={`py-4 text-center text-xs font-semibold uppercase tracking-wider ${i === 1 ? 'text-brand-600' : 'text-zinc-700'}`}>{p}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((m, i) => <ComparisonRow key={m.feature} feature={m.feature} values={m.values} last={i === matrix.length - 1} />)}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section className="py-20">
          <div className="mx-auto max-w-[1000px] px-5 lg:px-8">
            <div className="reveal text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">FAQs</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 lg:text-4xl">Questions, answered.</h2>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 md:grid-cols-2">
              {faqs.map(([q, a]) => (
                <div key={q} className="reveal bg-white p-6">
                  <div className="text-[15px] font-semibold text-zinc-900">{q}</div>
                  <div className="mt-2 text-sm leading-relaxed text-zinc-600" style={{ textWrap: 'pretty' }}>{a}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <FooterCTA />
      </main>
      <PageFooter />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<PricingPage />);
