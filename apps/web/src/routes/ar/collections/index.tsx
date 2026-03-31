import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, ClipboardList, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatINR } from '@/lib/utils';
import { useUsers } from '@/hooks/queries/use-settings';
import { useInvoices } from '@/hooks/queries/use-invoices';
import {
  PageHeader, Badge, Button, Select, Combobox, Input, Textarea,
  Card, CardHeader, CardContent, CardFooter,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  TableSkeleton, EmptyState, useToast, DateInput,
} from '@/components/ui';

interface CollectionAssignment {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  assignedTo: string;
  assigneeName: string;
  assignedAt: string;
  balanceDue: number;
  status: string;
  notes: string | null;
  followUpDate: string | null;
}

type AssignmentStatus = 'open' | 'contacted' | 'promised' | 'resolved' | 'escalated';

const STATUS_BADGE: Record<string, { variant: 'default' | 'info' | 'success' | 'danger' | 'warning' | 'cyan'; label: string }> = {
  open: { variant: 'warning', label: 'Open' },
  contacted: { variant: 'info', label: 'Contacted' },
  promised: { variant: 'cyan', label: 'Promised' },
  resolved: { variant: 'success', label: 'Resolved' },
  escalated: { variant: 'danger', label: 'Escalated' },
};

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'promised', label: 'Promised' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'escalated', label: 'Escalated' },
];

const COLLECTION_KEYS = {
  all: ['collections'] as const,
  list: ['collections', 'list'] as const,
};

function useCollections() {
  return useQuery({
    queryKey: COLLECTION_KEYS.list,
    queryFn: () => api.get<{ data: CollectionAssignment[] }>('/ar/collections'),
  });
}

function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { invoiceId: string; assignedTo: string; notes?: string; followUpDate?: string }) =>
      api.post('/ar/collections', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: COLLECTION_KEYS.all }),
  });
}

function useUpdateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status?: AssignmentStatus; notes?: string; followUpDate?: string } }) =>
      api.put(`/ar/collections/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: COLLECTION_KEYS.all }),
  });
}

export function CollectionsPage() {
  const { data, isLoading } = useCollections();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const assignments = data?.data ?? [];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Collections' }]}
        title="Collection Assignments"
        description="Assign overdue invoices to team members for follow-up."
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            <UserPlus size={16} />
            {showForm ? 'Cancel' : 'New Assignment'}
          </Button>
        }
      />

      {showForm && <AssignForm onSuccess={() => { setShowForm(false); toast('Assignment created.', 'success'); }} />}

      <Table>
        <TableHeader>
          <tr>
            <Th>Invoice</Th>
            <Th>Customer</Th>
            <Th align="right">Balance Due</Th>
            <Th>Assigned To</Th>
            <Th>Status</Th>
            <Th>Follow-up</Th>
            <Th>Notes</Th>
            <Th>Actions</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={4} cols={8} />
          ) : assignments.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <EmptyState
                  icon={ClipboardList}
                  title="No collection assignments"
                  description="Assign overdue invoices to your team for follow-up."
                />
              </td>
            </tr>
          ) : (
            assignments.map((a) => <AssignmentRow key={a.id} assignment={a} />)
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function AssignForm({ onSuccess }: { onSuccess: () => void }) {
  const createMutation = useCreateAssignment();
  const { data: usersData } = useUsers();
  const { data: invoicesData } = useInvoices({ status: 'overdue', limit: 100 });
  const { toast } = useToast();

  const [invoiceId, setInvoiceId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  const userOptions = (usersData?.data ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.role})` }));
  const invoiceOptions = (invoicesData?.data ?? []).map((inv) => ({
    value: inv.id,
    label: `${inv.invoiceNumber} — ${inv.customerName}`,
  }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(
      {
        invoiceId,
        assignedTo,
        notes: notes || undefined,
        followUpDate: followUpDate || undefined,
      },
      {
        onSuccess,
        onError: () => toast('Failed to create assignment.', 'error'),
      },
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader title="Assign Invoice for Collection" />
      <form onSubmit={handleSubmit}>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Combobox
              label="Overdue Invoice"
              options={invoiceOptions}
              value={invoiceId}
              onChange={setInvoiceId}
              placeholder="Search invoice..."
              required
            />
            <Combobox
              label="Assign To"
              options={userOptions}
              value={assignedTo}
              onChange={setAssignedTo}
              placeholder="Select team member..."
              required
            />
            <DateInput
              label="Follow-up Date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
            />
            <div />
            <div className="col-span-2">
              <Textarea
                label="Notes"
                placeholder="Instructions for the collector..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit" loading={createMutation.isPending} disabled={!invoiceId || !assignedTo}>
            Assign
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function AssignmentRow({ assignment }: { assignment: CollectionAssignment }) {
  const navigate = useNavigate();
  const updateMutation = useUpdateAssignment();
  const { toast } = useToast();
  const badge = STATUS_BADGE[assignment.status] ?? STATUS_BADGE.open;

  function handleStatusChange(newStatus: string) {
    updateMutation.mutate(
      { id: assignment.id, data: { status: newStatus as AssignmentStatus } },
      {
        onSuccess: () => toast('Status updated.', 'success'),
        onError: () => toast('Failed to update.', 'error'),
      },
    );
  }

  return (
    <TableRow>
      <TableCell>
        <button
          onClick={() => navigate({ to: '/ar/invoices/$invoiceId', params: { invoiceId: assignment.invoiceId } })}
          className="flex items-center gap-1 font-mono text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          {assignment.invoiceNumber}
          <ExternalLink size={12} />
        </button>
      </TableCell>
      <TableCell>{assignment.customerName}</TableCell>
      <TableCell align="right" numeric className="font-mono font-medium text-red-600 dark:text-red-400">
        {formatINR(assignment.balanceDue)}
      </TableCell>
      <TableCell>{assignment.assigneeName}</TableCell>
      <TableCell>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </TableCell>
      <TableCell className="text-zinc-500 dark:text-zinc-400">
        {assignment.followUpDate ?? '—'}
      </TableCell>
      <TableCell className="max-w-[200px] truncate text-xs text-zinc-500 dark:text-zinc-400">
        {assignment.notes ?? '—'}
      </TableCell>
      <TableCell>
        <Select
          options={STATUS_OPTIONS}
          value={assignment.status}
          onChange={(e) => handleStatusChange(e.target.value)}
        />
      </TableCell>
    </TableRow>
  );
}
