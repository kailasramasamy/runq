import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  Card,
  CardContent,
  PageHeader,
  Button,
  Badge,
  Input,
  Select,
  DateInput,
  Textarea,
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
  useTasks,
  useCreateTask,
  useUpdateTaskStatus,
} from '@/hooks/queries/use-workflows';

function statusVariant(status: string) {
  if (status === 'completed') return 'success' as const;
  if (status === 'in_progress') return 'info' as const;
  if (status === 'cancelled') return 'danger' as const;
  return 'warning' as const;
}

const ENTITY_TYPE_OPTIONS = [
  { value: '', label: 'Select type...' },
  { value: 'bill', label: 'Bill' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'payment', label: 'Payment' },
  { value: 'receipt', label: 'Receipt' },
];

// ─── Create Form ─────────────────────────────────────────────────────────────

function CreateForm({ onClose }: { onClose: () => void }) {
  const create = useCreateTask();
  const { toast } = useToast();
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        entityType,
        entityId,
        title,
        description: description || undefined,
        assignedTo,
        dueDate: dueDate || undefined,
      });
      toast('Task created', 'success');
      onClose();
    } catch {
      toast('Failed to create task', 'error');
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New Task</h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Review invoice #42" />
          <Input label="Assigned To (User ID)" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} required placeholder="User ID" />
          <Select label="Entity Type" value={entityType} onChange={(e) => setEntityType(e.target.value)} options={ENTITY_TYPE_OPTIONS} required />
          <Input label="Entity ID" value={entityId} onChange={(e) => setEntityId(e.target.value)} required placeholder="Entity UUID" />
          <DateInput label="Due Date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details..." />
        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending} size="sm"><Plus size={14} /> Create Task</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ─── Tasks Page ──────────────────────────────────────────────────────────────

export function TasksPage() {
  const { data, isLoading } = useTasks();
  const updateStatus = useUpdateTaskStatus();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);

  const tasks = data?.data ?? [];

  async function handleStatusUpdate(taskId: string, status: string) {
    try {
      await updateStatus.mutateAsync({ taskId, status });
      toast(`Task marked as ${status.replace('_', ' ')}`, 'success');
    } catch {
      toast('Failed to update task status', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Task Assignments"
        breadcrumbs={[{ label: 'Workflows' }, { label: 'Tasks' }]}
        description="Manage and track task assignments across your team."
        actions={
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            <Plus size={14} />
            New Task
          </Button>
        }
      />

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr>
                <Th>Title</Th>
                <Th>Entity</Th>
                <Th>Assigned To</Th>
                <Th>Due Date</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={6} />
              ) : tasks.length === 0 ? (
                <TableEmpty colSpan={6} message="No tasks assigned yet." />
              ) : (
                tasks.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell>
                      <Badge variant="info">{t.entityType}</Badge>
                    </TableCell>
                    <TableCell className="text-zinc-600 dark:text-zinc-400">{t.assignedTo}</TableCell>
                    <TableCell className="text-zinc-600 dark:text-zinc-400">
                      {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(t.status)}>{t.status.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell align="right">
                      <div className="flex justify-end gap-1">
                        {t.status === 'open' && (
                          <Button variant="outline" size="sm" onClick={() => handleStatusUpdate(t.id, 'in_progress')} disabled={updateStatus.isPending}>
                            Start
                          </Button>
                        )}
                        {(t.status === 'open' || t.status === 'in_progress') && (
                          <Button variant="outline" size="sm" onClick={() => handleStatusUpdate(t.id, 'completed')} disabled={updateStatus.isPending}>
                            Complete
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
