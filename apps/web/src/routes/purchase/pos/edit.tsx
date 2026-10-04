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
        onError: (e: any) => toast(e?.message ?? 'Failed to update PO', 'error'),
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

  // Items can be amended until goods are fully in; vendor and date only in draft.
  const editable = ['draft', 'sent', 'partially_received'].includes(po.status);
  const sent = po.status !== 'draft';
  if (!editable) {
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
          This PO is <strong>{po.status.replace('_', ' ')}</strong> and can no longer be edited. Create a new PO for further items.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Edit ${po.poNumber}`}
        description={sent
          ? 'Sent to the vendor — items can still change; vendor and PO date are fixed. Share the updated PO after saving.'
          : 'Drafts edit freely.'}
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
            id: l.id,
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
        lockedHeader={sent}
        lineFloors={Object.fromEntries(po.lines
          .filter((l) => l.qtyReceived > 0 || l.qtyBilled > 0)
          .map((l) => [l.id, l.qtyBilled > l.qtyReceived
            ? { qty: l.qtyBilled, why: 'billed' as const }
            : { qty: l.qtyReceived, why: 'received' as const }]))}
        onSubmit={handleSubmit}
        isLoading={mutation.isPending}
      />
    </div>
  );
}
