import { ArrowDown, Receipt, RefreshCcw, Search, Plus } from 'lucide-react';
import { MockSidebar } from './mock-sidebar';

interface Stat {
  label: string;
  value: string;
  delta: string;
  positive: boolean | null;
  sub: string;
}

const stats: Stat[] = [
  { label: 'Cash Position', value: '₹84.6L', delta: '+12.4%', positive: true, sub: '4 accounts' },
  { label: 'Receivable', value: '₹2.34Cr', delta: '38 invoices', positive: null, sub: 'Avg 24 days' },
  { label: 'Payable', value: '₹62.8L', delta: '12 due this week', positive: false, sub: '₹8.4L overdue' },
  { label: 'GST Output', value: '₹14.2L', delta: 'Due 20 May', positive: null, sub: 'GSTR-3B' },
];

const sparkPaths = [
  'M0,15 L20,12 L40,14 L60,8 L80,10 L100,4',
  'M0,10 L20,8 L40,11 L60,12 L80,7 L100,9',
  'M0,5 L20,8 L40,7 L60,12 L80,10 L100,15',
  'M0,12 L20,11 L40,13 L60,10 L80,8 L100,7',
];

const activity = [
  { Icon: ArrowDown, color: 'text-emerald-400', bg: 'bg-emerald-500/10', title: 'INV-2026/00428', detail: 'Bharat Polymers Pvt Ltd', amt: '+₹4,72,000', time: '2m ago', tag: 'PAID',     tagClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
  { Icon: Receipt,   color: 'text-amber-400',   bg: 'bg-amber-500/10',   title: 'BILL-AC-7821',   detail: 'Air Conditioning Pvt Ltd', amt: '-₹1,18,500', time: '14m ago', tag: 'OCR',      tagClass: 'bg-brand-500/15 text-brand-300 border-brand-500/20' },
  { Icon: RefreshCcw,color: 'text-blue-400',    bg: 'bg-blue-500/10',    title: 'HDFC ****4521',  detail: 'Auto-matched 47 transactions', amt: '94%',        time: '38m ago', tag: 'AI',       tagClass: 'bg-violet-500/15 text-violet-300 border-violet-500/20' },
  { Icon: ArrowDown, color: 'text-emerald-400', bg: 'bg-emerald-500/10', title: 'INV-2026/00427', detail: 'Sundar Steels & Alloys',  amt: '+₹2,16,400', time: '1h ago',  tag: 'SENT',     tagClass: 'bg-zinc-700/40 text-zinc-300 border-zinc-700' },
  { Icon: Receipt,   color: 'text-amber-400',   bg: 'bg-amber-500/10',   title: 'BILL-EL-3309',   detail: 'BESCOM electricity',      amt: '-₹38,420',   time: '2h ago',  tag: 'APPROVED', tagClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
];

const aging = [
  { label: 'Current', value: 142, color: 'oklch(0.72 0.16 162)' },
  { label: '1–30',   value: 58,  color: 'oklch(0.7 0.18 220)' },
  { label: '31–60',  value: 22,  color: 'oklch(0.59 0.20 264)' },
  { label: '61–90',  value: 9,   color: 'oklch(0.72 0.16 60)' },
  { label: '90+',    value: 3,   color: 'oklch(0.65 0.20 25)' },
];

export function MockDashboard() {
  const maxAging = Math.max(...aging.map((a) => a.value));
  return (
    <div className="flex h-full overflow-hidden bg-zinc-950 text-zinc-100">
      <MockSidebar active="Dashboard" />
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800/80 px-5 py-3">
          <div>
            <div className="text-xs text-zinc-500">Saturday, 4 May 2026 · FY 2026–27</div>
            <div className="text-sm font-semibold">Good morning, Ananya</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-500">
              <Search size={12} />
              <span>Search invoices, vendors…</span>
              <span className="ml-2 rounded border border-zinc-700 bg-zinc-950 px-1 font-mono text-[10px]">⌘K</span>
            </div>
            <button className="flex items-center gap-1.5 rounded-md bg-brand-500 px-2.5 py-1.5 text-xs font-medium text-white">
              <Plus size={12} /> New invoice
            </button>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-[10px] font-semibold ring-2 ring-zinc-900">
              AS
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-12 gap-3 overflow-hidden p-4">
          {stats.map((s, i) => (
            <div key={s.label} className="col-span-3 rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">{s.label}</div>
              <div className="mt-1 text-xl font-semibold tabular">{s.value}</div>
              <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className={s.positive === true ? 'text-emerald-400' : s.positive === false ? 'text-rose-400' : 'text-zinc-500'}>
                  {s.delta}
                </span>
                <span className="text-zinc-600">{s.sub}</span>
              </div>
              <svg viewBox="0 0 100 20" className="mt-2 h-5 w-full">
                <path
                  d={sparkPaths[i]}
                  fill="none"
                  stroke={i === 2 ? 'oklch(0.7 0.2 25)' : i === 1 ? 'oklch(0.7 0.18 220)' : 'oklch(0.7 0.18 264)'}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          ))}

          {/* Recent activity */}
          <div className="col-span-7 rounded-lg border border-zinc-800/80 bg-zinc-900/50">
            <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2">
              <div className="text-xs font-semibold">Recent activity</div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
                <span>·</span>
                <span>HDFC + ICICI</span>
              </div>
            </div>
            <div className="divide-y divide-zinc-800/60 text-xs">
              {activity.map((a) => (
                <div key={a.title} className="flex items-center gap-3 px-3 py-2">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${a.bg}`}>
                    <a.Icon size={13} className={a.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-medium">{a.title}</span>
                      <span className={`rounded border px-1 text-[9px] font-semibold uppercase tracking-wider ${a.tagClass}`}>
                        {a.tag}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-zinc-500">{a.detail}</div>
                  </div>
                  <div className="text-right">
                    <div className={`tabular text-[11px] font-medium ${a.amt.startsWith('+') ? 'text-emerald-300' : a.amt.startsWith('-') ? 'text-zinc-300' : 'text-violet-300'}`}>
                      {a.amt}
                    </div>
                    <div className="text-[9px] text-zinc-500">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AR Aging */}
          <div className="col-span-5 rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold">AR Aging</div>
              <div className="text-[10px] text-zinc-500">₹2.34 Cr open</div>
            </div>
            <div className="mt-3 flex h-32 items-end gap-2">
              {aging.map((b, i) => (
                <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
                  <div className="text-[9px] tabular text-zinc-400">₹{b.value}L</div>
                  <div
                    className="bar-rise w-full rounded-t-sm"
                    style={{
                      height: `${(b.value / maxAging) * 100}%`,
                      background: b.color,
                      animationDelay: `${i * 80}ms`,
                    }}
                  />
                  <div className="text-[9px] text-zinc-500">{b.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-zinc-800/60 pt-2 text-[10px]">
              <div>
                <div className="text-zinc-500">DSO</div>
                <div className="tabular text-zinc-200">24 days</div>
              </div>
              <div>
                <div className="text-zinc-500">Top customer</div>
                <div className="text-zinc-200">Bharat Polymers</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
