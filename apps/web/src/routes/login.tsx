import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';

export function LoginPage() {
  const { login } = useAuth();
  const [tenant, setTenant] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!tenant.trim()) {
      setError('Workspace slug is required.');
      return;
    }
    setLoading(true);
    try {
      await login(email, password, tenant.trim().toLowerCase());
      window.location.href = '/';
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-indigo-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/logo.svg" alt="runQ" className="h-10 w-auto" />
          <div className="text-center">
            <h1 className="text-xl font-semibold text-zinc-100">Sign in to runQ</h1>
            <p className="mt-1 text-sm text-zinc-400">Finance & Accounting ERP</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tenant */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-300">
                Workspace
              </label>
              <input
                type="text"
                placeholder="your-company"
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
                autoComplete="organization"
                autoFocus
                className="block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* Email */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-300">
                Email
              </label>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-300">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="mt-2 w-full"
            >
              <LogIn size={16} />
              Sign In
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          runQ Finance v1 &mdash; Internal use only
        </p>
      </div>
    </div>
  );
}
