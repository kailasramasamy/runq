import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, Hash, Landmark, Sparkles, type LucideIcon } from 'lucide-react';
import { WindowChrome } from '@/components/mockups/window-chrome';
import { MockInvoice } from '@/components/mockups/mock-invoice';
import { MockBankRecon } from '@/components/mockups/mock-bank-recon';
import { MockGst } from '@/components/mockups/mock-gst';
import { MockAiChat } from '@/components/mockups/mock-ai-chat';

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
  Mock: () => React.JSX.Element;
  copy: string;
}

const tabs: Tab[] = [
  { id: 'invoice', label: 'GST Invoice',    icon: FileText, Mock: MockInvoice,    copy: 'Sub-30-second flow with auto-IRN, customer GSTIN verify, HSN suggestions.' },
  { id: 'recon',   label: 'Bank Recon',     icon: Landmark, Mock: MockBankRecon,  copy: 'Live HDFC, ICICI, Axis, SBI feeds. AI matches 90%+ on day one.' },
  { id: 'gstr',    label: 'GSTR-2B Match',  icon: Hash,     Mock: MockGst,        copy: 'Vendor-by-vendor diff against your bills. ITC mismatches surface instantly.' },
  { id: 'ai',      label: 'AI Assistant',   icon: Sparkles, Mock: MockAiChat,     copy: 'Ask in English, Hindi, Tamil. Reads your books and answers with real data.' },
];

export function ProductShowcase() {
  const [active, setActive] = useState('invoice');
  const prevIndex = useRef(0);
  const activeTab = tabs.find((t) => t.id === active)!;
  const activeIndex = tabs.findIndex((t) => t.id === active);
  const direction = activeIndex >= prevIndex.current ? 1 : -1;
  prevIndex.current = activeIndex;
  const ActiveMock = activeTab.Mock;

  return (
    <section id="showcase" className="relative overflow-hidden bg-zinc-950 py-24 text-zinc-100">
      <div className="aurora aurora-dark" />
      <div className="absolute inset-0 dot-grid opacity-50" />
      <div className="relative mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="reveal mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">The product</div>
          <h2 className="mt-3 text-4xl tracking-tight lg:text-5xl">
            One platform.
            <br />
            <span className="font-display italic grad-text-light">Every finance moment.</span>
          </h2>
        </div>

        {/* Pill tabs */}
        <div className="reveal mt-10 flex flex-wrap items-center justify-center gap-2">
          {tabs.map((t) => {
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={
                  isActive
                    ? 'inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-4 py-2 text-sm text-brand-100 shadow-[0_0_30px_-5px_oklch(0.59_0.20_264_/_0.4)] transition-all'
                    : 'inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-sm text-zinc-400 transition-all hover:border-zinc-700 hover:text-zinc-200'
                }
              >
                <t.icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        <p
          className="reveal mx-auto mt-5 max-w-xl text-center text-sm text-zinc-400"
          style={{ textWrap: 'pretty' }}
        >
          {activeTab.copy}
        </p>

        {/* Mockup */}
        <div className="reveal relative mt-10">
          <div
            className="absolute inset-x-0 -top-12 -bottom-20 -z-10"
            style={{
              background: 'radial-gradient(50% 40% at 50% 50%, oklch(0.59 0.22 264 / .35), transparent 70%)',
              filter: 'blur(40px)',
            }}
          />
          <div className="mockup-shadow mx-auto max-w-[1080px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-1.5">
            <div className="-mx-5 overflow-x-auto pb-2 md:mx-0 md:overflow-visible">
              <div className="min-w-[960px] md:min-w-0">
                <WindowChrome url={`app.runq.in/${active}`} height={580}>
                  <AnimatePresence mode="wait" initial={false} custom={direction}>
                    <motion.div
                      key={active}
                      custom={direction}
                      initial={{ x: 60 * direction, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -60 * direction, opacity: 0 }}
                      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
                      className="h-full"
                    >
                      <ActiveMock />
                    </motion.div>
                  </AnimatePresence>
                </WindowChrome>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
