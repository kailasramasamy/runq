import { type CSSProperties, type ReactNode } from 'react';
import {
  ArrowRight, Battery, Camera, CheckCircle2, Plus, Signal, Sparkles, TrendingUp, Wifi,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhoneFrameProps {
  /** Main screen content (rendered below the status bar). Either `screen` or `children` may be used. */
  screen?: ReactNode;
  children?: ReactNode;
  /** Rotation in degrees */
  tilt?: number;
  /** Outer phone width in px (default 260) */
  width?: number;
  /** Optional caption shown below the phone */
  label?: string;
  /** Small caption shown above status bar inside the chrome */
  showStatusBar?: boolean;
  /** Use light home-indicator (for predominantly dark screens) */
  darkScreen?: boolean;
  /** Status bar text color override */
  statusBarClass?: string;
  /** Screen container className (default: bg-white) */
  screenClass?: string;
}

export function PhoneFrame({
  screen, children, tilt = 0, width = 260, label,
  showStatusBar = true,
  darkScreen = false,
  statusBarClass,
  screenClass = 'bg-white',
}: PhoneFrameProps) {
  const wrapperStyle: CSSProperties = {
    width,
    transform: tilt ? `rotate(${tilt}deg)` : undefined,
  };
  return (
    <div className="phone-frame" style={wrapperStyle}>
      {/* Hardware side buttons */}
      <span className="phone-btn phone-btn-mute" />
      <span className="phone-btn phone-btn-volup" />
      <span className="phone-btn phone-btn-voldn" />
      <span className="phone-btn phone-btn-power" />

      <div className="phone-bezel rounded-[42px] p-[10px]">
        <div
          className={cn('relative overflow-hidden rounded-[34px]', screenClass)}
          style={{ minHeight: width * (19.5 / 9) }}
        >
          {/* Dynamic island */}
          <span className="phone-island" />

          {showStatusBar && (
            <div
              className={cn(
                'relative flex items-center justify-between px-5 pt-3 pb-1 text-[10px] font-semibold',
                statusBarClass ?? 'bg-white text-zinc-900',
              )}
            >
              <span className="z-30">9:41</span>
              <div className="z-30 flex items-center gap-1">
                <Signal size={11} />
                <Wifi size={11} />
                <Battery size={13} />
              </div>
            </div>
          )}

          {screen}
          {children}

          {/* Home indicator */}
          <span className={cn('phone-home-indicator', darkScreen && 'phone-home-indicator-light')} />
          {/* Subtle glass glare */}
          <span className="phone-screen-glare" />
        </div>
      </div>
      {label && (
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </div>
      )}
    </div>
  );
}

export function MobileCashScreen() {
  const quick: Array<[string, typeof Plus]> = [
    ['New invoice', Plus],
    ['Scan bill', Camera],
    ['Approve', CheckCircle2],
    ['Reports', TrendingUp],
  ];
  const events: Array<[string, string, string, 'emerald' | 'amber' | 'brand']> = [
    ['INV-428 paid', 'Bharat Polymers', '+₹4.72L', 'emerald'],
    ['Bill scanned', 'Reliance Foam', '−₹85K', 'amber'],
    ['Bank matched', 'HDFC ··4521', '47 txns', 'brand'],
  ];
  return (
    <div className="bg-zinc-50 px-4 py-3" style={{ minHeight: 460 }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] text-zinc-500">Saturday</div>
          <div className="text-base font-semibold">Hi, Ananya</div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-[10px] font-semibold text-white">
          AS
        </div>
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
        {quick.map(([n, Ic]) => (
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
          {events.map(([t, s, a, c]) => (
            <div key={t} className="flex items-center gap-2.5">
              <div
                className={
                  c === 'emerald'
                    ? 'h-7 w-7 rounded-lg bg-emerald-100'
                    : c === 'amber'
                    ? 'h-7 w-7 rounded-lg bg-amber-100'
                    : 'h-7 w-7 rounded-lg bg-brand-100'
                }
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium">{t}</div>
                <div className="truncate text-[9px] text-zinc-500">{s}</div>
              </div>
              <div
                className={
                  c === 'emerald'
                    ? 'text-[10px] font-semibold tabular text-emerald-600'
                    : c === 'amber'
                    ? 'text-[10px] font-semibold tabular text-zinc-700'
                    : 'text-[10px] font-semibold tabular text-brand-600'
                }
              >
                {a}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MobileInvoiceScreen() {
  const items: Array<[string, string, string]> = [
    ['HDPE Granules FG-2540', '1500 × ₹78.50', '₹1,17,750'],
    ['LDPE Roll 50µ', '850 × ₹122', '₹1,03,700'],
    ['Master Batch MB-K9', '120 × ₹410', '₹49,200'],
  ];
  return (
    <div className="bg-white px-4 py-3" style={{ minHeight: 460 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100">
            <ArrowRight size={13} className="rotate-180" />
          </div>
          <span className="text-sm font-semibold">Quick invoice</span>
        </div>
        <div className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[10px]">3 of 4</div>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 p-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">To</div>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-[10px] font-semibold text-emerald-700">
            BP
          </div>
          <div>
            <div className="text-sm font-semibold">Bharat Polymers</div>
            <div className="font-mono text-[9px] text-zinc-500">29ABCDE1234F1Z5</div>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-zinc-200">
        {items.map(([n, q, a], i) => (
          <div key={n} className={`flex items-center justify-between p-2.5 ${i ? 'border-t border-zinc-100' : ''}`}>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">{n}</div>
              <div className="text-[10px] text-zinc-500">{q}</div>
            </div>
            <div className="font-mono text-[11px] font-semibold tabular">{a}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl bg-zinc-50 p-3">
        <div className="flex justify-between text-[11px] text-zinc-500">
          <span>Sub</span>
          <span className="tabular">₹2,70,650</span>
        </div>
        <div className="flex justify-between text-[11px] text-zinc-500">
          <span>GST 18%</span>
          <span className="tabular">₹48,717</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between border-t border-zinc-200 pt-1.5">
          <span className="text-xs font-semibold">Total</span>
          <span className="text-lg font-bold tabular">₹3,19,367</span>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button className="flex-1 rounded-xl border border-zinc-300 py-3 text-xs font-medium">Save draft</button>
        <button className="flex-[2] rounded-xl bg-brand-500 py-3 text-xs font-semibold text-white">
          Generate IRN & Send
        </button>
      </div>

      <div className="mt-2 text-center text-[10px] text-zinc-500">
        Drafted in <span className="font-semibold text-zinc-700">22 seconds</span> from a saved template
      </div>
    </div>
  );
}

export function MobileScanScreen() {
  const fields: Array<[string, string]> = [
    ['Vendor', 'Reliance Foam'],
    ['Invoice', 'RF/26/4421'],
    ['Date', '28 Apr 2026'],
    ['Total', '₹1,00,795.60'],
    ['Ledger', 'Raw Materials'],
  ];
  return (
    <div className="relative overflow-hidden bg-zinc-950 text-white" style={{ minHeight: 460 }}>
      {/* Camera viewfinder */}
      <div className="relative h-56 bg-gradient-to-b from-zinc-800 to-zinc-950">
        <div className="absolute inset-4 rounded-xl border-2 border-dashed border-white/30" />
        {/* Faux receipt overlay */}
        <div
          className="absolute left-1/2 top-1/2 w-32 -translate-x-1/2 -translate-y-1/2 rotate-3 rounded-md bg-amber-50 p-2 font-mono text-[7px] text-zinc-700 shadow-2xl"
        >
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
          <Sparkles size={9} className="mr-1 inline text-brand-300" />
          AI extracting…
        </div>
      </div>

      {/* Result panel */}
      <div className="rounded-t-3xl bg-white p-4 text-zinc-900">
        <div className="mx-auto h-1 w-10 rounded-full bg-zinc-300" />
        <div className="mt-3 flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-500" />
          <span className="text-sm font-semibold">Bill captured</span>
          <span className="ml-auto text-[10px] text-zinc-500">2.4s · 99% conf</span>
        </div>
        <div className="mt-3 space-y-1.5 text-[11px]">
          {fields.map(([k, v]) => (
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
