import { useState, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Upload, Sparkles, Check, X, AlertTriangle, FileSpreadsheet, ArrowLeft } from 'lucide-react';
import {
  PageHeader,
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Badge,
  useToast,
} from '@/components/ui';
import {
  useExtractItemsFromFile,
  useBulkCreateItems,
  type ExtractedItem,
  type ExtractionResult,
  type BulkImportResult,
  type CreateItemInput,
} from '@/hooks/queries/use-items';
import { EditableRow, REVIEW_HEADERS } from './import-editable-row';

type Step = 'upload' | 'review' | 'result';
type Mode = 'skip' | 'overwrite';

const ACCEPT = '.csv,.xlsx,.xls,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
const MAX_BYTES = 5 * 1024 * 1024;

export function ImportItemsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [rows, setRows] = useState<ExtractedItem[]>([]);
  const [mode, setMode] = useState<Mode>('skip');
  const [result, setResult] = useState<BulkImportResult | null>(null);

  const extract = useExtractItemsFromFile();
  const commit = useBulkCreateItems();

  function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast('File too large. Maximum size is 5 MB.', 'error');
      return;
    }
    setFileName(file.name);
    extract.mutate(file, {
      onSuccess: (res) => {
        setExtraction(res.data);
        setRows(res.data.items);
        setStep('review');
        if (res.data.items.length === 0) {
          toast('No items found in this file.', 'error');
        }
      },
      onError: (err) => {
        toast(err.message ?? 'Extraction failed', 'error');
      },
    });
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ''; // allow re-selecting the same file
  }

  function updateRow(index: number, patch: Partial<ExtractedItem>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function deleteRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleCommit() {
    const valid = rows.filter((r) => r.name.trim().length > 0);
    if (valid.length === 0) {
      toast('No valid rows to import. Each item needs a name.', 'error');
      return;
    }

    const payload: CreateItemInput[] = valid.map((r) => ({
      name: r.name.trim(),
      type: r.type,
      sku: r.sku ?? null,
      ean: r.ean ?? null,
      hsnSacCode: r.hsnSacCode ?? null,
      unit: r.unit ?? null,
      grammage: r.grammage ?? null,
      defaultSellingPrice: r.defaultSellingPrice ?? null,
      defaultPurchasePrice: r.defaultPurchasePrice ?? null,
      basicPrice: r.basicPrice ?? null,
      mrp: r.mrp ?? null,
      costPrice: r.costPrice ?? null,
      gstRate: r.gstRate ?? null,
      gstValue: r.gstValue ?? null,
      margin: r.margin ?? null,
      brand: r.brand ?? null,
      packingType: r.packingType ?? null,
      shelfLifeDays: r.shelfLifeDays ?? null,
      rtvAllowed: r.rtvAllowed ?? null,
      vendorPackSize: r.vendorPackSize ?? null,
      packagingDimension: r.packagingDimension ?? null,
      temperature: r.temperature ?? null,
      cutoffTime: r.cutoffTime ?? null,
      productType: r.productType ?? null,
      category: r.category ?? null,
      subcategory: r.subcategory ?? null,
      description: r.description ?? null,
    }));

    commit.mutate(
      { items: payload, mode },
      {
        onSuccess: (res) => {
          setResult(res.data);
          setStep('result');
        },
        onError: () => toast('Import failed. Please try again.', 'error'),
      },
    );
  }

  function reset() {
    setStep('upload');
    setExtraction(null);
    setRows([]);
    setResult(null);
    setFileName('');
  }

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        breadcrumbs={[
          { label: 'Masters' },
          { label: 'Items', href: '/masters/items' },
          { label: 'Smart Import' },
        ]}
        title="Smart Import Items"
        description="Upload a CSV or Excel file. AI extracts product data — even from messy distributor sheets."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate({ to: '/masters/items' })}>
            <ArrowLeft size={14} /> Back to Items
          </Button>
        }
      />

      {step === 'upload' && (
        <UploadStep
          dragOver={dragOver}
          setDragOver={setDragOver}
          onDrop={handleDrop}
          onFileInput={handleFileInput}
          fileInputRef={fileInputRef}
          isExtracting={extract.isPending}
          fileName={fileName}
        />
      )}

      {step === 'review' && extraction && (
        <ReviewStep
          extraction={extraction}
          rows={rows}
          fileName={fileName}
          mode={mode}
          setMode={setMode}
          onUpdateRow={updateRow}
          onDeleteRow={deleteRow}
          onBack={reset}
          onCommit={handleCommit}
          isCommitting={commit.isPending}
        />
      )}

      {step === 'result' && result && (
        <ResultStep result={result} onImportMore={reset} onDone={() => navigate({ to: '/masters/items' })} />
      )}
    </div>
  );
}

// ─── Upload Step ─────────────────────────────────────────────────────────────

