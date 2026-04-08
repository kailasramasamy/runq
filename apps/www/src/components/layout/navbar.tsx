import { useState, useRef, useEffect } from 'react';
import {
  ChevronDown, Menu, X, BarChart3, Users, Calculator,
  Package, ShoppingCart, Handshake, FolderKanban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavLink, useRouter } from '@/lib/router';
import { Button } from '@/components/ui/button';

interface ProductLink {
  href: string;
  label: string;
  icon: typeof Calculator;
  desc: string;
  soon?: boolean;
}

const productLinks: ProductLink[] = [
  { href: '/finance', label: 'Finance & Accounting', icon: Calculator, desc: 'GST invoicing, AP/AR, bank recon' },
  { href: '/hr', label: 'Human Resources', icon: Users, desc: 'Payroll, attendance, leaves', soon: true },
  { href: '/bi', label: 'Business Intelligence', icon: BarChart3, desc: 'Dashboards, reports, forecasting', soon: true },
  { href: '#', label: 'Inventory & Warehouse', icon: Package, desc: 'Stock tracking, multi-warehouse', soon: true },
  { href: '#', label: 'Procurement', icon: ShoppingCart, desc: 'Purchase orders, 3-way matching', soon: true },
  { href: '#', label: 'CRM & Sales', icon: Handshake, desc: 'Leads, deals, quotations', soon: true },
  { href: '#', label: 'Projects', icon: FolderKanban, desc: 'Tasks, time tracking, billing', soon: true },
];

const navLinks = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

function ProductDropdown({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute top-full left-0 mt-2 w-80 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl shadow-black/50 overflow-hidden p-2">
      {productLinks.map(({ href, label, icon: Icon, desc, soon }) => {
        const content = (
          <div className={cn(
            'flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors duration-150',
            soon ? 'opacity-60' : 'hover:bg-zinc-800 cursor-pointer',
          )}>
            <div className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-primary-950 border border-primary-800 shrink-0">
              <Icon className="size-4 text-primary-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-100">{label}</span>
                {soon && (
                  <span className="shrink-0 rounded-full bg-amber-900/50 border border-amber-700/50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                    Soon
                  </span>
                )}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">{desc}</div>
            </div>
          </div>
        );

        if (soon || href === '#') return <div key={label}>{content}</div>;

        return (
          <NavLink key={href} to={href} className={() => ''} onClick={onClose}>
            {content}
          </NavLink>
        );
      })}
    </div>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { navigate } = useRouter();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-80 max-w-full bg-zinc-950 border-l border-zinc-800',
          'flex flex-col p-6 transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-between mb-8">
          <Logo />
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors">
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-2 px-3">Modules</p>
          {productLinks.map(({ href, label, icon: Icon, soon }) => {
            if (soon || href === '#') {
              return (
                <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-500 opacity-60">
                  <Icon className="size-4" />
                  <span className="flex-1">{label}</span>
                  <span className="rounded-full bg-amber-900/50 border border-amber-700/50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">Soon</span>
                </div>
              );
            }
            return (
              <NavLink
                key={href}
                to={href}
                onClick={onClose}
                className={(active) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                    active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            );
          })}

          <div className="my-4 border-t border-zinc-800" />

          {navLinks.map(({ href, label }) => (
            <NavLink
              key={href}
              to={href}
              onClick={onClose}
              className={(active) =>
                cn(
                  'px-3 py-2.5 rounded-lg text-sm transition-colors',
                  active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <Button
          onClick={() => { navigate('/get-started'); onClose(); }}
          size="lg"
          className="w-full mt-6"
        >
          Get Started
        </Button>
      </div>
    </>
  );
}

function Logo() {
  const { path } = useRouter();
  const label = path.startsWith('/finance') ? 'Finance' : 'ERP';
  return (
    <NavLink to="/" className="flex items-center gap-2">
      <img src="/runq-light.png" alt="runQ" className="h-7" />
      <span className="rounded border border-primary-500/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-400">{label}</span>
    </NavLink>
  );
}

export function Navbar() {
  const [productOpen, setProductOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { navigate } = useRouter();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProductOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 w-full backdrop-blur-lg bg-zinc-950/80 border-b border-zinc-800/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-6">
            <Logo />

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {/* Product dropdown */}
              <div ref={dropdownRef} className="relative">
                <button
                  onClick={() => setProductOpen((v) => !v)}
                  className={cn(
                    'flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    productOpen ? 'text-zinc-100 bg-zinc-800/60' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60',
                  )}
                >
                  Product
                  <ChevronDown className={cn('size-3.5 transition-transform duration-200', productOpen && 'rotate-180')} />
                </button>
                {productOpen && <ProductDropdown onClose={() => setProductOpen(false)} />}
              </div>

              {navLinks.map(({ href, label }) => (
                <NavLink
                  key={href}
                  to={href}
                  className={(active) =>
                    cn(
                      'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      active ? 'text-zinc-100 bg-zinc-800/60' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60',
                    )
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/contact')}
              >
                Sign In
              </Button>
              <Button
                size="sm"
                onClick={() => navigate('/get-started')}
              >
                Get Started
              </Button>
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}
