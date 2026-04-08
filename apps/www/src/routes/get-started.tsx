import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const INDUSTRIES = [
  'Manufacturing', 'Trading / Distribution', 'Retail', 'Services', 'Construction',
  'Food & Beverage', 'Healthcare', 'Hospitality', 'Education', 'IT / Software', 'Other',
];

const STATES = [
  'Andhra Pradesh', 'Delhi', 'Gujarat', 'Haryana', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Punjab', 'Rajasthan', 'Tamil Nadu',
  'Telangana', 'Uttar Pradesh', 'West Bengal', 'Other',
];

const PLANS = [
  {
    name: 'Starter',
    price: 'Free forever',
    cta: 'Get started',
    features: ['1 user', '50 invoices/mo', 'Finance module', 'CSV export'],
  },
  {
    name: 'Growth',
    price: '₹999/mo',
    cta: 'Start 14-day free trial',
    features: ['5 users', 'Unlimited invoices', 'Tally export', 'AI features'],
    popular: true,
    trial: true,
  },
  {
    name: 'Enterprise',
    price: '₹2,499/mo',
    cta: 'Talk to us',
    features: ['Unlimited users', 'All modules', 'API access', 'Priority support'],
    enterprise: true,
  },
];

const STEPS = ['Business', 'Your Info', 'Plan', 'Review'];

interface FormData {
  company: string;
  industry: string;
  state: string;
  gstin: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phone: string;
  password: string;
  plan: string;
  terms: boolean;
}

