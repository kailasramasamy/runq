import { useState, useMemo } from 'react';
import { Check, ArrowLeft, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import { useOnboarding, useCompleteOnboardingStep, useDismissOnboarding } from '@/hooks/queries/use-settings';
import {
  STEP_META,
  type StepKey,
  CompanyProfileStep,
  BankAccountStep,
  InvoiceSettingsStep,
  FirstCustomerStep,
  FirstItemStep,
} from './onboarding-steps';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function OnboardingWizard({ open, onClose }: Props) {
  const { data } = useOnboarding();
  const completeStep = useCompleteOnboardingStep();
  const dismiss = useDismissOnboarding();
  const completedSteps = data?.data.steps ?? {};

  // Start at the first incomplete step
  const initialIndex = useMemo(() => {
    const idx = STEP_META.findIndex((s) => !completedSteps[s.key]);
    return idx === -1 ? 0 : idx;
  }, [completedSteps]);

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const activeStep = STEP_META[activeIndex];
  const totalSteps = STEP_META.length;
  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const progressPct = Math.round((completedCount / totalSteps) * 100);

  if (!open || !activeStep) return null;

  async function handleStepComplete() {
    if (!activeStep) return;
    await completeStep.mutateAsync(activeStep.key);
    if (activeIndex < totalSteps - 1) {
      setActiveIndex(activeIndex + 1);
    } else {
      onClose();
    }
  }

  function handleSkip() {
    if (activeIndex < totalSteps - 1) {
      setActiveIndex(activeIndex + 1);
    } else {
      onClose();
    }
  }

  function handleStepClick(index: number) {
    setActiveIndex(index);
  }

  async function handleDismiss() {
    await dismiss.mutateAsync();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative flex h-full max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Get runQ ready for your business</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Setup takes 2 minutes — you can skip and come back anytime</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-600 dark:text-zinc-400">{completedCount} of {totalSteps} complete</span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">{progressPct}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">

          {/* Sidebar */}
          <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30 md:block">
            <nav className="space-y-1">
              {STEP_META.map((step, idx) => {
                const Icon = step.icon;
                const isDone = !!completedSteps[step.key];
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => handleStepClick(idx)}
                    className={[
                      'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition',
                      isActive
                        ? 'bg-white shadow-sm dark:bg-zinc-900'
                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-900/60',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition',
                        isDone
                          ? 'bg-green-500 text-white'
                          : isActive
                          ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                          : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
                      ].join(' ')}
                    >
                      {isDone ? <Check size={14} /> : <Icon size={14} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={[
                          'block truncate text-sm font-medium',
                          isActive ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400',
                        ].join(' ')}
                      >
                        {step.label}
                      </span>
                      {step.optional && (
                        <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Optional</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Step content */}
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl p-6 sm:p-8">
              <div className="mb-6">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Step {activeIndex + 1} of {totalSteps}
                </p>
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{activeStep.label}</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{activeStep.description}</p>
              </div>

              <StepBody stepKey={activeStep.key} onComplete={handleStepComplete} onSkip={activeStep.optional ? handleSkip : undefined} />

              {activeIndex > 0 && (
                <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setActiveIndex(activeIndex - 1)}>
                    <ArrowLeft size={14} />
                    Back
                  </Button>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function StepBody({ stepKey, onComplete, onSkip }: { stepKey: StepKey; onComplete: () => void; onSkip?: () => void }) {
  switch (stepKey) {
    case 'company':
      return <CompanyProfileStep onComplete={onComplete} />;
    case 'bank':
      return <BankAccountStep onComplete={onComplete} onSkip={onSkip} />;
    case 'invoice':
      return <InvoiceSettingsStep onComplete={onComplete} />;
    case 'customer':
      return <FirstCustomerStep onComplete={onComplete} onSkip={onSkip} />;
    case 'item':
      return <FirstItemStep onComplete={onComplete} onSkip={onSkip} />;
    default:
      return null;
  }
}

// ─── Persistent setup strip for the dashboard ────────────────────────────────
//
// Always rendered. Two states:
//   - Incomplete: indigo strip with progress bar + "Resume" — opens wizard.
//   - Complete:   emerald strip with checkmark + "Review" — links to
//                 /settings/setup so the user can edit anytime.

export function OnboardingProgressWidget({ onResume }: { onResume: () => void }) {
  const { data } = useOnboarding();
  const completedSteps = data?.data.steps ?? {};
  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const totalSteps = STEP_META.length;
  const progressPct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
  const isComplete = data?.data.completed || completedCount === totalSteps;

  // Once everything is set up, the strip has done its job. Hiding entirely
  // (rather than turning into a permanent green pill) keeps the dashboard
  // clean. Users can still re-enter the setup flow from the sidebar nav
  // (Settings → Setup) or directly at /settings/setup.
  if (isComplete) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onResume}
      className="group flex w-full items-center justify-between gap-4 rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-purple-50 px-4 py-2.5 text-left transition hover:border-indigo-300 hover:shadow-sm dark:border-indigo-900/40 dark:from-indigo-950/30 dark:via-zinc-900 dark:to-purple-950/30 dark:hover:border-indigo-700"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
          <Sparkles size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Finish setting up runQ
            <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
              {completedCount}/{totalSteps} complete · ~2 min left
            </span>
          </p>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/70 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm group-hover:bg-indigo-700 dark:bg-indigo-500 dark:group-hover:bg-indigo-600">
        Resume
      </span>
    </button>
  );
}
