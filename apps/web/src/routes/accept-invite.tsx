import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, ArrowRight, LogIn } from 'lucide-react';
import { Button } from '@/components/ui';
import { markWelcomePending } from '@/components/welcome-screen';

type InviteType = 'new_tenant' | 'join_tenant';
type InviteAudience = 'finance_collab' | 'employee';
type Mode = 'register' | 'login' | 'one_click';

interface InviteLookupResponse {
  data: {
    token: string;
    inviteType: InviteType;
    audience: InviteAudience;
    role: string;
    email: string | null;
    companyName: string | null;
    note: string | null;
    expiresAt: string;
    valid: boolean;
    expired: boolean;
    used: boolean;
    invitingUser: { name: string; email: string };
    invitingTenantName: string;
  };
}

interface AcceptResponse {
  data: {
    token: string;
    user: { id: string; tenantId?: string; email: string; name: string };
    tenant: { id: string; name: string; slug: string } | null;
  };
}

const API_BASE = '/api/v1';
const TOKEN_KEY = 'runq-token';
const ACTIVE_TENANT_KEY = 'runq-active-tenant-id';

function getTokenFromPath(): string | null {
  // Matches /signup/invite/:token AND /finance/signup/invite/:token
  const m = window.location.pathname.match(/\/signup\/invite\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50);
}

