import { Send, Sparkles } from 'lucide-react';
import { MockSidebar } from './mock-sidebar';

const monthly = [18, 22, 28, 19, 31, 24, 36, 29, 33, 27, 31, 42];

export function MockAiChat() {
  return (
    <div className="flex h-full min-w-[960px] bg-zinc-950 text-zinc-100">
      <MockSidebar active="Reports" dense />
      <div className="flex flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800/80 px-5 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-400 to-brand-700">
            <Sparkles size={14} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold">runQ Assistant</div>
            <div className="text-[10px] text-zinc-500">English · हिंदी · தமிழ் · తెలుగు · ಕನ್ನಡ</div>
          </div>
          <div className="ml-auto flex items-center gap-2 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Reading your books
            </span>
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
              <Sparkles size={13} className="text-white" />
            </div>
            <div className="max-w-[78%] space-y-3">
              <div className="rounded-2xl rounded-tl-md bg-zinc-900 px-3.5 py-2.5 text-xs text-zinc-200 ring-1 ring-zinc-800">
                अप्रैल 2026 में आपका सबसे बड़ा vendor spend था{' '}
                <span className="font-semibold text-white">Reliance Foam Industries</span> पर — कुल{' '}
                <span className="font-mono text-emerald-300">₹4,28,420</span> (5 bills)।
              </div>

              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
                <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/15 text-[10px] font-semibold text-amber-300">
                      RF
                    </div>
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
                  {monthly.map((v, i) => (
                    <div
                      key={i}
                      className="bar-rise flex-1 rounded-sm"
                      style={{
                        height: `${v * 2}%`,
                        background: i === 11 ? 'oklch(0.59 0.20 264)' : 'oklch(0.4 0.10 264)',
                        animationDelay: `${i * 30}ms`,
                      }}
                    />
                  ))}
                </div>
                <div className="mt-1 flex justify-between font-mono text-[8px] text-zinc-600">
                  <span>May</span><span>Aug</span><span>Nov</span><span>Feb</span><span>Apr</span>
                </div>
              </div>

              <div className="rounded-2xl rounded-tl-md bg-zinc-900 px-3.5 py-2.5 text-xs text-zinc-200 ring-1 ring-zinc-800">
                क्या आप उनके पिछले 5 bills का GSTR-2B match status देखना चाहेंगे?
              </div>

              <div className="flex flex-wrap gap-1.5">
                {['View bills', 'Open vendor', 'Schedule payment', 'Compare with peers'].map((a) => (
                  <button
                    key={a}
                    className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-300 hover:border-brand-500/40 hover:text-brand-300"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-zinc-800/80 px-5 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
            <Sparkles size={13} className="text-brand-400" />
            <span className="flex-1 text-xs text-zinc-500">
              Ask anything — "show overdue invoices" or "draft a GST return"…
            </span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">↵</span>
            <button className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-white">
              <Send size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
