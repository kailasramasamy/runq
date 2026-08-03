import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';
import type { ReceiveAgainstPoInput, ScanReceiveAgainstPoInput } from '@runq/validators';

/**
 * PP Phase 2 — hooks for receive-template + receive-against-PO endpoints.
 */

export interface ReceiveTemplateLine {
  poLineId: string;
  lineNo: number;
  description: string;
  uom: string | null;
  hsnSacCode: string | null;
  qtyOrdered: number;
  qtyReceivedSoFar: number;
  qtyOpen: number;
  unitRate: number;
  /** Catalog row backing this PO line; required to receive. */
  catalogItemId: string | null;
  /** Bridge into items master. NULL → not inventory-tracked. */
  inventoryItemId: string | null;
}

export interface ReceiveTemplate {
  poId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  warehouseId: string | null;
  lines: ReceiveTemplateLine[];
}

export interface ReceiveResult {
  grnId: string;
  grnNo: string;
  totalValue: number;
  lineCount: number;
  newPoStatus: string;
}

export function useReceiveTemplate(poId: string) {
  return useQuery({
    queryKey: ['po-receive-template', poId],
    queryFn: () => api.get<ApiSuccess<ReceiveTemplate>>(`/purchase/pos/${poId}/receive-template`),
    enabled: !!poId,
  });
}

export function useReceiveAgainstPo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ poId, data }: { poId: string; data: ReceiveAgainstPoInput }) =>
      api.post<ApiSuccess<ReceiveResult>>(`/purchase/pos/${poId}/receive`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['po-receive-template', vars.poId] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}

// ─── PP Phase 5: scan-on-receive ────────────────────────────────────────

export interface ScanSuggestedLine {
  poLineId: string | null;
  catalogItemId: string | null;
  catalogDescription: string;
  vendorQty: number;
  vendorRate: number;
  vendorTaxRate: number | null;
  vendorHsnSacCode: string | null;
  poQty: number | null;
  poRate: number | null;
  isOffPo: boolean;
}

export interface ScanPreviewResult {
  extractionId: string;
  extracted: {
    vendorName: string;
    vendorGstin: string | null;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string | null;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    confidence: number;
    items: Array<{
      itemName: string;
      hsnSacCode: string | null;
      quantity: number;
      unitPrice: number;
      amount: number;
      taxRate: number | null;
    }>;
  };
  vendorMatch: { id: string; name: string; matchType: 'gstin' | 'name' } | null;
  vendorMismatch: boolean;
  suggestedLines: ScanSuggestedLine[];
}

export interface ScanCommitResult {
  billId: string;
  billNumber: string;
  grnId: string;
  grnNo: string;
  newPoStatus: string;
  offPoLineCount: number;
}

/**
 * Multipart upload — sends the file as `file` form field. Caller passes a
 * native File / Blob; we wrap into FormData here.
 */
export function useScanPreview() {
  return useMutation({
    mutationFn: ({ poId, file }: { poId: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.upload<ApiSuccess<ScanPreviewResult>>(`/purchase/pos/${poId}/scan-preview`, fd);
    },
  });
}

export function useScanCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ poId, data }: { poId: string; data: ScanReceiveAgainstPoInput }) =>
      api.post<ApiSuccess<ScanCommitResult>>(`/purchase/pos/${poId}/scan-commit`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['po-receive-template', vars.poId] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-invoices'] });
    },
  });
}
