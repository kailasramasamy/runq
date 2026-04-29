import { useMutation, useQueryClient } from '@tanstack/react-query';

interface ExtractedItem {
  itemName: string;
  hsnSacCode: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number | null;
  taxCategory: string | null;
}

export interface ExtractedInvoice {
  vendorName: string;
  vendorGstin: string | null;
  vendorPan: string | null;
  vendorPhone: string | null;
  vendorEmail: string | null;
  vendorAddress: string | null;
  vendorCity: string | null;
  vendorState: string | null;
  vendorPincode: string | null;
  vendorBankAccount: string | null;
  vendorBankIfsc: string | null;
  vendorBankName: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  items: ExtractedItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  tdsSection: string | null;
  confidence: number;
}

interface VendorMatch {
  id: string;
  name: string;
  matchType: 'gstin' | 'name';
}

export interface ExtractionResult {
  confidence: number;
  extracted: ExtractedInvoice;
  vendorMatch: VendorMatch | null;
  // Set on the two-step flow: server has staged the file in S3 under this id
  // and will bind it to the bill on commit.
  extractionId?: string;
}

interface ScanImportResult {
  extraction: ExtractionResult;
  vendorCreated: boolean;
  vendorId: string;
  vendorName: string;
  billId: string;
  billNumber: string;
}

const BASE = '/api/v1/ap/purchase-invoices';

async function uploadFile<T>(url: string, file: File, token: string | null): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw err;
  }
  return res.json();
}

function getToken(): string | null {
  try { return localStorage.getItem('runq-token'); } catch { return null; }
}

export function useExtractInvoice() {
  return useMutation({
    mutationFn: (file: File) =>
      uploadFile<{ data: ExtractionResult }>(`${BASE}/extract`, file, getToken()),
  });
}

export function useScanCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      extracted: ExtractedInvoice;
      vendorId?: string;
      // Original AI output from /extract — pass through unchanged so the
      // server can compute the user's correction diff for learning.
      aiOutput?: ExtractedInvoice;
      // Round-trip the extractionId from /extract so the server can bind
      // the staged S3 file to the new bill as an attachment.
      extractionId?: string;
    }) => {
      const token = getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${BASE}/scan-commit`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw err;
      }
      return res.json() as Promise<{ data: ScanImportResult }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-invoices'] });
      qc.invalidateQueries({ queryKey: ['vendors'] });
    },
  });
}
