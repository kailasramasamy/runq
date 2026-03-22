import { useState } from 'react';
import { Download, FileDown } from 'lucide-react';
import {
  Card,
  CardContent,
  CardFooter,
  PageHeader,
  Button,
  Input,
} from '@/components/ui';

const API_BASE = '/api/v1/tally';

function buildExportUrl(dateFrom: string, dateTo: string): string {
  const params = new URLSearchParams({ dateFrom, dateTo });
  return `${API_BASE}/export?${params.toString()}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function TallyExportPage() {
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [error, setError] = useState('');

  function handleExportVouchers() {
    if (!dateFrom || !dateTo) {
      setError('Please select both start and end dates.');
      return;
    }
    if (dateFrom > dateTo) {
      setError('Start date must be on or before end date.');
      return;
    }
    setError('');
    window.open(buildExportUrl(dateFrom, dateTo), '_blank');
  }

  function handleExportLedgers() {
    window.open(`${API_BASE}/ledgers`, '_blank');
  }

  return (
    <div>
      <PageHeader
        title="Tally Export"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Tally Export' }]}
        description="Export runQ finance data for import into Tally Prime or Tally ERP 9."
      />

      <div className="space-y-6 max-w-2xl">
        {/* Export Vouchers */}
        <Card>
          <CardContent className="space-y-4 pt-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Export Vouchers</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Download a Tally-compatible XML file containing sales invoices, purchase invoices, vendor payments, and customer receipts for the selected date range.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="From Date"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <Input
                label="To Date"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}
          </CardContent>

          <CardFooter className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <Download size={14} />
              <span>Downloads as XML. Import into Tally after importing ledgers.</span>
            </div>
            <Button onClick={handleExportVouchers}>
              Download Vouchers XML
            </Button>
          </CardFooter>
        </Card>

        {/* Export Ledger Masters */}
        <Card>
          <CardContent className="space-y-4 pt-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Export Ledger Masters</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Import this first to create customer and vendor ledgers in Tally before importing vouchers. Includes all active customers (Sundry Debtors), vendors (Sundry Creditors), and bank accounts.
            </p>
          </CardContent>

          <CardFooter className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <FileDown size={14} />
              <span>Import ledgers before vouchers to avoid import errors.</span>
            </div>
            <Button variant="secondary" onClick={handleExportLedgers}>
              Download Ledgers XML
            </Button>
          </CardFooter>
        </Card>

        {/* Import Instructions */}
        <Card>
          <CardContent className="pt-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Import Instructions</h2>
            <ol className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400 list-decimal list-inside">
              <li>Open Tally Prime and go to <strong>Gateway of Tally</strong>.</li>
              <li>Select <strong>Import</strong> from the menu.</li>
              <li>Choose the <strong>ledgers XML file</strong> and import it first — this creates all customer, vendor, and bank ledgers.</li>
              <li>Go back to <strong>Import</strong> and choose the <strong>vouchers XML file</strong> to import all transactions.</li>
              <li>Verify the imported entries in <strong>Day Book</strong> (Gateway of Tally → Display → Day Book).</li>
            </ol>
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <strong>Note:</strong> The party ledger names in Tally must exactly match the customer and vendor names in runQ. If a ledger already exists in Tally, Tally will skip the duplicate — existing data is not overwritten.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
