import { useState } from 'react';
import { Plus, Lock, X } from 'lucide-react';
import {
  Card,
  CardContent,
  PageHeader,
  Button,
  Badge,
  Input,
  DateInput,
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
import {
  useFiscalPeriods,
  useCreateFiscalPeriod,
  useCloseFiscalPeriod,
} from '@/hooks/queries/use-fiscal';

function statusVariant(status: string) {
  if (status === 'open') return 'success' as const;
  if (status === 'closed') return 'warning' as const;
  return 'danger' as const;
}

// ─── Create Form ─────────────────────────────────────────────────────────────

function CreateForm({ onClose }: { onClose: () => void }) {
  const create = useCreateFiscalPeriod();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({ name, startDate, endDate });
      toast('Fiscal period created', 'success');
      onClose();
    } catch {
      toast('Failed to create fiscal period', 'error');
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New Fiscal Period</h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="FY 2025-26" />
        <DateInput label="Start Date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        <DateInput label="End Date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        <div className="flex items-end gap-2 sm:col-span-3">
          <Button type="submit" loading={create.isPending} size="sm"><Plus size={14} />Create</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ─── Fiscal Periods Page ─────────────────────────────────────────────────────

export function FiscalPeriodsPage() {
  const { data, isLoading } = useFiscalPeriods();
  const closePeriod = useCloseFiscalPeriod();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);

  const periods = data?.data ?? [];

  async function handleClose(id: string, status: 'closed' | 'locked') {
    try {
      await closePeriod.mutateAsync({ id, status });
      toast(`Period ${status}`, 'success');
    } catch {
      toast(`Failed to ${status === 'locked' ? 'lock' : 'close'} period`, 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Fiscal Periods"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Fiscal Periods' }]}
        description="Manage accounting periods. Close or lock periods to prevent changes."
        actions={
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            <Plus size={14} />
            New Period
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
                <Th>Start Date</Th>
                <Th>End Date</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={4} cols={5} />
              ) : periods.length === 0 ? (
                <TableEmpty colSpan={5} message="No fiscal periods configured." />
              ) : (
                periods.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.startDate}</TableCell>
                    <TableCell>{p.endDate}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                    </TableCell>
                    <TableCell align="right">
                      {p.status === 'open' && (
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => handleClose(p.id, 'closed')} disabled={closePeriod.isPending}>
                            Close
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleClose(p.id, 'locked')} disabled={closePeriod.isPending}>
                            <Lock size={12} /> Lock
                          </Button>
                        </div>
                      )}
                      {p.status === 'closed' && (
                        <Button variant="outline" size="sm" onClick={() => handleClose(p.id, 'locked')} disabled={closePeriod.isPending}>
                          <Lock size={12} /> Lock
                        </Button>
                      )}
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
