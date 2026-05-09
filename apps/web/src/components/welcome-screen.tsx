import { useEffect, useState } from 'react';
import {
  ArrowRight, ArrowLeft, X, Check,
  FileText, FileInput, Landmark, ShieldCheck,
  Eye, MessageSquare, Download, Command, ListChecks, ClipboardCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';

const PENDING_FLAG_KEY = 'runq-welcome-pending';
const INVITER_KEY = 'runq-welcome-inviter';
const VARIANT_KEY = 'runq-welcome-variant';
const TENANT_NAME_KEY = 'runq-welcome-tenant-name';
const SEEN_PREFIX = 'runq-welcome-seen';

type WelcomeVariant = 'new_tenant_owner' | 'ca_joining';

interface MarkPendingArgs {
  variant: WelcomeVariant;
  invitingUserName?: string;
  tenantName?: string;
}

/**
 * Mark the welcome flow as pending. Only the entry-point flows that produce
 * a fresh user-tenant relationship should call this:
 *   - accept-invite (new_tenant flow) → variant: 'new_tenant_owner'
 *   - accept-invite (join_tenant, sub-flow C: brand-new user registers) → variant: 'ca_joining'
 *   - self-signup → variant: 'new_tenant_owner'
 *
 * Existing users who simply log in or switch tenants must NEVER call this.
 */
export function markWelcomePending({ variant, invitingUserName, tenantName }: MarkPendingArgs): void {
  try {
    localStorage.setItem(PENDING_FLAG_KEY, '1');
    localStorage.setItem(VARIANT_KEY, variant);
    if (invitingUserName) localStorage.setItem(INVITER_KEY, invitingUserName);
    if (tenantName) localStorage.setItem(TENANT_NAME_KEY, tenantName);
  } catch { /* SSR or denied */ }
}

function seenKey(userId: string, tenantId: string): string {
  return `${SEEN_PREFIX}-${userId}-${tenantId}`;
}

interface SlideProps {
  current: number;
  total: number;
}

function SlideShell({ children }: { children: React.ReactNode }) {
  return <div className="px-8 py-10 sm:px-10 sm:py-12">{children}</div>;
}

function SlideHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-6 text-center">
      {eyebrow && (
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">{eyebrow}</p>
      )}
      <h2 className="font-display text-[28px] leading-tight text-zinc-900 dark:text-zinc-50 sm:text-[32px]">{title}</h2>
      {subtitle && <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{subtitle}</p>}
    </div>
  );
}

interface FeatureCardProps {
  Icon: LucideIcon;
  title: string;
  body: string;
}

function FeatureCard({ Icon, title, body }: FeatureCardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700">
      <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15">
        <Icon size={16} className="text-indigo-600 dark:text-indigo-400" />
      </div>
      <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>
    </div>
  );
}

function CheckRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
      <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
        <Check size={12} className="text-emerald-600 dark:text-emerald-400" />
      </span>
      <span>{children}</span>
    </li>
  );
}

// ─── Variant A: new tenant owner (Rohit at Acme) ─────────────────────────────

function HeroBand({ greeting, subline }: { greeting: string; subline: React.ReactNode }) {
  return (
    <div className="-mx-8 -mt-10 mb-8 overflow-hidden rounded-t-2xl bg-gradient-to-br from-indigo-600 to-violet-600 px-8 py-12 text-center sm:-mx-10 sm:-mt-12 sm:px-10">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur">
        <span className="text-2xl">👋</span>
      </div>
      <h2 className="font-display text-[28px] leading-tight text-white sm:text-[34px]">{greeting}</h2>
      <p className="mt-2 text-sm text-indigo-100">{subline}</p>
    </div>
  );
}

function OwnerSlide1({ userName, tenantName, invitingUserName }: { userName: string; tenantName: string; invitingUserName?: string }) {
  return (
    <SlideShell>
      <HeroBand
        greeting={`Welcome to runQ, ${userName.split(' ')[0]}`}
        subline={<>Your books for <span className="font-semibold">{tenantName}</span> are ready.</>}
      />
      {invitingUserName ? (
        <p className="mb-2 text-center text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{invitingUserName}</span> is set up as your accountant.
          You'll do the daily work — invoices, bills, payments. They'll handle GST and reviews.
        </p>
      ) : (
        <p className="mb-2 text-center text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          Let's give you a quick tour. It takes about 30 seconds.
        </p>
      )}
    </SlideShell>
  );
}

