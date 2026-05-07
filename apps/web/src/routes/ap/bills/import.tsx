import { useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Upload, Check, X, Download } from 'lucide-react';
import { useImportBillsCSV } from '@/hooks/queries/use-bill-import';
import { useVendors } from '@/hooks/queries/use-vendors';
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
  employee_salary: {
    headers: 'Vendor Name,Invoice Number,Invoice Date,Due Date,Item Name,Amount,TDS Section,TDS Rate',
    example: 'Ramesh Kumar,SAL-2026-04-001,2026-04-01,2026-04-07,Salary Apr 2026,45000,194J,10',
  },
  delivery_boys: {
    headers: 'Vendor Name,Invoice Number,Invoice Date,Due Date,Item Name,Amount',
    example: 'Suresh Logistics,DEL-2026-04-001,2026-04-01,2026-04-07,Delivery Apr 2026,6000',
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
    case 'rent_fixed':
      return `${v},${invNum},${date},${due},${item},0,,`;
    case 'delivery_boys':
      return `${v},${invNum},${date},${due},${item},0`;
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
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
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

  function handlePreview() {
    const rows = parsePreview(csvData);
    if (rows.length === 0) {
      toast('No valid rows found. Check your CSV format.', 'error');
      return;
    }
    setPreview(rows);
    setStep(2);
  }

  function handleImport() {
    importMutation.mutate(
      isSalaryCategory
        ? { csvData, category, periodMonth, periodYear }
        : { csvData, category },
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
    <div className="max-w-4xl space-y-4">
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

      {/* Step 2: Preview */}
      {step >= 2 && preview.length > 0 && (
        <Card>
          <CardHeader title={`2. Preview — ${preview.length} row${preview.length !== 1 ? 's' : ''} parsed`} />
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                  {['#', 'Vendor', 'Invoice #', 'Date', 'Due Date', 'Item', 'Amount'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="px-4 py-2 text-zinc-400">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{row.vendorName}</td>
                    <td className="px-4 py-2 font-mono text-zinc-500">{row.invoiceNumber}</td>
                    <td className="px-4 py-2 text-zinc-500">{row.invoiceDate}</td>
                    <td className="px-4 py-2 text-zinc-500">{row.dueDate}</td>
                    <td className="px-4 py-2 text-zinc-500">{row.itemName || '—'}</td>
                    <td className="px-4 py-2 font-mono font-medium">{row.amount || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 50 && (
              <p className="px-4 py-2 text-xs text-zinc-400">… and {preview.length - 50} more rows</p>
            )}
          </CardContent>
          <CardFooter className="flex items-center justify-between">
            <Button variant="outline" onClick={() => { setStep(1); setPreview([]); }}>
              Back
            </Button>
            <Button onClick={() => setShowConfirm(true)} loading={importMutation.isPending}>
              <Upload size={16} />
              Import {preview.length} Bills
            </Button>
          </CardFooter>
        </Card>
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
        description={`This will create ${preview.length} bill${preview.length !== 1 ? 's' : ''} as drafts. Proceed?`}
        confirmLabel="Import"
        loading={importMutation.isPending}
      />
    </div>
  );
}
