import { CheckCircle2, CircleDashed, CircleDollarSign } from 'lucide-react';
import type { PaymentReceipt } from '@runq/types';
import { formatINR } from '../../../lib/utils';

export type AllocationStatus = 'allocated' | 'partial' | 'unallocated';

/** ₹ tolerance for treating a receipt as fully allocated — absorbs the
 *  sub-rupee round-off the server books when invoices settle in full. */
const ALLOC_TOLERANCE = 1;

export interface AllocationSummary {
  status: AllocationStatus;
  allocated: number;
  unallocated: number;
}

type ReceiptAllocInput = Pick<PaymentReceipt, 'amount' | 'allocatedAmount'>;

export function receiptAllocation(r: ReceiptAllocInput): AllocationSummary {
  const allocated = r.allocatedAmount ?? 0;
  const unallocated = Math.max(0, Math.round((r.amount - allocated) * 100) / 100);
  const status: AllocationStatus =
    allocated <= ALLOC_TOLERANCE ? 'unallocated'
    : unallocated <= ALLOC_TOLERANCE ? 'allocated'
    : 'partial';
  return { status, allocated, unallocated };
}

const STYLES: Record<AllocationStatus, string> = {
  allocated: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300',
  partial: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300',
  unallocated: 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-400',
};

const ICON: Record<AllocationStatus, typeof CheckCircle2> = {
  allocated: CheckCircle2,
  partial: CircleDollarSign,
  unallocated: CircleDashed,
};

/** Persistent badge telling whether a receipt's remittance allocation is
 *  complete (matches amount received) or still has cash sitting on-account. */
export function ReceiptAllocationBadge({ receipt }: { receipt: ReceiptAllocInput }) {
  const { status, unallocated } = receiptAllocation(receipt);
  const Icon = ICON[status];
  const label =
    status === 'allocated' ? 'Fully allocated'
    : status === 'partial' ? `${formatINR(unallocated)} on-account`
    : `${formatINR(receipt.amount)} on-account`;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      <Icon size={12} />
      {label}
    </span>
  );
}