function OwnerSlide2() {
  return (
    <SlideShell>
      <SlideHeader
        eyebrow="What you'll do daily"
        title="Four things, that's the job"
        subtitle="Every day on runQ comes down to these. Everything else is built around them."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FeatureCard Icon={FileText}    title="Invoice customers" body="GST-compliant in 30 seconds. WhatsApp the link." />
        <FeatureCard Icon={FileInput}   title="Capture bills"     body="Snap a photo. We extract the line items." />
        <FeatureCard Icon={Landmark}    title="Match the bank"    body="Connect your account. Reconcile in one click." />
        <FeatureCard Icon={ShieldCheck} title="Stay GST-ready"    body="GSTR-1, 3B, 2B prepared monthly." />
      </div>
    </SlideShell>
  );
}

function OwnerSlide3({ invitingUserName }: { invitingUserName?: string }) {
  const ca = invitingUserName ?? 'Your CA';
  return (
    <SlideShell>
      <SlideHeader
        eyebrow="How runQ works with your CA"
        title="You move daily, your CA reviews"
        subtitle="No more emailing back-and-forth at month-end."
      />
      <ul className="space-y-3">
        <CheckRow><span className="font-medium text-zinc-900 dark:text-zinc-100">Real-time visibility.</span> Everything you record, {ca} sees instantly.</CheckRow>
        <CheckRow><span className="font-medium text-zinc-900 dark:text-zinc-100">Smart approvals.</span> Bills above ₹10,000 route to {ca} (you can change this).</CheckRow>
        <CheckRow><span className="font-medium text-zinc-900 dark:text-zinc-100">One-click GST filing.</span> Month-end {ca} runs reports and files — all from your books.</CheckRow>
      </ul>
      <p className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-center text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        Your data is yours. <Download size={11} className="mx-1 inline" />Export to Tally, Excel, or PDF anytime.
      </p>
    </SlideShell>
  );
}

function OwnerSlide4({ onPrimary }: { onPrimary: () => void }) {
  const steps = [
    { n: 1, title: 'Add your GSTIN and address', body: 'Required for GST-compliant invoices.' },
    { n: 2, title: 'Connect your bank', body: 'Auto-imports transactions every 6 hours.' },
    { n: 3, title: 'Create your first invoice', body: 'Try it once — see how fast it is.' },
  ];
  return (
    <SlideShell>
      <SlideHeader eyebrow="Get started" title="Three small steps, then you're live" />
      <ol className="mb-6 space-y-3">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
              {s.n}
            </span>
            <div>
              <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{s.title}</p>
              <p className="mt-0.5 text-[12px] text-zinc-600 dark:text-zinc-400">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <PrimaryCta onClick={onPrimary}>Take me to my dashboard</PrimaryCta>
      <p className="mt-3 text-center text-[11px] text-zinc-500">Reopen this anytime from the help menu.</p>
    </SlideShell>
  );
}

// ─── Variant B: CA joining an existing tenant ────────────────────────────────

