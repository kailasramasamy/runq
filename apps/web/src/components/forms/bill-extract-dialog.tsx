import { useState, useCallback } from 'react';
import { Upload, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Card, CardContent, Table, TableHeader, TableBody, TableRow, TableCell, Th } from '@/components/ui';
import { formatINR } from '@/lib/utils';

interface ExtractedItem {
  itemName: string;
  hsnSacCode: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number | null;
  taxCategory: string | null;
}

interface ExtractedInvoice {
  vendorName: string;
  vendorGstin: string | null;
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

interface ExtractionResult {
  confidence: number;
  extracted: ExtractedInvoice;
  vendorMatch: VendorMatch | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onExtracted: (data: ExtractionResult) => void;
}

type State = 'idle' | 'uploading' | 'extracting' | 'preview' | 'error';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
];
const MAX_SIZE = 10 * 1024 * 1024;

export function BillExtractDialog({ open, onClose, onExtracted }: Props) {
  const [state, setState] = useState<State>('idle');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setState('idle');
    setResult(null);
    setErrorMsg('');
  }, []);

  function handleClose() {
    reset();
    onClose();
  }

  function handleUseData() {
    if (result) {
      onExtracted(result);
      reset();
    }
  }

  async function uploadFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMsg('Unsupported file type. Upload PDF, PNG, or JPG.');
      setState('error');
      return;
    }
    if (file.size > MAX_SIZE) {
      setErrorMsg('File too large. Maximum size is 10 MB.');
      setState('error');
      return;
    }

    setState('uploading');
    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem('runq-token');
    setState('extracting');

    try {
      const res = await fetch('/api/v1/ap/purchase-invoices/extract', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Extraction failed (${res.status})`);
      }

      const json = await res.json();
      setResult(json.data);
      setState('preview');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Extraction failed');
      setState('error');
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} aria-hidden="true" />
      <div className={cn(
        'relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg border',
        'border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900',
      )}>
        <button onClick={handleClose} className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200" aria-label="Close">
          <X size={18} />
        </button>
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Extract from Invoice
        </h2>

        {state === 'idle' && <DropZone dragOver={dragOver} setDragOver={setDragOver} onDrop={handleDrop} onFileInput={handleFileInput} />}
        {(state === 'uploading' || state === 'extracting') && <ExtractingState />}
        {state === 'error' && <ErrorState message={errorMsg} onRetry={reset} />}
        {state === 'preview' && result && (
          <PreviewState result={result} onUse={handleUseData} onCancel={handleClose} />
        )}
      </div>
    </div>
  );
}

function DropZone({ dragOver, setDragOver, onDrop, onFileInput }: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10',
        'transition-colors cursor-pointer',
        dragOver
          ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950'
          : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500',
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => document.getElementById('extract-file-input')?.click()}
    >
      <Upload size={32} className="text-zinc-400" />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Drag and drop a PDF or image, or click to browse
      </p>
      <p className="text-xs text-zinc-400">PDF, PNG, JPG up to 10 MB</p>
      <input
        id="extract-file-input"
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        className="hidden"
        onChange={onFileInput}
      />
    </div>
  );
}

function ExtractingState() {
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <Loader2 size={32} className="animate-spin text-blue-500" />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Analyzing invoice with AI...
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <AlertCircle size={32} className="text-red-500" />
      <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>Try Again</Button>
    </div>
  );
}

function PreviewState({ result, onUse, onCancel }: {
  result: ExtractionResult;
  onUse: () => void;
  onCancel: () => void;
}) {
  const { extracted, vendorMatch } = result;
  return (
    <div className="flex flex-col gap-4">
      <ConfidenceBadge confidence={extracted.confidence} />

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Vendor" value={extracted.vendorName} />
          <Field label="GSTIN" value={extracted.vendorGstin} />
          <Field label="Invoice #" value={extracted.invoiceNumber} />
          <Field label="Invoice Date" value={extracted.invoiceDate} />
          <Field label="Due Date" value={extracted.dueDate} />
          <Field label="TDS Section" value={extracted.tdsSection} />
        </CardContent>
      </Card>

      {vendorMatch && (
        <div className="flex items-center gap-2 rounded bg-green-50 px-3 py-2 text-sm dark:bg-green-950">
          <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
          <span className="text-green-700 dark:text-green-300">
            Matched vendor: <strong>{vendorMatch.name}</strong> (by {vendorMatch.matchType})
          </span>
        </div>
      )}

      {extracted.items.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <tr>
                  <Th>Item</Th>
                  <Th>HSN/SAC</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">Amount</Th>
                  <Th>GST %</Th>
                </tr>
              </TableHeader>
              <TableBody>
                {extracted.items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell>{item.itemName}</TableCell>
                    <TableCell>{item.hsnSacCode ?? '-'}</TableCell>
                    <TableCell align="right" numeric>{item.quantity}</TableCell>
                    <TableCell align="right" numeric>{formatINR(item.unitPrice)}</TableCell>
                    <TableCell align="right" numeric>{formatINR(item.amount)}</TableCell>
                    <TableCell>{item.taxRate != null ? `${item.taxRate}%` : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="flex items-end justify-between text-sm">
        <div className="flex flex-col gap-1 text-zinc-500 dark:text-zinc-400">
          <span>Subtotal: {formatINR(extracted.subtotal)}</span>
          <span>Tax: {formatINR(extracted.taxAmount)}</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            Total: {formatINR(extracted.totalAmount)}
          </span>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={onUse}>Use This Data</Button>
        </div>
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'red';
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium w-fit',
      color === 'green' && 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      color === 'amber' && 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
      color === 'red' && 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    )}>
      Confidence: {pct}%
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-zinc-500 dark:text-zinc-400">{label}: </span>
      <span className="text-zinc-900 dark:text-zinc-100">{value || '-'}</span>
    </div>
  );
}
