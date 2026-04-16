import { useState, useRef } from 'react';
import { useImportAssets } from '@/hooks/queries/use-fixed-assets';
import {
  PageHeader, Card, CardHeader, CardContent, Button, useToast,
} from '@/components/ui';

interface ImportResult {
  created: number;
  errors: { row: number; message: string }[];
}

export function AssetImportPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const mutation = useImportAssets();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
  }

  function handleUpload() {
    if (!file) { toast('Select a file first', 'error'); return; }
    mutation.mutate(file, {
      onSuccess: (res) => {
        setResult((res as any).data);
        toast(`Imported ${(res as any).data?.created ?? 0} assets`, 'success');
      },
      onError: (err: any) => toast(err?.message ?? 'Import failed', 'error'),
    });
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Import Assets"
        description="Bulk-import fixed assets from a CSV or Excel file."
        breadcrumbs={[{ label: 'Fixed Assets', href: '/fa' }, { label: 'Import Assets' }]}
      />

      <Card className="mb-6">
        <CardHeader title="Upload File" />
        <CardContent>
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                File (CSV, XLS, XLSX)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="block text-sm text-zinc-700 dark:text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:file:bg-zinc-700 dark:file:text-zinc-300 dark:hover:file:bg-zinc-600"
              />
            </div>
            {file && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Selected: <span className="font-medium text-zinc-700 dark:text-zinc-300">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
            <div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleUpload}
                disabled={!file}
                loading={mutation.isPending}
              >
                Upload &amp; Import
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {result && (
        <div className="flex flex-col gap-4">
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader title="Import Complete" />
            <CardContent>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                <span className="font-semibold text-green-600 dark:text-green-400">{result.created}</span> asset{result.created !== 1 ? 's' : ''} created successfully.
              </p>
            </CardContent>
          </Card>

          {result.errors.length > 0 && (
            <Card className="border-red-200 dark:border-red-900">
              <CardHeader title={`${result.errors.length} Error${result.errors.length !== 1 ? 's' : ''}`} />
              <CardContent>
                <ul className="flex flex-col gap-1.5">
                  {result.errors.map((err, i) => (
                    <li key={i} className="text-sm text-red-600 dark:text-red-400">
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
