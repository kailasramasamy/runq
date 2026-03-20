import { useState, useEffect } from 'react';
import { Hash } from 'lucide-react';
import {
  Card,
  CardContent,
  CardFooter,
  PageHeader,
  Button,
  Input,
} from '@/components/ui';
import { useInvoiceNumbering, useUpdateInvoiceNumbering } from '@/hooks/queries/use-settings';
import { useToast } from '@/components/ui';

function buildPreview(prefix: string, format: string, seq: number): string {
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyShort = `${String(fyStart).slice(2)}${String(fyStart + 1).slice(2)}`;
  const seqStr = String(seq).padStart(4, '0');
  return format
    .replace('{prefix}', prefix || 'INV')
    .replace('{fy}', fyShort)
    .replace('{seq}', seqStr);
}

export function InvoiceNumberingPage() {
  const { data, isLoading } = useInvoiceNumbering();
  const update = useUpdateInvoiceNumbering();
  const { toast } = useToast();

  const [prefix, setPrefix] = useState('INV');
  const [format, setFormat] = useState('{prefix}-{fy}-{seq}');
  const [startSeq, setStartSeq] = useState('1');

  useEffect(() => {
    if (data?.data) {
      setPrefix(data.data.invoicePrefix ?? 'INV');
      setFormat(data.data.invoiceFormat ?? '{prefix}-{fy}-{seq}');
      setStartSeq(String(data.data.invoiceStartSequence ?? 1));
    }
  }, [data]);

  const preview = buildPreview(prefix, format, Number(startSeq) || 1);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const seq = Number(startSeq);
    if (!Number.isInteger(seq) || seq < 1) {
      toast('Start sequence must be a positive integer', 'error');
      return;
    }
    try {
      await update.mutateAsync({
        invoicePrefix: prefix,
        invoiceFormat: format,
        invoiceStartSequence: seq,
      });
      toast('Invoice numbering saved', 'success');
    } catch {
      toast('Failed to save', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Invoice Numbering"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Invoice Numbering' }]}
        description="Configure how invoice numbers are generated."
      />

      <form onSubmit={handleSave}>
        <Card className="max-w-xl">
          <CardContent className="space-y-5 pt-5">
            <Input
              label="Prefix"
              value={isLoading ? '' : prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              maxLength={10}
              placeholder="INV"
              helper="Short identifier prepended to every invoice number (e.g. INV, TAX, SI)."
            />

            <Input
              label="Format Pattern"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              placeholder="{prefix}-{fy}-{seq}"
              helper="Available tokens: {prefix}, {fy} (financial year, e.g. 2526), {seq} (padded sequence)."
            />

            <Input
              label="Starting Sequence Number"
              type="number"
              min="1"
              step="1"
              value={startSeq}
              onChange={(e) => setStartSeq(e.target.value)}
              helper="The next invoice will use this sequence. Already-issued invoices are unaffected."
            />

            {/* Live Preview */}
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-900/50 dark:bg-indigo-950/30">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-indigo-500 dark:text-indigo-400">
                Next Invoice Preview
              </p>
              <p className="font-mono text-lg font-semibold text-indigo-700 dark:text-indigo-300">
                {preview}
              </p>
            </div>
          </CardContent>

          <CardFooter className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <Hash size={14} />
              <span>Applies to all new invoices going forward.</span>
            </div>
            <Button type="submit" loading={update.isPending}>
              Save Changes
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
