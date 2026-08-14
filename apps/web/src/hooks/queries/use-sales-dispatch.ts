/**
 * Queries for the invoice → dispatch lane and sales returns.
 *
 * Kept out of use-inventory.ts (already 1k lines) but sharing its `['inv']`
 * query-key root, so posting a dispatch invalidates on-hand, the DN list and
 * this queue in one go.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { DeliveryNote } from './use-inventory';

const get = <T,>(r: { data: T }): T => r.data;

export const DISPATCH_KEYS = {
  pending: (filter?: Record<string, unknown>) => ['inv', 'sales-dispatch', 'pending', filter] as const,
  preview: (id: string, warehouseId: string) => ['inv', 'sales-dispatch', 'preview', id, warehouseId] as const,
  status: (id: string) => ['inv', 'sales-dispatch', 'status', id] as const,
  returnable: (dnId: string) => ['inv', 'dn', dnId, 'returnable'] as const,
};

export interface PendingInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerId: string;
  customerName: string;
  totalAmount: string;
  lineCount: number;
  /** Lines resolving to a stock-tracked item — the rest never ship. */
  stockableCount: number;
  dispatchedCount: number;
  /** A draft DN already open for this invoice, if someone started one. */
  openDraftDnId: string | null;
}

export type LineResolution = 'item' | 'alias' | 'unmapped' | 'not_stocked';

export interface DispatchPreviewLine {
  invoiceLineId: string;
  description: string;
  invoicedQty: number;
  dispatchedQty: number;
  remainingQty: number;
  itemId: string | null;
  itemName: string | null;
  itemSku: string | null;
  uom: string | null;
  trackBatches: boolean;
  resolution: LineResolution;
  suggestedBatchNo: string | null;
  availableQty: number;
  /**
   * Present when the SKU is only branded at dispatch, so it holds no stock of
   * its own and `availableQty` is 0 by design. `capacityQty` is how many packs
   * the limiting component could still make.
   */
  repackFrom: { poolItemName: string; capacityQty: number } | null;
}

export interface DispatchPreview {
  invoice: {
    id: string; invoiceNumber: string; invoiceDate: string;
    customerId: string; customerName: string;
  };
  lines: DispatchPreviewLine[];
}

export interface InvoiceDispatchStatus {
  status: 'not_stockable' | 'pending' | 'partial' | 'dispatched';
  stockableLines: number;
  dispatchedLines: number;
  lines: Array<{
    invoiceLineId: string;
    description: string;
    invoicedQty: number;
    dispatchedQty: number;
    stockable: boolean;
  }>;
  deliveryNotes: Array<{
    id: string; dnNo: string; status: string;
    direction: 'out' | 'in'; dispatchDate: string;
  }>;
}

export interface ReturnableLine {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  batchNo: string | null;
  uom: string | null;
  unitCost: string;
  dispatchedQty: number;
  returnedQty: number;
  returnableQty: number;
}

export function usePendingDispatches(filter: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: DISPATCH_KEYS.pending(filter),
    queryFn: () => api.get<{
      data: PendingInvoice[]; page: number; limit: number; total: number; totalPages: number;
    }>(`/inventory/sales-dispatch/pending${qs(filter)}`),
  });
}

export interface PendingPage {
  data: PendingInvoice[]; page: number; limit: number; total: number; totalPages: number;
}

/**
 * The queue as the server sees it, for the bulk loop — which pages past the
 * 100 rows the tab renders and so cannot use the cached hook.
 */
export function fetchPendingDispatches(filter: Record<string, unknown>) {
  return api.get<PendingPage>(`/inventory/sales-dispatch/pending${qs(filter)}`);
}

/** What the bulk endpoint did with one invoice. */
export type DispatchOutcome =
  | { status: 'off' }
  | { status: 'skipped'; reason: string }
  | { status: 'dispatched'; dnId: string; dnNo: string; lineCount: number }
  | { status: 'failed'; reason: string; dnId?: string; dnNo?: string };

export interface BulkDispatchResult { invoiceId: string; outcome: DispatchOutcome }

/** Capped at 25 server-side — the caller chunks and reports progress. */
export function bulkDispatch(invoiceIds: string[], dateMode: 'invoice' | 'today' = 'invoice') {
  return api.post<{ data: BulkDispatchResult[] }>(
    '/inventory/sales-dispatch/bulk', { invoiceIds, dateMode },
  ).then(get);
}

/** The cut-over: leaves the queue without moving stock. Returns the count. */
export function waiveDispatch(upto: string) {
  return api.post<{ data: { waived: number } }>(
    '/inventory/sales-dispatch/waive', { upto },
  ).then(get);
}

export function useDispatchPreview(invoiceId: string, warehouseId: string) {
  return useQuery({
    queryKey: DISPATCH_KEYS.preview(invoiceId, warehouseId),
    queryFn: () => api.get<{ data: DispatchPreview }>(
      `/inventory/sales-dispatch/${invoiceId}/preview?warehouseId=${warehouseId}`,
    ).then(get),
    enabled: !!invoiceId && !!warehouseId,
  });
}

export function useInvoiceDispatchStatus(invoiceId: string) {
  return useQuery({
    queryKey: DISPATCH_KEYS.status(invoiceId),
    queryFn: () => api.get<{ data: InvoiceDispatchStatus }>(
      `/inventory/sales-dispatch/${invoiceId}/status`,
    ).then(get),
    enabled: !!invoiceId,
  });
}

export interface DispatchFromInvoiceBody {
  warehouseId: string;
  dispatchDate: string;
  vehicleNo?: string | null;
  lrNo?: string | null;
  notes?: string | null;
  lines: Array<{
    itemId: string;
    invoiceLineId: string;
    qty: number;
    batchNo?: string | null;
    uom?: string | null;
  }>;
}

/** Creates the draft DN only — the caller then dispatches it. */
export function useCreateDispatchFromInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { invoiceId: string; body: DispatchFromInvoiceBody }) =>
      api.post<{ data: DeliveryNote }>(`/inventory/sales-dispatch/${v.invoiceId}`, v.body).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv'] }),
  });
}

export function useSaveItemAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { sourceName: string; itemId: string }) =>
      api.post<{ data: { id: string } }>('/inventory/sales-dispatch/item-aliases', v).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv', 'sales-dispatch'] }),
  });
}

export function useReturnableLines(dnId: string) {
  return useQuery({
    queryKey: DISPATCH_KEYS.returnable(dnId),
    queryFn: () => api.get<{ data: ReturnableLine[] }>(
      `/inventory/delivery-notes/${dnId}/returnable`,
    ).then(get),
    enabled: !!dnId,
  });
}

export function useCreateSalesReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      dnId: string;
      body: {
        returnDate: string; reason: string; creditNoteId?: string | null;
        lines: Array<{ dnLineId: string; qty: number }>;
      };
    }) => api.post<{ data: DeliveryNote }>(`/inventory/delivery-notes/${v.dnId}/return`, v.body).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv'] }),
  });
}

function qs(filter: Record<string, unknown>) {
  const entries = Object.entries(filter).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (entries.length === 0) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of entries) sp.set(k, String(v));
  return `?${sp.toString()}`;
}
