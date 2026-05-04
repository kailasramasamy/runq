import { useEffect } from 'react';
import {
  CheckCircle2, Coins, FileText, GitBranch, Hash, RefreshCcw, Receipt, ShieldCheck,
  Smartphone, Sparkles,
} from 'lucide-react';
import { PageHero } from '@/components/marketing/page-hero';
import { FooterCTA } from '@/components/marketing/footer-cta';
import {
  Section, GreySection, DarkSection, SectionHead, IconGrid, FeatureRow,
} from '@/components/marketing/blocks';
import { PhoneFrame } from '@/components/mockups/mock-phone';

function InvoiceMockup() {
  const lines: Array<[string, string, string, string, string]> = [
    ['Premium yarn 40s', '5205', '120', '₹148', '₹17,760'],
    ['Carded yarn 30s',  '5205', '80',  '₹132', '₹10,560'],
    ['Industrial dye',   '3204', '12',  '₹2,400', '₹28,800'],
  ];
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-1.5 mockup-shadow-light shadow-xl shadow-brand-500/10">
      <div className="rounded-xl bg-white">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
            </div>
            <span className="ml-3 text-xs text-zinc-500">runq.in / invoices / new</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Sparkles size={12} className="text-brand-500" /> AI assist on
          </div>
        </div>
        <div className="grid grid-cols-12 gap-5 p-6">
          <div className="col-span-7 space-y-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Customer</div>
              <div className="mt-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                <div className="font-medium text-zinc-900">Saraswati Cotton Mills Pvt Ltd</div>
                <div className="text-xs text-zinc-500">GSTIN 27AABCS1234L1Z5 · Mumbai, MH</div>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Items</div>
              <div className="mt-1 overflow-hidden rounded-lg border border-zinc-200">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-right font-medium">HSN</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Rate</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {lines.map((r, i) => (
                      <tr key={i} className="border-t border-zinc-200">
                        {r.map((c, j) => (
                          <td key={j} className={j === 0 ? 'px-3 py-2 text-zinc-900' : 'px-3 py-2 text-right text-zinc-700'}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="col-span-5 space-y-4">
            <div className="rounded-xl bg-zinc-50 p-4">
              <div className="space-y-2 text-xs tabular">
                <div className="flex justify-between"><span className="text-zinc-500">Subtotal</span><span className="text-zinc-900">₹57,120</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">CGST 9%</span><span className="text-zinc-900">₹5,140.80</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">SGST 9%</span><span className="text-zinc-900">₹5,140.80</span></div>
                <div className="mt-2 flex items-baseline justify-between border-t border-zinc-200 pt-2">
                  <span className="text-zinc-900">Total</span>
                  <span className="text-base font-semibold text-zinc-900">₹67,401.60</span>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
                <CheckCircle2 size={13} /> e-Invoice generated
              </div>
              <div className="mt-1 font-mono text-[11px] text-emerald-900/80">IRN 35a8f2d6c1e4...b9a8</div>
              <div className="text-[11px] text-emerald-700/80">Acknowledgement at 14:32:08 IST</div>
            </div>
            <button className="w-full rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white">
              Send via WhatsApp + email →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="mx-auto">
      <PhoneFrame width={280}>
        <div className="px-5 pt-3">
          <div className="text-xs text-zinc-500">Quick Invoice</div>
          <div className="text-[15px] font-semibold text-zinc-900">New invoice</div>
        </div>
        <div className="space-y-2 px-5 py-4">
          <div className="rounded-lg border border-zinc-200 px-3 py-2.5 text-xs">
            <div className="text-[10px] uppercase tracking-wide text-zinc-400">Customer</div>
            <div className="mt-0.5 font-medium text-zinc-900">Saraswati Cotton Mills</div>
          </div>
          <div className="rounded-lg border border-zinc-200 px-3 py-2.5 text-xs">
            <div className="text-[10px] uppercase tracking-wide text-zinc-400">Item</div>
            <div className="mt-0.5 font-medium text-zinc-900">Premium yarn 40s · HSN 5205</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-zinc-200 px-3 py-2.5 text-xs">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400">Qty</div>
              <div className="mt-0.5 font-medium text-zinc-900">120</div>
            </div>
            <div className="rounded-lg border border-zinc-200 px-3 py-2.5 text-xs">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400">Rate</div>
              <div className="mt-0.5 font-medium text-zinc-900">₹148</div>
            </div>
          </div>
          <div className="rounded-lg bg-zinc-50 px-3 py-2.5 text-xs tabular">
            <div className="flex justify-between text-zinc-500">
              <span>Total with GST</span>
              <span className="font-semibold text-zinc-900">₹20,956.80</span>
            </div>
          </div>
        </div>
        <div className="absolute inset-x-5 bottom-7 z-10">
          <button className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-3 text-xs font-semibold text-white">
            Send via WhatsApp
          </button>
        </div>
      </PhoneFrame>
    </div>
  );
}

const features = [
  { Icon: Receipt,     title: 'GST-compliant invoices', body: 'Automatic CGST/SGST/IGST split. State-aware tax rules. HSN/SAC suggestions on every item.' },
  { Icon: ShieldCheck, title: 'e-Invoice (IRN) included', body: 'IRN generated on the IRP in the background. QR + acknowledgement embedded on the PDF.' },
  { Icon: GitBranch,   title: 'e-Way bill, automatic',   body: 'Above ₹50,000 we generate the e-Way bill alongside the invoice. Vehicle number can be added later.' },
  { Icon: Sparkles,    title: 'AI item suggestions',     body: 'Type a few characters of an item — runQ remembers HSN, last rate, and the right tax slab.' },
  { Icon: Smartphone,  title: 'Send via WhatsApp',       body: 'One tap: WhatsApp opens with the customer, the PDF, a payment link, and a polite reminder template.' },
  { Icon: Coins,       title: 'Built-in payment links',  body: 'UPI, card, netbanking, and QR — collected via a runQ-managed payment page. Auto-marked paid on receipt.' },
  { Icon: Hash,        title: 'Multi-series, multi-GSTIN', body: 'Separate invoice series per branch and GSTIN. Auto-locking once filed in GSTR-1.' },
  { Icon: RefreshCcw,  title: 'Recurring invoices',      body: 'Set up monthly retainers and AMCs once — runQ raises, sends, and reconciles them every cycle.' },
  { Icon: FileText,    title: 'Customisable templates',  body: 'Upload your logo, pick a theme. Or use one of the eight templates designed for Indian formats.' },
];

export default function InvoicingPage() {
  useEffect(() => { document.title = 'Invoicing — runQ'; }, []);
  return (
    <main>
      <PageHero
        eyebrow="PRODUCT · INVOICING"
        title="Invoice in"
        titleItalic="under 30 seconds."
        subtitle="GST-compliant, e-Invoice & e-Way bill ready, sent via WhatsApp or email — from your phone or laptop. Built around the way Indian businesses actually bill."
      />

      <Section><InvoiceMockup /></Section>

      <GreySection>
        <SectionHead
          eyebrow="WHAT YOU GET"
          title="Everything that should be one click, is."
          subtitle="No hunting through menus to e-sign, no separate portal for e-Way."
        />
        <div className="mt-12">
          <IconGrid items={features} />
        </div>
      </GreySection>

      <Section>
        <FeatureRow
          eyebrow="ON THE MOVE"
          title="Raise an invoice from the auto."
          body="The mobile app is the same product, not a watered-down companion. Quick Invoice on the home screen lets you type three things — customer, item, amount — and runQ does the rest."
          bullets={[
            'Customer auto-complete with full GSTIN & address',
            'Last-used items show first; HSN remembered per item',
            'Offline drafts sync when you regain signal',
            'WhatsApp send works without leaving the app',
          ]}
          visual={<PhoneMockup />}
        />
      </Section>

      <DarkSection>
        <SectionHead
          eyebrow="UNDER THE HOOD"
          title="Compliance built-in, not bolted on."
          accent="violet"
          dark
        />
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {([
            ['IRP integration',                'Direct connection to the GSTN Invoice Registration Portal. No third-party intermediaries.'],
            ['Reverse charge & composition',   'Native handling for RCM transactions, composition scheme, and unregistered customers.'],
            ['SEZ & exports',                  'LUT, with-payment / without-payment, foreign currency invoicing — all GST-correct.'],
          ] as const).map(([t, b]) => (
            <div key={t} className="reveal rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="text-base font-semibold text-white">{t}</div>
              <div className="mt-2 text-sm text-zinc-400">{b}</div>
            </div>
          ))}
        </div>
        <div className="reveal mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4">
          {([
            ['28s',    'Average invoice creation'],
            ['99.7%',  'IRN success on first try'],
            ['8',      'Invoice templates'],
            ['0',      'Per-invoice fees'],
          ] as const).map(([v, k]) => (
            <div key={k} className="bg-zinc-950 p-6">
              <div className="text-3xl font-semibold tracking-tight tabular text-white">{v}</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-zinc-500">{k}</div>
            </div>
          ))}
        </div>
      </DarkSection>

      <FooterCTA />
    </main>
  );
}