export function AcceptInvitePage() {
  const token = getTokenFromPath();
  const [lookup, setLookup] = useState<InviteLookupResponse['data'] | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Flow A (new_tenant) form fields
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugDirty, setSlugDirty] = useState(false);

  // Shared identity fields (used by both flows)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Flow B (join_tenant) sub-mode
  const [mode, setMode] = useState<Mode>('register');

  // Detect existing session for one-click acceptance of join_tenant invites
  const existingToken = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;

  useEffect(() => {
    if (!token) {
      setLookupError('Invalid invite link');
      return;
    }
    fetch(`${API_BASE}/auth/invites/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.message || 'Invite not found');
        }
        return r.json() as Promise<InviteLookupResponse>;
      })
      .then((res) => {
        setLookup(res.data);
        if (res.data.email) setEmail(res.data.email);
        // Pre-fill company name when the CA pre-set it; user can still edit.
        if (res.data.companyName) {
          setCompanyName(res.data.companyName);
          setSlugDirty(false); // let the slug auto-derive from prefilled name
        }
        // Default starting mode for join_tenant: one_click if logged in, else register
        if (res.data.inviteType === 'join_tenant') {
          setMode(existingToken ? 'one_click' : 'register');
        }
      })
      .catch((err) => setLookupError(err.message ?? 'Invite lookup failed'));
  }, [token, existingToken]);

  // Auto-derive slug for new_tenant flow.
  useEffect(() => {
    if (!slugDirty) setSlug(slugify(companyName));
  }, [companyName, slugDirty]);

  async function submitNewTenant() {
    const res = await fetch(`${API_BASE}/auth/invites/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, companyName, slug, name, email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Sign-up failed');
    }
    const accepted = (await res.json()) as AcceptResponse;
    return accepted.data;
  }

  async function submitJoinTenant() {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (mode === 'one_click' && existingToken) {
      headers['Authorization'] = `Bearer ${existingToken}`;
    }

    let body: Record<string, unknown> = { token };
    if (mode === 'register') body = { token, name, email, password };
    if (mode === 'login') body = { token, email, password };

    const res = await fetch(`${API_BASE}/auth/invites/accept-join`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || 'Could not accept invite');
    }
    const accepted = (await res.json()) as AcceptResponse;
    return accepted.data;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !lookup) return;

    const isNewTenant = lookup.inviteType === 'new_tenant';
    const nameRequired = isNewTenant || mode === 'register';
    const credsRequired = isNewTenant || mode !== 'one_click';

    if (nameRequired) {
      const trimmed = name.trim();
      if (!trimmed) {
        setSubmitError('Please enter your name.');
        return;
      }
      if (trimmed.includes('@')) {
        setSubmitError('Please enter your name (not your email address).');
        return;
      }
      if (trimmed.length < 2) {
        setSubmitError('Name must be at least 2 characters.');
        return;
      }
    }

    if (credsRequired) {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        setSubmitError('Please enter your email.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        setSubmitError('Please enter a valid email address.');
        return;
      }
      if (!password) {
        setSubmitError('Please enter a password.');
        return;
      }
      if (password.length < 8) {
        setSubmitError('Password must be at least 8 characters.');
        return;
      }
    }

    if (isNewTenant) {
      if (!companyName.trim()) {
        setSubmitError('Please enter a company name.');
        return;
      }
      if (!slug.trim()) {
        setSubmitError('Please enter a URL slug for your books.');
        return;
      }
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const data =
        lookup.inviteType === 'new_tenant'
          ? await submitNewTenant()
          : await submitJoinTenant();

      // Persist token and active tenant for the joined/created tenant.
      localStorage.setItem(TOKEN_KEY, data.token);
      if (data.tenant?.id) {
        localStorage.setItem(ACTIVE_TENANT_KEY, data.tenant.id);
      }
      // Trigger the welcome carousel:
      //   - new_tenant flow → owner-focused tour ("your books are ready, here's daily flow")
      //   - join_tenant + brand-new user (sub-flow C) → CA-focused tour ("you've joined X's books, here's how to review/file")
      //   - join_tenant + existing user (sub-flow A or B) → no tour (they know runQ)
      if (lookup?.inviteType === 'new_tenant') {
        markWelcomePending({
          variant: 'new_tenant_owner',
          invitingUserName: lookup.invitingUser?.name,
          tenantName: data.tenant?.name,
        });
      } else if (lookup?.inviteType === 'join_tenant' && mode === 'register' && lookup?.audience !== 'employee') {
        markWelcomePending({
          variant: 'ca_joining',
          invitingUserName: lookup.invitingUser?.name,
          tenantName: lookup.invitingTenantName,
        });
      }
      // Employees land in the HR module; CA/collab invites land in Finance.
      window.location.href = lookup?.audience === 'employee' ? '/hr' : '/finance';
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Something went wrong';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (lookupError) {
    return <ErrorScreen title="Invite unavailable" message={lookupError} />;
  }

  if (!lookup) {
    return (
      <Shell>
        <p className="text-sm text-zinc-500">Loading invite…</p>
      </Shell>
    );
  }

  if (!lookup.valid) {
    return (
      <ErrorScreen
        title={lookup.used ? 'Invite already used' : 'Invite expired'}
        message={
          lookup.used
            ? 'This link has already been redeemed. Ask the inviter for a fresh invite.'
            : `This link expired on ${new Date(lookup.expiresAt).toLocaleDateString()}. Ask the inviter for a fresh invite.`
        }
      />
    );
  }

  const isNewTenant = lookup.inviteType === 'new_tenant';
  const isEmployee = lookup.audience === 'employee';

  const shellTitle = isNewTenant
    ? 'Start your runQ books'
    : isEmployee
      ? `Set up your ${lookup.invitingTenantName} account`
      : `Join ${lookup.invitingTenantName}`;

  const bannerTitle = isNewTenant
    ? `${lookup.invitingUser.name} from ${lookup.invitingTenantName} invited you to runQ`
    : isEmployee
      ? `${lookup.invitingTenantName} invited you to runQ`
      : `${lookup.invitingUser.name} from ${lookup.invitingTenantName} invited you to join their books as ${lookup.role}`;

  const bannerBody = isNewTenant
    ? `They'll be added to your new books as your ${lookup.role}.`
    : isEmployee
      ? 'Set a password to view your attendance, leave, and payslips on the runQ app.'
      : `You'll get ${lookup.role === 'viewer' ? 'read-only' : 'read & write'} access.`;

  return (
    <Shell title={shellTitle}>
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.08)]">
        <div className="mb-4 flex items-start gap-3 rounded-md border border-indigo-200 bg-indigo-50 p-3">
          <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-indigo-600" />
          <div className="text-sm">
            <p className="font-medium text-zinc-900">{bannerTitle}</p>
            <p className="mt-1 text-xs text-zinc-600">
              {bannerBody}
              {lookup.note && !isEmployee ? ` Note: ${lookup.note}` : ''}
            </p>
          </div>
        </div>

        {/* Mode chips — only meaningful for CA/collab invites where the
            invitee may already have a runQ account. Employee invites are
            always "new user, set a password," so we hide the chips. */}
        {!isNewTenant && !isEmployee && (
          <div className="mb-4 flex flex-wrap gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-1 text-xs">
            {existingToken && (
              <ModeChip active={mode === 'one_click'} onClick={() => setMode('one_click')}>
                Accept with current session
              </ModeChip>
            )}
            <ModeChip active={mode === 'register'} onClick={() => setMode('register')}>
              I'm new to runQ
            </ModeChip>
            <ModeChip active={mode === 'login'} onClick={() => setMode('login')}>
              I already have an account
            </ModeChip>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isNewTenant && (
            <>
              <Field label="Company name" value={companyName} onChange={setCompanyName} placeholder="Acme Pvt Ltd" required autoFocus />
              <Field
                label="URL slug"
                value={slug}
                onChange={(v) => { setSlug(v); setSlugDirty(true); }}
                placeholder="acme"
                required
                hint="Lowercase letters, numbers, and hyphens only."
              />
            </>
          )}

          {/* Identity fields — visible based on mode */}
          {(isNewTenant || mode === 'register') && (
            <Field label="Your name" value={name} onChange={setName} placeholder="Your full name" required />
          )}
          {(isNewTenant || mode !== 'one_click') && (
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              required
              disabled={isNewTenant && !!lookup.email}
            />
          )}
          {(isNewTenant || mode !== 'one_click') && (
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder={mode === 'login' ? 'Your existing password' : 'At least 8 characters'}
              required
            />
          )}

          {!isNewTenant && mode === 'one_click' && (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
              Accepting will add <strong className="text-zinc-900">{lookup.invitingTenantName}</strong> to your tenant list.
              You can switch into it any time via Cmd-K.
            </p>
          )}

          {submitError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs text-red-700">{submitError}</p>
            </div>
          )}

          <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
            {isNewTenant ? (
              <>Create my company books <ArrowRight size={16} /></>
            ) : mode === 'one_click' ? (
              <>Accept invitation <ArrowRight size={16} /></>
            ) : mode === 'login' ? (
              <><LogIn size={16} /> Sign in & accept</>
            ) : (
              <>Create account & accept <ArrowRight size={16} /></>
            )}
          </Button>
        </form>
      </div>
    </Shell>
  );
}

function ModeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded px-3 py-1.5 transition-colors ${
        active
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-zinc-600 hover:bg-white hover:text-zinc-900'
      }`}
    >
      {children}
    </button>
  );
}

function Shell({ children, title = 'Start your runQ books' }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-50 via-white to-indigo-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/runq-dark.png" alt="runQ" className="h-10 w-auto" />
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              {title.split('runQ').length > 1 ? (
                <>
                  {title.split('runQ')[0]}
                  <span className="font-display-italic">runQ</span>
                  {title.split('runQ')[1]}
                </>
              ) : (
                title
              )}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">Finance & Accounting ERP</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <Shell title="runQ">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-[0_20px_50px_-15px_rgba(0,0,0,0.08)]">
        <XCircle size={36} className="mx-auto mb-3 text-red-500" />
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        <p className="mt-2 text-sm text-zinc-600">{message}</p>
      </div>
    </Shell>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

function Field({ label, value, onChange, placeholder, type = 'text', required, hint, disabled, autoFocus }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="ml-0.5 text-red-500" aria-hidden>*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        aria-required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        minLength={type === 'password' ? 8 : undefined}
        className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 disabled:bg-zinc-50 disabled:opacity-70"
      />
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
