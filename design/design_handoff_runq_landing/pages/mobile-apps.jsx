// Mobile apps product page
const { PageNav, PageFooter, usePageReveal, PageHero, FooterCTA } = window.Shell;
const { IconGrid, Section, GreySection, DarkSection, SectionHead } = window.Blocks;

function PhoneFrame({ children, tilt = 0 }) {
  return (
    <div className="relative w-[260px]" style={{ transform: `rotate(${tilt}deg)` }}>
      <div className="phone-bezel rounded-[40px] p-[9px]">
        <div className="overflow-hidden rounded-[32px] bg-white">
          <div className="flex items-center justify-between bg-zinc-50 px-5 pt-3 pb-2 text-[11px] font-semibold text-zinc-700">
            <span>9:41</span>
            <span className="flex items-center gap-1"><I.Signal size={11} /><I.Wifi size={11} /><I.Battery size={14} /></span>
          </div>
          {children}
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
        <PageHero eyebrow="PRODUCT · MOBILE APPS" title="Real native apps." titleItalic="Not a cramped web view." subtitle="iOS and Android. Built by people who use them. Offline drafts, biometric unlock, push-pulled bank statements, and a Quick Invoice flow that finishes in three taps." />

        <Section>
          <div className="flex justify-center gap-6 lg:gap-10">
            <PhoneFrame tilt={-6}>
              <div className="px-5 py-4">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Today, 02 May</div>
                <div className="mt-1 text-[15px] font-semibold text-zinc-900">Cash position</div>
                <div className="mt-3 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 p-4 text-white">
                  <div className="text-[10px] uppercase tracking-wider opacity-80">Available</div>
                  <div className="mt-1 text-2xl font-semibold tabular">₹47.2L</div>
                  <div className="mt-2 text-[10px] opacity-80">Across 4 accounts · synced 2 hr ago</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-zinc-50 p-3">
                    <div className="text-[10px] uppercase text-zinc-500">Receivable</div>
                    <div className="text-sm font-semibold text-emerald-700 tabular">+₹12.4L</div>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-3">
                    <div className="text-[10px] uppercase text-zinc-500">Payable</div>
                    <div className="text-sm font-semibold text-rose-700 tabular">−₹6.8L</div>
                  </div>
                </div>
              </div>
            </PhoneFrame>
            <PhoneFrame>
              <div className="px-5 py-4">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Quick Invoice</div>
                <div className="mt-1 text-[15px] font-semibold text-zinc-900">New invoice</div>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="rounded-lg border border-zinc-200 px-3 py-2.5"><div className="text-[10px] uppercase text-zinc-400">To</div><div className="font-medium">Saraswati Cotton Mills</div></div>
                  <div className="rounded-lg border border-zinc-200 px-3 py-2.5"><div className="text-[10px] uppercase text-zinc-400">Item</div><div className="font-medium">Premium yarn 40s</div></div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2.5 tabular"><div className="flex justify-between text-zinc-500"><span>Total</span><span className="font-semibold text-zinc-900">₹20,956.80</span></div></div>
                  <button className="mt-1 w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white">Send via WhatsApp</button>
                </div>
              </div>
            </PhoneFrame>
            <PhoneFrame tilt={6}>
              <div className="px-5 py-4">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Approvals</div>
                <div className="mt-1 text-[15px] font-semibold text-zinc-900">3 waiting</div>
                <div className="mt-3 space-y-2">
                  {[['Patel Tools', '₹84,200', 'OCR'],['Mahindra Logistics', '₹2,14,500', 'Email'],['Voltas AC Service', '₹14,100', 'OCR']].map(([v, a, src]) => (
                    <div key={v} className="rounded-lg border border-zinc-200 p-3">
                      <div className="flex items-baseline justify-between"><div className="text-xs font-semibold text-zinc-900">{v}</div><div className="text-sm font-semibold tabular text-zinc-900">{a}</div></div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500"><span>{src} · 99% confidence</span><button className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">Approve</button></div>
                    </div>
                  ))}
                </div>
              </div>
            </PhoneFrame>
          </div>
        </Section>

        <GreySection>
          <SectionHead eyebrow="MOBILE-FIRST WINS" title="Six things you can do on the road." />
          <div className="mt-12">
            <IconGrid items={[
              { Ic: I.Receipt, title: 'Invoice from your phone', body: 'Three taps. WhatsApp delivery. Done before you finish the chai.' },
              { Ic: I.Camera, title: 'Snap vendor bills', body: 'OCR extracts GSTIN, items, taxes. Posts to the right ledger automatically.' },
              { Ic: I.CheckCircle, title: 'Approve from anywhere', body: 'Push notifications with bill preview. Approve or reject without opening the laptop.' },
              { Ic: I.Bell, title: 'Real-time alerts', body: 'Big credit, big debit, GST deadline, low cash — only the alerts that matter.' },
              { Ic: I.Cloud, title: 'Offline drafts', body: 'No signal in your warehouse? Draft invoices and bills, they sync when you reconnect.' },
              { Ic: I.Fingerprint, title: 'Biometric unlock', body: 'Face ID, fingerprint. PIN fallback. Auto-lock after 60 seconds. Books stay yours.' },
            ]} accent="brand" />
          </div>
        </GreySection>

        <DarkSection>
          <div className="reveal flex flex-col items-center gap-6 text-center">
            <h2 className="text-3xl font-semibold tracking-tight lg:text-5xl"><span>Get the apps.</span> <span className="font-display italic grad-text-light">Use the books.</span></h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a href="#" className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-zinc-900"><I.Apple size={18} /><span>App Store</span></a>
              <a href="#" className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100"><I.Play size={16} /><span>Google Play</span></a>
            </div>
          </div>
        </DarkSection>

        <FooterCTA />
      </main>
      <PageFooter />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<Page />);
