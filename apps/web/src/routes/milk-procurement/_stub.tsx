import { useRouterState } from '@tanstack/react-router';
import { PageHeader, Card, CardContent } from '@/components/ui';

/** Placeholder for milk-procurement screens not yet built (next increment). */
export function MpComingSoon() {
  const { location } = useRouterState();
  const name = location.pathname.replace('/milk-procurement/', '').replace(/\//g, ' › ') || 'screen';
  return (
    <div>
      <PageHeader title="Coming soon" description="This Dhenu admin screen is being built." fullWidth />
      <Card>
        <CardContent className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
          The <span className="font-medium text-zinc-700 dark:text-zinc-300">“{name}”</span> screen lands in the next increment.
        </CardContent>
      </Card>
    </div>
  );
}