function UploadStep({
  dragOver,
  setDragOver,
  onDrop,
  onFileInput,
  fileInputRef,
  isExtracting,
  fileName,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isExtracting: boolean;
  fileName: string;
}) {
  return (
    <Card>
      <CardHeader title="Upload File" />
      <CardContent>
        {isExtracting ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50/40 px-6 py-12 dark:border-indigo-800 dark:bg-indigo-950/20">
            <Sparkles className="animate-pulse text-indigo-500" size={32} />
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                AI is reading {fileName}…
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                This typically takes 5-15 seconds. Don&apos;t close this tab.
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 transition-colors cursor-pointer ${
              dragOver
                ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-950/30'
                : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet size={32} className="text-zinc-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Drop a CSV or Excel file here
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                or click to browse — .csv, .xlsx, .xls up to 5 MB
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              onChange={onFileInput}
              className="hidden"
            />
          </div>
        )}

        <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex items-start gap-2">
            <Sparkles size={14} className="mt-0.5 shrink-0 text-indigo-500" />
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              <p className="font-medium text-zinc-700 dark:text-zinc-300">How AI import works</p>
              <p className="mt-1">
                Upload any spreadsheet — even messy ones with extra headers, footers, address blocks, or
                inconsistent column names. AI identifies the product rows, normalizes prices and units,
                and shows you a preview. Nothing is saved until you confirm.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Review Step ─────────────────────────────────────────────────────────────

function ReviewStep({
  extraction,
  rows,
  fileName,
  mode,
  setMode,
  onUpdateRow,
  onDeleteRow,
  onBack,
  onCommit,
  isCommitting,
}: {
  extraction: ExtractionResult;
  rows: ExtractedItem[];
  fileName: string;
  mode: Mode;
  setMode: (m: Mode) => void;
  onUpdateRow: (index: number, patch: Partial<ExtractedItem>) => void;
  onDeleteRow: (index: number) => void;
  onBack: () => void;
  onCommit: () => void;
  isCommitting: boolean;
}) {
  const lowConfidence = extraction.confidence < 0.5;
  const validCount = rows.filter((r) => r.name.trim().length > 0).length;

  return (
    <>
      <Card>
        <CardHeader title={`Review — ${rows.length} item${rows.length !== 1 ? 's' : ''} from ${fileName}`} />
        <CardContent className="space-y-3">
          {extraction.notes && (
            <div className="flex items-start gap-2 rounded-md border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
              <Sparkles size={14} className="mt-0.5 shrink-0" />
              <p>
                <span className="font-medium">AI notes:</span> {extraction.notes}
              </p>
            </div>
          )}
          {lowConfidence && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <p>
                <span className="font-medium">Low confidence ({Math.round(extraction.confidence * 100)}%):</span>{' '}
                AI was uncertain about parts of this file. Please review carefully before importing.
              </p>
            </div>
          )}

          <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              When an item already exists (matched by SKU or name):
            </p>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                <input
                  type="radio"
                  checked={mode === 'skip'}
                  onChange={() => setMode('skip')}
                  className="text-indigo-600"
                />
                Skip (only add new items)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                <input
                  type="radio"
                  checked={mode === 'overwrite'}
                  onChange={() => setMode('overwrite')}
                  className="text-indigo-600"
                />
                Overwrite with new values
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  {REVIEW_HEADERS.map((h, idx) => (
                    <th
                      key={h || `col-${idx}`}
                      className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <EditableRow key={i} row={row} index={i} onUpdate={onUpdateRow} onDelete={onDeleteRow} />
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={REVIEW_HEADERS.length} className="px-4 py-6 text-center text-xs text-zinc-400">
                      All rows deleted. Go back and re-upload to try again.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft size={14} /> Upload Different File
          </Button>
          <Button onClick={onCommit} loading={isCommitting} disabled={validCount === 0}>
            <Upload size={14} /> Import {validCount} Item{validCount !== 1 ? 's' : ''}
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}

// ─── Result Step ─────────────────────────────────────────────────────────────

function ResultStep({
  result,
  onImportMore,
  onDone,
}: {
  result: BulkImportResult;
  onImportMore: () => void;
  onDone: () => void;
}) {
  return (
    <Card>
      <CardHeader title="Import Complete" />
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <ResultBox icon={<Check size={20} />} label="Created" count={result.created} tone="emerald" />
          <ResultBox label="Updated" count={result.updated} tone="blue" />
          <ResultBox label="Skipped" count={result.skipped} tone="zinc" />
          <ResultBox icon={<X size={20} />} label="Errors" count={result.errors.length} tone="red" />
        </div>

        {result.errors.length > 0 && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
            <p className="mb-2 text-xs font-semibold text-red-700 dark:text-red-400">Row Errors:</p>
            <ul className="space-y-1">
              {result.errors.map((err) => (
                <li key={err.row} className="text-xs text-red-600 dark:text-red-400">
                  Row {err.row} ({err.name}): {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" onClick={onImportMore}>
          Import More
        </Button>
        <Button onClick={onDone}>View Items</Button>
      </CardFooter>
    </Card>
  );
}

function ResultBox({
  icon,
  label,
  count,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  count: number;
  tone: 'emerald' | 'blue' | 'zinc' | 'red';
}) {
  const styles = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400',
    blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-400',
    zinc: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300',
    red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400',
  }[tone];
  return (
    <div className={`rounded-lg border p-4 text-center ${styles}`}>
      {icon ? <div className="mx-auto mb-1 flex justify-center">{icon}</div> : <Badge variant="default" className="mx-auto mb-1 block w-fit">{label}</Badge>}
      <p className="text-2xl font-bold">{count}</p>
      <p className="mt-0.5 text-xs">{label}</p>
    </div>
  );
}
