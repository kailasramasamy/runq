import { useState } from 'react';
import { Plus, Trash2, CheckCircle, X, ArrowLeft } from 'lucide-react';
import {
  Card,
  CardContent,
  PageHeader,
  Button,
  Badge,
  Input,
  DateInput,
  Combobox,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableEmpty,
  Th,
  TableSkeleton,
  useToast,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { PaymentSchedule } from '@runq/types';
import { usePurchaseInvoices } from '@/hooks/queries/use-purchase-invoices';
import { useVendors } from '@/hooks/queries/use-vendors';
import {
  usePaymentSchedules,
  usePaymentSchedule,
  useCreatePaymentSchedule,
  useApprovePaymentSchedule,
} from '@/hooks/queries/use-vendor-management';

function statusVariant(status: string) {
  if (status === 'approved') return 'success' as const;
  if (status === 'draft') return 'warning' as const;
  if (status === 'processing') return 'info' as const;
  if (status === 'completed') return 'primary' as const;
  if (status === 'cancelled') return 'danger' as const;
  return 'default' as const;
}

// ─── Schedule Detail View ───────────────────────────────────────────────────

function ScheduleDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, isLoading } = usePaymentSchedule(id);
  const approve = useApprovePaymentSchedule();
  const { toast } = useToast();
  const schedule = data?.data;

  async function handleApprove() {
    try {
      await approve.mutateAsync(id);
      toast('Schedule approved', 'success');
    } catch {
      toast('Failed to approve schedule', 'error');
    }
  }

  if (isLoading) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft size={14} /> Back to Schedules
        </Button>
        <Card><CardContent className="p-6 text-center text-zinc-500">Loading...</CardContent></Card>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft size={14} /> Back to Schedules
        </Button>
        <Card><CardContent className="p-6 text-center text-zinc-500">Schedule not found.</CardContent></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={schedule.name}
        breadcrumbs={[
          { label: 'Vendor Management' },
          { label: 'Payment Schedules', onClick: onBack },
          { label: schedule.name },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft size={14} /> Back
            </Button>
            {schedule.status === 'draft' && (
              <Button size="sm" onClick={handleApprove} loading={approve.isPending}>
                <CheckCircle size={14} /> Approve Schedule
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <InfoCard label="Scheduled Date" value={schedule.scheduledDate} />
        <InfoCard label="Status">
          <Badge variant={statusVariant(schedule.status)}>{schedule.status}</Badge>
        </InfoCard>
        <InfoCard label="Total Amount" value={formatINR(schedule.totalAmount)} />
        <InfoCard label="Items" value={`${schedule.items.length} invoice(s)`} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr>
                <Th>Invoice</Th>
                <Th>Vendor</Th>
                <Th align="right">Amount</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {schedule.items.length === 0 ? (
                <TableEmpty colSpan={3} message="No items in this schedule." />
              ) : (
                schedule.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">
                      {item.invoiceNumber ?? item.invoiceId.slice(0, 8)}
                    </TableCell>
                    <TableCell>{item.vendorName ?? item.vendorId.slice(0, 8)}</TableCell>
                    <TableCell align="right" numeric>{formatINR(item.amount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoCard({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      {children ?? <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>}
    </div>
  );
}

// ─── Create Form ─────────────────────────────────────────────────────────────

interface ScheduleItemRow {
  invoiceId: string;
  vendorId: string;
  vendorName: string;
  invoiceLabel: string;
  amount: string;
}

function CreateForm({ onClose }: { onClose: () => void }) {
  const create = useCreatePaymentSchedule();
  const { toast } = useToast();
  const { data: vendorsData } = useVendors({ limit: 200 });
  const [name, setName] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [items, setItems] = useState<ScheduleItemRow[]>([]);
  const [selectedVendorFilter, setSelectedVendorFilter] = useState('');

  const vendors = vendorsData?.data ?? [];
  const vendorOptions = [
    { value: '', label: 'All vendors' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
  ];

  // Fetch unpaid invoices (approved/partially_paid)
  const { data: invoicesData } = usePurchaseInvoices({
    ...(selectedVendorFilter ? { vendorId: selectedVendorFilter } : {}),
  });
  const allInvoices = (invoicesData?.data ?? []).filter(
    (inv) => inv.status !== 'paid' && inv.status !== 'cancelled' && inv.status !== 'draft',
  );

  // Exclude already-added invoices
  const addedIds = new Set(items.map((i) => i.invoiceId));
  const availableInvoices = allInvoices.filter((inv) => !addedIds.has(inv.id));

  function addInvoice(invoiceId: string) {
    const inv = allInvoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    const vendor = vendors.find((v) => v.id === inv.vendorId);
    setItems((prev) => [
      ...prev,
      {
        invoiceId: inv.id,
        vendorId: inv.vendorId,
        vendorName: vendor?.name ?? inv.vendorId.slice(0, 8),
        invoiceLabel: inv.invoiceNumber,
        amount: String(inv.balanceDue),
      },
    ]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateAmount(idx: number, value: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, amount: value } : it)));
  }

  const totalAmount = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) {
      toast('Add at least one invoice to the schedule', 'error');
      return;
    }
    try {
      await create.mutateAsync({
        name,
        scheduledDate,
        items: items.map((it) => ({
          invoiceId: it.invoiceId,
          vendorId: it.vendorId,
          amount: Number(it.amount),
        })),
      });
      toast('Payment schedule created', 'success');
      onClose();
    } catch {
      toast('Failed to create schedule', 'error');
    }
  }

  const invoiceOptions = availableInvoices.map((inv) => {
    const vendor = vendors.find((v) => v.id === inv.vendorId);
    return {
      value: inv.id,
      label: `${inv.invoiceNumber} — ${vendor?.name ?? 'Unknown'} — ${formatINR(inv.balanceDue)}`,
    };
  });

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New Payment Schedule</h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Schedule Name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Weekly vendor payments — Apr W1" />
          <DateInput label="Payment Date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} required />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Invoices to Pay {items.length > 0 && <span className="text-zinc-400">({items.length})</span>}
            </label>
            {items.length > 0 && (
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Total: {formatINR(totalAmount)}
              </span>
            )}
          </div>

          <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Combobox
              label="Filter by vendor"
              options={vendorOptions}
              value={selectedVendorFilter}
              onChange={setSelectedVendorFilter}
              placeholder="All vendors"
            />
            <Combobox
              label="Add invoice"
              options={invoiceOptions}
              value=""
              onChange={(val) => { if (val) addInvoice(val); }}
              placeholder={availableInvoices.length === 0 ? 'No unpaid invoices' : `Select from ${availableInvoices.length} invoice(s)...`}
            />
          </div>

          {items.length > 0 && (
            <div className="space-y-1">
              {items.map((item, idx) => (
                <div key={item.invoiceId} className="flex items-center gap-2 rounded border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                  <span className="flex-1 text-sm">
                    <span className="font-mono text-xs text-zinc-500">{item.invoiceLabel}</span>
                    <span className="mx-2 text-zinc-300 dark:text-zinc-600">|</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{item.vendorName}</span>
                  </span>
                  <Input
                    type="number"
                    value={item.amount}
                    onChange={(e) => updateAmount(idx, e.target.value)}
                    required
                    className="w-32 text-right"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-red-500">
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {items.length === 0 && (
            <p className="rounded border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
              Select invoices above to add them to this payment schedule.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending} size="sm" disabled={items.length === 0}>
            <Plus size={14} /> Create Schedule
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ─── Payment Schedules Page ──────────────────────────────────────────────────

export function PaymentSchedulesPage() {
  const { data, isLoading } = usePaymentSchedules();
  const approve = useApprovePaymentSchedule();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const schedules = data?.data ?? [];

  async function handleApprove(id: string) {
    try {
      await approve.mutateAsync(id);
      toast('Schedule approved', 'success');
    } catch {
      toast('Failed to approve schedule', 'error');
    }
  }

  if (viewingId) {
    return <ScheduleDetail id={viewingId} onBack={() => setViewingId(null)} />;
  }

  return (
    <div>
      <PageHeader
        title="Payment Schedules"
        breadcrumbs={[{ label: 'Vendor Management' }, { label: 'Payment Schedules' }]}
        description="Batch vendor payments into scheduled runs for approval and execution."
        actions={
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            <Plus size={14} />
            New Schedule
          </Button>
        }
      />

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr>
                <Th>Name</Th>
                <Th>Scheduled Date</Th>
                <Th>Status</Th>
                <Th align="right">Total Amount</Th>
                <Th align="right">Actions</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={5} />
              ) : schedules.length === 0 ? (
                <TableEmpty colSpan={5} message="No payment schedules yet." />
              ) : (
                schedules.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => setViewingId(s.id)}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.scheduledDate}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                    </TableCell>
                    <TableCell align="right" numeric>
                      {formatINR(Number(s.totalAmount ?? 0))}
                    </TableCell>
                    <TableCell align="right">
                      <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                        {s.status === 'draft' && (
                          <Button variant="outline" size="sm" onClick={() => handleApprove(s.id)} disabled={approve.isPending}>
                            <CheckCircle size={14} /> Approve
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