const INITIAL: FormData = {
  company: '', industry: '', state: '', gstin: '',
  name: '', email: '', emailVerified: false, phone: '', password: '',
  plan: 'Growth', terms: false,
};

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.3, ease: 'easeOut' as const } },
  exit: (dir: number) => ({ x: dir > 0 ? -48 : 48, opacity: 0, transition: { duration: 0.2 } }),
};

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="w-full mb-10">
      <div className="flex justify-between mb-3">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-col items-center gap-1.5">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all',
              i < step ? 'bg-primary-600 text-white' :
              i === step ? 'bg-primary-600 text-white ring-4 ring-primary-600/30' :
              'bg-zinc-800 text-zinc-500',
            )}>
              {i < step ? <Check className="size-4" /> : i + 1}
            </div>
            <span className={cn('text-xs hidden sm:block', i === step ? 'text-zinc-200' : 'text-zinc-500')}>
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-primary-600 to-violet-600 rounded-full"
          animate={{ width: `${((step) / (STEPS.length - 1)) * 100}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' as const }}
        />
      </div>
    </div>
  );
}

function Step1({ form, setForm }: { form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>> }) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-2xl font-semibold text-white mb-1">Tell us about your business</h2>
      <Input label="Company name" placeholder="Acme Pvt Ltd" value={form.company}
        onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))} required />
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-zinc-300">Industry</label>
        <select value={form.industry} onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value }))}
          className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500">
          <option value="">Select industry…</option>
          {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-zinc-300">State</label>
        <select value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
          className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500">
          <option value="">Select state…</option>
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <Input label="GSTIN (optional)" placeholder="22AAAAA0000A1Z5" value={form.gstin}
        onChange={(e) => setForm((p) => ({ ...p, gstin: e.target.value }))} />
    </div>
  );
}

function Step2({ form, setForm }: { form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>> }) {
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendOtp() {
    if (!form.email.trim() || !form.email.includes('@')) {
      setOtpError('Enter a valid email first');
      return;
    }
    setOtpError('');
    setOtpLoading(true);
    try {
      const res = await fetch('/api/v1/public/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Failed to send OTP');
      }
      setOtpSent(true);
      setCooldown(60);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  }

  async function verifyOtp() {
    if (otpCode.length !== 6) { setOtpError('Enter the 6-digit code'); return; }
    setOtpError('');
    setOtpLoading(true);
    try {
      const res = await fetch('/api/v1/public/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), code: otpCode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Invalid code');
      }
      setForm((p) => ({ ...p, emailVerified: true }));
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setOtpLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-2xl font-semibold text-white mb-1">Create your account</h2>
      <Input label="Full name" placeholder="Priya Sharma" value={form.name}
        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />

      {/* Email + OTP verification */}
      <div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Input label="Work email" type="email" placeholder="priya@acme.in" value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value, emailVerified: false }))}
              required disabled={form.emailVerified} />
          </div>
          {!form.emailVerified && (
            <Button
              variant="secondary"
              size="md"
              onClick={sendOtp}
              disabled={otpLoading || cooldown > 0}
              className="shrink-0"
            >
              {otpLoading ? 'Sending...' : cooldown > 0 ? `Resend (${cooldown}s)` : otpSent ? 'Resend OTP' : 'Send OTP'}
            </Button>
          )}
        </div>
        {form.emailVerified && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="size-3.5" /> Email verified — complete your details below
          </p>
        )}
        {otpSent && !form.emailVerified && (
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <label className="text-sm font-medium text-zinc-300 mb-2 block">We sent a 6-digit code to <span className="text-white">{form.email}</span></label>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-center text-lg font-mono tracking-[0.3em] text-zinc-100 border border-zinc-700 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <Button size="md" onClick={verifyOtp} disabled={otpLoading || otpCode.length !== 6} className="shrink-0">
                {otpLoading ? 'Verifying...' : 'Verify'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Didn't receive it?{' '}
              <button
                type="button"
                onClick={sendOtp}
                disabled={cooldown > 0}
                className="text-primary-400 hover:text-primary-300 disabled:text-zinc-600 disabled:cursor-not-allowed"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </p>
          </div>
        )}
        {otpError && <p className="mt-1.5 text-xs text-red-400">{otpError}</p>}
      </div>

      {/* Phone + Password — only shown after email verification */}
      {form.emailVerified && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col gap-5"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-300">Phone</label>
            <div className="flex rounded-xl border border-zinc-700 bg-zinc-900 focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary-500 focus-within:border-transparent">
              <span className="flex items-center px-3 text-sm text-zinc-400 border-r border-zinc-700 select-none">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="98765 43210"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                required
                className="flex-1 bg-transparent px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              />
            </div>
          </div>
          <Input label="Password" type="password" placeholder="Min 8 characters" value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} required />
        </motion.div>
      )}
    </div>
  );
}

function Step3({ form, setForm }: { form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>> }) {
  const selected = PLANS.find((p) => p.name === form.plan);

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-2xl font-semibold text-white mb-1">Choose your plan</h2>
      <div className="flex flex-col gap-4">
        {PLANS.map((plan) => (
          <button key={plan.name} type="button" onClick={() => setForm((p) => ({ ...p, plan: plan.name }))}
            className={cn(
              'text-left rounded-2xl border p-5 transition-all',
              form.plan === plan.name
                ? 'border-primary-500 bg-primary-950/50 ring-2 ring-primary-500/30'
                : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700',
            )}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{plan.name}</span>
                {plan.popular && (
                  <span className="text-xs bg-primary-600 text-white px-2 py-0.5 rounded-full">Popular</span>
                )}
                {plan.trial && (
                  <span className="text-xs bg-emerald-900/60 text-emerald-400 border border-emerald-700/50 px-2 py-0.5 rounded-full">14-day free trial</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{plan.price}</span>
                {form.plan === plan.name && <Check className="size-4 text-primary-400" />}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {plan.features.map((f) => (
                <span key={f} className="text-xs text-zinc-400 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-zinc-600 inline-block" />{f}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* Contextual note based on selected plan */}
      {selected?.trial && (
        <div className="rounded-xl bg-emerald-950/30 border border-emerald-800/40 px-4 py-3 text-sm text-emerald-300">
          Your 14-day free trial starts now — no payment needed. We'll remind you before it ends.
        </div>
      )}
      {selected?.enterprise && (
        <div className="rounded-xl bg-primary-950/30 border border-primary-800/40 px-4 py-3 text-sm text-primary-300">
          Our team will reach out within 24 hours to set up your account with custom onboarding.
        </div>
      )}
    </div>
  );
}

function Step4({ form, setForm, onSubmit, loading, error }: { form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>; onSubmit: () => void; loading: boolean; error: string }) {
  const rows = [
    { label: 'Company', value: form.company },
    { label: 'Industry', value: form.industry },
    { label: 'State', value: form.state },
    { label: 'GSTIN', value: form.gstin || '—' },
    { label: 'Name', value: form.name },
    { label: 'Email', value: form.email },
    { label: 'Plan', value: form.plan === 'Growth' ? 'Growth — 14-day free trial' : form.plan === 'Enterprise' ? 'Enterprise — we\'ll contact you' : form.plan },
  ];

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-2xl font-semibold text-white mb-1">Review &amp; submit</h2>
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
        {rows.map((row, i) => (
          <div key={row.label} className={cn('flex justify-between px-5 py-3 text-sm', i > 0 && 'border-t border-zinc-800')}>
            <span className="text-zinc-500">{row.label}</span>
            <span className="text-zinc-200 font-medium">{row.value}</span>
          </div>
        ))}
      </div>
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={form.terms}
          onChange={(e) => setForm((p) => ({ ...p, terms: e.target.checked }))}
          className="mt-0.5 rounded border-zinc-600 bg-zinc-900 text-primary-600 focus:ring-primary-500"
        />
        <span className="text-sm text-zinc-400">
          I agree to the{' '}
          <span className="text-primary-400 underline underline-offset-2 cursor-pointer">Terms of Service</span>
          {' '}and{' '}
          <span className="text-primary-400 underline underline-offset-2 cursor-pointer">Privacy Policy</span>
        </span>
      </label>
      {error && (
        <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-lg px-4 py-2">{error}</p>
      )}
      <Button type="button" size="lg" className="w-full" onClick={onSubmit} disabled={!form.terms || loading}>
        {loading ? 'Creating account...' : form.plan === 'Growth' ? 'Start free trial' : form.plan === 'Enterprise' ? 'Submit request' : 'Create account'} <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function SuccessScreen({ name, email, plan }: { name: string; email: string; plan: string }) {
  const firstName = name.split(' ')[0];
  const isEnterprise = plan === 'Enterprise';
  const isTrial = plan === 'Growth';

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <CheckCircle2 className="size-16 text-emerald-400 mx-auto mb-6" />
        <h1 className="font-display text-4xl text-white mb-3">
          {isEnterprise ? 'Request received' : 'You\'re all set'}
        </h1>
        <p className="text-zinc-400 mb-2">Welcome to runQ, {firstName}.</p>

        {isEnterprise ? (
          <div className="space-y-3 mt-4">
            <p className="text-zinc-500 text-sm">
              Our team will reach out to <span className="text-zinc-300">{email}</span> within 24 hours to set up your Enterprise account with custom onboarding.
            </p>
            <p className="text-zinc-600 text-xs">
              In the meantime, your account is active on the Starter plan.
            </p>
          </div>
        ) : isTrial ? (
          <div className="space-y-3 mt-4">
            <p className="text-zinc-500 text-sm">
              Your <span className="text-emerald-400 font-medium">14-day Growth trial</span> is active. Full access, no restrictions.
            </p>
            <p className="text-zinc-600 text-xs">
              We'll send a reminder to {email} before your trial ends. No surprise charges.
            </p>
          </div>
        ) : (
          <p className="text-zinc-500 text-sm mt-2">
            Your Starter account is ready. A welcome email is on its way to {email}.
          </p>
        )}

        <div className="mt-8">
          <Button size="lg" onClick={() => window.location.href = `${window.location.origin}/finance/`}>
            Open your dashboard <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepNav({ step, onNext, onBack }: { step: number; onNext: () => void; onBack: () => void }) {
  if (step >= STEPS.length - 1) return null;
  return (
    <div className="flex gap-3 mt-8">
      {step > 0 && (
        <Button variant="secondary" onClick={onBack} className="flex-1">
          <ArrowLeft className="size-4" /> Back
        </Button>
      )}
      <Button onClick={onNext} className={cn('flex-1', step === 0 && 'w-full')}>
        Continue <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50) || 'my-company';
}

export default function GetStarted() {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Get started — runQ'; }, []);

  function next() {
    // Basic validation per step
    if (step === 0 && !form.company.trim()) { setError('Company name is required'); return; }
    if (step === 1) {
      if (!form.name.trim() || !form.email.trim() || !form.password) { setError('All fields are required'); return; }
      if (!form.emailVerified) { setError('Please verify your email with OTP before continuing'); return; }
      if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    }
    setError('');
    setDir(1);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() { setError(''); setDir(-1); setStep((s) => Math.max(s - 1, 0)); }

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.company.trim(),
          slug: toSlug(form.company),
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Registration failed');
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) return <SuccessScreen name={form.name} email={form.email} plan={form.plan} />;

  const stepProps = { form, setForm };
  const steps = [
    <Step1 key={0} {...stepProps} />,
    <Step2 key={1} {...stepProps} />,
    <Step3 key={2} {...stepProps} />,
    <Step4 key={3} {...stepProps} onSubmit={handleSubmit} loading={loading} error={error} />,
  ];

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-start pt-16 px-6 pb-16">
      <div className="w-full max-w-lg">
        <div className="mb-10 text-center">
          <h1 className="font-display text-3xl sm:text-4xl text-white mb-2">
            Let's get you <span className="gradient-text italic">running</span>
          </h1>
          <p className="text-sm text-zinc-500">Setup takes under 2 minutes. No credit card required.</p>
        </div>
        <ProgressBar step={step} />
        <div className="relative overflow-x-hidden py-1">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={step} custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit">
              {steps[step]}
            </motion.div>
          </AnimatePresence>
        </div>
        <StepNav step={step} onNext={next} onBack={back} />
        {error && step < STEPS.length - 1 && (
          <p className="mt-4 text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-lg px-4 py-2">{error}</p>
        )}
      </div>
    </div>
  );
}
