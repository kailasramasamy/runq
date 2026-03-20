import { useNavigate } from '@tanstack/react-router';
import { VendorForm } from '@/components/forms/vendor-form';
import { useCreateVendor } from '@/hooks/queries/use-vendors';
import { useToast } from '@/components/ui';
import { PageHeader } from '@/components/ui';
import type { CreateVendorInput } from '@runq/validators';

export function NewVendorPage() {
  const navigate = useNavigate();
  const mutation = useCreateVendor();
  const { toast } = useToast();

  function handleSubmit(data: CreateVendorInput) {
    mutation.mutate(data, {
      onSuccess: () => {
        toast('Vendor created successfully', 'success');
        navigate({ to: '/ap/vendors' });
      },
      onError: () => {
        toast('Failed to create vendor. Please try again.', 'error');
      },
    });
  }

  function handleCancel() {
    navigate({ to: '/ap/vendors' });
  }

  return (
    <div className="mx-auto max-w-2xl">
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
