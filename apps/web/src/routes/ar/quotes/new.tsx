import { useNavigate } from '@tanstack/react-router';
import { PageHeader } from '@/components/ui';
import { CreateForm } from './index';

/**
 * Dedicated /new screen for sales quotes. Hosts the same `CreateForm` the
 * list page used to render inline — the inline-on-list-page version was
 * cramped on full-width layouts and made the field grid hard to scan.
 * Capped at max-w-3xl so the two-column field grid sits at a comfortable
 * line length even when the global shell is full-width.
 */
export function NewQuotePage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New sales quote"
        description="Quote a customer or prospect for upcoming work."
      />
      <CreateForm onClose={() => navigate({ to: '/finance/ar/quotes' as never })} />
    </div>
  );
}