function CASlide1({ userName, tenantName, role }: { userName: string; tenantName: string; role: string }) {
  return (
    <SlideShell>
      <HeroBand
        greeting={`Welcome aboard, ${userName.split(' ')[0]}`}
        subline={<>You've joined <span className="font-semibold">{tenantName}</span> as {role}.</>}
      />
      <p className="mb-2 text-center text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        These are <span className="font-medium text-zinc-900 dark:text-zinc-100">{tenantName}</span>'s books.
        Their team handles daily entries — you review, file, and report.
      </p>
    </SlideShell>
  );
}

function CASlide2() {
  return (
    <SlideShell>
      <SlideHeader
        eyebrow="What you can do here"
        title="Review, reconcile, file"
        subtitle="The tools you need for a clean monthly close."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FeatureCard Icon={ClipboardCheck} title="Approve transactions" body="Review pending bills, payments, and journal entries above threshold." />
        <FeatureCard Icon={Landmark}       title="Reconcile banking"   body="Match statement lines to vendor payments. AI suggests matches." />
        <FeatureCard Icon={ShieldCheck}    title="File GST returns"    body="GSTR-1, 3B, 2B all queued, validated, filed via GSP." />
        <FeatureCard Icon={Download}       title="Export anytime"      body="Tally XML, Excel, PDF. Your client's data, on demand." />
      </div>
    </SlideShell>
  );
}

function CASlide3() {
  return (
    <SlideShell>
      <SlideHeader
        eyebrow="Managing many clients"
        title="One login. All your books."
        subtitle="Use Cmd-K to switch between client tenants — no logging out."
      />
      <ul className="space-y-3">
        <CheckRow><span className="font-medium text-zinc-900 dark:text-zinc-100">⌘K (or Ctrl-K)</span> opens the client switcher. Type three letters, hit enter.</CheckRow>
        <CheckRow><span className="font-medium text-zinc-900 dark:text-zinc-100">Per-tenant roles.</span> You can be accountant in one tenant and viewer in another. runQ enforces it.</CheckRow>
        <CheckRow><span className="font-medium text-zinc-900 dark:text-zinc-100">Bring your own clients.</span> Settings → Invitations to onboard new clients onto runQ.</CheckRow>
      </ul>
      <p className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-center text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        <Command size={11} className="mr-1 inline" /> Press <kbd className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-800">⌘ K</kbd> any time to switch clients.
      </p>
    </SlideShell>
  );
}

function CASlide4({ onPrimary, tenantName }: { onPrimary: () => void; tenantName: string }) {
  const steps = [
    { Icon: ClipboardCheck, title: 'Check pending approvals', body: 'See what the team has queued for your sign-off.' },
    { Icon: ListChecks,     title: 'Review the GL',           body: 'Scan recent journal entries for misclassifications.' },
    { Icon: ShieldCheck,    title: 'Open the GST module',     body: 'See where the current month stands across GSTR-1 / 3B / 2B.' },
  ];
  return (
    <SlideShell>
      <SlideHeader
        eyebrow="Get started"
        title={`First look at ${tenantName}`}
      />
      <ol className="mb-6 space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/15">
              <s.Icon size={14} className="text-indigo-600 dark:text-indigo-400" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{s.title}</p>
              <p className="mt-0.5 text-[12px] text-zinc-600 dark:text-zinc-400">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <PrimaryCta onClick={onPrimary}>Go to the dashboard</PrimaryCta>
      <p className="mt-3 text-center text-[11px] text-zinc-500">You can come back to this tour from the help menu.</p>
    </SlideShell>
  );
}

// ─── Shared chrome ───────────────────────────────────────────────────────────

function PrimaryCta({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(79,70,229,0.6)] transition-colors hover:bg-indigo-700"
    >
      {children} <ArrowRight size={15} />
    </button>
  );
}

function Dots({ current, total, onSelect }: SlideProps & { onSelect: (i: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          aria-label={`Go to slide ${i + 1}`}
          onClick={() => onSelect(i)}
          className={`h-1.5 rounded-full transition-all ${
            i === current
              ? 'w-6 bg-indigo-500'
              : 'w-1.5 bg-zinc-300 hover:bg-zinc-400 dark:bg-zinc-700 dark:hover:bg-zinc-600'
          }`}
        />
      ))}
    </div>
  );
}

interface WelcomeScreenProps {
  open: boolean;
  onClose: () => void;
  variant: WelcomeVariant;
  invitingUserName?: string;
  tenantName?: string;
}

