import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Upload, Check, X, Download } from 'lucide-react';
import { useImportBillsCSV } from '@/hooks/queries/use-bill-import';
import type { BillCategory } from '@runq/validators';
import {
  PageHeader,
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Select,
  Textarea,
  Badge,
  useToast,
} from '@/components/ui';

const CATEGORY_OPTIONS = [
  { value: 'employee_salary', label: 'Employee Salary' },
  { value: 'delivery_boys', label: 'Delivery Boys' },
  { value: 'farmers_suppliers', label: 'Farmers / Suppliers' },
  { value: 'rent_fixed', label: 'Rent / Fixed Payments' },
  { value: 'general', label: 'General' },
];

const TEMPLATES: Record<BillCategory, { headers: string; example: string }> = {
  employee_salary: {
    headers: 'Vendor Name,Invoice Number,Invoice Date,Due Date,Item Name,Amount,TDS Section,TDS Rate',
    example: 'Ramesh Kumar,SAL-2026-04-001,2026-04-01,2026-04-07,Salary Apr 2026,45000,194J,10',
  },
  delivery_boys: {
    headers: 'Vendor Name,Invoice Number,Invoice Date,Due Date,Item Name,Trips,Rate Per Trip,Amount',
    example: 'Suresh Logistics,DEL-2026-04-001,2026-04-01,2026-04-07,Delivery Apr 2026,120,50,6000',
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

export function ImportBillsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [category, setCategory] = useState<BillCategory>('general');
  const [csvData, setCsvData] = useState('');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const importMutation = useImportBillsCSV();

  const template = TEMPLATES[category];

  function handleDownloadTemplate() {
    const csv = `${template.headers}\n${template.example}`;
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
      { csvData, category },
      {
        onSuccess: (res) => {
          setResult(res.data);
          setStep(3);
        },
        onError: () => toast('Import failed. Please check your CSV and try again.', 'error'),
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
        description="Download a category template, fill in your data, and paste to import bills."
      />

      {/* Step 1: Category + CSV */}
      <Card>
        <CardHeader title="1. Select Category & Paste CSV" />
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
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Expected columns:{' '}
            <span className="font-mono">{template.headers}</span>
          </p>
          <Textarea
            label="CSV Data"
            placeholder={`${template.headers}\n${template.example}`}
            value={csvData}
            onChange={(e) => setCsvData(e.target.value)}
            className="min-h-[160px] font-mono text-xs"
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
            <Button onClick={handleImport} loading={importMutation.isPending}>
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
    </div>
  );
}
