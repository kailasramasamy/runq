import { Github, Heart, Linkedin, Twitter, type LucideIcon } from 'lucide-react';
import { NavLink } from '@/lib/router';

interface FooterLink { label: string; href: string }

const cols: Array<{ title: string; items: FooterLink[] }> = [
  {
    title: 'Product',
    items: [
      { label: 'Invoicing',           href: '/invoicing' },
      { label: 'Bank reconciliation', href: '/bank-reconciliation' },
      { label: 'GST filing',          href: '/gst-filing' },
      { label: 'Bills & expenses',    href: '/bills-expenses' },
      { label: 'Reports',             href: '/reports' },
      { label: 'Mobile apps',         href: '/mobile-apps' },
    ],
  },
  {
    title: 'For',
    items: [
      { label: 'SME owners',            href: '/for-sme-owners' },
      { label: 'Chartered accountants', href: '/for-cas' },
      { label: 'Manufacturers',         href: '/for-manufacturers' },
      { label: 'Service businesses',    href: '/for-service' },
    ],
  },
  {
    title: 'Company',
    items: [
      { label: 'About Quartex', href: '/about' },
      { label: 'Careers',       href: '/careers' },
      { label: 'Press',         href: '/press' },
      { label: 'Contact',       href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    items: [
      { label: 'Privacy',        href: '/privacy' },
      { label: 'Terms',          href: '/terms' },
      { label: 'Security',       href: '/security' },
      { label: 'GST compliance', href: '/gst-compliance' },
    ],
  },
];

const social: LucideIcon[] = [Twitter, Linkedin, Github];

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-zinc-950 pt-20 pb-8 text-zinc-400">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
      <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="grid grid-cols-12 gap-6 md:gap-10">
          <div className="col-span-12 lg:col-span-4">
            <NavLink to="/" className="inline-flex items-center gap-2">
              <img src="/runq-light.png" alt="runQ" className="h-7" />
              <span className="rounded border border-brand-400/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-300">
                Finance
              </span>
            </NavLink>
            <p className="mt-4 max-w-xs text-sm text-zinc-500">
              Modern books for modern Indian businesses. Built by Quartex Technologies in Bengaluru.
            </p>
            <div className="mt-5 flex gap-2">
              {social.map((Ic, i) => (
                <a
                  key={i}
                  href="#"
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 hover:border-brand-500/40 hover:text-brand-300"
                >
                  <Ic size={14} />
                </a>
              ))}
            </div>
          </div>

          <div className="col-span-12 grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-8">
            {cols.map((c) => (
              <div key={c.title}>
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-300">{c.title}</div>
                <ul className="mt-3 space-y-2 text-sm">
                  {c.items.map((l) => (
                    <li key={l.href}>
                      <NavLink to={l.href} className="text-zinc-500 transition-colors hover:text-zinc-200">
                        {l.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-3 border-t border-zinc-800 pt-6 text-xs text-zinc-500 sm:flex-row sm:items-center">
          <div>© 2026 Quartex Technologies Pvt Ltd · runq.in</div>
          <div className="flex items-center gap-1.5">
            Made with <Heart size={11} className="fill-rose-400 text-rose-400" /> in Bangalore, India
          </div>
        </div>
      </div>
    </footer>
  );
}
