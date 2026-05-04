// Product mockups — hand-built HTML, real-looking Indian SME data.
const { I } = window;

// Indian rupee formatter
const inr = (n, opts = {}) => {
  const { compact = false, decimals = 2 } = opts;
  if (compact) {
    if (Math.abs(n) >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr';
    if (Math.abs(n) >= 100000) return '₹' + (n / 100000).toFixed(2) + ' L';
    if (Math.abs(n) >= 1000) return '₹' + (n / 1000).toFixed(1) + 'K';
  }
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

// ─── Window chrome (used for product mockups) ──────────────────────────
const WindowChrome = ({ url = 'app.runq.in', children, dark = true, height }) => (
  <div className={`relative overflow-hidden rounded-xl border ${dark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-white'}`} style={{ height }}>
    <div className={`flex items-center gap-3 border-b px-4 py-2.5 ${dark ? 'border-zinc-800/80 bg-zinc-900/60' : 'border-zinc-200 bg-zinc-50'}`}>
      <div className="flex gap-1.5">
        <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <div className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <div className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
      </div>
      <div className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 text-[11px] ${dark ? 'bg-zinc-900 text-zinc-500' : 'bg-white text-zinc-400 border border-zinc-200'}`}>
        <I.Lock size={10} />
        <span className="font-mono">{url}</span>
      </div>
      <div className={`h-5 w-5 rounded-md ${dark ? 'bg-zinc-900' : 'bg-white border border-zinc-200'}`} />
    </div>
    <div className="relative">{children}</div>
  </div>
);

// ─── Sidebar (mini, for dashboard mockup) ──────────────────────────────
const MockSidebar = ({ active = 'Dashboard', dense = false }) => {
  const items = [
    ['Dashboard', I.Layers],
    ['Receivable', I.ArrowDown],
    ['Payable', I.Arrow],
    ['Banking', I.Landmark],
    ['GST', I.FileText],
    ['Reports', I.TrendUp],
    ['Vendors', I.Users],
    ['Settings', I.Settings],
  ];
  return (
    <div className={`flex flex-col gap-0.5 border-r border-zinc-800/80 bg-zinc-950 ${dense ? 'w-14 px-1.5 py-3' : 'w-44 px-2.5 py-3'}`}>
      <div className={`mb-3 flex items-center gap-2 ${dense ? 'justify-center' : 'px-1.5'}`}>
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500">
          <span className="text-[11px] font-bold text-white">Q</span>
        </div>
        {!dense && <span className="text-sm font-semibold text-white">runQ</span>}
        {!dense && <span className="ml-auto rounded border border-brand-400/30 px-1 py-px text-[8px] font-semibold uppercase tracking-wider text-brand-300">Finance</span>}
      </div>
      {items.map(([label, Ic]) => {
        const isActive = label === active;
        return (
          <div key={label} className={`flex items-center rounded-md ${dense ? 'justify-center p-1.5' : 'gap-2 px-2 py-1.5 text-[11px]'} ${isActive ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>
            <Ic size={dense ? 14 : 13} />
            {!dense && <span>{label}</span>}
          </div>
        );
      })}
      <div className="mt-auto" />
    </div>
  );
};