export function WelcomeScreen({ open, onClose, variant, invitingUserName, tenantName }: WelcomeScreenProps) {
  const { user } = useAuth();
  const [slide, setSlide] = useState(0);

  useEffect(() => { if (open) setSlide(0); }, [open]);
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setSlide((s) => Math.min(s + 1, 3));
      else if (e.key === 'ArrowLeft') setSlide((s) => Math.max(s - 1, 0));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const userName = user?.name ?? 'there';
  const tName = tenantName ?? 'your company';
  const role = user?.role ?? 'accountant';

  const slides =
    variant === 'ca_joining'
      ? [
          <CASlide1 key="1" userName={userName} tenantName={tName} role={role} />,
          <CASlide2 key="2" />,
          <CASlide3 key="3" />,
          <CASlide4 key="4" onPrimary={onClose} tenantName={tName} />,
        ]
      : [
          <OwnerSlide1 key="1" userName={userName} tenantName={tName} invitingUserName={invitingUserName} />,
          <OwnerSlide2 key="2" />,
          <OwnerSlide3 key="3" invitingUserName={invitingUserName} />,
          <OwnerSlide4 key="4" onPrimary={onClose} />,
        ];

  const total = slides.length;
  const isLast = slide === total - 1;
  const isFirst = slide === 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div
        className="absolute inset-0 bg-zinc-900/40 backdrop-blur-md dark:bg-gradient-to-br dark:from-zinc-950/95 dark:via-zinc-900/95 dark:to-indigo-950/95"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-[560px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-20 inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-900/10 backdrop-blur-sm transition-colors hover:bg-white hover:text-zinc-900 dark:bg-zinc-800/80 dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          aria-label="Skip the tour"
        >
          Skip <X size={11} />
        </button>
        <div key={slide} className="animate-fade-in">{slides[slide]}</div>
        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950/60">
          <button
            onClick={() => setSlide((s) => Math.max(s - 1, 0))}
            disabled={isFirst}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-white hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <ArrowLeft size={13} /> Back
          </button>
          <Dots current={slide} total={total} onSelect={setSlide} />
          {!isLast ? (
            <button
              onClick={() => setSlide((s) => Math.min(s + 1, total - 1))}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Next <ArrowRight size={13} />
            </button>
          ) : (
            <span className="w-[60px]" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Trigger hook with hardened gates ────────────────────────────────────────

interface WelcomeTriggerState {
  open: boolean;
  variant: WelcomeVariant;
  invitingUserName?: string;
  tenantName?: string;
  close: () => void;
}

/**
 * Decide whether to show the welcome overlay. The flag set by an entry-point
 * flow opens the welcome ONCE per (user, tenant). Closing it persists a
 * `seen` flag so it never re-shows even if the pending flag is set again
 * for the same pair.
 *
 * Reactive: recomputes when userId / activeTenantId change, since auth loads
 * asynchronously after the hook first runs.
 */
export function useWelcomeTrigger(userId: string | null, activeTenantId: string | null): WelcomeTriggerState {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<WelcomeVariant>('new_tenant_owner');
  const [invitingUserName, setInvitingUserName] = useState<string | undefined>();
  const [tenantName, setTenantName] = useState<string | undefined>();

  useEffect(() => {
    if (!userId || !activeTenantId) {
      // Auth not yet resolved — wait. Don't change open state in case we
      // already opened it from a previous tick.
      return;
    }
    try {
      const pending = localStorage.getItem(PENDING_FLAG_KEY) === '1';
      const alreadySeen = localStorage.getItem(seenKey(userId, activeTenantId)) === '1';
      if (!pending || alreadySeen) {
        setOpen(false);
        return;
      }
      setVariant((localStorage.getItem(VARIANT_KEY) as WelcomeVariant | null) ?? 'new_tenant_owner');
      setInvitingUserName(localStorage.getItem(INVITER_KEY) ?? undefined);
      setTenantName(localStorage.getItem(TENANT_NAME_KEY) ?? undefined);
      setOpen(true);
    } catch {
      setOpen(false);
    }
  }, [userId, activeTenantId]);

  const close = () => {
    try {
      localStorage.removeItem(PENDING_FLAG_KEY);
      localStorage.removeItem(VARIANT_KEY);
      localStorage.removeItem(INVITER_KEY);
      localStorage.removeItem(TENANT_NAME_KEY);
      if (userId && activeTenantId) {
        localStorage.setItem(seenKey(userId, activeTenantId), '1');
      }
    } catch { /* noop */ }
    setOpen(false);
  };

  return { open, variant, invitingUserName, tenantName, close };
}

// Unused exports — kept so we can later wire a "reopen welcome" action.
export const WelcomeReopenIcon = Eye;
export const WelcomeReopenChatIcon = MessageSquare;
