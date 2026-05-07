import { useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Upload, Check, X, Download, AlertTriangle, UserPlus, Search } from 'lucide-react';
import { useImportBillsCSV, usePreviewBillsCSV, type PreviewRow as ApiPreviewRow } from '@/hooks/queries/use-bill-import';
import { useVendors, useCreateVendor } from '@/hooks/queries/use-vendors';
import type { BillCategory } from '@runq/validators';
import {
  PageHeader,
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Select,
  Badge,
  ConfirmationDialog,
  DropZone,
  useToast,
} from '@/components/ui';

const CATEGORY_OPTIONS = [
  { value: 'employee_salary', label: 'Salary / Payroll' },
  { value: 'delivery_boys', label: 'Gig & Contract Payouts' },
  { value: 'farmers_suppliers', label: 'Goods / Raw Materials' },
  { value: 'rent_fixed', label: 'Rent & Recurring Payments' },
  { value: 'general', label: 'General / Mixed' },
];

const CATEGORY_DESCRIPTIONS: Record<BillCategory, { title: string; body: string; minimal?: string }> = {
  employee_salary: {
    title: 'Salary / Payroll',
    body: 'Monthly or one-off employee payouts with statutory TDS withholding (194J professional fees, etc.). Auto-fills invoice number and dates from a chosen period.',
    minimal: 'Minimal CSV: Name + Salary',
  },
  delivery_boys: {
    title: 'Gig & Contract Payouts',
    body: 'Simple flat payouts to gig workers, drivers, contract labour, freelancers — no TDS, no GST. Auto-fills invoice number and dates from a chosen period.',
    minimal: 'Minimal CSV: Name + Amount',
  },
  farmers_suppliers: {
    title: 'Goods / Raw Materials',
    body: 'Bulk purchase of physical goods bought by quantity × unit price, with HSN code and GST tax rate per line.',
  },
  rent_fixed: {
    title: 'Rent & Recurring Payments',
    body: 'Fixed-amount recurring bills (rent, utilities, telecom, software subscriptions). Supports statutory TDS (194I rent etc.).',
  },
  general: {
    title: 'General / Mixed',
    body: 'Full template with every field available — for one-off purchases that don\'t fit the other categories. Use when in doubt.',
  },
};

const MONTHS = [
  { value: '1', label: 'January' }, { value: '2', label: 'February' },
  { value: '3', label: 'March' }, { value: '4', label: 'April' },
  { value: '5', label: 'May' }, { value: '6', label: 'June' },
  { value: '7', label: 'July' }, { value: '8', label: 'August' },
  { value: '9', label: 'September' }, { value: '10', label: 'October' },
  { value: '11', label: 'November' }, { value: '12', label: 'December' },
];

const YEAR_OPTIONS = (() => {
  const now = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => {
    const y = now - 2 + i;
    return { value: String(y), label: String(y) };
  });
})();

const TEMPLATES: Record<BillCategory, { headers: string; example: string }> = {
  // Salary / payroll: minimal template — invoice number, dates, and item
  // name are auto-filled from the chosen period. User just fills in amounts.
  employee_salary: {
    headers: 'Name,Amount',
    example: 'Ramesh Kumar,45000',
  },
  // Gig / contract payouts: same minimal shape — period auto-fills the rest.
  delivery_boys: {
    headers: 'Name,Amount',
    example: 'Suresh Singh,6000',
  },
  farmers_suppliers: {
    headers: 'Vendor Name,Invoice Number,Invoice Date,Due Date,Item Name,Quantity,Unit Price,Amount,HSN Code,Tax Rate',
    example: 'Gopal Farm,PUR-2026-04-001,2026-04-01,2026-04-15,Fresh Milk,500,52,26000,0401,5',
  },
  rent_fixed: {
    headers: 'Vendor Name,Invoice Number,Invoice Date,Due Date,Item Name,Amount,TDS Section,TDS Rate',
    example: 'ABC Realty,RENT-2026-04-001,2026-04-01,2026-04-05,Office Rent Apr 2026,35000,194I,10',
  },
  general: {
    headers: 'Vendor Name,Invoice Number,Invoice Date,Due Date,Item Name,Quantity,Unit Price,Amount,HSN Code,Tax Rate,TDS Section,TDS Rate',
    example: 'Stationery House,GEN-2026-04-001,2026-04-01,2026-04-30,A4 Paper Ream,10,350,3500,,0,,',
  },
};

