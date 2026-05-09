import { useState } from 'react';
import {
  LogIn, FileText, FileInput, Landmark, ShieldCheck,
  Sparkles, Quote,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';

interface FeatureRow {
  Icon: LucideIcon;
  title: string;
  body: string;
}

const FEATURES: FeatureRow[] = [
  {
    Icon: FileText,
    title: 'GST-compliant invoicing',
    body: 'Create e-Invoices with IRN + e-Way bill, send via WhatsApp.',
  },
  {
    Icon: FileInput,
    title: 'AI bill capture',
    body: 'Snap a photo or forward an email. Vendor, GSTIN, lines auto-extracted.',
  },
  {
    Icon: Landmark,
    title: 'Bank reconciliation',
    body: 'Connect once, AI matches statements to invoices and bills.',
  },
  {
    Icon: ShieldCheck,
    title: 'GST returns end-to-end',
    body: 'GSTR-1 / 3B / 2B prepared, validated, filed via GSP.',
  },
];

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sessionExpired =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('session') === 'expired';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { platform } = await login(email, password, '');
      const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
      window.location.href = platform ? `${base}/admin` : (import.meta.env.BASE_URL ?? '/');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Invalid credentials. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-indigo-50">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 gap-12 px-6 py-10 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:px-10">
        {/* ─── Left: pitch + features ─── */}
        <section className="order-2 lg:order-1">
          <div className="mb-8 flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}runq-dark.png`}
              alt="runQ"
              className="h-9 w-auto"
            />
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
              Finance & Accounting ERP
            </span>
          </div>

          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tight text-zinc-900 sm:text-[52px]">
            The finance OS
            <br />
            <span className="font-display-italic bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-[44px] text-transparent sm:text-[58px]">
              for Indian SMEs.
            </span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-600 sm:text-[15px]">
            One product for invoices, bills, banking, and GST. Designed so you can run daily ops
            without your CA — and so your CA can review, file, and close without emailing back-and-forth.
          </p>

          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="flex items-start gap-3 rounded-xl border border-zinc-200/70 bg-white/60 p-3 backdrop-blur-sm transition-colors hover:border-indigo-200 hover:bg-white"
              >
                <span className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                  <f.Icon size={16} className="text-indigo-600" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-zinc-900">{f.title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-600">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex items-start gap-3 rounded-xl border border-zinc-200/70 bg-white/60 p-4">
            <Quote size={16} className="mt-0.5 flex-shrink-0 text-indigo-500" />
            <div>
              <p className="text-[13px] leading-relaxed text-zinc-700">
                "We replaced Tally and three spreadsheets with runQ.
                Month-end used to take a week — now it's a single afternoon."
              </p>
              <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Founder · Mid-sized FMCG distributor
              </p>
            </div>
          </div>

          <p className="mt-8 inline-flex items-center gap-2 text-[12px] text-zinc-500">
            <Sparkles size={12} className="text-indigo-500" />
            Trusted by manufacturers, distributors, services, and CAs across India.
          </p>
        </section>

        {/* ─── Right: sign-in form ─── */}
        <section className="order-1 lg:order-2">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-6 flex flex-col items-center gap-1 text-center lg:items-start lg:text-left">
              <h2 className="text-[26px] font-semibold tracking-tight text-zinc-900">
                Sign in to <span className="font-display-italic">runQ</span>
              </h2>
              <p className="text-sm text-zinc-500">Welcome back. Pick up where you left off.</p>
            </div>

            {sessionExpired && !error && (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs text-amber-700">
                  Your session has expired. Please sign in again.
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.08)]">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-zinc-700">Email</label>
                  <input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                    required
                    className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-zinc-700">Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                  />
                </div>

                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                    <p className="text-xs text-red-700">{error}</p>
                  </div>
                )}

                <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-2 w-full">
                  <LogIn size={16} />
                  Sign In
                </Button>
              </form>
            </div>

            <p className="mt-6 text-center text-xs text-zinc-400 lg:text-left">
              runQ Finance v1
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
