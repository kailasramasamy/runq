import { useNavigate } from '@tanstack/react-router';
import { PageHeader } from '@/components/ui';
import { CreateForm } from './index';

/**
 * Dedicated /new screen for sales orders. Same rationale as the quotes
 * /new page — the inline form was too wide once the parent went
 * full-bleed. Capped at max-w-3xl for a comfortable form layout.
 */
export function NewSalesOrderPage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New sales order"
        description="Confirm a customer order before invoicing."
      />
      <CreateForm onClose={() => navigate({ to: '/finance/ar/sales-orders' as never })} />
    </div>
  );
}