// Map bill import category → vendor categories to pre-fill template
const CATEGORY_VENDOR_MAP: Record<BillCategory, string[]> = {
  employee_salary: ['employee'],
  delivery_boys: ['logistics', 'contractor'],
  farmers_suppliers: ['raw_material'],
  rent_fixed: ['rent', 'utilities', 'telecom'],
  general: [],
};

interface PreviewRow {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  itemName: string;
  amount: string;
}

interface ImportResult {
  created: number;
  errors: Array<{ row: number; vendorName: string; message: string }>;
}

type Step = 1 | 2 | 3;

function parsePreview(csv: string): PreviewRow[] {
  const lines = csv.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
  const get = (cols: string[], key: string) =>
    cols[headers.indexOf(key)]?.trim().replace(/"/g, '') ?? '';

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    return {
      vendorName: get(cols, 'vendor name'),
      invoiceNumber: get(cols, 'invoice number'),
      invoiceDate: get(cols, 'invoice date'),
      dueDate: get(cols, 'due date'),
      itemName: get(cols, 'item name'),
      amount: get(cols, 'amount'),
    };
  }).filter((r) => r.vendorName);
}

function buildTemplateRow(cat: BillCategory, vendor: string, invNum: string, date: string, due: string, item: string): string {
  const v = vendor.includes(',') ? `"${vendor}"` : vendor;
  switch (cat) {
    case 'employee_salary':
    case 'delivery_boys':
      // Minimal salary/payout template — only Name + Amount.
      return `${v},0`;
    case 'rent_fixed':
      return `${v},${invNum},${date},${due},${item},0,,`;
    case 'farmers_suppliers':
      return `${v},${invNum},${date},${due},${item},0,0,0,,`;
    case 'general':
    default:
      return `${v},${invNum},${date},${due},${item},1,0,0,,,,`;
  }
}

