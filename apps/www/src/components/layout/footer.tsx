import { Twitter, Linkedin, Github } from 'lucide-react';
import { NavLink, useRouter } from '@/lib/router';

const links = [
  { href: '/finance', label: 'Finance' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

const socialLinks = [
  { href: 'https://twitter.com/runqhq', label: 'Twitter', icon: Twitter },
  { href: 'https://linkedin.com/company/runqhq', label: 'LinkedIn', icon: Linkedin },
  { href: 'https://github.com/runqhq', label: 'GitHub', icon: Github },
];

export function Footer() {
  const year = new Date().getFullYear();
  const { path } = useRouter();
  const label = path.startsWith('/finance') ? 'Finance' : 'ERP';

  return (
    <footer className="border-t border-zinc-800/50">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Top row: logo + nav + social */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <NavLink to="/" className="inline-flex items-center gap-2">
            <img src="/runq-light.png" alt="runQ" className="h-6" />
            <span className="rounded border border-primary-500/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-400">{label}</span>
          </NavLink>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {links.map(({ href, label }) => (
              <NavLink
                key={href}
                to={href}
                className="text-sm text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {socialLinks.map(({ href, label, icon: Icon }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="flex size-8 items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>

        {/* Bottom row */}
        <div className="mt-8 pt-6 border-t border-zinc-800/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
          <p>&copy; {year} Quartex Technologies. All rights reserved.</p>
          <nav className="flex items-center gap-x-5">
            <NavLink to="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</NavLink>
            <NavLink to="/terms" className="hover:text-zinc-300 transition-colors">Terms</NavLink>
            <NavLink to="/support" className="hover:text-zinc-300 transition-colors">Support</NavLink>
          </nav>
          <p>Made with ❤️ in Bangalore, India</p>
        </div>
      </div>
    </footer>
  );
}
