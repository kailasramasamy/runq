import { useNavigate } from '@tanstack/react-router';
import { BillForm } from '../../../components/forms/bill-form';
import {
  usePurchaseInvoice,
  useUpdatePurchaseInvoice,
} from '../../../hooks/queries/use-purchase-invoices';
import { PageHeader, useToast, CardSkeleton } from '@/components/ui';
import type { CreatePurchaseInvoiceInput } from '@runq/validators';
import type { PurchaseInvoiceWithDetails } from '@runq/types';

interface Props { billId: string }

/** Map a fully-loaded bill into the partial create-input shape that BillForm
 *  consumes via its `initialData` prop.
 *  Note: `notes` is intentionally not mapped here — the PurchaseInvoice type
 *  doesn't currently expose it (despite the schema accepting it). */
function billToInitialData(bill: PurchaseInvoiceWithDetails): Partial<CreatePurchaseInvoiceInput> {
  return {
    vendorId: bill.vendorId,
    invoiceNumber: bill.invoiceNumber,
    invoiceDate: bill.invoiceDate,
    dueDate: bill.dueDate,
    items: bill.items.map((item) => ({
      itemName: item.itemName,
      sku: item.sku ?? undefined,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      hsnSacCode: item.hsnSacCode ?? undefined,
      taxCategory: item.taxCategory ?? undefined,
      taxRate: item.taxRate ?? undefined,
      tdsSection: item.tdsSection ?? undefined,
      tdsRate: item.tdsRate ?? undefined,
    })),
  };
}

export function EditBillPage({ billId }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading, isError } = usePurchaseInvoice(billId);
  const mutation = useUpdatePurchaseInvoice();
  const bill = data?.data;

  function handleSubmit(formData: CreatePurchaseInvoiceInput) {
    mutation.mutate(
      { id: billId, data: formData },
      {
        onSuccess: () => {
          toast('Bill updated successfully.', 'success');
          navigate({ to: '/ap/bills/$billId', params: { billId } });
        },
        onError: () => {
          toast('Failed to update bill. Please check your inputs and try again.', 'error');
        },
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

  if (isError || !bill) {
    return <p className="text-sm text-red-500">Bill not found.</p>;
  }

  if (bill.status !== 'draft') {
    return (
      <div className="max-w-2xl">
        <PageHeader
          title="Cannot edit bill"
          breadcrumbs={[
            { label: 'AP', href: '/ap' },
            { label: 'Bills', href: '/ap/bills' },
            { label: bill.invoiceNumber },
          ]}
        />
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-400">
          This bill is in <strong>{bill.status}</strong> status and cannot be edited. Issue a debit note to make adjustments.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={`Edit ${bill.invoiceNumber}`}
        description="Editing a draft bill. Once approved, it cannot be edited — only adjusted via debit notes."
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Bills', href: '/ap/bills' },
          { label: bill.invoiceNumber, href: `/ap/bills/${billId}` },
          { label: 'Edit' },
        ]}
      />
      <BillForm
        initialData={billToInitialData(bill)}
        editingId={billId}
        onSubmit={handleSubmit}
        isLoading={mutation.isPending}
      />
    </div>
  );
}
