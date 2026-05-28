import { useNavigate } from '@tanstack/react-router';
import { PageHeader, CardSkeleton, useToast } from '@/components/ui';
import { PoForm } from '@/components/forms/po-form';
import {
  usePurchaseOrder,
  useUpdatePurchaseOrder,
} from '@/hooks/queries/use-purchase-orders';
import type { CreatePurchaseOrderInput } from '@runq/validators';

interface Props { poId: string }

export function EditPurchaseOrderPage({ poId }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading, isError } = usePurchaseOrder(poId);
  const mutation = useUpdatePurchaseOrder();
  const po = data?.data;

  function handleSubmit(data: CreatePurchaseOrderInput) {
    mutation.mutate(
      { id: poId, data },
      {
        onSuccess: () => {
          toast('PO updated', 'success');
          navigate({ to: '/purchase/pos/$poId', params: { poId } });
        },
        onError: () => toast('Failed to update PO', 'error'),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }
  if (isError || !po) {
    return <p className="text-sm text-red-500">PO not found.</p>;
  }

  if (po.status !== 'draft') {
    return (
      <div className="max-w-2xl">
        <PageHeader
          title={`Cannot edit ${po.poNumber}`}
          breadcrumbs={[
            { label: 'Purchase', href: '/purchase' },
            { label: 'Purchase Orders', href: '/purchase/pos' },
            { label: po.poNumber },
          ]}
        />
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-400">
          This PO is <strong>{po.status}</strong> and cannot be edited. Cancel + recreate if changes are needed.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Edit ${po.poNumber}`}
        description="Drafts edit freely; sending locks the PO."
        breadcrumbs={[
          { label: 'Purchase', href: '/purchase' },
          { label: 'Purchase Orders', href: '/purchase/pos' },
          { label: po.poNumber, href: `/purchase/pos/${poId}` },
          { label: 'Edit' },
        ]}
      />
      <PoForm
        initialData={{
          vendorId: po.vendorId,
          poDate: po.poDate,
          expectedDate: po.expectedDate ?? undefined,
          paymentTerms: po.paymentTerms ?? undefined,
          deliveryAddress: po.deliveryAddress ?? undefined,
          notes: po.notes ?? undefined,
          subtotal: po.subtotal,
          taxTotal: po.taxTotal,
          total: po.total,
          lines: po.lines.map((l) => ({
            description: l.description,
            catalogItemId: l.catalogItemId ?? undefined,
            uom: l.uom ?? undefined,
            hsnSacCode: l.hsnSacCode ?? undefined,
            qtyOrdered: l.qtyOrdered,
            unitRate: l.unitRate,
            amount: l.amount,
            taxRate: l.taxRate ?? undefined,
            taxAmount: l.taxAmount ?? undefined,
            notes: l.notes ?? undefined,
          })),
        }}
        editingId={poId}
        onSubmit={handleSubmit}
        isLoading={mutation.isPending}
      />
    </div>
  );
}
