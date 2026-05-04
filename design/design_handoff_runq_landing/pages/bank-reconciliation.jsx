// Bank reconciliation product page
const { PageNav, PageFooter, usePageReveal, PageHero, FooterCTA } = window.Shell;
const { FeatureRow, IconGrid, Section, GreySection, DarkSection, SectionHead } = window.Blocks;

function ReconMockup() {
  const rows = [
    { date: '02 May', desc: 'NEFT-IDIB-INF/0125892/SARASWATI', amt: '+₹67,401.60', match: 'INV-2026-0214', conf: 99 },
    { date: '02 May', desc: 'UPI/CR/MERCURY/SCAN AT COUNTER', amt: '+₹4,250.00', match: 'POS sale · auto', conf: 96 },
    { date: '01 May', desc: 'BANGALORE ELEC SUPPLY', amt: '−₹18,420.00', match: 'BESCOM bill (recurring)', conf: 92 },
    { date: '01 May', desc: 'IMPS/3105/SHRI BALAJI', amt: '−₹2,12,000', match: 'PO-2026-0418 (Shri Balaji)', conf: 88 },
    { date: '30 Apr', desc: 'CASH WITHDRAWAL ATM', amt: '−₹50,000', match: 'Needs review', conf: 0 },
  ];
  return (
    <div className="rounded-2xl bg-zinc-950 p-1.5 mockup-shadow">
      <div className="overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-white/10">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3 text-xs text-zinc-400">
          <div className="flex gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
          </div>
          <span className="ml-2">Bank reconciliation · HDFC current ····4821</span>
          <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">94% auto-matched</span>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-white/[0.03] text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Date</th>
              <th className="px-4 py-2.5 text-left font-medium">Description</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              <th className="px-4 py-2.5 text-left font-medium">AI match</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="px-4 py-3 text-zinc-400">{r.date}</td>
                <td className="px-4 py-3 font-mono text-[10.5px] text-zinc-300">{r.desc}</td>
                <td className={`px-4 py-3 text-right font-medium ${r.amt.startsWith('+') ? 'text-emerald-400' : 'text-zinc-200'}`}>{r.amt}</td>
                <td className="px-4 py-3">
                  {r.conf > 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`inline-flex h-1.5 w-1.5 rounded-full ${r.conf > 95 ? 'bg-emerald-400' : r.conf > 90 ? 'bg-emerald-400/70' : 'bg-amber-400'}`} />
                      <span className="text-zinc-300">{r.match}</span>
                      <span className="text-zinc-500">{r.conf}%</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-amber-300"><I.Sparkle size={11} /> {r.match}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Page() {
  usePageReveal();
  return (
    <>
      <PageNav />
      <main>
        <PageHero
          eyebrow="PRODUCT · BANK RECONCILIATION"
          title="Reconcile a month"
          titleItalic="in fifteen minutes."
          subtitle="Live bank feeds from 60+ Indian banks. AI matches transactions to invoices, bills, and ledgers — you approve the edge cases. That's it."
        />

        <Section><ReconMockup /></Section>

        <GreySection>
          <SectionHead eyebrow="HOW IT WORKS" title="Three steps. Mostly the AI's." />
          <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {[
              ['01', 'Connect once', 'Link any current or savings account through our regulated AA / bank-feed partners. SBI, HDFC, ICICI, Axis, Kotak, Yes — 60+ supported.'],
              ['02', 'Live sync, automatically', 'Statements pull every 6 hours. No CSV uploads, no screen-scraping. Read-only, RBI-compliant rails.'],
              ['03', 'AI proposes matches', 'Our matcher pairs ~94% of lines on day one — to invoices, bills, recurring expenses, or ledgers. You confirm or correct in one click.'],
            ].map(([n, t, b]) => (
              <div key={n} className="reveal lift rounded-2xl border border-zinc-200 bg-white p-7">
                <div className="font-display text-3xl text-brand-500/60">{n}</div>
                <div className="mt-3 text-lg font-semibold text-zinc-900">{t}</div>
                <div className="mt-2 text-sm text-zinc-600" style={{ textWrap: 'pretty' }}>{b}</div>
              </div>
            ))}
          </div>
        </GreySection>

        <Section>
          <SectionHead eyebrow="WHY IT WORKS HERE" title="Built for Indian bank statement noise." subtitle="Most matchers fail on Indian narration codes. Ours is trained on millions of them." />
          <div className="mt-12">
            <IconGrid items={[
              { Ic: I.Sparkle, title: 'Trained on Indian narration', body: 'NEFT/IMPS/UPI codes, PSU bank quirks, abbreviations like "INF/" and "TRTR/" — handled natively.' },
              { Ic: I.Refresh, title: 'Recurring detection', body: 'Rent, utilities, salaries — runQ learns the pattern after two cycles and auto-categorises every following one.' },
              { Ic: I.GitBranch, title: 'Split & part-payments', body: 'A single bank credit can settle three invoices. A single payout can cover four bills. Splits are first-class.' },
              { Ic: I.Coins, title: 'Multi-bank, multi-currency', body: 'Reconcile rupee accounts and EEFC/USD accounts side-by-side. Forex differences booked correctly.' },
              { Ic: I.Shield, title: 'Read-only access', body: 'Bank credentials never touch our servers. Connections are revocable from your bank portal at any time.' },
              { Ic: I.Bot, title: 'Smart suggestions', body: 'Unmatched lines get an AI explanation: "Looks like a refund to vendor Patel Tools — book against bill #B-42?"' },
            ]} />
          </div>
        </Section>

        <DarkSection>
          <SectionHead eyebrow="THE NUMBERS" title="What our beta books look like." accent="violet" />
          <div className="reveal mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4">
            {[['94.3%', 'Avg auto-match rate'], ['6.2 hrs', 'Saved per week'], ['60+', 'Banks supported'], ['<6 hrs', 'Statement sync interval']].map(([v, k]) => (
              <div key={k} className="bg-zinc-950 p-6">
                <div className="text-3xl font-semibold tracking-tight text-white tabular">{v}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-zinc-500">{k}</div>
              </div>
            ))}
          </div>
        </DarkSection>

        <FooterCTA />
      </main>
      <PageFooter />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<Page />);
