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
  // Editable copy of the AI extraction. The user's version of `extracted`
  // is what we save; `extraction.extracted` stays the immutable AI original
  // and is sent as `aiOutput` so the server can compute the correction diff.
  const [edited, setEdited] = useState<ExtractedInvoice | null>(null);
  const [commitResult, setCommitResult] = useState<{ vendorCreated: boolean; vendorName: string; billId: string; billNumber: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const extractMutation = useExtractInvoice();
  const commitMutation = useScanCommit();

  function handleFileSelected(f: File) {
    setFile(f);
    extractMutation.mutate(f, {
      onSuccess: (res) => {
        setExtraction(res.data);
        setEdited(res.data.extracted);
        setStep('preview');
      },
      onError: (err: any) => {
        toast(`Extraction failed: ${err?.error || err?.message || 'Unknown error'}`, 'error');
      },
    });
  }

  function handleCommit() {
    if (!extraction || !edited) return;
    setShowConfirm(false);
    commitMutation.mutate(
      {
        extracted: edited,
        vendorId: extraction.vendorMatch?.id,
        aiOutput: extraction.extracted,
        extractionId: extraction.extractionId,
      },
      {
        onSuccess: (res) => {
          setCommitResult(res.data);
          setStep('done');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        onError: (err: any) => {
          // Surface server-side validation errors with the offending field
          // path so the user knows where to look. Falls back to plain
          // message for non-validation errors.
          const details: Array<{ field: string; message: string }> | undefined = err?.details;
          if (Array.isArray(details) && details.length > 0) {
            const summary = details
              .map((d) => `${prettyFieldName(d.field)}: ${d.message}`)
              .slice(0, 3)
              .join(' · ');
            toast(`Cannot save: ${summary}`, 'error');
          } else {
            toast(`Import failed: ${err?.error || err?.message || 'Unknown error'}`, 'error');
          }
        },
      },
    );
  }

  function prettyFieldName(path: string): string {
    return path
      .replace(/^extracted\./, '')
      .replace(/\.items\.(\d+)/, ' (line $1)')
      .replace(/\./g, ' ');
  }

  function reset() {
    setStep('upload');
    setFile(null);
    setExtraction(null);
    setEdited(null);
    setCommitResult(null);
  }

  return (
    <div className="max-w-6xl space-y-4">
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

      {/* Step 2: Preview & edit extracted data */}
      {step === 'preview' && extraction && edited && (
        <ExtractedPreview
          extraction={extraction}
          edited={edited}
          onChange={setEdited}
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
              <Button variant="outline" onClick={() => navigate({ to: '/finance/ap/bills/$billId', params: { billId: commitResult.billId } })}>
                View Bill
              </Button>
              <Button onClick={() => navigate({ to: '/finance/ap/bills' })}>All Bills</Button>
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
            ? `Create a draft bill from ${edited?.vendorName} for ${formatINR(edited?.totalAmount ?? 0)}?`
            : `Vendor "${edited?.vendorName}" not found. A new vendor will be auto-created and a draft bill for ${formatINR(edited?.totalAmount ?? 0)} will be created. Proceed?`
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
  edited,
  onChange,
  fileName,
  onConfirm,
  onRetry,
  isCommitting,
}: {
  extraction: ExtractionResult;
  edited: ExtractedInvoice;
  onChange: (next: ExtractedInvoice) => void;
  fileName: string;
  onConfirm: () => void;
  onRetry: () => void;
  isCommitting: boolean;
}) {
  const { vendorMatch, confidence } = extraction;
  const confidencePct = Math.round(confidence * 100);

  // Field setters — keeps the JSX terse without inlining setState calls.
  const setField = <K extends keyof ExtractedInvoice>(key: K, value: ExtractedInvoice[K]) =>
    onChange({ ...edited, [key]: value });

  const updateItem = (idx: number, patch: Partial<ExtractedInvoice['items'][number]>) => {
    const items = edited.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    // Auto-recompute amount when qty or unit price changes.
    if (patch.quantity !== undefined || patch.unitPrice !== undefined) {
      const target = items[idx];
      if (target) target.amount = Number((target.quantity * target.unitPrice).toFixed(2));
    }
    const subtotal = items.reduce((s, it) => s + (it.amount || 0), 0);
    onChange({ ...edited, items, subtotal: Number(subtotal.toFixed(2)) });
  };

  const addItem = () => {
    onChange({
      ...edited,
      items: [
        ...edited.items,
        { itemName: '', hsnSacCode: null, quantity: 1, unitPrice: 0, amount: 0, taxRate: null, taxCategory: null },
      ],
    });
  };

  const removeItem = (idx: number) => {
    const items = edited.items.filter((_, i) => i !== idx);
    const subtotal = items.reduce((s, it) => s + (it.amount || 0), 0);
    onChange({ ...edited, items, subtotal: Number(subtotal.toFixed(2)) });
  };

  // Sanity check — surface tax/total mismatch even if the server already softened it.
  const computedTotal = (edited.subtotal || 0) + (edited.taxAmount || 0);
  const totalsMismatch = edited.totalAmount > 0 && Math.abs(computedTotal - edited.totalAmount) > 2;

  // Client-side validation that mirrors the server schema. Shown as a
  // banner + used to disable "Create Bill" so the user understands why.
  const validationIssues: string[] = [];
  if (!edited.vendorName?.trim()) validationIssues.push('Vendor name is required');
  if (!edited.invoiceNumber?.trim()) validationIssues.push('Invoice number is required');
  if (!edited.invoiceDate) validationIssues.push('Invoice date is required');
  if (edited.totalAmount <= 0) validationIssues.push('Total must be greater than 0');
  edited.items.forEach((it, i) => {
    if (!it.itemName?.trim()) validationIssues.push(`Line ${i + 1}: item name is required`);
    if (!(it.quantity > 0)) validationIssues.push(`Line ${i + 1}: quantity must be > 0`);
    if (!(it.amount > 0)) validationIssues.push(`Line ${i + 1}: amount must be > 0`);
  });
  if (edited.items.length === 0) validationIssues.push('Add at least one line item');
  const hasErrors = validationIssues.length > 0;

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
            Low confidence extraction. Review every field carefully — extracted values may be wrong.
          </p>
        </div>
      )}

      {totalsMismatch && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-900/20">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Subtotal + Tax doesn't match Total ({formatINR(computedTotal)} vs {formatINR(edited.totalAmount)}). Please correct before saving.
          </p>
        </div>
      )}

      {hasErrors && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
            <div className="text-xs text-red-700 dark:text-red-400">
              <p className="font-semibold">Fix the following before saving:</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {validationIssues.slice(0, 6).map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
                {validationIssues.length > 6 && <li>…and {validationIssues.length - 6} more</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Invoice header — editable */}
      <Card>
        <CardHeader title="Invoice Details" />
        <CardContent>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <EditableField label="Vendor" value={edited.vendorName} onChange={(v) => setField('vendorName', v)} required />
            <EditableField label="GSTIN" value={edited.vendorGstin} onChange={(v) => setField('vendorGstin', v || null)} mono />
            <EditableField label="PAN" value={edited.vendorPan} onChange={(v) => setField('vendorPan', v || null)} mono />
            <EditableField label="Phone" value={edited.vendorPhone} onChange={(v) => setField('vendorPhone', v || null)} />
            <EditableField label="Email" value={edited.vendorEmail} onChange={(v) => setField('vendorEmail', v || null)} />
            <EditableField label="City" value={edited.vendorCity} onChange={(v) => setField('vendorCity', v || null)} />
            <EditableField label="State" value={edited.vendorState} onChange={(v) => setField('vendorState', v || null)} />
            <EditableField label="Pincode" value={edited.vendorPincode} onChange={(v) => setField('vendorPincode', v || null)} mono />
            <EditableField label="Address" value={edited.vendorAddress} onChange={(v) => setField('vendorAddress', v || null)} />
            <EditableField label="Invoice #" value={edited.invoiceNumber} onChange={(v) => setField('invoiceNumber', v)} mono required />
            <EditableField label="Invoice Date" value={edited.invoiceDate} onChange={(v) => setField('invoiceDate', v)} type="date" required />
            <EditableField label="Due Date" value={edited.dueDate} onChange={(v) => setField('dueDate', v || null)} type="date" />
            <EditableField label="TDS Section" value={edited.tdsSection} onChange={(v) => setField('tdsSection', v || null)} />
            <EditableField label="Bank A/C" value={edited.vendorBankAccount} onChange={(v) => setField('vendorBankAccount', v || null)} mono />
            <EditableField label="IFSC" value={edited.vendorBankIfsc} onChange={(v) => setField('vendorBankIfsc', v || null)} mono />
          </div>
        </CardContent>
      </Card>

      {/* Line items — editable */}
      <Card>
        <CardHeader
          title={`Line Items (${edited.items.length})`}
          action={
            <Button variant="outline" size="sm" onClick={addItem}>+ Add row</Button>
          }
        />
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                {[
                  { label: 'Item', align: 'text-left' },
                  { label: 'HSN/SAC', align: 'text-left' },
                  { label: 'Qty', align: 'text-right' },
                  { label: 'Unit Price', align: 'text-right' },
                  { label: 'Taxable', align: 'text-right' },
                  { label: 'Tax %', align: 'text-right' },
                  { label: 'Tax ₹', align: 'text-right' },
                  { label: '', align: 'text-right' },
                ].map((h, i) => (
                  <th key={i} className={`px-3 py-2.5 ${h.align} text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400`}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {edited.items.map((item, i) => (
                <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-3 py-1.5">
                    <CellInput value={item.itemName} onChange={(v) => updateItem(i, { itemName: v })} className="w-full min-w-[12rem]" />
                  </td>
                  <td className="px-3 py-1.5">
                    <CellInput value={item.hsnSacCode ?? ''} onChange={(v) => updateItem(i, { hsnSacCode: v || null })} className="w-24 font-mono" />
                  </td>
                  <td className="px-3 py-1.5">
                    <CellInput type="number" value={String(item.quantity)} onChange={(v) => updateItem(i, { quantity: Number(v) || 0 })} className="w-20 text-right font-mono" />
                  </td>
                  <td className="px-3 py-1.5">
                    <CellInput type="number" value={String(item.unitPrice)} onChange={(v) => updateItem(i, { unitPrice: Number(v) || 0 })} className="w-28 text-right font-mono" />
                  </td>
                  <td className="px-3 py-1.5">
                    <CellInput type="number" value={String(item.amount)} onChange={(v) => updateItem(i, { amount: Number(v) || 0 })} className="w-28 text-right font-mono font-medium" />
                  </td>
                  <td className="px-3 py-1.5">
                    <CellInput type="number" value={item.taxRate != null ? String(item.taxRate) : ''} onChange={(v) => updateItem(i, { taxRate: v ? Number(v) : null })} className="w-20 text-right font-mono" placeholder="—" />
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-zinc-600 dark:text-zinc-400">
                    {item.taxRate != null ? formatINR(Math.round(item.amount * item.taxRate) / 100) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button type="button" onClick={() => removeItem(i)} className="text-zinc-400 hover:text-red-500 dark:hover:text-red-400" aria-label="Remove row">
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Totals — editable */}
      <Card>
        <CardContent>
          <div className="flex flex-col items-end gap-1.5 text-sm">
            <div className="flex w-64 items-center justify-between">
              <span className="text-zinc-500">Subtotal</span>
              <CellInput type="number" value={String(edited.subtotal)} onChange={(v) => setField('subtotal', Number(v) || 0)} className="w-32 text-right font-mono" />
            </div>
            <div className="flex w-64 items-center justify-between">
              <span className="text-zinc-500">Tax</span>
              <CellInput type="number" value={String(edited.taxAmount)} onChange={(v) => setField('taxAmount', Number(v) || 0)} className="w-32 text-right font-mono" />
            </div>
            <div className="flex w-64 items-center justify-between border-t border-zinc-200 pt-1.5 dark:border-zinc-700">
              <span className="font-semibold">Total</span>
              <CellInput type="number" value={String(edited.totalAmount)} onChange={(v) => setField('totalAmount', Number(v) || 0)} className="w-32 text-right font-mono font-bold" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onRetry}>Upload Different File</Button>
        <Button onClick={onConfirm} loading={isCommitting} disabled={hasErrors}>
          <Check size={16} />
          Create Bill
        </Button>
      </div>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  mono,
  required,
  type,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  mono?: boolean;
  required?: boolean;
  type?: 'text' | 'date';
}) {
  return (
    <div>
      <label className="text-xs text-zinc-400 dark:text-zinc-500">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        type={type ?? 'text'}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={[
          'mt-0.5 block w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-800 placeholder-zinc-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500',
          mono ? 'font-mono' : '',
        ].join(' ')}
      />
    </div>
  );
}

function CellInput({
  value,
  onChange,
  type,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'number';
  className?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type ?? 'text'}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={[
        'rounded border border-transparent bg-transparent px-2 py-1 text-xs text-zinc-800 placeholder-zinc-400 hover:border-zinc-200 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500/30 dark:text-zinc-100 dark:placeholder-zinc-500 dark:hover:border-zinc-700 dark:focus:bg-zinc-900',
        className ?? '',
      ].join(' ')}
    />
  );
}
