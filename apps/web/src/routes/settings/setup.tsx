import { useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Sparkles, CheckCircle2, ChevronRight,
  Building2, FileText, Layers, BookOpen,
  Plug, Bell, BarChart3, ShieldCheck,
  FileX, FileInput, UserCog,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { useOnboarding, useCompanySettings } from '@/hooks/queries/use-settings';
import { getOnboardingSteps } from '@/components/onboarding/onboarding-steps';
import { PageHeader, Button } from '@/components/ar/primitives';

interface SetupLink {
  label: string;
  description: string;
  to: string;
  icon: LucideIcon;
}

interface SetupGroup {
  label: string;
  items: SetupLink[];
}

const GROUPS: SetupGroup[] = [
  {
    label: 'Organization',
    items: [
      { label: 'Company', description: 'Legal entity, GSTIN, address, branding.', to: '/settings/company', icon: Building2 },
      { label: 'Users & roles', description: 'Invite people, manage permissions.', to: '/settings/users', icon: UserCog },
      { label: 'CA portal', description: 'Share read-only access with your accountant.', to: '/settings/ca-portal', icon: ShieldCheck },
    ],
  },
  {
    label: 'Operational',
    items: [
      { label: 'Invoice numbering', description: 'Series, prefixes, fiscal-year rollover.', to: '/settings/invoice-numbering', icon: FileText },
      { label: 'Item attributes', description: 'Custom catalogue fields per industry.', to: '/settings/item-attributes', icon: Layers },
      { label: 'Opening balances', description: 'Set initial balances when migrating mid-year.', to: '/settings/opening-balances', icon: BookOpen },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { label: 'Integrations', description: 'Razorpay, Stripe, GSP, and other connectors.', to: '/settings/integrations', icon: Plug },
      { label: 'Email provider', description: 'SMTP / Postmark / Resend for outbound mail.', to: '/settings/email-provider', icon: Bell },
      { label: 'Webhooks', description: 'Push events to external systems.', to: '/settings/webhooks', icon: Plug },
    ],
  },
  {
    label: 'Imports & exports',
    items: [
      { label: 'Tally export', description: 'Export ledger postings to Tally XML.', to: '/settings/tally-export', icon: FileX },
      { label: 'Migrate from Tally', description: 'Bulk-import customers, vendors, items, opening balances.', to: '/settings/tally-import', icon: FileInput },
      { label: 'Scheduled reports', description: 'Auto-email reports on a cadence.', to: '/settings/scheduled-reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Notifications',
    items: [
      { label: 'Notifications', description: 'Per-user channel preferences.', to: '/settings/notifications', icon: Bell },
    ],
  },
];

export function SetupPage() {
  const navigate = useNavigate();
  const { data } = useOnboarding();
  const { data: companyData } = useCompanySettings();
  const [wizardOpen, setWizardOpen] = useState(false);

  const STEP_META = useMemo(
    () => getOnboardingSteps(companyData?.data?.industry ?? null),
    [companyData?.data?.industry],
  );

  const completedSteps = data?.data.steps ?? {};
  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const totalSteps = STEP_META.length;
  const progressPct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
  const allDone = totalSteps > 0 && completedCount === totalSteps;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure your company, users, integrations, imports, and notifications — everything ops-related lives here."
      />

      <OnboardingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />

      {/* Onboarding progress card */}
      <div
        className="relative mb-6 overflow-hidden rounded-xl border p-5"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div
          className="absolute -right-12 -top-12 h-44 w-44 rounded-full opacity-50"
          style={{ background: 'radial-gradient(circle, var(--accent-soft) 0%, transparent 70%)' }}
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
              style={{ background: 'var(--accent)' }}
            >
              <Sparkles size={22} />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
                Setup wizard
              </div>
              <p className="mt-1 text-[12.5px]" style={{ color: 'var(--text-3)' }}>
                Get fully configured in 5 minutes — company, bank, invoicing, master data.
              </p>
              <div className="mt-3 flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-3)' }}>
                <span className="num font-medium" style={{ color: 'var(--text-1)' }}>
                  {completedCount} of {totalSteps}
                </span>
                <span>complete</span>
                <span>·</span>
                <span className="num font-semibold" style={{ color: 'var(--accent-text)' }}>{progressPct}%</span>
              </div>
              <div className="mt-2 h-1.5 w-64 max-w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progressPct}%`, background: 'var(--accent)' }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 lg:shrink-0">
            <Button onClick={() => setWizardOpen(true)}>
              {allDone ? 'Review setup' : completedCount === 0 ? 'Start setup' : 'Resume setup'}
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: '/' })}>
              Dashboard
            </Button>
          </div>
        </div>

        {/* Quick step preview */}
        {totalSteps > 0 && completedCount < totalSteps && (
          <ul className="relative mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {STEP_META.slice(0, 4).map((step) => {
              const isDone = !!completedSteps[step.key];
              const Icon = step.icon;
              return (
                <li
                  key={step.key}
                  className="flex items-center gap-2.5 rounded-md border px-3 py-2"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border-soft)' }}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: isDone ? 'var(--pos)' : 'var(--surface)',
                      color: isDone ? 'white' : 'var(--text-3)',
                    }}
                  >
                    {isDone ? <CheckCircle2 size={13} /> : <Icon size={12} />}
                  </span>
                  <span className="text-[12px]" style={{ color: 'var(--text-1)' }}>{step.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Categorized hub */}
      <div className="space-y-6">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <h3
              className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: 'var(--text-3)' }}
            >
              {group.label}
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.to}
                    onClick={() => navigate({ to: item.to as '/' })}
                    className="group flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all hover:shadow-sm"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                    >
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium" style={{ color: 'var(--text-1)' }}>
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-[11.5px]" style={{ color: 'var(--text-3)' }}>
                        {item.description}
                      </span>
                    </span>
                    <ChevronRight
                      size={14}
                      className="shrink-0 transition-transform group-hover:translate-x-0.5"
                      style={{ color: 'var(--text-3)' }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
