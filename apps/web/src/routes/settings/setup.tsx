import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { useOnboarding } from '@/hooks/queries/use-settings';
import { STEP_META } from '@/components/onboarding/onboarding-steps';

export function SetupPage() {
  const navigate = useNavigate();
  const { data } = useOnboarding();
  const [wizardOpen, setWizardOpen] = useState(false);

  const completedSteps = data?.data.steps ?? {};
  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const totalSteps = STEP_META.length;
  const progressPct = Math.round((completedCount / totalSteps) * 100);
  const allDone = completedCount === totalSteps;

  return (
    <div>
      <OnboardingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />

      <Card className="max-w-2xl">
        <CardContent className="space-y-6 pt-5">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm">
              <Sparkles size={22} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Setup wizard</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Configure your company profile, bank account, invoicing, and master data in one guided flow.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">{completedCount} of {totalSteps} complete</span>
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">{progressPct}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <ul className="space-y-2">
            {STEP_META.map((step) => {
              const isDone = !!completedSteps[step.key];
              const Icon = step.icon;
              return (
                <li
                  key={step.key}
                  className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800"
                >
                  <span
                    className={[
                      'flex size-8 shrink-0 items-center justify-center rounded-full',
                      isDone
                        ? 'bg-green-500 text-white'
                        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
                    ].join(' ')}
                  >
                    {isDone ? <CheckCircle2 size={16} /> : <Icon size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{step.label}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{step.description}</p>
                  </div>
                  {step.optional && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      Optional
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => setWizardOpen(true)} className="flex-1">
              {allDone ? 'Review setup' : completedCount === 0 ? 'Start setup' : 'Resume setup'}
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: '/' })} className="flex-1">
              Back to dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
