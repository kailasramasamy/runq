import { useNavigate } from '@tanstack/react-router';
import { ConfirmationDialog, useToast } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import {
  useDeleteRecurringBill, useCancelRecurringPayment,
  type RecurringAgreementDetail, type RecurringPayment,
} from '@/hooks/queries/use-recurring-bills';

/** Delete an agreement set up by mistake — refused by the server once anything is paid. */
export function DeleteAgreementDialog({ agreement, onClose }: { agreement: RecurringAgreementDetail; onClose: () => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const del = useDeleteRecurringBill(agreement.id);
  const bills = agreement.months.length;
  return (
    <ConfirmationDialog
      open
      onClose={onClose}
      title="Delete agreement?"
      description={bills
        ? `"${agreement.title}" and its ${bills} unpaid bill${bills === 1 ? '' : 's'} will be removed. Agreements with payments can't be deleted — pause them instead.`
        : `"${agreement.title}" will be removed.`}
      confirmLabel="Delete agreement"
      loading={del.isPending}
      onConfirm={() => del.mutate(undefined, {
        onSuccess: () => { toast('Agreement deleted', 'success'); navigate({ to: '/finance/ap/recurring' }); },
        onError: (e: any) => { toast(e?.message ?? 'Failed', 'error'); onClose(); },
      })}
    />
  );
}

export function CancelPaymentDialog({ agreementId, payment, onClose }: {
  agreementId: string; payment: RecurringPayment; onClose: () => void;
}) {
  const { toast } = useToast();
  const cancel = useCancelRecurringPayment(agreementId);
  const forWhat = payment.paidFor.length ? ` — ${payment.paidFor.map((f) => f.label).join(', ')} go back to due` : '';
  return (
    <ConfirmationDialog
      open
      onClose={onClose}
      title="Cancel payment?"
      description={`${formatINR(payment.amount)}${payment.reference ? ` (${payment.reference})` : ''} will be reversed${forWhat}.`}
      confirmLabel="Cancel payment"
      loading={cancel.isPending}
      onConfirm={() => cancel.mutate(payment.id, {
        onSuccess: () => { toast('Payment cancelled', 'success'); onClose(); },
        onError: (e: any) => { toast(e?.message ?? 'Failed', 'error'); onClose(); },
      })}
    />
  );
}
