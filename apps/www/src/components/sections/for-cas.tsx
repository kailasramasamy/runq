import { Fragment } from 'react';
import { Download, Eye, FileText, Sparkles, Users, type LucideIcon } from 'lucide-react';

interface Feature {
  Icon: LucideIcon;
  title: string;
  sub: string;
}

const features: Feature[] = [
  { Icon: Users,    title: 'Multi-client switcher',   sub: 'Jump between 27 client books in one keystroke. Recent, pinned, search.' },
  { Icon: Download, title: 'Tally-compatible export', sub: 'XML and DAT exports that import cleanly into Tally Prime — no manual mapping.' },
  { Icon: Eye,      title: 'Read-only CA portal',     sub: 'Give your CA scoped access. They see books, you keep control of approvals.' },
  { Icon: FileText, title: 'GSTR-ready bundles',      sub: 'GSTR-1, 3B, 2B, 9 with reconciliations attached. One-click filing.' },
];

const flow: Array<[string, string, string]> = [
  ['1', 'Pull all 2B', 'auto'],
  ['2', 'Reconcile bills', '12 min'],
  ['3', 'Approve 1B/3B', 'in-app'],
  ['4', 'Tally export', '1-click'],
  ['5', 'Done', '🎉'],
];

export function ForCAs() {
  return (
    <section id="for-cas" className="ca-bg relative py-24">
      <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="grid grid-cols-12 gap-10">
          {/* Sticky left */}
          <div className="col-span-12 lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <div className="reveal text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                For Chartered Accountants
              </div>
              <h2 className="reveal mt-3 text-4xl tracking-tight text-zinc-900 lg:text-5xl">
                Built <span className="font-display italic">with</span> CAs,
                <br />
                not <span className="font-display italic">around</span> them.
              </h2>
              <p className="reveal mt-4 text-zinc-600" style={{ textWrap: 'pretty' }}>
                We did 80+ interviews with practising CAs in Bengaluru, Mumbai and Coimbatore before writing a line of code. The result is a portal that fits how your month-end actually flows.
              </p>

              <figure className="reveal mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <Sparkles size={16} className="text-brand-500" />
                <blockquote className="mt-3 text-base leading-relaxed text-zinc-800">
                  <span className="font-display italic text-2xl text-brand-700">"</span>
                  I closed three sets of books in the time I usually take for one. The Tally export just works — no fudging in Excel.
                  <span className="font-display italic text-2xl text-brand-700">"</span>
                </blockquote>
                <figcaption className="mt-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-300 to-emerald-600" />
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">CA Priya Subramanian</div>
                    <div className="text-xs text-zinc-500">
                      Partner, Subramanian & Co · Bengaluru · 14 years practice
                    </div>
                  </div>
                </figcaption>
              </figure>
            </div>
          </div>

          {/* Right grid */}
          <div className="reveal col-span-12 lg:col-span-7">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {features.map((f) => (
                <div key={f.title} className="lift rounded-2xl border border-zinc-200 bg-white p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                    <f.Icon size={16} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-zinc-900">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{f.sub}</p>
                </div>
              ))}
            </div>

            {/* Workflow strip */}
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                A typical CA month-end on runQ
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs">
                {flow.map(([n, label, t], i) => (
                  <Fragment key={n}>
                    <div className="flex flex-1 flex-col items-center text-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 font-mono text-[11px] font-semibold text-emerald-700">
                        {n}
                      </div>
                      <div className="mt-1.5 text-[11px] font-medium text-zinc-800">{label}</div>
                      <div className="text-[10px] text-zinc-500">{t}</div>
                    </div>
                    {i < flow.length - 1 && <div className="h-px flex-1 border-t border-dashed border-zinc-300" />}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