export function ImportBillsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [category, setCategory] = useState<BillCategory>('general');
  const [csvData, setCsvData] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ApiPreviewRow[]>([]);
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [vendorOverrides, setVendorOverrides] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const previewMutation = usePreviewBillsCSV();
  // Period picker — only used for salary-style categories that auto-fill
  // missing invoice fields. Defaults to last completed month.
  const lastMonth = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }, []);
  const [periodMonth, setPeriodMonth] = useState<number>(lastMonth.month);
  const [periodYear, setPeriodYear] = useState<number>(lastMonth.year);
  const isSalaryCategory = category === 'employee_salary' || category === 'delivery_boys';
  const importMutation = useImportBillsCSV();

  // Fetch vendors matching the selected category
  const vendorCategories = CATEGORY_VENDOR_MAP[category];
  const { data: vendorsData } = useVendors({ limit: 500 });
  const categoryVendors = useMemo(() => {
    const all = vendorsData?.data ?? [];
    if (vendorCategories.length === 0) return all.filter((v) => v.isActive);
    return all.filter((v) => v.isActive && vendorCategories.includes(v.category ?? ''));
  }, [vendorsData, vendorCategories]);

  const template = TEMPLATES[category];

  function handleDownloadTemplate() {
    const today = new Date().toISOString().split('T')[0]!;
    const dueDate = new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0]!;
    const month = new Date().toLocaleString('en', { month: 'short', year: 'numeric' });

    // Generate one row per vendor with pre-filled names
    const rows = categoryVendors.length > 0
      ? categoryVendors.map((v, i) => {
          const invNum = `${category.toUpperCase().replace(/_/g, '-')}-${(i + 1).toString().padStart(3, '0')}`;
          const itemName = `${template.example.split(',')[4] || 'Payment'} ${month}`.trim();
          return buildTemplateRow(category, v.name, invNum, today, dueDate, itemName);
        })
      : [template.example];

    const csv = `${template.headers}\n${rows.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bill-import-${category}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handlePreview() {
    setVendorOverrides({});
    try {
      const res = await previewMutation.mutateAsync(
        isSalaryCategory
          ? { csvData, category, periodMonth, periodYear }
          : { csvData, category },
      );
      setHeaderErrors(res.data.headerErrors);
      setPreview(res.data.rows);
      // Pre-populate overrides with the auto-matched vendor IDs so the
      // commit call has a definitive vendor for every matched row, even if
      // the row was matched by ilike or first-word heuristics.
      const initialOverrides: Record<string, string> = {};
      for (const r of res.data.rows) {
        if (r.matchStatus === 'matched' && r.vendorId) initialOverrides[String(r.rowNum)] = r.vendorId;
      }
      setVendorOverrides(initialOverrides);
      if (res.data.rows.length === 0 && res.data.headerErrors.length === 0) {
        toast('No valid rows found. Check your CSV format.', 'error');
        return;
      }
      setStep(2);
    } catch (err: any) {
      toast(`Preview failed: ${err?.error || err?.message || 'unknown'}`, 'error');
    }
  }

  function handleImport() {
    const importableCount = preview.filter((r) =>
      r.matchStatus !== 'parse_error' && (vendorOverrides[String(r.rowNum)] || r.vendorId),
    ).length;
    if (importableCount === 0) {
      toast('No rows with a resolved vendor — fix mismatches first.', 'error');
      return;
    }
    importMutation.mutate(
      {
        csvData,
        category,
        ...(isSalaryCategory ? { periodMonth, periodYear } : {}),
        vendorOverrides,
      },
      {
        onSuccess: (res) => {
          setResult(res.data);
          setStep(3);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        onError: (err: any) => {
          // API client throws the raw JSON error object, not an Error instance
          const msg = err?.error || err?.message || JSON.stringify(err);
          toast(`Import failed: ${msg}`, 'error');
          console.error('Bill import error:', JSON.stringify(err, null, 2));
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Bills', href: '/ap/bills' },
          { label: 'Import' },
        ]}
        title="Import Bills"
        description="Download a category template, fill in your data, and upload to import bills."
      />

      {/* Step 1: Category + Upload */}
      <Card>
        <CardHeader title="1. Select Category & Upload CSV" />
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Bill Category"
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={(e) => setCategory(e.target.value as BillCategory)}
            />
            <div className="flex items-end">
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download size={14} />
                Download Template
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50/60 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="font-medium text-zinc-900 dark:text-zinc-100">{CATEGORY_DESCRIPTIONS[category].title}</div>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">{CATEGORY_DESCRIPTIONS[category].body}</p>
            {CATEGORY_DESCRIPTIONS[category].minimal && (
              <p className="mt-1 text-indigo-700 dark:text-indigo-300">{CATEGORY_DESCRIPTIONS[category].minimal}</p>
            )}
          </div>

          {isSalaryCategory && (
            <div className="rounded-md border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/20">
              <p className="text-xs text-indigo-900 dark:text-indigo-200">
                Pick the period — invoice number, dates, and item name auto-fill from it so you don't need those columns in the CSV.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Select
                  label="Period month"
                  value={String(periodMonth)}
                  onChange={(e) => setPeriodMonth(parseInt(e.target.value, 10))}
                  options={MONTHS}
                />
                <Select
                  label="Period year"
                  value={String(periodYear)}
                  onChange={(e) => setPeriodYear(parseInt(e.target.value, 10))}
                  options={YEAR_OPTIONS}
                />
              </div>
            </div>
          )}

          <DropZone
            fileName={fileName}
            onFile={(name, content) => { setFileName(name); setCsvData(content); }}
            onClear={() => { setFileName(null); setCsvData(''); }}
          />
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={handlePreview} disabled={!csvData.trim()}>
            Preview Rows
          </Button>
        </CardFooter>
      </Card>

      {/* Step 2: Preview with vendor match status */}
      {step >= 2 && (preview.length > 0 || headerErrors.length > 0) && (
        <PreviewStep
          preview={preview}
          headerErrors={headerErrors}
          vendorOverrides={vendorOverrides}
          setVendorOverrides={setVendorOverrides}
          onBack={() => { setStep(1); setPreview([]); setHeaderErrors([]); setVendorOverrides({}); }}
          onConfirm={() => setShowConfirm(true)}
          importing={importMutation.isPending}
        />
      )}

      {/* Step 3: Results */}
      {step === 3 && result && (
        <Card>
          <CardHeader title="3. Import Results" />
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-900/20">
                <Check className="mx-auto mb-1 text-emerald-600 dark:text-emerald-400" size={20} />
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{result.created}</p>
                <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-500">Bills Created</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-900 dark:bg-red-900/20">
                <X className="mx-auto mb-1 text-red-600 dark:text-red-400" size={20} />
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">{result.errors.length}</p>
                <p className="mt-0.5 text-xs text-red-600 dark:text-red-500">Errors</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
                <p className="mb-2 text-xs font-semibold text-red-700 dark:text-red-400">Row Errors:</p>
                <ul className="space-y-1">
                  {result.errors.map((err, i) => (
                    <li key={i} className="text-xs text-red-600 dark:text-red-400">
                      Row {err.row}{err.vendorName ? ` (${err.vendorName})` : ''}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={() => navigate({ to: '/ap/bills' })}>View Bills</Button>
          </CardFooter>
        </Card>
      )}

      <ConfirmationDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => { setShowConfirm(false); handleImport(); }}
        title="Confirm Import"
        description={`This will create ${preview.filter((r) => vendorOverrides[String(r.rowNum)] || r.vendorId).length} bill${preview.length !== 1 ? 's' : ''} as drafts. Proceed?`}
        confirmLabel="Import"
        loading={importMutation.isPending}
      />
    </div>
  );
}

// ─── Step 2: Preview ─────────────────────────────────────────────────────────

interface PreviewStepProps {
  preview: ApiPreviewRow[];
  headerErrors: string[];
  vendorOverrides: Record<string, string>;
  setVendorOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onBack: () => void;
  onConfirm: () => void;
  importing: boolean;
}

function PreviewStep({ preview, headerErrors, vendorOverrides, setVendorOverrides, onBack, onConfirm, importing }: PreviewStepProps) {
  const counts = useMemo(() => {
    let matched = 0, ambiguous = 0, notFound = 0, parseError = 0;
    for (const r of preview) {
      if (r.matchStatus === 'parse_error') parseError++;
      else if (vendorOverrides[String(r.rowNum)]) matched++;
      else if (r.matchStatus === 'matched') matched++;
      else if (r.matchStatus === 'ambiguous') ambiguous++;
      else if (r.matchStatus === 'not_found') notFound++;
    }
    return { matched, ambiguous, notFound, parseError };
  }, [preview, vendorOverrides]);

  const importable = counts.matched;
  const blocked = counts.ambiguous + counts.notFound + counts.parseError;

  return (
    <Card>
      <CardHeader title={`2. Review & resolve — ${preview.length} row${preview.length !== 1 ? 's' : ''}`} />
      <CardContent className="space-y-3">
        {headerErrors.length > 0 && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-200">
            {headerErrors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="success">{counts.matched} matched</Badge>
          {counts.ambiguous > 0 && <Badge variant="warning">{counts.ambiguous} ambiguous</Badge>}
          {counts.notFound > 0 && <Badge variant="danger">{counts.notFound} not found</Badge>}
          {counts.parseError > 0 && <Badge variant="danger">{counts.parseError} parse errors</Badge>}
        </div>

        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
                {['#', 'CSV name', 'Invoice #', 'Amount', 'runQ vendor'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <PreviewRowItem
                  key={row.rowNum}
                  row={row}
                  override={vendorOverrides[String(row.rowNum)]}
                  onSetOverride={(vid) => setVendorOverrides((s) => ({ ...s, [String(row.rowNum)]: vid }))}
                  onClearOverride={() => setVendorOverrides((s) => {
                    const next = { ...s };
                    delete next[String(row.rowNum)];
                    return next;
                  })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <div className="flex items-center gap-3">
          {blocked > 0 && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {blocked} row{blocked === 1 ? '' : 's'} will be skipped
            </span>
          )}
          <Button onClick={onConfirm} loading={importing} disabled={importable === 0}>
            <Upload size={16} />
            Import {importable} Bill{importable === 1 ? '' : 's'}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

interface PreviewRowItemProps {
  row: ApiPreviewRow;
  override: string | undefined;
  onSetOverride: (vendorId: string) => void;
  onClearOverride: () => void;
}

function PreviewRowItem({ row, override, onSetOverride, onClearOverride }: PreviewRowItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState(row.vendorName);
  const [search, setSearch] = useState('');
  // Remember the resolved name for any override we set ourselves so the
  // badge shows the actual vendor name even when the picker dropdown's
  // search list has scrolled past it (or it's a just-created vendor that
  // isn't in any prior list).
  const [overrideNameCache, setOverrideNameCache] = useState<Record<string, string>>({});
  const { data: vendorsData } = useVendors({ search: search || undefined, limit: 10 });
  const createVendor = useCreateVendor();

  const effectiveStatus: ApiPreviewRow['matchStatus'] = row.matchStatus === 'parse_error'
    ? 'parse_error'
    : override
      ? 'matched'
      : row.matchStatus;

  const matchedName = override
    ? (overrideNameCache[override]
       ?? vendorsData?.data.find((v) => v.id === override)?.name
       ?? row.candidates.find((c) => c.id === override)?.name
       ?? row.matchedVendorName
       ?? '(selected)')
    : row.matchedVendorName;

  function selectVendor(id: string, name: string) {
    setOverrideNameCache((s) => ({ ...s, [id]: name }));
    onSetOverride(id);
    setExpanded(false);
    setCreating(false);
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const res = await createVendor.mutateAsync({ name: trimmed } as never);
      const created = (res as { data?: { id?: string; name?: string } } | undefined)?.data;
      if (created?.id) selectVendor(created.id, created.name ?? trimmed);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err instanceof Error ? err.message : 'Failed to create vendor');
    }
  }

  return (
    <>
      <tr className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
        <td className="px-3 py-2 align-top text-zinc-400">{row.rowNum}</td>
        <td className="px-3 py-2 align-top">
          <div className="font-medium text-zinc-900 dark:text-zinc-100">{row.vendorName || <em className="text-zinc-400">(empty)</em>}</div>
          {row.parseError && <div className="mt-0.5 text-xs text-red-600 dark:text-red-400">{row.parseError}</div>}
        </td>
        <td className="px-3 py-2 align-top font-mono text-[11px] text-zinc-500">{row.invoiceNumber || '—'}</td>
        <td className="px-3 py-2 align-top font-mono font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
          {row.amount ? `₹${row.amount.toLocaleString('en-IN')}` : '—'}
        </td>
        <td className="px-3 py-2 align-top">
          <div className="space-y-1">
            <RowMatchBadge status={effectiveStatus} matchedName={matchedName} candidateCount={row.candidates.length} />
            {effectiveStatus !== 'parse_error' && effectiveStatus !== 'matched' && !expanded && (
              <button onClick={() => setExpanded(true)} className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
                Resolve →
              </button>
            )}
            {effectiveStatus === 'matched' && override && (
              <button onClick={() => { onClearOverride(); setExpanded(false); }} className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                Change
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && effectiveStatus !== 'parse_error' && (
        <tr className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-800/60 dark:bg-zinc-900/30">
          <td colSpan={5} className="px-3 py-3">
            {!creating ? (
              <div className="space-y-2">
                {row.candidates.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">Candidates from runQ:</div>
                    <div className="flex flex-wrap gap-1">
                      {row.candidates.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => selectVendor(c.id, c.name)}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:border-indigo-400 hover:bg-indigo-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/30"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px] flex-1">
                    <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Search vendors…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="block w-full rounded-md border border-zinc-300 bg-white pl-7 pr-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </div>
                  <Select
                    value={override ?? ''}
                    onChange={(e) => {
                      const picked = (vendorsData?.data ?? []).find((v) => v.id === e.target.value);
                      if (picked) selectVendor(picked.id, picked.name);
                    }}
                    options={[
                      { value: '', label: '— pick vendor —' },
                      ...(vendorsData?.data ?? []).map((v) => ({ value: v.id, label: v.name })),
                    ]}
                  />
                  <span className="text-xs text-zinc-400">or</span>
                  <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
                    <UserPlus size={12} /> Create new vendor
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-600 dark:text-zinc-300">Create runQ vendor:</span>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="min-w-[200px] flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  placeholder="Vendor name"
                />
                <Button size="sm" onClick={handleCreate} loading={createVendor.isPending} disabled={!newName.trim()}>
                  <UserPlus size={12} /> Create &amp; use
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function RowMatchBadge({ status, matchedName, candidateCount }: { status: ApiPreviewRow['matchStatus']; matchedName?: string; candidateCount: number }) {
  if (status === 'matched') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-950/30 dark:text-green-300">
        <Check size={11} />
        <span className="truncate max-w-[200px]">{matchedName ?? 'Matched'}</span>
      </span>
    );
  }
  if (status === 'ambiguous') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        <AlertTriangle size={11} />
        Ambiguous · {candidateCount} candidates
      </span>
    );
  }
  if (status === 'not_found') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-950/30 dark:text-red-300">
        <X size={11} />
        Not found
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      Parse error
    </span>
  );
}
