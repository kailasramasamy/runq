import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Upload, Check, X } from 'lucide-react';
import { useImportPGSettlement } from '@/hooks/queries/use-pg-recon';
import type { PGGateway } from '@/hooks/queries/use-pg-recon';
import { formatINR } from '@/lib/utils';
import { useToast } from '@/components/ui';
import {
  PageHeader,
  Badge,
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Select,
  Textarea,
} from '@/components/ui';

// ─── Gateway CSV hints ────────────────────────────────────────────────────────

const CSV_HINTS: Record<PGGateway, { columns: string; example: string }> = {
  razorpay: {
    columns: 'settlement_id, order_id, payment_id, settlement_date, gross, fee, tax, net',
    example:
      'settlement_id,order_id,payment_id,settlement_date,gross,fee,tax,net\n' +
      'setl_ABC123,order_XYZ,pay_123,2026-03-01,10000,295,53,9652',
  },
  phonepe: {
    columns: 'merchant_order_id, transaction_id, date, gross_amount, pg_charges, net_amount',
    example:
      'merchant_order_id,transaction_id,date,gross_amount,pg_charges,net_amount\n' +
      'ORD-001,T-20260301001,2026-03-01,5000,100,4900',
  },
  paytm: {
    columns: 'order_id, txn_id, txn_date, txn_amount, merchant_charges, net_amount',
    example:
      'order_id,txn_id,txn_date,txn_amount,merchant_charges,net_amount\n' +
      'ORD123,TXN456,2026-03-01,2500,75,2425',
  },
};

const GATEWAY_OPTIONS = [
  { value: '', label: 'Select gateway…' },
  { value: 'razorpay', label: 'Razorpay' },
  { value: 'phonepe', label: 'PhonePe' },
  { value: 'paytm', label: 'Paytm' },
];

type Step = 1 | 2 | 3;

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportPGSettlementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [gateway, setGateway] = useState<PGGateway | ''>('');
  const [csvData, setCsvData] = useState('');
  const [result, setResult] = useState<{
    settlementId: string;
    imported: number;
    totalAmount: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);

  const importMutation = useImportPGSettlement();
  const hint = gateway ? CSV_HINTS[gateway] : null;

  function handleGatewayChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setGateway(e.target.value as PGGateway | '');
    if (e.target.value && step < 2) setStep(2);
  }

  function handleSubmit() {
    if (!gateway || !csvData.trim()) return;
    importMutation.mutate(
      { gateway, csvData },
      {
        onSuccess: (res) => {
          setResult(res.data);
          setStep(3);
          toast(`Imported ${res.data.imported} lines successfully.`, 'success');
        },
        onError: () => {
          toast('Import failed. Check your CSV format and try again.', 'error');
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        breadcrumbs={[
          { label: 'Banking', href: '/banking' },
          { label: 'PG Reconciliation', href: '/banking/pg-recon' },
          { label: 'Import Settlement' },
        ]}
        title="Import PG Settlement"
        description="Paste a CSV export from your payment gateway to import settlement data."
      />

      {/* Step 1: Select gateway */}
      <Card>
        <CardHeader title="1. Select Payment Gateway" />
        <CardContent>
          <div className="max-w-sm">
            <Select
              label="Gateway"
              required
              options={GATEWAY_OPTIONS}
              value={gateway}
              onChange={handleGatewayChange}
            />
          </div>
          {hint && (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
              <p className="mb-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                Expected columns
              </p>
              <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{hint.columns}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Paste CSV */}
      <Card className={!gateway ? 'pointer-events-none opacity-50' : ''}>
        <CardHeader title="2. Paste CSV Data" />
        <CardContent>
          {hint && (
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-900/20">
              <p className="mb-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
                Example format
              </p>
              <pre className="overflow-x-auto text-xs text-blue-600 dark:text-blue-300">
                {hint.example}
              </pre>
            </div>
          )}
          <Textarea
            label="CSV Data"
            placeholder={hint?.example ?? 'Paste CSV data here…'}
            value={csvData}
            onChange={(e) => setCsvData(e.target.value)}
            className="min-h-[180px] font-mono text-xs"
          />
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button
            onClick={handleSubmit}
            loading={importMutation.isPending}
            disabled={!gateway || !csvData.trim()}
          >
            <Upload size={16} />
            Import Settlement
          </Button>
        </CardFooter>
      </Card>

      {/* Step 3: Results */}
      {step === 3 && result && (
        <Card>
          <CardHeader title="3. Import Results" />
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-900/20">
                <Check className="mx-auto mb-1 text-emerald-600 dark:text-emerald-400" size={20} />
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {result.imported}
                </p>
                <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-500">Lines Imported</p>
              </div>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-center dark:border-indigo-900 dark:bg-indigo-900/20">
                <p className="text-lg font-bold text-indigo-700 dark:text-indigo-400 font-mono tabular-nums">
                  {formatINR(result.totalAmount)}
                </p>
                <p className="mt-0.5 text-xs text-indigo-600 dark:text-indigo-500">Total Amount</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-900 dark:bg-red-900/20">
                <X className="mx-auto mb-1 text-red-600 dark:text-red-400" size={20} />
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                  {result.errors.length}
                </p>
                <p className="mt-0.5 text-xs text-red-600 dark:text-red-500">Errors</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
                <p className="mb-2 text-xs font-semibold text-red-700 dark:text-red-400">
                  Row Errors:
                </p>
                <ul className="space-y-1">
                  {result.errors.map((err) => (
                    <li key={err.row} className="text-xs text-red-600 dark:text-red-400">
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.imported > 0 && (
              <div className="mt-4 flex items-center gap-2">
                <Badge variant="success">Settlement ID</Badge>
                <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
                  {result.settlementId}
                </span>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setStep(1);
                setGateway('');
                setCsvData('');
                setResult(null);
              }}
            >
              Import Another
            </Button>
            {result.imported > 0 && (
              <Button
                onClick={() =>
                  navigate({ to: `/banking/pg-recon/${result.settlementId}` })
                }
              >
                View Settlement
              </Button>
            )}
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
