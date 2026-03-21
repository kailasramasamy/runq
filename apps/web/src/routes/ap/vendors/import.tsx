import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Upload, Check, X } from 'lucide-react';
import { useImportVendorsCSV } from '@/hooks/queries/use-vendors';
import { useToast } from '@/components/ui';
import {
  PageHeader,
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Textarea,
  Badge,
} from '@/components/ui';

interface PreviewRow {
  name: string;
  phone: string;
  bank: string;
  ifsc: string;
  city: string;
  state: string;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; name: string; message: string }>;
}

function parsePreview(csv: string): PreviewRow[] {
  const lines = csv.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
  const get = (cols: string[], key: string) =>
    cols[headers.indexOf(key)]?.trim().replace(/"/g, '') ?? '';

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    return {
      name: get(cols, 'name'),
      phone: get(cols, 'phone'),
      bank: get(cols, 'bank account'),
      ifsc: get(cols, 'ifsc'),
      city: get(cols, 'city'),
      state: get(cols, 'state'),
    };
  }).filter((r) => r.name);
}

type Step = 1 | 2 | 3;

const CSV_FORMAT = `Name,Phone,Email,GSTIN,PAN,Bank Account,IFSC,Bank Name,Address,City,State,Pincode,Category,Payment Terms
Gopal Sharma,9876543210,,,,,SBIN0001234,SBI,,Mathura,Uttar Pradesh,281001,raw_material,15`;

export function ImportVendorsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [csvData, setCsvData] = useState('');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const importMutation = useImportVendorsCSV();

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
      { csvData },
      {
        onSuccess: (res) => {
          setResult(res.data);
          setStep(3);
        },
        onError: () => toast('Import failed. Please check your CSV format and try again.', 'error'),
      },
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Vendors', href: '/ap/vendors' },
          { label: 'Import' },
        ]}
        title="Import Vendors"
        description="Paste CSV data to bulk import or update vendors."
      />

      <Card>
        <CardHeader title="1. Paste CSV Data" />
        <CardContent>
          <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
            Expected columns:{' '}
            <span className="font-mono">
              Name, Phone, Email, GSTIN, PAN, Bank Account, IFSC, Bank Name, Address, City, State, Pincode, Category, Payment Terms
            </span>
          </p>
          <Textarea
            label="CSV Data"
            placeholder={CSV_FORMAT}
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

      {step >= 2 && preview.length > 0 && (
        <Card>
          <CardHeader title={`2. Preview — ${preview.length} row${preview.length !== 1 ? 's' : ''} parsed`} />
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                  {['Name', 'Phone', 'Bank Account', 'IFSC', 'City', 'State'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="px-4 py-2 font-medium">{row.name}</td>
                    <td className="px-4 py-2 font-mono text-zinc-500">{row.phone || '—'}</td>
                    <td className="px-4 py-2 font-mono text-zinc-500">{row.bank || '—'}</td>
                    <td className="px-4 py-2 font-mono text-zinc-500">{row.ifsc || '—'}</td>
                    <td className="px-4 py-2 text-zinc-500">{row.city || '—'}</td>
                    <td className="px-4 py-2 text-zinc-500">{row.state || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 20 && (
              <p className="px-4 py-2 text-xs text-zinc-400 dark:text-zinc-600">
                … and {preview.length - 20} more rows
              </p>
            )}
          </CardContent>
          <CardFooter className="flex items-center justify-between">
            <Button variant="outline" onClick={() => { setStep(1); setPreview([]); }}>
              Back
            </Button>
            <Button onClick={handleImport} loading={importMutation.isPending}>
              <Upload size={16} />
              Import {preview.length} Vendors
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 3 && result && (
        <Card>
          <CardHeader title="3. Import Results" />
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-900/20">
                <Check className="mx-auto mb-1 text-emerald-600 dark:text-emerald-400" size={20} />
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{result.created}</p>
                <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-500">Created</p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center dark:border-blue-900 dark:bg-blue-900/20">
                <Badge variant="info" className="mx-auto mb-1 block w-fit">Updated</Badge>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{result.updated}</p>
                <p className="mt-0.5 text-xs text-blue-600 dark:text-blue-500">Updated</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-center dark:border-zinc-800 dark:bg-zinc-800/50">
                <Badge variant="default" className="mx-auto mb-1 block w-fit">Skip</Badge>
                <p className="text-2xl font-bold text-zinc-700 dark:text-zinc-300">{result.skipped}</p>
                <p className="mt-0.5 text-xs text-zinc-500">Skipped</p>
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
                  {result.errors.map((err) => (
                    <li key={err.row} className="text-xs text-red-600 dark:text-red-400">
                      Row {err.row} ({err.name}): {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={() => navigate({ to: '/ap/vendors' })}>View Vendors</Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
