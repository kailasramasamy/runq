import { useEffect, useState, type MouseEvent } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavLink, useRouter } from '@/lib/router';

interface Link {
  label: string;
  href: string;
  anchor?: boolean;
}

const links: Link[] = [
  { label: 'Features', href: '#features', anchor: true },
  { label: 'Mobile',   href: '#mobile',   anchor: true },
  { label: 'For CAs',  href: '#for-cas',  anchor: true },
  { label: 'Pricing',  href: '/pricing' },
  { label: 'About',    href: '/about' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { navigate, path } = useRouter();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleAnchor = (e: MouseEvent, href: string) => {
    e.preventDefault();
    setOpen(false);
    const id = href.slice(1);
    if (path === '/') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate('/');
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 80);
    }
  };

  return (
    <nav
      className={cn(
        'sticky top-0 z-40 transition-all',
        scrolled ? 'nav-blur border-b border-zinc-200/70 bg-white/75' : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-14 max-w-[1200px] items-center px-5 lg:px-8">
        <NavLink to="/" className="flex items-center gap-2">
          <img src="/runq-dark.png" alt="runQ" className="h-6" />
          <span className="rounded border border-brand-500/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-600">
            ERP
          </span>
        </NavLink>

        <div className="ml-10 hidden items-center gap-7 lg:flex">
          {links.map((l) =>
            l.anchor ? (
              <a
                key={l.label}
                href={l.href}
                onClick={(e) => handleAnchor(e, l.href)}
                className="text-sm text-zinc-600 transition-colors hover:text-zinc-900"
              >
                {l.label}
              </a>
            ) : (
              <NavLink
                key={l.label}
                to={l.href}
                className={(active) =>
                  cn('text-sm transition-colors hover:text-zinc-900', active ? 'text-zinc-900' : 'text-zinc-600')
                }
              >
                {l.label}
              </NavLink>
            ),
          )}
        </div>

        <div className="ml-auto hidden items-center gap-3 lg:flex">
          <a href="/login" className="text-sm text-zinc-600 hover:text-zinc-900">Sign in</a>
          <button
            onClick={() => navigate('/get-started')}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Get started free <ArrowRight size={14} />
          </button>
        </div>

        <button className="ml-auto lg:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-zinc-200 bg-white px-5 py-4 lg:hidden">
          {links.map((l) =>
            l.anchor ? (
              <a
                key={l.label}
                href={l.href}
                onClick={(e) => handleAnchor(e, l.href)}
                className="block py-2 text-sm text-zinc-700"
              >
                {l.label}
              </a>
            ) : (
              <NavLink
                key={l.label}
                to={l.href}
                onClick={() => setOpen(false)}
                className="block py-2 text-sm text-zinc-700"
              >
                {l.label}
              </NavLink>
            ),
          )}
          <button
            onClick={() => {
              setOpen(false);
              navigate('/get-started');
            }}
            className="mt-2 block w-full rounded-md bg-zinc-900 px-3 py-2 text-center text-sm font-medium text-white"
          >
            Get started free
          </button>
        </div>
      )}
    </nav>
  );
}