// ─── Hero dashboard mockup ─────────────────────────────────────────────
const DashboardMockup = () => {
  const stats = [
    { label: 'Cash Position', value: '₹84.6L', delta: '+12.4%', positive: true, sub: '4 accounts' },
    { label: 'Receivable', value: '₹2.34Cr', delta: '38 invoices', positive: null, sub: 'Avg 24 days' },
    { label: 'Payable', value: '₹62.8L', delta: '12 due this week', positive: false, sub: '₹8.4L overdue' },
    { label: 'GST Output', value: '₹14.2L', delta: 'Due 20 May', positive: null, sub: 'GSTR-3B' },
  ];
  const activity = [
    { type: 'invoice', icon: I.ArrowDown, color: 'text-emerald-400', bg: 'bg-emerald-500/10', title: 'INV-2026/00428', detail: 'Bharat Polymers Pvt Ltd', amt: '+₹4,72,000', time: '2m ago', tag: 'PAID', tagClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
    { type: 'bill', icon: I.Receipt, color: 'text-amber-400', bg: 'bg-amber-500/10', title: 'BILL-AC-7821', detail: 'Air Conditioning Pvt Ltd', amt: '-₹1,18,500', time: '14m ago', tag: 'OCR', tagClass: 'bg-brand-500/15 text-brand-300 border-brand-500/20' },
    { type: 'recon', icon: I.Refresh, color: 'text-blue-400', bg: 'bg-blue-500/10', title: 'HDFC ****4521', detail: 'Auto-matched 47 transactions', amt: '94%', time: '38m ago', tag: 'AI', tagClass: 'bg-violet-500/15 text-violet-300 border-violet-500/20' },
    { type: 'invoice', icon: I.ArrowDown, color: 'text-emerald-400', bg: 'bg-emerald-500/10', title: 'INV-2026/00427', detail: 'Sundar Steels & Alloys', amt: '+₹2,16,400', time: '1h ago', tag: 'SENT', tagClass: 'bg-zinc-700/40 text-zinc-300 border-zinc-700' },
    { type: 'bill', icon: I.Receipt, color: 'text-amber-400', bg: 'bg-amber-500/10', title: 'BILL-EL-3309', detail: 'BESCOM electricity', amt: '-₹38,420', time: '2h ago', tag: 'APPROVED', tagClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
  ];
  // AR aging buckets (in lakhs)
  const aging = [
    { label: 'Current', value: 142, color: 'oklch(0.72 0.16 162)' },
    { label: '1–30',   value: 58,  color: 'oklch(0.7 0.18 220)' },
    { label: '31–60',  value: 22,  color: 'oklch(0.59 0.20 264)' },
    { label: '61–90',  value: 9,   color: 'oklch(0.72 0.16 60)' },
    { label: '90+',    value: 3,   color: 'oklch(0.65 0.20 25)' },
  ];
  const maxAging = Math.max(...aging.map(a => a.value));
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
              <I.Search size={12} />
              <span>Search invoices, vendors…</span>
              <span className="ml-2 rounded border border-zinc-700 bg-zinc-950 px-1 font-mono text-[10px]">⌘K</span>
            </div>
            <button className="flex items-center gap-1.5 rounded-md bg-brand-500 px-2.5 py-1.5 text-xs font-medium text-white">
              <I.Plus size={12} /> New invoice
            </button>
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 ring-2 ring-zinc-900 flex items-center justify-center text-[10px] font-semibold">AS</div>
          </div>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-12 gap-3 overflow-hidden p-4">
          {/* Stat tiles */}
          {stats.map((s, i) => (
            <div key={i} className="col-span-3 rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">{s.label}</div>
              <div className="mt-1 text-xl font-semibold tabular">{s.value}</div>
              <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className={s.positive === true ? 'text-emerald-400' : s.positive === false ? 'text-rose-400' : 'text-zinc-500'}>
                  {s.delta}
                </span>
                <span className="text-zinc-600">{s.sub}</span>
              </div>
              {/* tiny sparkline */}
              <svg viewBox="0 0 100 20" className="mt-2 h-5 w-full">
                <path d={i===0?"M0,15 L20,12 L40,14 L60,8 L80,10 L100,4":i===1?"M0,10 L20,8 L40,11 L60,12 L80,7 L100,9":i===2?"M0,5 L20,8 L40,7 L60,12 L80,10 L100,15":"M0,12 L20,11 L40,13 L60,10 L80,8 L100,7"}
                  fill="none" stroke={i===2?"oklch(0.7 0.2 25)":i===1?"oklch(0.7 0.18 220)":"oklch(0.7 0.18 264)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ))}

          {/* Recent activity */}
          <div className="col-span-7 rounded-lg border border-zinc-800/80 bg-zinc-900/50">
            <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2">
              <div className="text-xs font-semibold">Recent activity</div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />Live</span>
                <span>·</span>
                <span>HDFC + ICICI</span>
              </div>
            </div>
            <div className="divide-y divide-zinc-800/60 text-xs">
              {activity.map((a, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${a.bg}`}>
                    <a.icon size={13} className={a.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-medium">{a.title}</span>
                      <span className={`rounded border px-1 text-[9px] font-semibold uppercase tracking-wider ${a.tagClass}`}>{a.tag}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-zinc-500">{a.detail}</div>
                  </div>
                  <div className="text-right">
                    <div className={`tabular text-[11px] font-medium ${a.amt.startsWith('+') ? 'text-emerald-300' : a.amt.startsWith('-') ? 'text-zinc-300' : 'text-violet-300'}`}>{a.amt}</div>
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
};

// ─── GST Invoice mockup ────────────────────────────────────────────────
const InvoiceMockup = () => (
  <div className="flex h-full bg-zinc-950 text-zinc-100">
    <MockSidebar active="Receivable" dense />
    <div className="flex flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800/80 px-5 py-2.5">
        <I.ChevronRight size={12} className="rotate-180 text-zinc-500" />
        <span className="text-xs text-zinc-500">Receivable / Invoices /</span>
        <span className="text-xs font-medium text-zinc-200">New invoice</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-300">Save draft</button>
          <button className="rounded-md bg-brand-500 px-2.5 py-1 text-[10px] font-medium text-white">Generate IRN & Send</button>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-12 gap-3 overflow-hidden p-4">
        {/* Left form */}
        <div className="col-span-7 flex flex-col gap-3">
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
              <span>Customer</span>
              <span className="text-brand-400">Tax Invoice · B2B</span>
            </div>
            <div className="mt-2 flex items-start gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/15 text-[11px] font-semibold text-emerald-300">BP</div>
              <div className="flex-1">
                <div className="text-sm font-semibold">Bharat Polymers Pvt Ltd</div>
                <div className="mt-0.5 text-[10px] text-zinc-500">GSTIN <span className="font-mono">29ABCDE1234F1Z5</span> · Bengaluru, Karnataka</div>
              </div>
              <div className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">VERIFIED</div>
            </div>
          </div>

          <div className="flex-1 overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-900/50">
            <div className="grid grid-cols-12 gap-2 border-b border-zinc-800/80 px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
              <div className="col-span-5">Item / HSN</div>
              <div className="col-span-2 text-right">Qty</div>
              <div className="col-span-2 text-right">Rate</div>
              <div className="col-span-1 text-right">GST</div>
              <div className="col-span-2 text-right">Amount</div>
            </div>
            {[
              ['HDPE Granules — Grade FG-2540', '39012000', 1500, 78.50, 18, 117750],
              ['LDPE Roll Stock 50µ', '39201019', 850, 122.00, 18, 103700],
              ['Master Batch Black MB-K9', '32041100', 120, 410.00, 18, 49200],
            ].map(([name, hsn, qty, rate, gst, amt], i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2 border-b border-zinc-800/40 px-3 py-2 text-[11px] last:border-0">
                <div className="col-span-5">
                  <div className="text-zinc-100">{name}</div>
                  <div className="mt-0.5 font-mono text-[9px] text-zinc-500">HSN {hsn}</div>
                </div>
                <div className="col-span-2 text-right tabular text-zinc-300">{qty.toLocaleString('en-IN')}</div>
                <div className="col-span-2 text-right tabular text-zinc-300">₹{rate.toFixed(2)}</div>
                <div className="col-span-1 text-right tabular text-zinc-400">{gst}%</div>
                <div className="col-span-2 text-right tabular font-medium">₹{amt.toLocaleString('en-IN')}</div>
              </div>
            ))}
            <button className="flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[10px] text-zinc-500 hover:text-brand-300">
              <I.Plus size={11} /> Add line
            </button>
          </div>
        </div>

        {/* Right summary */}
        <div className="col-span-5 flex flex-col gap-3">
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3 text-xs">
            <div className="space-y-1.5">
              <div className="flex justify-between"><span className="text-zinc-500">Subtotal</span><span className="tabular">₹2,70,650.00</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">CGST 9%</span><span className="tabular">₹24,358.50</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">SGST 9%</span><span className="tabular">₹24,358.50</span></div>
              <div className="my-2 border-t border-zinc-800/80" />
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Total</span>
                <span className="text-lg font-semibold tabular">₹3,19,367.00</span>
              </div>
              <div className="text-[9px] text-zinc-500">Three Lakh Nineteen Thousand Three Hundred Sixty Seven Rupees Only</div>
            </div>
          </div>

          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-2">
              <I.CheckCircle size={14} className="text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-300">e-Invoice ready</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <div className="text-zinc-500">IRN</div>
                <div className="font-mono text-emerald-200/90">a4c2…f9d1</div>
              </div>
              <div>
                <div className="text-zinc-500">Ack No</div>
                <div className="font-mono text-emerald-200/90">112526043118274</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-3">
            <div className="flex items-center gap-2">
              <I.Sparkle size={14} className="text-brand-300" />
              <span className="text-xs font-semibold text-brand-200">Auto-suggested</span>
            </div>
            <div className="mt-1.5 text-[10px] text-zinc-400">Based on last 12 invoices to this customer, payment usually clears in <span className="text-zinc-200">21 days</span>. Suggested terms: <span className="text-zinc-200">Net 30, 2/10 early-pay</span>.</div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2 text-[10px] text-zinc-500">
            <I.Clock size={11} />
            Drafted in <span className="text-zinc-200 mx-1">22 seconds</span>
            <span className="ml-auto rounded bg-brand-500/10 px-1.5 py-0.5 font-mono text-brand-300">⌘ ↵</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ─── Bank Recon mockup ─────────────────────────────────────────────────
const BankReconMockup = () => {
  const txns = [
    { date: '02 May', desc: 'NEFT/SBIN0526782/BHARATPLM', amt: 472000, status: 'matched', match: 'INV-2026/00428', conf: 99 },
    { date: '02 May', desc: 'IMPS/HDFC/AIRCONDITIONING', amt: -118500, status: 'matched', match: 'BILL-AC-7821', conf: 96 },
    { date: '02 May', desc: 'UPI/sundar@hdfc/ALLOYS', amt: 216400, status: 'suggested', match: 'INV-2026/00427', conf: 87 },
    { date: '01 May', desc: 'NEFT/AXIS/RELIANCEFOAM', amt: -85420, status: 'matched', match: 'BILL-RF-2204', conf: 100 },
    { date: '01 May', desc: 'BESCOM ELECTRICITY BILL', amt: -38420, status: 'matched', match: 'BILL-EL-3309', conf: 100 },
    { date: '01 May', desc: 'CHQ 042881 / KIRTI ENT', amt: 145000, status: 'unmatched', match: null, conf: null },
    { date: '30 Apr', desc: 'NEFT/ICICI/PRIMETEX', amt: 318900, status: 'matched', match: 'INV-2026/00425', conf: 94 },
    { date: '30 Apr', desc: 'GST CHALLAN 22042026', amt: -142000, status: 'matched', match: 'GST May·25', conf: 100 },
  ];
  return (
    <div className="flex h-full bg-zinc-950 text-zinc-100">
      <MockSidebar active="Banking" dense />
      <div className="flex flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800/80 px-5 py-3">
          <div>
            <div className="text-xs text-zinc-500">Bank Reconciliation</div>
            <div className="text-sm font-semibold">HDFC Current ····4521</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live feed
            </div>
            <button className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-300">Filter</button>
            <button className="rounded-md bg-brand-500 px-2.5 py-1 text-[10px] font-medium text-white">Approve all matches</button>
          </div>
        </div>

        {/* Match summary */}
        <div className="grid shrink-0 grid-cols-4 gap-3 border-b border-zinc-800/80 px-5 py-3">
          {[
            ['Auto-matched', '142', 'of 156', 'emerald'],
            ['Suggested', '8', '92% avg conf', 'brand'],
            ['Needs review', '6', '~3 min', 'amber'],
            ['Closing balance', '₹84.6L', 'as of 14:32', 'zinc'],
          ].map(([label, val, sub, color], i) => (
            <div key={i} className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2">
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
              <div className={`mt-1 text-lg font-semibold tabular ${
                color === 'emerald' ? 'text-emerald-300' : color === 'brand' ? 'text-brand-300' : color === 'amber' ? 'text-amber-300' : ''
              }`}>{val}</div>
              <div className="text-[9px] text-zinc-500">{sub}</div>
            </div>
          ))}
        </div>

        {/* Match progress */}
        <div className="shrink-0 border-b border-zinc-800/80 px-5 py-2.5">
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>Match progress · this statement</span>
            <span className="tabular text-zinc-200">142 / 156 (91%)</span>
          </div>
          <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div className="bar-rise" style={{ width: '91%', background: 'linear-gradient(to right, oklch(0.72 0.16 162), oklch(0.59 0.20 264))' }} />
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 border-b border-zinc-800/80 px-5 py-2 text-[9px] uppercase tracking-wider text-zinc-500">
            <div className="col-span-1">Date</div>
            <div className="col-span-4">Bank narration</div>
            <div className="col-span-2 text-right">Amount</div>
            <div className="col-span-1 text-center">→</div>
            <div className="col-span-3">runQ match</div>
            <div className="col-span-1 text-right">Status</div>
          </div>
          {txns.map((t, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-2 border-b border-zinc-800/40 px-5 py-2 text-[11px] last:border-0">
              <div className="col-span-1 text-zinc-400">{t.date}</div>
              <div className="col-span-4 truncate font-mono text-zinc-300">{t.desc}</div>
              <div className={`col-span-2 text-right tabular font-medium ${t.amt > 0 ? 'text-emerald-300' : 'text-zinc-200'}`}>
                {t.amt > 0 ? '+' : ''}{inr(Math.abs(t.amt), { decimals: 0 })}
              </div>
              <div className="col-span-1 text-center text-zinc-600">
                {t.status === 'unmatched' ? '?' : '↔'}
              </div>
              <div className="col-span-3">
                {t.match ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-zinc-200">{t.match}</span>
                    {t.conf && (
                      <span className={`rounded border px-1 text-[9px] font-semibold ${
                        t.conf >= 95 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' :
                        t.conf >= 85 ? 'border-brand-500/30 bg-brand-500/10 text-brand-300' :
                        'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      }`}>{t.conf}%</span>
                    )}
                  </div>
                ) : <span className="italic text-zinc-500">no match found</span>}
              </div>
              <div className="col-span-1 text-right">
                {t.status === 'matched' && <I.Check size={13} className="ml-auto text-emerald-400" />}
                {t.status === 'suggested' && <I.Sparkle size={13} className="ml-auto text-brand-400" />}
                {t.status === 'unmatched' && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">REVIEW</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── GSTR-2B Match mockup ──────────────────────────────────────────────
const GSTR2BMockup = () => {
  const rows = [
    { gstin: '27AABCR1234F1Z5', name: 'Reliance Foam Industries', invNo: 'RF/24-25/4421', date: '28 Apr 2026', taxable: 85420, igst: 15375.6, status: 'matched' },
    { gstin: '29AABCB5678G1Z2', name: 'Bharat Polymers (PO-8821)', invNo: 'BP/26-27/0184', date: '27 Apr 2026', taxable: 142000, igst: 25560, status: 'matched' },
    { gstin: '24AABCK9012H1Z8', name: 'Kirti Enterprises', invNo: 'KE/26/01124', date: '26 Apr 2026', taxable: 38420, igst: 6915.6, status: 'mismatch', diff: '₹420 less in books' },
    { gstin: '06AABCS3456J1Z9', name: 'Sundar Steels & Alloys', invNo: 'SS/26-27/0091', date: '24 Apr 2026', taxable: 216400, igst: 38952, status: 'matched' },
    { gstin: '33AABCP7890K1Z3', name: 'Prime Textile (Coimbatore)', invNo: 'PT/26/2241', date: '22 Apr 2026', taxable: 318900, igst: 57402, status: 'missing-2b' },
    { gstin: '27AABCM2468L1Z6', name: 'Mahindra Logistics', invNo: 'ML/26/9981', date: '20 Apr 2026', taxable: 24500, igst: 4410, status: 'matched' },
    { gstin: '07AABCD1357M1Z4', name: 'Delhi Hardware Co', invNo: 'DH/26/0445', date: '18 Apr 2026', taxable: 18200, igst: null, status: 'missing-books', diff: 'Not in your books' },
  ];
  return (
    <div className="flex h-full bg-zinc-950 text-zinc-100">
      <MockSidebar active="GST" dense />
      <div className="flex flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800/80 px-5 py-3">
          <div>
            <div className="text-xs text-zinc-500">GST Filing / GSTR-2B</div>
            <div className="text-sm font-semibold">April 2026 reconciliation</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-300">Period: April 2026</div>
            <button className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-300">Download CSV</button>
            <button className="rounded-md bg-brand-500 px-2.5 py-1 text-[10px] font-medium text-white">Mark resolved</button>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-4 gap-3 border-b border-zinc-800/80 px-5 py-3">
          {[
            ['Total invoices in 2B', '184', 'from 47 vendors'],
            ['Matched cleanly', '161', '87.5%', 'emerald'],
            ['Mismatches', '14', 'Avg ₹612 diff', 'amber'],
            ['Missing on either side', '9', '6 in 2B not in books', 'rose'],
          ].map(([label, val, sub, color], i) => (
            <div key={i} className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2">
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
              <div className={`mt-1 text-lg font-semibold tabular ${
                color === 'emerald' ? 'text-emerald-300' : color === 'amber' ? 'text-amber-300' : color === 'rose' ? 'text-rose-300' : ''
              }`}>{val}</div>
              <div className="text-[9px] text-zinc-500">{sub}</div>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 border-b border-zinc-800/80 px-5 py-2 text-[9px] uppercase tracking-wider text-zinc-500">
            <div className="col-span-3">Vendor / GSTIN</div>
            <div className="col-span-2">Invoice no.</div>
            <div className="col-span-1">Date</div>
            <div className="col-span-2 text-right">Taxable</div>
            <div className="col-span-2 text-right">IGST</div>
            <div className="col-span-2">Status</div>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-2 border-b border-zinc-800/40 px-5 py-2 text-[11px] last:border-0">
              <div className="col-span-3 min-w-0">
                <div className="truncate text-zinc-100">{r.name}</div>
                <div className="font-mono text-[9px] text-zinc-500">{r.gstin}</div>
              </div>
              <div className="col-span-2 font-mono text-[10px] text-zinc-300">{r.invNo}</div>
              <div className="col-span-1 text-[10px] text-zinc-400">{r.date}</div>
              <div className="col-span-2 text-right tabular text-zinc-200">{inr(r.taxable, { decimals: 0 })}</div>
              <div className="col-span-2 text-right tabular text-zinc-300">{r.igst != null ? inr(r.igst, { decimals: 0 }) : '—'}</div>
              <div className="col-span-2">
                {r.status === 'matched' && (
                  <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                    <I.Check size={10} /> MATCHED
                  </span>
                )}
                {r.status === 'mismatch' && (
                  <div className="flex flex-col gap-0.5">
                    <span className="inline-flex w-fit items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">MISMATCH</span>
                    <span className="text-[9px] text-zinc-500">{r.diff}</span>
                  </div>
                )}
                {r.status === 'missing-books' && (
                  <span className="inline-flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-rose-300">MISSING IN BOOKS</span>
                )}
                {r.status === 'missing-2b' && (
                  <span className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800/50 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-300">PENDING IN 2B</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── AI Assistant mockup ───────────────────────────────────────────────
const AIAssistantMockup = () => (
  <div className="flex h-full bg-zinc-950 text-zinc-100">
    <MockSidebar active="Reports" dense />
    <div className="flex flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800/80 px-5 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-400 to-brand-700">
          <I.Sparkle size={14} className="text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold">runQ Assistant</div>
          <div className="text-[10px] text-zinc-500">English · हिंदी · தமிழ் · తెలుగు · ಕನ್ನಡ</div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Reading your books</span>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-hidden p-5">
        {/* User message */}
        <div className="flex justify-end">
          <div className="max-w-[78%] rounded-2xl rounded-tr-md bg-brand-500/15 px-3.5 py-2 text-xs text-brand-100 ring-1 ring-brand-500/20">
            पिछले महीने सबसे ज़्यादा खर्च किस वेंडर पर हुआ? और उसका GSTIN दिखाओ।
          </div>
        </div>

        {/* Assistant response */}
        <div className="flex items-start gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand-400 to-brand-700">
            <I.Sparkle size={13} className="text-white" />
          </div>
          <div className="max-w-[78%] space-y-3">
            <div className="rounded-2xl rounded-tl-md bg-zinc-900 px-3.5 py-2.5 text-xs text-zinc-200 ring-1 ring-zinc-800">
              अप्रैल 2026 में आपका सबसे बड़ा vendor spend था <span className="font-semibold text-white">Reliance Foam Industries</span> पर — कुल <span className="font-mono text-emerald-300">₹4,28,420</span> (5 bills)।
            </div>

            {/* Inline data card */}
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
              <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/15 text-[10px] font-semibold text-amber-300">RF</div>
                  <div>
                    <div className="text-[12px] font-semibold">Reliance Foam Industries</div>
                    <div className="font-mono text-[9px] text-zinc-500">27AABCR1234F1Z5 · Mumbai, MH</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold tabular">₹4,28,420</div>
                  <div className="text-[9px] text-zinc-500">↑ 14% vs Mar</div>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-zinc-800 text-center">
                <div className="px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500">Bills</div>
                  <div className="text-sm tabular">5</div>
                </div>
                <div className="px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500">Avg days to pay</div>
                  <div className="text-sm tabular">28</div>
                </div>
                <div className="px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500">YTD spend</div>
                  <div className="text-sm tabular">₹38.4L</div>
                </div>
              </div>
            </div>

            {/* Mini chart */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
              <div className="mb-2 flex items-center justify-between text-[10px]">
                <span className="text-zinc-400">Monthly spend — Reliance Foam</span>
                <span className="text-zinc-500">FY 2025–26</span>
              </div>
              <div className="flex h-12 items-end gap-1">
                {[18, 22, 28, 19, 31, 24, 36, 29, 33, 27, 31, 42].map((v, i) => (
                  <div key={i} className="bar-rise flex-1 rounded-sm" style={{
                    height: `${v * 2}%`,
                    background: i === 11 ? 'oklch(0.59 0.20 264)' : 'oklch(0.4 0.10 264)',
                    animationDelay: `${i * 30}ms`,
                  }} />
                ))}
              </div>
              <div className="mt-1 flex justify-between font-mono text-[8px] text-zinc-600">
                <span>May</span><span>Aug</span><span>Nov</span><span>Feb</span><span>Apr</span>
              </div>
            </div>

            <div className="rounded-2xl rounded-tl-md bg-zinc-900 px-3.5 py-2.5 text-xs text-zinc-200 ring-1 ring-zinc-800">
              क्या आप उनके पिछले 5 bills का GSTR-2B match status देखना चाहेंगे?
            </div>

            {/* Suggested actions */}
            <div className="flex flex-wrap gap-1.5">
              {['View bills', 'Open vendor', 'Schedule payment', 'Compare with peers'].map(a => (
                <button key={a} className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-300 hover:border-brand-500/40 hover:text-brand-300">
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-800/80 px-5 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
          <I.Sparkle size={13} className="text-brand-400" />
          <span className="flex-1 text-xs text-zinc-500">Ask anything — "show overdue invoices" or "draft a GST return"…</span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">↵</span>
          <button className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-white">
            <I.Send size={12} />
          </button>
        </div>
      </div>
    </div>
  </div>
);

window.Mockups = { DashboardMockup, InvoiceMockup, BankReconMockup, GSTR2BMockup, AIAssistantMockup, WindowChrome, inr };
