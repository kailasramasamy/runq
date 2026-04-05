import { useState, useMemo } from 'react';
import { Plus, X, Eye, Pencil, Paperclip } from 'lucide-react';
import {
  Card,
  CardContent,
  PageHeader,
  Button,
  Badge,
  Input,
  DateInput,
  Textarea,
  Select,
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
import {
  useVendorContracts,
  useCreateVendorContract,
  useUpdateVendorContract,
} from '@/hooks/queries/use-vendor-management';
import { useVendors } from '@/hooks/queries/use-vendors';
import type { VendorContract } from '@runq/types';

function statusVariant(status: string) {
  if (status === 'active') return 'success' as const;
  if (status === 'draft') return 'warning' as const;
  if (status === 'expired') return 'danger' as const;
  return 'default' as const;
}

// ─── View Modal ───────────────────────────────────────────────────────────────

function ViewModal({ contract, onClose, onEdit }: { contract: VendorContract; onClose: () => void; onEdit: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40">
      <div className="relative w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Contract Details</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
            <X size={16} />
          </button>
        </div>
        <dl className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Contract Number</dt>
              <dd className="mt-0.5 font-mono text-zinc-900 dark:text-zinc-100">{contract.contractNumber}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Status</dt>
              <dd className="mt-0.5"><Badge variant={statusVariant(contract.status)}>{contract.status}</Badge></dd>
            </div>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Title</dt>
            <dd className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-100">{contract.title}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Vendor</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{contract.vendorName ?? contract.vendorId}</dd>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Start Date</dt>
              <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{contract.startDate}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">End Date</dt>
              <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{contract.endDate}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Renewal Date</dt>
              <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{contract.renewalDate ?? '—'}</dd>
            </div>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Value</dt>
            <dd className="mt-0.5 font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
              {contract.value != null ? formatINR(contract.value) : '—'}
            </dd>
          </div>
          {contract.terms && (
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Terms</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{contract.terms}</dd>
            </div>
          )}
        </dl>
        <div className="mt-4 border-t border-zinc-200 dark:border-zinc-700 pt-4">
          <p className="text-xs text-zinc-400 flex items-center gap-1">
            <Paperclip size={12} /> Document upload coming soon
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={onEdit}><Pencil size={13} /> Edit</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({ contract, onClose }: { contract: VendorContract; onClose: () => void }) {
  const update = useUpdateVendorContract();
  const { toast } = useToast();
  const [title, setTitle] = useState(contract.title);
  const [startDate, setStartDate] = useState(contract.startDate);
  const [endDate, setEndDate] = useState(contract.endDate);
  const [value, setValue] = useState(contract.value != null ? String(contract.value) : '');
  const [terms, setTerms] = useState(contract.terms ?? '');
  const [renewalDate, setRenewalDate] = useState(contract.renewalDate ?? '');
  const [status, setStatus] = useState(contract.status);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        id: contract.id,
        data: {
          title,
          startDate,
          endDate,
          value: value ? Number(value) : null,
          terms: terms || null,
          renewalDate: renewalDate || null,
          status,
        },
      });
      toast('Contract updated', 'success');
      onClose();
    } catch {
      toast('Failed to update contract', 'error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40">
      <div className="relative w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Edit Contract</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
            <X size={16} />
          </button>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Contract Number</span>
            <p className="mt-0.5 font-mono text-zinc-900 dark:text-zinc-100">{contract.contractNumber}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Vendor</span>
            <p className="mt-0.5 text-zinc-900 dark:text-zinc-100">{contract.vendorName ?? contract.vendorId}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <DateInput label="Start Date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="dark:[color-scheme:dark]" />
            <DateInput label="End Date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required className="dark:[color-scheme:dark]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Value" type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Contract value" />
            <DateInput label="Renewal Date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} className="dark:[color-scheme:dark]" />
          </div>
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'active', label: 'Active' },
              { value: 'expired', label: 'Expired' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
          <Textarea label="Terms" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Contract terms and conditions..." />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={update.isPending} size="sm">Save Changes</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Create Form ─────────────────────────────────────────────────────────────

function CreateForm({ onClose }: { onClose: () => void }) {
  const create = useCreateVendorContract();
  const { toast } = useToast();
  const { data: vendorsData } = useVendors({ limit: 100 });
  const [vendorId, setVendorId] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [value, setValue] = useState('');
  const [terms, setTerms] = useState('');
  const [renewalDate, setRenewalDate] = useState('');

  const vendorOptions = useMemo(
    () => (vendorsData?.data ?? []).map((v) => ({ value: v.id, label: v.name })),
    [vendorsData],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        vendorId,
        contractNumber,
        title,
        startDate,
        endDate,
        value: value ? Number(value) : null,
        terms: terms || undefined,
        renewalDate: renewalDate || undefined,
      });
      toast('Contract created', 'success');
      onClose();
    } catch {
      toast('Failed to create contract', 'error');
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New Vendor Contract</h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Combobox label="Vendor" options={vendorOptions} value={vendorId} onChange={setVendorId} placeholder="Select vendor…" required />
          <Input label="Contract Number" value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} required placeholder="CTR-001" />
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Annual supply agreement" />
          <DateInput label="Start Date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="dark:[color-scheme:dark]" />
          <DateInput label="End Date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required className="dark:[color-scheme:dark]" />
          <Input label="Value" type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Contract value" />
          <DateInput label="Renewal Date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} className="dark:[color-scheme:dark]" />
        </div>
        <Textarea label="Terms" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Contract terms and conditions..." />
        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending} size="sm"><Plus size={14} /> Create Contract</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ─── Contracts Page ──────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function VendorContractsPage() {
  const { data, isLoading } = useVendorContracts();
  const { data: vendorsData } = useVendors({ limit: 100 });
  const [showCreate, setShowCreate] = useState(false);
  const [viewContract, setViewContract] = useState<VendorContract | null>(null);
  const [editContract, setEditContract] = useState<VendorContract | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');

  const allContracts = data?.data ?? [];
  const vendorOptions = useMemo(
    () => (vendorsData?.data ?? []).map((v) => ({ value: v.id, label: v.name })),
    [vendorsData],
  );

  const contracts = useMemo(() => {
    let result = allContracts;
    if (vendorFilter) result = result.filter((c) => c.vendorId === vendorFilter);
    if (statusFilter) result = result.filter((c) => c.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        c.contractNumber.toLowerCase().includes(q) || c.title.toLowerCase().includes(q),
      );
    }
    return result;
  }, [allContracts, vendorFilter, statusFilter, search]);

  function handleEditFromView() {
    setEditContract(viewContract);
    setViewContract(null);
  }

  return (
    <div>
      <PageHeader
        title="Vendor Contracts"
        breadcrumbs={[{ label: 'Vendor Management' }, { label: 'Contracts' }]}
        description="Track vendor contracts, expiry dates, and renewal schedules."
        actions={
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            <Plus size={14} />
            New Contract
          </Button>
        }
      />

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}

      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          placeholder="Search by number or title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={STATUS_OPTIONS}
          className="w-40"
        />
        <div className="w-56">
          <Combobox
            options={vendorOptions}
            value={vendorFilter}
            onChange={setVendorFilter}
            placeholder="All Vendors"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr>
                <Th>Number</Th>
                <Th>Title</Th>
                <Th>Vendor</Th>
                <Th>Start</Th>
                <Th>End</Th>
                <Th>Status</Th>
                <Th align="right">Value</Th>
                <Th />
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={8} />
              ) : contracts.length === 0 ? (
                <TableEmpty colSpan={8} message="No vendor contracts found." />
              ) : (
                contracts.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => setViewContract(c)}
                  >
                    <TableCell className="font-mono text-xs">{c.contractNumber}</TableCell>
                    <TableCell className="font-medium">{c.title}</TableCell>
                    <TableCell className="text-zinc-600 dark:text-zinc-400">{c.vendorName ?? c.vendorId}</TableCell>
                    <TableCell>{c.startDate}</TableCell>
                    <TableCell>{c.endDate}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                    </TableCell>
                    <TableCell align="right" numeric>
                      {c.value != null ? (
                        <span className="font-mono tabular-nums">{formatINR(c.value)}</span>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          title="View"
                          onClick={() => setViewContract(c)}
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => setEditContract(c)}
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {viewContract && (
        <ViewModal
          contract={viewContract}
          onClose={() => setViewContract(null)}
          onEdit={handleEditFromView}
        />
      )}
      {editContract && (
        <EditModal
          contract={editContract}
          onClose={() => setEditContract(null)}
        />
      )}
    </div>
  );
}
