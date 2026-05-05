import { Bell, Camera, CheckCircle2, Cloud, Fingerprint, Plus, type LucideIcon } from 'lucide-react';
import { PhoneFrame, MobileCashScreen, MobileInvoiceScreen, MobileScanScreen } from '@/components/mockups/mock-phone';

interface Win {
  Icon: LucideIcon;
  title: string;
  sub: string;
}

const wins: Win[] = [
  { Icon: Plus,        title: 'Invoice from your phone', sub: 'Save templates. Generate IRN. Send WhatsApp link in 22 seconds.' },
  { Icon: Camera,      title: 'Snap bills, not folders', sub: 'AI reads vendor, GSTIN, HSN, totals. Drops it straight into AP.' },
  { Icon: CheckCircle2, title: 'Approve on the go',     sub: 'Tap-through approvals with audit trail. No more "send me on email".' },
  { Icon: Bell,        title: 'Real-time alerts',       sub: 'Big invoice paid, bill due tomorrow, GST deadline in 3 days.' },
  { Icon: Cloud,       title: 'Offline drafts',         sub: "Works in patchy Tier-2 connectivity. Syncs when you're back." },
  { Icon: Fingerprint, title: 'Biometric security',     sub: 'Face ID / fingerprint for the app and large transactions.' },
];

function AppleGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16 4a4 4 0 0 1-3 4M11 9c-3.5 0-7 3-7 7.5 0 4 3 7.5 5 7.5 1.5 0 2-1 3.5-1s2 1 3.5 1c1.7 0 5-3 5-8 0-2.5-2-4-3.5-4S13 11 11 9Z" stroke="currentColor" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MobileBand() {
  return (
    <section id="mobile" className="relative bg-white py-24">
      <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="grid grid-cols-12 items-center gap-6 md:gap-10">
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
                <PhoneFrame
                  screen={<MobileScanScreen />}
                  screenClass="bg-zinc-950"
                  statusBarClass="bg-zinc-950 text-white"
                  darkScreen
                />
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="col-span-12 lg:col-span-5">
            <div className="reveal text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
              Mobile-first, not mobile-also
            </div>
            <h2 className="reveal mt-3 text-4xl tracking-tight text-zinc-900 lg:text-5xl">
              Real apps for <span className="font-display italic">owners on the move.</span>
            </h2>
            <p className="reveal mt-3 text-zinc-600" style={{ textWrap: 'pretty' }}>
              Tally needs a desktop. Zoho's app feels like a cramped browser. We built ours native — for the founder approving a payment from a factory in Hosur.
            </p>

            <ul className="reveal mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {wins.map((w) => (
                <li key={w.title} className="flex gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                    <w.Icon size={14} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">{w.title}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-zinc-600">{w.sub}</div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="reveal mt-7 flex flex-wrap gap-3">
              <a href="#" className="inline-flex items-center gap-2.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-white">
                <AppleGlyph />
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
