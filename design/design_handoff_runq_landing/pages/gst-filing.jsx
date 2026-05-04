// GST filing product page
const { PageNav, PageFooter, usePageReveal, PageHero, FooterCTA } = window.Shell;
const { IconGrid, Section, GreySection, DarkSection, SectionHead } = window.Blocks;

function GSTRMockup() {
  return (
    <div className="rounded-2xl bg-zinc-950 p-1.5 mockup-shadow">
      <div className="rounded-xl ring-1 ring-white/10">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3 text-xs">
          <div className="flex gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
          </div>
          <span className="text-zinc-400">GSTR-2B Reconciliation · Apr 2026 · 27AABCQ8910K1Z3</span>
          <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">3 mismatches</span>
        </div>
        <div className="grid grid-cols-12 gap-5 p-5">
          <div className="col-span-7 overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03] text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Vendor</th>
                  <th className="px-3 py-2 text-right font-medium">Books</th>
                  <th className="px-3 py-2 text-right font-medium">2B</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="tabular text-zinc-300">
                {[
                  ['Patel Tools, Ahmedabad', '₹84,200', '₹84,200', 'matched'],
                  ['Mahindra Logistics', '₹2,14,500', '₹2,14,500', 'matched'],
                  ['Reliance Polymers', '₹1,45,000', '—', 'missing-2B'],
                  ['Bharat Petroleum', '₹52,800', '₹52,200', 'value-diff'],
                  ['Voltas AC Service', '₹14,100', '₹14,100', 'matched'],
                ].map(([v, b, t, s], i) => {
                  const tone = s === 'matched' ? 'text-emerald-400' : s === 'value-diff' ? 'text-amber-300' : 'text-rose-300';
                  const dot = s === 'matched' ? 'bg-emerald-400' : s === 'value-diff' ? 'bg-amber-300' : 'bg-rose-300';
                  return (
                    <tr key={i} className="border-t border-white/5">
                      <td className="px-3 py-2 text-zinc-200">{v}</td>
                      <td className="px-3 py-2 text-right">{b}</td>
                      <td className="px-3 py-2 text-right">{t}</td>
                      <td className={`px-3 py-2 ${tone}`}><span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${dot}`} />{s}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="col-span-5 space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">ITC summary</div>
              <div className="mt-2 space-y-1.5 text-xs tabular text-zinc-300">
                <div className="flex justify-between"><span className="text-zinc-500">Eligible (matched)</span><span>₹3,12,840</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Pending (missing 2B)</span><span className="text-amber-300">₹26,100</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Difference</span><span className="text-rose-300">₹108</span></div>
                <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-2 text-zinc-200">
                  <span>Net claimable</span><span className="text-base font-semibold">₹3,12,840</span>
                </div>
              </div>
            </div>
            <button className="w-full rounded-md bg-brand-500 px-3 py-2 text-xs font-semibold text-white">File GSTR-3B →</button>
          </div>
        </div>
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
          eyebrow="PRODUCT · GST FILING"
          title="GSTR-1, 3B, 2B —"
          titleItalic="all in one place."
          subtitle="File your returns directly from runQ. Auto-prepared from your books, with a 2B reconciliation that catches mismatches before they become notices."
        />

        <Section><GSTRMockup /></Section>

        <GreySection>
          <SectionHead eyebrow="WHAT'S COVERED" title="Every return your business actually files." />
          <div className="mt-12">
            <IconGrid items={[
              { Ic: I.FileText, title: 'GSTR-1 (outward)', body: 'Auto-prepared from invoices, with state-wise B2B/B2C splits, HSN summary, and amendments. One-click submit to GSTN.' },
              { Ic: I.FileText, title: 'GSTR-3B (summary)', body: 'Auto-computed from outward + ITC. We highlight section 3.1 and 4 for your review before filing.' },
              { Ic: I.GitBranch, title: 'GSTR-2B reconciliation', body: 'Vendor-by-vendor compare. Missing-2B, value mismatches, and rate differences flagged with AI explanations.' },
              { Ic: I.Refresh, title: 'CMP-08 & GSTR-4', body: 'Composition scheme returns supported end-to-end. Quarterly auto-fill from your books.' },
              { Ic: I.Globe, title: 'GSTR-9 / 9C', body: 'Annual return prep with ledger-level drilldown for your auditor. CA-friendly export.' },
              { Ic: I.ShieldCheck, title: 'Multi-GSTIN', body: 'Branches in Maharashtra, Karnataka, Tamil Nadu? File each GSTIN separately, consolidate financials at the parent.' },
            ]} />
          </div>
        </GreySection>

        <DarkSection>
          <SectionHead eyebrow="DEADLINE COMFORT" title="Quiet on the 11th. Quiet on the 20th." accent="violet" />
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              ['Reminders that respect you', 'Three nudges before the deadline. Email, in-app, and a single WhatsApp ping. No spam.'],
              ['Pre-filing checks', 'We block the submit button if your ledger does not balance, or if a high-value 2B mismatch is unresolved.'],
              ['Audit trail', 'Every return saves the JSON we sent to GSTN, the ARN we got back, and who clicked submit. Forever.'],
            ].map(([t, b], i) => (
              <div key={i} className="reveal rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="text-base font-semibold text-white">{t}</div>
                <div className="mt-2 text-sm text-zinc-400">{b}</div>
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
