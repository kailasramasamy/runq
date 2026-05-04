// Bills & expenses product page
const { PageNav, PageFooter, usePageReveal, PageHero, FooterCTA } = window.Shell;
const { IconGrid, Section, GreySection, DarkSection, SectionHead } = window.Blocks;

function OCRMockup() {
  return (
    <div className="grid grid-cols-12 gap-5">
      <div className="col-span-12 lg:col-span-5">
        <div className="relative mx-auto w-[280px]">
          <div className="phone-bezel rounded-[42px] p-[10px]">
            <div className="overflow-hidden rounded-[34px] bg-zinc-900">
              <div className="flex items-center justify-between bg-zinc-900 px-5 pt-3 pb-2 text-[11px] font-semibold text-zinc-300">
                <span>9:41</span>
                <span className="flex items-center gap-1"><I.Signal size={11} /><I.Wifi size={11} /><I.Battery size={14} /></span>
              </div>
              <div className="px-5 py-2 text-[11px] text-zinc-500">Capture bill</div>
              <div className="mx-3 h-[300px] rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-700 ring-1 ring-white/10 p-4 relative">
                <div className="absolute inset-3 rounded-xl border-2 border-dashed border-brand-400/60" />
                <div className="absolute inset-x-6 top-10 space-y-1.5 text-[10px] text-zinc-300/80 font-mono">
                  <div className="font-bold text-zinc-100">PATEL TOOLS</div>
                  <div>GSTIN 24ABCDE1234F1Z5</div>
                  <div className="mt-3">Inv. No: PT/2026/0418</div>
                  <div>Date: 28-Apr-2026</div>
                  <div className="mt-3 border-t border-white/10 pt-2">M.S. plates · 12 nos · ₹70,200</div>
                  <div>CGST 9% ₹6,318 / SGST 9% ₹6,318</div>
                  <div className="mt-3 font-bold text-emerald-300">Total ₹84,200 (incl. GST)</div>
                </div>
              </div>
              <div className="px-3 py-3">
                <button className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-500 py-2.5 text-xs font-semibold text-white"><I.Camera size={13} /> Snap & extract</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="col-span-12 lg:col-span-7">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl shadow-brand-500/10">
          <div className="flex items-center gap-2"><span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">EXTRACTED</span><span className="text-xs text-zinc-500">99.2% confidence · 1.4s</span></div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            {[
              ['Vendor', 'Patel Tools'],
              ['GSTIN', '24ABCDE1234F1Z5'],
              ['Bill No.', 'PT/2026/0418'],
              ['Date', '28 Apr 2026'],
              ['Place of supply', 'Karnataka'],
              ['HSN', '7208'],
              ['Taxable value', '₹70,200'],
              ['CGST + SGST', '₹6,318 + ₹6,318'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-zinc-50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">{k}</div>
                <div className="mt-0.5 font-medium text-zinc-900 tabular">{v}</div>
              </div>
            ))}
            <div className="col-span-2 rounded-lg bg-brand-50 px-3 py-2.5 ring-1 ring-brand-500/20">
              <div className="text-[10px] uppercase tracking-wider text-brand-700">Suggested ledger</div>
              <div className="mt-0.5 font-medium text-zinc-900">Raw Materials · M.S. Plates (used 14 times)</div>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <button className="flex-1 rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white">Approve & post</button>
            <button className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700">Edit</button>
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
        <PageHero eyebrow="PRODUCT · BILLS & EXPENSES" title="Photograph the bill." titleItalic="That's the entry." subtitle="OCR built for Indian vendor bills. We read GSTIN, HSN, line items, and tax splits — and post the entry to the right ledger." />

        <Section><OCRMockup /></Section>

        <GreySection>
          <SectionHead eyebrow="THE CAPTURE" title="Five ways bills get into runQ." />
          <div className="mt-12">
            <IconGrid items={[
              { Ic: I.Camera, title: 'Snap on mobile', body: 'Phone camera, with on-device crop and de-skew. Works on physical and PDF bills.' },
              { Ic: I.Inbox, title: 'Forward an email', body: 'bills@yourorg.runq.in inbox. PDFs and images are extracted automatically.' },
              { Ic: I.Cloud, title: 'WhatsApp the bill', body: 'A vendor sends a bill on WhatsApp? Forward to runQ — extracted in 30 seconds.' },
              { Ic: I.Download, title: 'Drag & drop on web', body: 'Upload a folder of PDFs. We extract, dedupe, and queue for approval.' },
              { Ic: I.GitBranch, title: 'API & vendor portal', body: 'Bigger vendors can push bills directly via our API or their own runQ supplier portal.' },
              { Ic: I.Sparkle, title: 'AI categorisation', body: 'After two bills from a vendor, runQ proposes the ledger. After five, it auto-posts.' },
            ]} accent="emerald" />
          </div>
        </GreySection>

        <DarkSection>
          <SectionHead eyebrow="APPROVAL FLOW" title="Right amount of process. Not more." accent="violet" />
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              ['Set thresholds', 'Below ₹10,000 — auto-post. Above — owner approves. Above ₹1L — owner + finance head.'],
              ['Approve on mobile', 'Push notification, snap-judgement approval. Or open the bill, see the line items, then decide.'],
              ['Audit-ready', 'Every approval logs the user, the timestamp, and the version of the bill. Tally export carries it through.'],
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
