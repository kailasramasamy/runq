import { useNavigate } from '@tanstack/react-router';
import { VendorForm } from '@/components/forms/vendor-form';
import { useCreateVendor } from '@/hooks/queries/use-vendors';
import { useToast } from '@/components/ui';
import { PageHeader } from '@/components/ui';
import { useVendorBase } from '@/lib/vendor-nav';
import type { CreateVendorInput } from '@runq/validators';

export function NewVendorPage() {
  const navigate = useNavigate();
  const mutation = useCreateVendor();
  const { toast } = useToast();
  const base = useVendorBase();

  function handleSubmit(data: CreateVendorInput) {
    mutation.mutate(data, {
      onSuccess: () => {
        toast('Vendor created successfully', 'success');
        navigate({ to: base as any });
      },
      onError: () => {
        toast('Failed to create vendor. Please try again.', 'error');
      },
    });
  }

  function handleCancel() {
    navigate({ to: base as any });
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Vendors', href: '/ap/vendors' },
          { label: 'New Vendor' },
        ]}
        title="New Vendor"
        description="Add a new vendor to your accounts payable."
      />
      <VendorForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={mutation.isPending}
      />
    </div>
  );
}
