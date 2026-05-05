import { useEffect } from 'react';
import {
  Building, Clock, Coins, Download, FileText, Hash, Layers, TrendingUp, Users,
} from 'lucide-react';
import { PageHero } from '@/components/marketing/page-hero';
import { FooterCTA } from '@/components/marketing/footer-cta';
import { Section, GreySection, DarkSection, SectionHead, IconGrid } from '@/components/marketing/blocks';

const bars = [38, 52, 47, 61, 58, 72, 68, 81, 76, 88, 92, 84];

function ReportsMockup() {
  return (
    <div className="-mx-5 overflow-x-auto pb-2 md:mx-0 md:overflow-visible">
    <div className="min-w-[640px] rounded-2xl bg-zinc-950 p-1.5 mockup-shadow md:min-w-0">
      <div className="rounded-xl ring-1 ring-white/10">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3 text-xs">
          <div className="flex gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
          </div>
          <span className="text-zinc-400">Profit & Loss · FY 2025–26 · YTD</span>
          <span className="ml-auto text-zinc-500">Apr 25 → May 26</span>
        </div>
        <div className="grid grid-cols-12 gap-5 p-5">
          <div className="col-span-7 rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Revenue, monthly (₹L)</div>
            <div className="mt-4 flex h-40 items-end gap-2">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="bar-rise flex-1 rounded-t bg-gradient-to-t from-brand-500 to-brand-300"
                  style={{ height: `${h}%`, animationDelay: `${i * 0.05}s` }}
                />
              ))}
            </div>
            <div className="mt-2 flex gap-2 text-[10px] text-zinc-500">
              {['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'].map((m) => (
                <div key={m} className="flex-1 text-center">{m}</div>
              ))}
            </div>
          </div>
          <div className="col-span-5 space-y-2 text-xs">
            {([
              ['Revenue',             '₹12.84 Cr', 'text-zinc-100'],
              ['Cost of goods sold',  '−₹6.20 Cr', 'text-zinc-400'],
              ['Gross profit',        '₹6.64 Cr',  'text-emerald-400'],
              ['Operating expenses',  '−₹3.12 Cr', 'text-zinc-400'],
              ['EBITDA',              '₹3.52 Cr',  'text-emerald-400'],
              ['Tax',                 '−₹0.88 Cr', 'text-zinc-400'],
              ['Net profit',          '₹2.64 Cr',  'text-emerald-300'],
            ] as const).map(([k, v, c]) => (
              <div key={k} className="flex items-baseline justify-between rounded-lg bg-white/[0.03] px-3 py-2 tabular">
                <span className="text-zinc-500">{k}</span>
                <span className={`font-medium ${c}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

const library = [
  { Icon: TrendingUp, title: 'P&L · monthly, quarterly, annual', body: 'With YoY, MoM, and budget-vs-actual variance built in. Drill down to the journal entry.' },
  { Icon: Layers,     title: 'Balance sheet',                    body: 'Assets, liabilities, equity. With a one-click trial balance and a comparative view.' },
  { Icon: Coins,      title: 'Cash flow statement',              body: 'Direct and indirect methods. Operating, investing, financing — auto-classified from your bank lines.' },
  { Icon: Clock,      title: 'AR & AP aging',                    body: '0–30, 31–60, 61–90, 90+ buckets. With customer-level detail and one-click reminders from the report.' },
  { Icon: Hash,       title: 'GST liability & ITC',              body: 'Live tax position. What you owe, what you can claim, what is stuck in 2B mismatches.' },
  { Icon: Users,      title: 'Customer & vendor ledgers',        body: 'Statement-of-account view, ready to email. Reconciles against payments and credit notes.' },
  { Icon: Building,   title: 'Branch P&L',                       body: 'Multi-branch consolidation, with inter-branch eliminations done correctly.' },
  { Icon: FileText,   title: 'TDS & TCS',                        body: 'Form 26Q-ready summaries. Section-wise, deductee-wise, with challan tracking.' },
  { Icon: Download,   title: 'Custom reports',                   body: 'Pivot any ledger by any dimension. Save, schedule, or push to your CA on the 5th of every month.' },
];

export default function ReportsPage() {
  useEffect(() => { document.title = 'Reports — runQ'; }, []);
  return (
    <main>
      <PageHero
        eyebrow="PRODUCT · REPORTS"
        title="The numbers"
        titleItalic="that decisions need."
        subtitle="P&L, balance sheet, cash flow, AR aging — and twenty more, all live, drillable, and exportable. The report you need at 11 PM the night before the board meeting."
      />

      <Section><ReportsMockup /></Section>

      <GreySection>
        <SectionHead eyebrow="THE LIBRARY" title="Twenty-five reports out of the box." />
        <div className="mt-12">
          <IconGrid items={library} accent="violet" />
        </div>
      </GreySection>

      <DarkSection>
        <SectionHead eyebrow="EXPORT EVERYWHERE" title="Excel, PDF, Tally, CSV. Pick your venom." accent="violet" dark />
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-4">
          {([
            ['Excel',      'Native .xlsx with formulas, not flat values.'],
            ['PDF',        'Print-ready, with branding, page numbers, and signatures.'],
            ['Tally XML',  'Vouchers, ledgers, masters — exact Tally schema.'],
            ['CSV / API',  'For your data team, BI tool, or auditor of choice.'],
          ] as const).map(([t, b]) => (
            <div key={t} className="reveal rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-base font-semibold text-white">{t}</div>
              <div className="mt-2 text-sm text-zinc-400">{b}</div>
            </div>
          ))}
        </div>
      </DarkSection>

      <FooterCTA />
    </main>
  );
}
