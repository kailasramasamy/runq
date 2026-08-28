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
  shortages: (filter?: Record<string, unknown>) => ['inv', 'shortages', filter] as const,
  shortageCount: () => ['inv', 'shortages', 'count'] as const,
  substitutes: (itemId: string) => ['inv', 'items', itemId, 'substitutes'] as const,
  draftSubstitutes: (dnId: string) => ['inv', 'dn', dnId, 'substitutes'] as const,
};

/** Whether a stand-in can go out against a line, and what it costs to say yes. */
export type SubstituteVerdict = 'clear' | 'needs_note' | 'blocked';

export interface SubstituteOption {
  itemId: string;
  itemName: string;
  itemSku: string | null;
  /** Pack size — one product name covers several SKUs. */
  uom: string | null;
  /** The stand-in's list price — what relabelling would re-price the line to. */
  sellingPrice: number | null;
  availableQty: number;
  verdict: SubstituteVerdict;
  /** Why it's refused, or what needs acknowledging. Absent when clear. */
  message?: string;
}

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
  /** Lines whose remainder is parked on a shortfall draft — blocked on stock. */
  shortLineCount: number;
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
  /** Declared stand-ins with stock, already scored against what this billed. */
  substitutes: SubstituteOption[];
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
  | {
    status: 'dispatched';
    dnId: string;
    dnNo: string;
    lineCount: number;
    shortfall?: DispatchShortfall;
  }
  /** Nothing could be covered — the shelf was empty, not an error. */
  | { status: 'shortfall'; dnId: string; dnNo: string; shortfall: DispatchShortfall }
  | { status: 'failed'; reason: string; dnId?: string; dnNo?: string };

export interface DispatchShortfall {
  dnId: string;
  dnNo: string;
  lineCount: number;
  reason: string;
  /** uom included because one product name can cover several pack sizes. */
  items: Array<{ itemName: string; qty: number; uom: string | null }>;
}

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
    /** Set when `itemId` is a stand-in for what the invoice line billed. */
    substitutedForItemId?: string | null;
    substitutionNote?: string | null;
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

// ─── Shortages: billed goods the warehouse never covered ──────────────────

export interface ShortageLine {
  dnId: string;
  dnNo: string;
  dispatchDate: string;
  ageDays: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  warehouseId: string;
  warehouseName: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  uom: string | null;
  shortQty: number;
  availableQty: number;
  /** Stock has since caught up — this draft can just be posted. */
  coverable: boolean;
  substituteCount: number;
}

export function useShortages(filter: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: DISPATCH_KEYS.shortages(filter),
    queryFn: () => api.get<{
      data: ShortageLine[]; page: number; limit: number; total: number; totalPages: number;
    }>(`/inventory/shortages${qs(filter)}`),
  });
}

/** Just the number, for the tab label — the rows are a much heavier query. */
export function useShortageCount() {
  return useQuery({
    queryKey: DISPATCH_KEYS.shortageCount(),
    queryFn: () => api.get<{ data: { open: number } }>('/inventory/shortages/count').then(get),
  });
}

export interface DeclaredSubstitute {
  itemId: string;
  itemName: string;
  itemSku: string | null;
  priority: number;
}

export function useItemSubstitutes(itemId: string) {
  return useQuery({
    queryKey: DISPATCH_KEYS.substitutes(itemId),
    queryFn: () => api.get<{ data: DeclaredSubstitute[] }>(
      `/inventory/items/${itemId}/substitutes`,
    ).then(get),
    enabled: !!itemId,
  });
}

/** Sent as a set — the item form edits the whole list, never one row. */
export function useSetItemSubstitutes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { itemId: string; substituteItemIds: string[] }) =>
      api.put<{ data: unknown }>(
        `/inventory/items/${v.itemId}/substitutes`, { substituteItemIds: v.substituteItemIds },
      ).then(get),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: DISPATCH_KEYS.substitutes(v.itemId) });
      qc.invalidateQueries({ queryKey: ['inv', 'sales-dispatch', 'preview'] });
    },
  });
}

// ─── Substituting on a parked draft ───────────────────────────────────────

/** Stand-in options for a draft DN's lines, keyed by delivery-note line id. */
export function useDraftSubstitutes(dnId: string, enabled = true) {
  return useQuery({
    queryKey: DISPATCH_KEYS.draftSubstitutes(dnId),
    queryFn: () => api.get<{ data: Record<string, SubstituteOption[]> }>(
      `/inventory/delivery-notes/${dnId}/substitutes`,
    ).then(get),
    enabled: !!dnId && enabled,
  });
}

/** Swaps what a draft line will send. Passing the billed item reverts it. */
export function useSubstituteDraftLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { dnId: string; lineId: string; itemId: string; note?: string | null }) =>
      api.post<{ data: unknown }>(
        `/inventory/delivery-notes/${v.dnId}/lines/${v.lineId}/substitute`,
        { itemId: v.itemId, note: v.note ?? null },
      ).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv'] }),
  });
}

/**
 * Point an invoice line at the substitute that actually shipped. Item and
 * description only — price, HSN and tax are untouched, so nothing the
 * customer owes changes.
 */
export function useRelabelInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { invoiceId: string; lineId: string }) =>
      api.post<{ data: unknown }>(
        `/ar/invoices/${v.invoiceId}/lines/${v.lineId}/relabel`, {},
      ).then(get),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inv'] });
      qc.invalidateQueries({ queryKey: ['ar'] });
    },
  });
}
