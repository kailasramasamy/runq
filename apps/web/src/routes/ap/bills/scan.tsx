import { useState, useRef, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FileUp, Check, X, AlertTriangle, UserPlus, Loader2 } from 'lucide-react';
import { useExtractInvoice, useScanCommit } from '@/hooks/queries/use-scan-import';
import type { ExtractionResult, ExtractedInvoice } from '@/hooks/queries/use-scan-import';
import { formatINR } from '@/lib/utils';
import {
  PageHeader,
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Badge,
  ConfirmationDialog,
  useToast,
} from '@/components/ui';

type Step = 'upload' | 'preview' | 'done';

export function ScanBillPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [commitResult, setCommitResult] = useState<{ vendorCreated: boolean; vendorName: string; billId: string; billNumber: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const extractMutation = useExtractInvoice();
  const commitMutation = useScanCommit();

  function handleFileSelected(f: File) {
    setFile(f);
    extractMutation.mutate(f, {
      onSuccess: (res) => {
        setExtraction(res.data);
        setStep('preview');
      },
      onError: (err: any) => {
        toast(`Extraction failed: ${err?.error || err?.message || 'Unknown error'}`, 'error');
      },
    });
  }

  function handleCommit() {
    if (!extraction) return;
    setShowConfirm(false);
    commitMutation.mutate(
      {
        extracted: extraction.extracted,
        vendorId: extraction.vendorMatch?.id,
      },
      {
        onSuccess: (res) => {
          setCommitResult(res.data);
          setStep('done');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        onError: (err: any) => {
          toast(`Import failed: ${err?.error || err?.message || 'Unknown error'}`, 'error');
        },
      },
    );
  }

  function reset() {
    setStep('upload');
    setFile(null);
    setExtraction(null);
    setCommitResult(null);
  }

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Bills', href: '/ap/bills' },
          { label: 'Scan Invoice' },
        ]}
        title="Scan Vendor Invoice"
        description="Upload a vendor invoice (PDF, image, or spreadsheet) to auto-extract and create a bill."
      />

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <Card>
          <CardHeader title="Upload Invoice" />
          <CardContent>
            {extractMutation.isPending ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 size={32} className="animate-spin text-indigo-500" />
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Extracting invoice data…</p>
                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">This may take a few seconds for scanned documents</p>
              </div>
            ) : (
              <InvoiceDropZone onFile={handleFileSelected} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview extracted data */}
      {step === 'preview' && extraction && (
        <ExtractedPreview
          extraction={extraction}
          fileName={file?.name ?? ''}
          onConfirm={() => setShowConfirm(true)}
          onRetry={reset}
          isCommitting={commitMutation.isPending}
        />
      )}

      {/* Step 3: Done */}
      {step === 'done' && commitResult && (
        <Card>
          <CardHeader title="Bill Created" />
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-900/20">
                <Check className="mx-auto mb-1 text-emerald-600 dark:text-emerald-400" size={24} />
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{commitResult.billNumber}</p>
                <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-500">Bill created as draft</p>
              </div>
              {commitResult.vendorCreated && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center dark:border-blue-900 dark:bg-blue-900/20">
                  <UserPlus className="mx-auto mb-1 text-blue-600 dark:text-blue-400" size={24} />
                  <p className="text-sm font-bold text-blue-700 dark:text-blue-400">{commitResult.vendorName}</p>
                  <p className="mt-0.5 text-xs text-blue-600 dark:text-blue-500">New vendor auto-created</p>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex items-center justify-between">
            <Button variant="outline" onClick={reset}>Scan Another</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate({ to: '/ap/bills/$billId', params: { billId: commitResult.billId } })}>
                View Bill
              </Button>
              <Button onClick={() => navigate({ to: '/ap/bills' })}>All Bills</Button>
            </div>
          </CardFooter>
        </Card>
      )}

      <ConfirmationDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleCommit}
        title="Create Bill"
        description={
          extraction?.vendorMatch
            ? `Create a draft bill from ${extraction.extracted.vendorName} for ${formatINR(extraction.extracted.totalAmount)}?`
            : `Vendor "${extraction?.extracted.vendorName}" not found. A new vendor will be auto-created and a draft bill for ${formatINR(extraction?.extracted.totalAmount ?? 0)} will be created. Proceed?`
        }
        confirmLabel="Create Bill"
        loading={commitMutation.isPending}
      />
    </div>
  );
}

