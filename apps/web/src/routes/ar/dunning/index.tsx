import { useState } from 'react';
import { Bell, BookOpen, History, Send } from 'lucide-react';
import {
  useOverdueInvoices,
  useSendReminders,
  useDunningRules,
  useCreateDunningRule,
  useUpdateDunningRule,
  useDunningLog,
} from '../../../hooks/queries/use-dunning';
import type { DunningRule, DunningLogEntry, DunningChannel } from '@runq/types';
import type { OverdueInvoice } from '../../../hooks/queries/use-dunning';
import { formatINR } from '../../../lib/utils';
import {
  PageHeader,
  Badge,
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Select,
  Input,
  Textarea,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  TableSkeleton,
  EmptyState,
  useToast,
} from '@/components/ui';

type Tab = 'overdue' | 'rules' | 'log';

const CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const CHANNEL_FILTER_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const LOG_STATUS_VARIANT: Record<string, 'info' | 'success' | 'danger'> = {
  sent: 'info',
  delivered: 'success',
  failed: 'danger',
};

// ─── Overdue Invoices Tab ─────────────────────────────────────────────────────

function OverdueTab() {
  const { data, isLoading } = useOverdueInvoices();
  const sendMutation = useSendReminders();
  const { toast } = useToast();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<DunningChannel>('email');

  const invoices = data?.data ?? [];

  function toggleAll() {
    if (selected.size === invoices.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(invoices.map((inv) => inv.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSend() {
    sendMutation.mutate(
      { invoiceIds: Array.from(selected), channel },
      {
        onSuccess: (res) => {
          toast(`Sent ${res.data.logged} reminder${res.data.logged !== 1 ? 's' : ''}.`, 'success');
          setSelected(new Set());
        },
        onError: () => toast('Failed to send reminders.', 'error'),
      },
    );
  }

  function daysOverdue(dueDate: string): number {
    const due = new Date(dueDate);
    const today = new Date();
    return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-3">
          <div className="w-44">
            <Select
              label="Channel"
              options={CHANNEL_OPTIONS}
              value={channel}
              onChange={(e) => setChannel(e.target.value as DunningChannel)}
            />
          </div>
          <Button
            onClick={handleSend}
            loading={sendMutation.isPending}
            disabled={selected.size === 0 || sendMutation.isPending}
          >
            <Send size={14} className="mr-1.5" />
            Send Reminders ({selected.size})
          </Button>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <tr>
            <Th className="w-10">
              <input
                type="checkbox"
                checked={selected.size > 0 && selected.size === invoices.length}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              />
            </Th>
            <Th>Invoice #</Th>
            <Th>Customer</Th>
            <Th>Due Date</Th>
            <Th align="right">Days Overdue</Th>
            <Th align="right">Amount</Th>
            <Th align="right">Balance Due</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : invoices.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  icon={Bell}
                  title="No overdue invoices"
                  description="All customer invoices are within their payment terms."
                />
              </td>
            </tr>
          ) : (
            invoices.map((inv: OverdueInvoice) => (
              <TableRow key={inv.id} className={selected.has(inv.id) ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(inv.id)}
                    onChange={() => toggleOne(inv.id)}
                    className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {inv.customerId.slice(0, 8)}…
                </TableCell>
                <TableCell className="text-zinc-600 dark:text-zinc-400">{inv.dueDate}</TableCell>
                <TableCell align="right" numeric>
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    {daysOverdue(inv.dueDate)}d
                  </span>
                </TableCell>
                <TableCell align="right" numeric>{formatINR(inv.totalAmount)}</TableCell>
                <TableCell align="right" numeric className="font-medium">{formatINR(inv.balanceDue)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Rules Tab ────────────────────────────────────────────────────────────────

function RuleRow({ rule }: { rule: DunningRule }) {
  return (
    <TableRow>
      <TableCell className="font-medium text-zinc-900 dark:text-zinc-100">{rule.name}</TableCell>
      <TableCell align="right" numeric>{rule.daysAfterDue}d</TableCell>
      <TableCell className="capitalize text-zinc-600 dark:text-zinc-400">{rule.channel}</TableCell>
      <TableCell className="max-w-[240px] truncate text-xs text-zinc-500 dark:text-zinc-400">
        {rule.bodyTemplate}
      </TableCell>
      <TableCell>
        <Badge variant={rule.isActive ? 'success' : 'outline'}>
          {rule.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

function RulesTab() {
  const { data, isLoading } = useDunningRules();
  const createMutation = useCreateDunningRule();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [daysAfterDue, setDaysAfterDue] = useState('');
  const [channel, setChannel] = useState<DunningChannel>('email');
  const [bodyTemplate, setBodyTemplate] = useState('');

  const rules = (data?.data ?? []) as DunningRule[];

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(
      { name, daysAfterDue: Number(daysAfterDue), channel, bodyTemplate, isActive: true },
      {
        onSuccess: () => {
          toast('Dunning rule created.', 'success');
          setShowForm(false);
          setName('');
          setDaysAfterDue('');
          setBodyTemplate('');
        },
        onError: () => toast('Failed to create rule.', 'error'),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'New Rule'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader title="Create Dunning Rule" />
          <form onSubmit={handleCreate}>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Rule Name"
                  required
                  placeholder="e.g. 7-day reminder"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Input
                  label="Days After Due"
                  required
                  type="number"
                  min={1}
                  placeholder="7"
                  value={daysAfterDue}
                  onChange={(e) => setDaysAfterDue(e.target.value)}
                />
                <Select
                  label="Channel"
                  options={CHANNEL_OPTIONS}
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as DunningChannel)}
                />
                <div className="col-span-2">
                  <Textarea
                    label="Body Template"
                    required
                    placeholder="Dear {{customer_name}}, your invoice {{invoice_number}} is overdue…"
                    value={bodyTemplate}
                    onChange={(e) => setBodyTemplate(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button type="submit" loading={createMutation.isPending}>
                Save Rule
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Name</Th>
            <Th align="right">Days After Due</Th>
            <Th>Channel</Th>
            <Th>Template Preview</Th>
            <Th>Status</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={4} cols={5} />
          ) : rules.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <EmptyState
                  icon={BookOpen}
                  title="No dunning rules"
                  description="Create rules to automate payment reminders for overdue invoices."
                />
              </td>
            </tr>
          ) : (
            rules.map((rule) => <RuleRow key={rule.id} rule={rule} />)
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Log Tab ──────────────────────────────────────────────────────────────────

function LogTab() {
  const { data, isLoading } = useDunningLog();
  const entries = data?.data ?? [];

  return (
    <Table>
      <TableHeader>
        <tr>
          <Th>Invoice #</Th>
          <Th>Customer</Th>
          <Th>Channel</Th>
          <Th>Sent At</Th>
          <Th>Status</Th>
        </tr>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : entries.length === 0 ? (
          <tr>
            <td colSpan={5}>
              <EmptyState
                icon={History}
                title="No reminders sent yet"
                description="Sent reminders will appear here."
              />
            </td>
          </tr>
        ) : (
          entries.map((entry: any) => (
            <TableRow key={entry.id}>
              <TableCell className="font-medium">{entry.invoiceNumber ?? entry.invoiceId.slice(0, 8)}</TableCell>
              <TableCell>
                <div>{entry.customerName ?? '—'}</div>
                {entry.customerEmail && (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{entry.customerEmail}</div>
                )}
              </TableCell>
              <TableCell className="capitalize text-zinc-600 dark:text-zinc-400">{entry.channel}</TableCell>
              <TableCell className="text-zinc-600 dark:text-zinc-400">
                {new Date(entry.sentAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <Badge variant={LOG_STATUS_VARIANT[entry.status] ?? 'outline'} className="capitalize">
                  {entry.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: 'overdue', label: 'Overdue Invoices' },
  { id: 'rules', label: 'Rules' },
  { id: 'log', label: 'Log' },
];

export function DunningPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overdue');

  return (
    <div>
      <PageHeader
        title="Dunning"
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Dunning' }]}
      />

      <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800">
        <nav className="flex gap-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={[
                'border-b-2 -mb-px px-4 py-2 text-sm font-medium transition-colors',
                activeTab === id
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'overdue' && <OverdueTab />}
      {activeTab === 'rules' && <RulesTab />}
      {activeTab === 'log' && <LogTab />}
    </div>
  );
}
