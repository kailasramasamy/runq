import { useEffect, useRef, useState } from 'react';
import { OnboardingWizard, OnboardingProgressWidget } from '@/components/onboarding/onboarding-wizard';
import { useOnboarding } from '@/hooks/queries/use-settings';
import { DashboardHero } from '@/components/dashboard/hero';
import { KpiStrip } from '@/components/dashboard/kpi-strip';
import { CashflowForecast } from '@/components/dashboard/cashflow-forecast';
import { AgentFeed } from '@/components/dashboard/agent-feed';
import { ApprovalsAndQuickActions } from '@/components/dashboard/approvals-quick';
import { AgingBars } from '@/components/dashboard/aging-bars';
import { GstAndPeriodClose } from '@/components/dashboard/gst-period-close';
import { RecentActivity } from '@/components/dashboard/recent-activity';

export function DashboardPage() {
  const { data: onboarding } = useOnboarding();
  const [wizardOpen, setWizardOpen] = useState(false);

  // Auto-open wizard once for fresh tenants — see prior version for rationale.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!onboarding?.data) return;
    const steps = onboarding.data.steps ?? {};
    const count = Object.values(steps).filter(Boolean).length;
    const isFreshTenant =
      !onboarding.data.dismissed && !onboarding.data.completed && count === 0;
    autoOpenedRef.current = true;
    if (isFreshTenant) setWizardOpen(true);
  }, [onboarding]);

  return (
    <div className="space-y-4 lg:space-y-5">
      <OnboardingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <OnboardingProgressWidget onResume={() => setWizardOpen(true)} />

      <DashboardHero />
      <KpiStrip />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <CashflowForecast />
        </div>
        <div className="lg:col-span-4">
          <AgentFeed />
        </div>
      </div>

      <ApprovalsAndQuickActions />
      <AgingBars />
      <GstAndPeriodClose />
      <RecentActivity />
    </div>
  );
}
