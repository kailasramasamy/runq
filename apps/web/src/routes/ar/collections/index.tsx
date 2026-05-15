import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, ClipboardList, Phone, Mail, Pencil, User, Calendar, Clock, Bell } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatINR } from '@/lib/utils';
import { useUsers } from '@/hooks/queries/use-settings';
import { useInvoices } from '@/hooks/queries/use-invoices';
import {
  PageHeader, Button, Select as ArSelect, StatTile, StatusBadge, Avatar,
  EmptyState, formatDate, daysBetween,
} from '@/components/ar/primitives';
import {
  Combobox, Textarea, DateInput, useToast,
  Card, CardHeader, CardContent, CardFooter,
  Button as UIButton,
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
  dueDate?: string | null;
}

type AssignmentStatus = 'open' | 'contacted' | 'promised' | 'resolved' | 'escalated';

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
  const navigate = useNavigate();
  const { data, isLoading } = useCollections();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const assignments = data?.data ?? [];
  const totalAtRisk = assignments.reduce((a, c) => a + c.balanceDue, 0);
  const byStatus = assignments.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Collections' }]}
        title="Collections"
        description="Track follow-ups on overdue invoices, assign to teammates, and log outcomes."
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Bell size={13} />} onClick={() => navigate({ to: '/finance/ar/dunning' })}>
              Dunning rules
            </Button>
            <Button size="sm" icon={<UserPlus size={13} />} onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Cancel' : 'New collection'}
            </Button>
          </>
        }
      />

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Total at risk"
          value={formatINR(totalAtRisk)}
          sub={`${assignments.length} cases`}
          tone="neg"
        />
        <StatTile label="Open" value={byStatus.open ?? 0} sub="No contact yet" tone="warn" />
        <StatTile label="Contacted" value={byStatus.contacted ?? 0} sub="Awaiting response" />
        <StatTile label="Promised" value={byStatus.promised ?? 0} sub="Payment commitment" tone="pos" />
        <StatTile label="Escalated" value={byStatus.escalated ?? 0} sub="Manager involved" tone="neg" />
      </div>

      {showForm && (
        <AssignForm
          onSuccess={() => { setShowForm(false); toast('Assignment created.', 'success'); }}
        />
      )}

      {/* Cases */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
            />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <div
          className="rounded-xl border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <EmptyState
            icon={<ClipboardList size={18} />}
            title="No collection assignments"
            description="Assign overdue invoices to your team for follow-up."
            action={
              <Button size="sm" icon={<UserPlus size={13} />} onClick={() => setShowForm(true)}>
                New collection
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((c) => (
            <CaseCard key={c.id} assignment={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CaseCard({ assignment }: { assignment: CollectionAssignment }) {
  const navigate = useNavigate();
  const updateMutation = useUpdateAssignment();
  const { toast } = useToast();
  const overdueDays = assignment.dueDate ? daysBetween(assignment.dueDate) : 0;

  function handleStatusChange(newStatus: string) {
    updateMutation.mutate(
      { id: assignment.id, data: { status: newStatus as AssignmentStatus } },
      {
        onSuccess: () => toast('Status updated.', 'success'),
        onError: () => toast('Failed to update.', 'error'),
      },
    );
  }

  function goToInvoice() {
    navigate({ to: '/finance/ar/invoices/$invoiceId', params: { invoiceId: assignment.invoiceId } });
  }

  return (
    <div
      className="rounded-xl border p-4 transition-shadow hover:shadow-sm"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-start gap-4">
        <Avatar name={assignment.customerName} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
              {assignment.customerName}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>·</span>
            <button
              onClick={goToInvoice}
              className="num text-[12px] font-medium hover:underline"
              style={{ color: 'var(--accent-text)' }}
            >
              {assignment.invoiceNumber}
            </button>
            <StatusBadge status={assignment.status} />
            {overdueDays > 0 && (
              <span className="num text-[10.5px] font-medium" style={{ color: 'var(--neg)' }}>
                {overdueDays}d overdue
              </span>
            )}
          </div>
          <div className="mt-1.5 text-[12px]" style={{ color: 'var(--text-2)' }}>
            {assignment.notes ? (
              assignment.notes
            ) : (
              <span className="italic" style={{ color: 'var(--text-3)' }}>
                No notes yet — log first contact attempt to keep the case warm.
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px]" style={{ color: 'var(--text-3)' }}>
            <span className="inline-flex items-center gap-1.5">
              <User size={11} />
              Assigned to <span className="font-medium" style={{ color: 'var(--text-2)' }}>{assignment.assigneeName}</span>
            </span>
            {assignment.followUpDate && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={11} />
                Follow-up <span className="num" style={{ color: 'var(--text-2)' }}>{formatDate(assignment.followUpDate)}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Clock size={11} />
              Assigned <span className="num" style={{ color: 'var(--text-2)' }}>
                {formatDate(assignment.assignedAt.slice(0, 10))}
              </span>
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10.5px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
            Balance
          </div>
          <div className="num text-[18px] font-semibold tabular-nums" style={{ color: 'var(--neg)' }}>
            {formatINR(assignment.balanceDue)}
          </div>
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <Button size="sm" variant="outline" icon={<Phone size={12} />}>Log call</Button>
            <Button size="sm" variant="outline" icon={<Mail size={12} />}>Email</Button>
            <ArSelect
              options={STATUS_OPTIONS}
              value={assignment.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="!h-7 !text-[11.5px]"
            />
            <Button size="sm" variant="outline" icon={<Pencil size={12} />}>Update</Button>
          </div>
        </div>
      </div>
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
    <Card className="mb-5 max-w-3xl">
      <CardHeader title="Assign invoice for collection" />
      <form onSubmit={handleSubmit}>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Combobox
              label="Overdue invoice"
              options={invoiceOptions}
              value={invoiceId}
              onChange={setInvoiceId}
              placeholder="Search invoice..."
              required
            />
            <Combobox
              label="Assign to"
              options={userOptions}
              value={assignedTo}
              onChange={setAssignedTo}
              placeholder="Select team member..."
              required
            />
            <DateInput
              label="Follow-up date"
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
          <UIButton type="submit" loading={createMutation.isPending} disabled={!invoiceId || !assignedTo}>
            Assign
          </UIButton>
        </CardFooter>
      </form>
    </Card>
  );
}
