import { useState, useEffect } from 'react';
import {
  PageHeader, Button, DateInput, Badge, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { useOpeningBalances, useSaveCustomerOB, useSaveVendorOB } from '@/hooks/queries/use-opening-balances';
import type { OBEntry } from '@/hooks/queries/use-opening-balances';
import { CheckCircle2, Save } from 'lucide-react';

export function OpeningBalancesPage() {
  const { data, isLoading } = useOpeningBalances();
  const status = data?.data;

  const defaultDate = getDefaultOBDate();
  const [effectiveDate, setEffectiveDate] = useState(defaultDate);

  if (isLoading) {
    return (
      <div>
        <PageHeader breadcrumbs={[{ label: 'Settings' }, { label: 'Opening Balances' }]} title="Opening Balances" />
        <p className="py-12 text-center text-sm text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Opening Balances' }]}
        title="Opening Balances"
        description="Set outstanding amounts owed by customers and to vendors as of your start date."
      />

      <div className="mb-6 max-w-xs">
        <DateInput
          label="Effective Date"
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
        />
        <p className="mt-1 text-xs text-zinc-500">Typically March 31 of the previous financial year</p>
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Customer Balances (Accounts Receivable)
        </h2>
        <p className="mb-3 text-xs text-zinc-500">How much does each customer owe you as of {effectiveDate}?</p>
        <BalanceTable entries={status?.customers ?? []} type="customer" effectiveDate={effectiveDate} />
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Vendor Balances (Accounts Payable)
        </h2>
        <p className="mb-3 text-xs text-zinc-500">How much do you owe each vendor as of {effectiveDate}?</p>
        <BalanceTable entries={status?.vendors ?? []} type="vendor" effectiveDate={effectiveDate} />
      </div>
    </div>
  );
}

function BalanceTable({ entries, type, effectiveDate }: { entries: OBEntry[]; type: 'customer' | 'vendor'; effectiveDate: string }) {
  if (entries.length === 0) {
    return <p className="text-xs text-zinc-400">No {type}s found. Add {type}s first.</p>;
  }

  return (
    <div className="max-w-2xl rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <Table>
        <TableHeader>
          <tr>
            <Th>Name</Th>
            <Th>Status</Th>
            <Th align="right">Opening Balance (₹)</Th>
            <Th></Th>
          </tr>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <OBRow key={entry.id} entry={entry} type={type} effectiveDate={effectiveDate} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function OBRow({ entry, type, effectiveDate }: { entry: OBEntry; type: 'customer' | 'vendor'; effectiveDate: string }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(entry.amount > 0 ? String(entry.amount) : '');
  const saveCustomer = useSaveCustomerOB();
  const saveVendor = useSaveVendorOB();
  const { toast } = useToast();
  const saving = saveCustomer.isPending || saveVendor.isPending;
  const showInput = !entry.hasOpeningBalance || editing;

  useEffect(() => {
    if (entry.amount > 0) setAmount(String(entry.amount));
  }, [entry.amount]);

  async function handleSave() {
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      toast('Enter a valid amount', 'error');
      return;
    }
    try {
      if (type === 'customer') {
        await saveCustomer.mutateAsync({ id: entry.id, amount: val, effectiveDate });
      } else {
        await saveVendor.mutateAsync({ id: entry.id, amount: val, effectiveDate });
      }
      toast(`Opening balance ${entry.hasOpeningBalance ? 'updated' : 'set'} for ${entry.name}`, 'success');
      setEditing(false);
    } catch {
      toast('Failed to save', 'error');
    }
  }

  return (
    <TableRow>
      <TableCell className="text-sm text-zinc-900 dark:text-zinc-100">{entry.name}</TableCell>
      <TableCell>
        {entry.hasOpeningBalance && !editing ? (
          <Badge variant="success">
            <CheckCircle2 className="mr-1 inline h-3 w-3" />
            Set
          </Badge>
        ) : (
          <span className="text-xs text-zinc-400">{editing ? 'Editing' : 'Not set'}</span>
        )}
      </TableCell>
      <TableCell align="right">
        {showInput ? (
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoFocus={editing}
            className="w-32 rounded border border-zinc-300 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        ) : (
          <span className="text-sm tabular-nums text-zinc-500">₹{entry.amount.toLocaleString('en-IN')}</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {showInput ? (
            <>
              <Button size="sm" variant="outline" onClick={handleSave} loading={saving} disabled={!amount || parseFloat(amount) <= 0}>
                <Save size={12} /> Save
              </Button>
              {editing && (
                <Button size="sm" variant="outline" onClick={() => { setEditing(false); setAmount(String(entry.amount)); }}>
                  Cancel
                </Button>
              )}
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function getDefaultOBDate(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const fyStartYear = month >= 4 ? year : year - 1;
  return `${fyStartYear}-03-31`;
}