// ─── Invoice Drop Zone ───────────────────────────────────────────────────────

function InvoiceDropZone({ onFile }: { onFile: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (!allowed.includes(f.type) && !f.name.match(/\.(pdf|png|jpe?g|csv|xlsx)$/i)) return;
    onFile(f);
  }, [onFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onClick={() => inputRef.current?.click()}
      className={[
        'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 transition-colors',
        dragging
          ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-900/20'
          : 'border-zinc-300 bg-zinc-50 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:border-zinc-600',
      ].join(' ')}
    >
      <FileUp size={36} className="mb-3 text-zinc-400" />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-indigo-600 dark:text-indigo-400">Click to upload</span> or drag and drop
      </p>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">PDF, JPG, PNG, CSV, or XLSX — up to 10 MB</p>
      <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
    </div>
  );
}

// ─── Extracted Data Preview ──────────────────────────────────────────────────

function ExtractedPreview({
  extraction,
  fileName,
  onConfirm,
  onRetry,
  isCommitting,
}: {
  extraction: ExtractionResult;
  fileName: string;
  onConfirm: () => void;
  onRetry: () => void;
  isCommitting: boolean;
}) {
  const { extracted, vendorMatch, confidence } = extraction;
  const confidencePct = Math.round(confidence * 100);

  return (
    <div className="space-y-4">
      {/* Confidence + vendor match */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <Badge variant={confidence >= 0.7 ? 'success' : 'warning'}>
            {confidencePct}% confidence
          </Badge>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">from {fileName}</span>
          <div className="ml-auto flex items-center gap-2">
            {vendorMatch ? (
              <Badge variant="success">Vendor matched: {vendorMatch.name}</Badge>
            ) : (
              <Badge variant="warning">
                <UserPlus size={12} className="mr-1" />
                New vendor will be created
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {confidence < 0.7 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-900/20">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Low confidence extraction. Please review the data carefully before importing.
          </p>
        </div>
      )}

      {/* Invoice header */}
      <Card>
        <CardHeader title="Invoice Details" />
        <CardContent>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Field label="Vendor" value={extracted.vendorName} />
            <Field label="GSTIN" value={extracted.vendorGstin} />
            <Field label="Invoice #" value={extracted.invoiceNumber} mono />
            <Field label="Invoice Date" value={extracted.invoiceDate} />
            <Field label="Due Date" value={extracted.dueDate} />
            <Field label="TDS Section" value={extracted.tdsSection} />
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader title={`Line Items (${extracted.items.length})`} />
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                {['Item', 'HSN/SAC', 'Qty', 'Unit Price', 'Amount', 'Tax %'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {extracted.items.map((item, i) => (
                <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-4 py-2 font-medium">{item.itemName}</td>
                  <td className="px-4 py-2 font-mono text-zinc-500">{item.hsnSacCode || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono">{item.quantity}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatINR(item.unitPrice)}</td>
                  <td className="px-4 py-2 text-right font-mono font-medium">{formatINR(item.amount)}</td>
                  <td className="px-4 py-2 text-right font-mono">{item.taxRate != null ? `${item.taxRate}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Totals */}
      <Card>
        <CardContent>
          <div className="flex flex-col items-end gap-1 text-sm">
            <div className="flex w-48 justify-between">
              <span className="text-zinc-500">Subtotal</span>
              <span className="font-mono">{formatINR(extracted.subtotal)}</span>
            </div>
            <div className="flex w-48 justify-between">
              <span className="text-zinc-500">Tax</span>
              <span className="font-mono">{formatINR(extracted.taxAmount)}</span>
            </div>
            <div className="flex w-48 justify-between border-t border-zinc-200 pt-1 dark:border-zinc-700">
              <span className="font-semibold">Total</span>
              <span className="font-mono font-bold">{formatINR(extracted.totalAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onRetry}>Upload Different File</Button>
        <Button onClick={onConfirm} loading={isCommitting}>
          <Check size={16} />
          Create Bill
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-zinc-800 dark:text-zinc-200 ${mono ? 'font-mono' : ''}`}>
        {value || '—'}
      </p>
    </div>
  );
}
