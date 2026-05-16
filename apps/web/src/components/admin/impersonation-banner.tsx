import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api-client';

const IMPERSONATION_TOKEN_KEY = 'runq-impersonation-active';
const PLATFORM_TOKEN_KEY = 'runq-platform-token';

interface ImpersonationContext {
  tenantName: string;
  tenantSlug: string;
}

export function ImpersonationBanner() {
  const [ctx, setCtx] = useState<ImpersonationContext | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(IMPERSONATION_TOKEN_KEY);
    if (raw) {
      try {
        setCtx(JSON.parse(raw));
      } catch {
        setCtx(null);
      }
    }
  }, []);

  if (!ctx) return null;

  const exit = async () => {
    try {
      await api.post('/admin/impersonate/exit', {});
    } catch {
      // best-effort log; continue exiting regardless
    }
    localStorage.removeItem(IMPERSONATION_TOKEN_KEY);
    const platformToken = localStorage.getItem(PLATFORM_TOKEN_KEY);
    if (platformToken) {
      localStorage.setItem('runq-token', platformToken);
      localStorage.removeItem(PLATFORM_TOKEN_KEY);
      window.location.href = '/finance/admin';
    } else {
      localStorage.removeItem('runq-token');
      window.location.href = '/login';
    }
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-red-600 px-4 py-2 text-sm text-white shadow">
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Impersonating <strong>{ctx.tenantName}</strong> ({ctx.tenantSlug}). All actions are audited.
        </span>
      </div>
      <button
        type="button"
        onClick={exit}
        className="shrink-0 rounded-md bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25"
      >
        Exit impersonation
      </button>
    </div>
  );
}
