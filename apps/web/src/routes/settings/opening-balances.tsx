import { useState, useEffect } from 'react';
import {
  PageHeader, Button, DateInput, Badge, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { useOpeningBalances, useSaveOpeningBalances } from '@/hooks/queries/use-opening-balances';
import type { OBEntry } from '@/hooks/queries/use-opening-balances';
import { CheckCircle2, Save } from 'lucide-react';

export function OpeningBalancesPage() {
  const { data, isLoading } = useOpeningBalances();
  const save = useSaveOpeningBalances();
  const { toast } = useToast();
  const status = data?.data;

  // Default to March 31 of current FY
  const defaultDate = getDefaultOBDate();
  const [effectiveDate, setEffectiveDate] = useState(defaultDate);
  const [customerAmounts, setCustomerAmounts] = useState<Record<string, string>>({});
  const [vendorAmounts, setVendorAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!status) return;
    const ca: Record<string, string> = {};
    for (const c of status.customers) {
      if (c.amount > 0) ca[c.id] = String(c.amount);
    }
    setCustomerAmounts(ca);
    const va: Record<string, string> = {};
    for (const v of status.vendors) {
      if (v.amount > 0) va[v.id] = String(v.amount);
    }
    setVendorAmounts(va);
  }, [status]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const customers = Object.entries(customerAmounts)
      .map(([id, amt]) => ({ id, amount: parseFloat(amt) || 0 }))
      .filter((c) => c.amount > 0);
    const vendors = Object.entries(vendorAmounts)
      .map(([id, amt]) => ({ id, amount: parseFloat(amt) || 0 }))
      .filter((v) => v.amount > 0);

    if (customers.length === 0 && vendors.length === 0) {
      toast('Enter at least one opening balance', 'error');
      return;
    }

    try {
      const result = await save.mutateAsync({ effectiveDate, customers, vendors });
      const r = result.data;
      toast(`Created ${r.invoicesCreated} opening invoices, ${r.billsCreated} opening bills`, 'success');
    } catch {
      toast('Failed to save opening balances', 'error');
    }
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader breadcrumbs={[{ label: 'Settings' }, { label: 'Opening Balances' }]} title="Opening Balances" />
        <p className="py-12 text-center text-sm text-zinc-400">Loading...</p>
      </div>
    );
  }

  const customerList = status?.customers ?? [];
  const vendorList = status?.vendors ?? [];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Opening Balances' }]}
        title="Opening Balances"
        description="Set outstanding amounts owed by customers and to vendors as of your start date. This ensures correct AR/AP balances and payment matching from day 1."
      />

      <form onSubmit={handleSave}>
        {/* Effective date */}
        <div className="mb-6 max-w-xs">
          <DateInput
            label="Effective Date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">Typically the last day of the previous financial year (March 31)</p>
        </div>

        {/* Customer balances */}
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Customer Balances (Accounts Receivable)
          </h2>
          <p className="mb-3 text-xs text-zinc-500">How much does each customer owe you as of {effectiveDate || 'the effective date'}?</p>
          <BalanceTable
            entries={customerList}
            amounts={customerAmounts}
            onChange={(id, val) => setCustomerAmounts((prev) => ({ ...prev, [id]: val }))}
          />
        </div>

        {/* Vendor balances */}
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Vendor Balances (Accounts Payable)
          </h2>
          <p className="mb-3 text-xs text-zinc-500">How much do you owe each vendor as of {effectiveDate || 'the effective date'}?</p>
          <BalanceTable
            entries={vendorList}
            amounts={vendorAmounts}
            onChange={(id, val) => setVendorAmounts((prev) => ({ ...prev, [id]: val }))}
          />
        </div>

        <Button type="submit" loading={save.isPending}>
          <Save size={16} />
          Save Opening Balances
        </Button>
      </form>
    </div>
  );
}

function BalanceTable({
  entries, amounts, onChange,
}: {
  entries: OBEntry[];
  amounts: Record<string, string>;
  onChange: (id: string, value: string) => void;
}) {
  if (entries.length === 0) {
    return <p className="text-xs text-zinc-400">No records found. Add customers/vendors first.</p>;
  }

  return (
    <div className="max-w-2xl rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <Table>
        <TableHeader>
          <tr>
            <Th>Name</Th>
            <Th>Status</Th>
            <Th align="right">Opening Balance (₹)</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-sm text-zinc-900 dark:text-zinc-100">
                {entry.name}
              </TableCell>
              <TableCell>
                {entry.hasOpeningBalance ? (
                  <Badge variant="success">
                    <CheckCircle2 className="mr-1 inline h-3 w-3" />
                    Set — ₹{entry.amount.toLocaleString('en-IN')}
                  </Badge>
                ) : (
                  <span className="text-xs text-zinc-400">Not set</span>
                )}
              </TableCell>
              <TableCell align="right">
                {entry.hasOpeningBalance ? (
                  <span className="text-sm tabular-nums text-zinc-500">₹{entry.amount.toLocaleString('en-IN')}</span>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amounts[entry.id] ?? ''}
                    onChange={(e) => onChange(entry.id, e.target.value)}
                    placeholder="0.00"
                    className="w-32 rounded border border-zinc-300 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function getDefaultOBDate(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const fyStartYear = month >= 4 ? year : year - 1;
  return `${fyStartYear}-03-31`;
}
