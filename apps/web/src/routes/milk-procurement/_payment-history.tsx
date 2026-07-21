import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import {
  Card, CardContent, Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty,
  TableSkeleton, Pagination, Input, Combobox, Badge, DateInput, CopyableAmount,
} from '@/components/ui';
import {
  useMpPayments, type MpPaymentKind, type MpPaymentHistoryFilters,
} from '@/hooks/queries/use-milk-procurement';

const LIMIT = 25;
const inr = (v: string) => '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'vmcc_bill', label: 'VMCC bill' },
  { value: 'farmer', label: 'Farmer' },
  { value: 'operator', label: 'Operator' },
];
const MODE_OPTIONS = [
  { value: '', label: 'All modes' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'upi', label: 'UPI' }, { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' }, { value: 'other', label: 'Other' },
];
const TYPE_META: Record<MpPaymentKind, { label: string; variant: 'info' | 'default' | 'cyan' }> = {
  vmcc_bill: { label: 'VMCC bill', variant: 'info' },
  farmer: { label: 'Farmer', variant: 'default' },
  operator: { label: 'Operator', variant: 'cyan' },
};
const modeLabel = (m: string | null) => MODE_OPTIONS.find((o) => o.value === m)?.label ?? (m ?? '—');

export function PaymentHistory() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState('');
  const [mode, setMode] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Debounce the free-text search so we don't hit the API on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  // Any filter change returns to the first page.
  useEffect(() => { setPage(1); }, [debounced, type, mode, dateFrom, dateTo]);

  const filters: MpPaymentHistoryFilters = {
    search: debounced || undefined,
    type: (type || undefined) as MpPaymentKind | undefined,
    paymentMode: mode || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };
  const { data, isLoading } = useMpPayments(filters, page, LIMIT);
  const rows = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-[34px] h-4 w-4 text-zinc-400" />
          <Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Payee, reference, cycle, recorded by…" className="pl-8" />
        </div>
        <div className="w-40"><Combobox label="Type" value={type} onChange={setType} options={TYPE_OPTIONS} /></div>
        <div className="w-40"><Combobox label="Mode" value={mode} onChange={setMode} options={MODE_OPTIONS} /></div>
        <div className="w-36"><DateInput label="From" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
        <div className="w-36"><DateInput label="To" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <Th>Date</Th><Th>Type</Th><Th>Payee</Th><Th>Cycle</Th>
              <Th align="right">Amount</Th><Th>Mode</Th><Th>Reference</Th><Th>Recorded by</Th>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={6} cols={8} />
              ) : rows.length === 0 ? (
                <TableEmpty colSpan={8} message="No payments match these filters." />
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">{r.date}</TableCell>
                  <TableCell><Badge variant={TYPE_META[r.kind].variant}>{TYPE_META[r.kind].label}</Badge></TableCell>
                  <TableCell>
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">{r.payee}</div>
                    <div className="text-xs text-zinc-500">
                      {r.payeeCode ? r.payeeCode : ''}{r.payeeCode && r.context ? ' · ' : ''}{r.context ?? ''}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">{r.cycleNo ?? '—'}</TableCell>
                  <TableCell className="text-right font-medium">
                    <CopyableAmount display={inr(r.amount)} copyValue={String(Math.round(Number(r.amount)))} />
                  </TableCell>
                  <TableCell className="text-sm text-zinc-600 dark:text-zinc-300">{modeLabel(r.paymentMode)}</TableCell>
                  <TableCell className="text-xs text-zinc-500">{r.reference || '—'}</TableCell>
                  <TableCell className="text-sm text-zinc-600 dark:text-zinc-300">{r.recordedBy ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && meta && (
        <Pagination page={page} totalPages={totalPages} total={meta.total} limit={LIMIT} onPageChange={setPage} />
      )}
    </div>
  );
}
