import { useState, useMemo } from 'react';
import { Bell, BookOpen, History, Search, Send, Mail, MessageCircle, Pencil, Play, Plus } from 'lucide-react';
import {
  useOverdueInvoices,
  useSendReminders,
  useDunningRules,
  useCreateDunningRule,
  useDunningLog,
} from '@/hooks/queries/use-dunning';
import type { DunningRule, DunningChannel, DunningAction } from '@runq/types';
import type { OverdueInvoice } from '@/hooks/queries/use-dunning';
import { formatINR, formatINRShort } from '@/lib/utils';
import {
  PageHeader, Button, Input, Select as ArSelect, StatTile, StatusBadge, Badge,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  EmptyState, Tabs, Toggle, formatDate,
} from '@/components/ar/primitives';
import {
  Card, CardHeader, CardContent, CardFooter,
  Select, Input as UIInput, Textarea, TableSkeleton, useToast,
  Button as UIButton,
} from '@/components/ui';

type Tab = 'overdue' | 'rules' | 'log';

const CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const ACTION_OPTIONS = [
  { value: 'send_reminder', label: 'Send Reminder' },
  { value: 'stop_supply', label: 'Stop Supply' },
  { value: 'escalate_to_manager', label: 'Escalate to Manager' },
];

function daysOverdueOf(dueDate: string): number {
  const due = new Date(dueDate);
  const today = new Date();
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
}

// ─── Header / Page ──────────────────────────────────────────────────────────

export function DunningPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overdue');

  const { data: overdueData } = useOverdueInvoices();
  const { data: rulesData } = useDunningRules();
  const { data: logData } = useDunningLog();

  const overdue = overdueData?.data ?? [];
  const rules = (rulesData?.data ?? []) as DunningRule[];
  const log = logData?.data ?? [];

  const totalBalance = overdue.reduce((a, o) => a + o.balanceDue, 0);
  const activeRules = rules.filter((r) => r.isActive).length;
  const delivered = log.filter((l: any) => l.status === 'delivered').length;
  const failed = log.filter((l: any) => l.status === 'failed').length;

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Dunning' }]}
        title="Dunning"
        description="Automated reminders, escalation rules, and a log of every nudge sent."
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Play size={13} />}>Run dunning now</Button>
            <Button size="sm" icon={<Plus size={13} />}>
              {activeTab === 'rules' ? 'New rule' : 'Send reminder'}
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Overdue invoices"
          value={overdue.length}
          sub={formatINRShort(totalBalance)}
          tone="neg"
        />
        <StatTile label="Active rules" value={activeRules} sub={`of ${rules.length} configured`} />
        <StatTile label="Reminders sent" value={log.length} sub={`${delivered} delivered`} />
        <StatTile label="Failed deliveries" value={failed} sub="Need review" tone={failed > 0 ? 'warn' : 'neutral'} />
      </div>

      <Tabs<Tab>
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'overdue', label: 'Overdue invoices', count: overdue.length },
          { id: 'rules', label: 'Rules', count: rules.length },
          { id: 'log', label: 'Activity log', count: log.length },
        ]}
      />

      {activeTab === 'overdue' && <OverdueTab />}
      {activeTab === 'rules' && <RulesTab />}
      {activeTab === 'log' && <LogTab />}
    </div>
  );
}

// ─── Overdue tab ────────────────────────────────────────────────────────────

function OverdueTab() {
  const { data, isLoading } = useOverdueInvoices();
  const sendMutation = useSendReminders();
  const { toast } = useToast();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<DunningChannel>('email');
  const [search, setSearch] = useState('');

  const allInvoices = data?.data ?? [];
  const invoices = useMemo(() => {
    if (!search.trim()) return allInvoices;
    const q = search.toLowerCase();
    return allInvoices.filter(
      (inv) => inv.invoiceNumber.toLowerCase().includes(q) || inv.customerName?.toLowerCase().includes(q),
    );
  }, [allInvoices, search]);

  const { data: rulesData } = useDunningRules();
  const rules = (rulesData?.data ?? []) as DunningRule[];

  function toggleAll() {
    if (selected.size === invoices.length) setSelected(new Set());
    else setSelected(new Set(invoices.map((inv) => inv.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function handleSend(ids?: string[]) {
    const target = ids ?? Array.from(selected);
    if (target.length === 0) return;
    sendMutation.mutate(
      { invoiceIds: target, channel },
      {
        onSuccess: (res) => {
          const { logged, sent, failed } = res.data;
          const msg = sent > 0
            ? `Sent ${sent} email${sent !== 1 ? 's' : ''}${failed ? `, ${failed} failed` : ''}.`
            : `Logged ${logged} reminder${logged !== 1 ? 's' : ''}.`;
          toast(msg, failed ? 'error' : 'success');
          setSelected(new Set());
        },
        onError: () => toast('Failed to send reminders.', 'error'),
      },
    );
  }

  function nextRuleFor(daysOverdue: number): DunningRule | undefined {
    return rules
      .filter((r) => r.isActive && r.daysAfterDue <= daysOverdue)
      .sort((a, b) => b.daysAfterDue - a.daysAfterDue)[0];
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-72 max-w-full">
          <Input
            icon={<Search size={13} />}
            placeholder="Search invoice # or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <ArSelect
          options={CHANNEL_OPTIONS}
          value={channel}
          onChange={(e) => setChannel(e.target.value as DunningChannel)}
        />
        <Button
          size="sm"
          icon={<Send size={13} />}
          onClick={() => handleSend()}
          loading={sendMutation.isPending}
          disabled={selected.size === 0}
        >
          Send reminders ({selected.size})
        </Button>
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{invoices.length} overdue</span>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>
              <input
                type="checkbox"
                checked={selected.size > 0 && selected.size === invoices.length}
                onChange={toggleAll}
                aria-label="Select all"
              />
            </Th>
            <Th>Invoice</Th>
            <Th>Customer</Th>
            <Th>Due</Th>
            <Th align="right">Days overdue</Th>
            <Th align="right">Balance</Th>
            <Th>Next rule</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={5} cols={8} />
          ) : invoices.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <EmptyState
                  icon={<Bell size={18} />}
                  title="No overdue invoices"
                  description="All customer invoices are within their payment terms."
                />
              </td>
            </tr>
          ) : invoices.map((inv: OverdueInvoice) => {
            const days = daysOverdueOf(inv.dueDate);
            const rule = nextRuleFor(days);
            return (
              <TableRow key={inv.id}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(inv.id)}
                    onChange={() => toggleOne(inv.id)}
                    aria-label={`Select ${inv.invoiceNumber}`}
                  />
                </TableCell>
                <TableCell>
                  <span className="num text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>
                    {inv.invoiceNumber}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="font-medium" style={{ color: 'var(--text-1)' }}>
                    {inv.customerName ?? `${inv.customerId.slice(0, 8)}…`}
                  </div>
                </TableCell>
                <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(inv.dueDate)}</TableCell>
                <TableCell align="right" numeric>
                  <span className="font-semibold" style={{ color: days >= 30 ? 'var(--neg)' : 'var(--warn)' }}>
                    {days}d
                  </span>
                </TableCell>
                <TableCell align="right" numeric className="font-semibold">{formatINR(inv.balanceDue)}</TableCell>
                <TableCell>
                  {rule ? (
                    <span className="text-[11.5px]" style={{ color: 'var(--text-2)' }}>{rule.name}</span>
                  ) : (
                    <span className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>—</span>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Button
                    size="sm"
                    icon={<Send size={12} />}
                    onClick={() => handleSend([inv.id])}
                    loading={sendMutation.isPending}
                  >
                    Send now
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Rules tab ──────────────────────────────────────────────────────────────

function RulesTab() {
  const { data, isLoading } = useDunningRules();
  const createMutation = useCreateDunningRule();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [daysAfterDue, setDaysAfterDue] = useState('');
  const [channel, setChannel] = useState<DunningChannel>('email');
  const [action, setAction] = useState<DunningAction>('send_reminder');
  const [bodyTemplate, setBodyTemplate] = useState('');

  const rules = (data?.data ?? []) as DunningRule[];

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(
      { name, daysAfterDue: Number(daysAfterDue), channel, action, bodyTemplate, isActive: true, escalationLevel: 1 },
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
        <Button size="sm" icon={<Plus size={13} />} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'New rule'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader title="Create dunning rule" />
          <form onSubmit={handleCreate}>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <UIInput label="Rule name" required placeholder="e.g. 7-day reminder" value={name} onChange={(e) => setName(e.target.value)} />
                <UIInput label="Days after due" required type="number" min={1} placeholder="7" value={daysAfterDue} onChange={(e) => setDaysAfterDue(e.target.value)} />
                <Select label="Channel" options={CHANNEL_OPTIONS} value={channel} onChange={(e) => setChannel(e.target.value as DunningChannel)} />
                <Select label="Action" options={ACTION_OPTIONS} value={action} onChange={(e) => setAction(e.target.value as DunningAction)} />
                <div className="col-span-2">
                  <Textarea
                    label="Body template"
                    required
                    placeholder="Dear {{customer_name}}, your invoice {{invoice_number}} is overdue…"
                    value={bodyTemplate}
                    onChange={(e) => setBodyTemplate(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <UIButton type="submit" loading={createMutation.isPending}>Save rule</UIButton>
            </CardFooter>
          </form>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
            />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <EmptyState
            icon={<BookOpen size={18} />}
            title="No dunning rules"
            description="Create rules to automate payment reminders for overdue invoices."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((r) => <RuleCard key={r.id} rule={r} />)}
        </div>
      )}
    </div>
  );
}

function RuleCard({ rule }: { rule: DunningRule }) {
  const ChannelIcon = rule.channel === 'whatsapp' ? MessageCircle : Mail;
  const level = rule.escalationLevel ?? 1;
  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
        >
          <ChannelIcon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>{rule.name}</span>
            <Badge variant={level === 3 ? 'danger' : level === 2 ? 'warning' : 'info'}>
              Level {level}
            </Badge>
            <Badge variant="default">{rule.channel}</Badge>
            {!rule.isActive && <Badge variant="outline">Disabled</Badge>}
          </div>
          <div className="mt-1.5 text-[12px]" style={{ color: 'var(--text-2)' }}>
            Triggers <span className="num font-medium" style={{ color: 'var(--text-1)' }}>{rule.daysAfterDue}</span>
            {' '}day{rule.daysAfterDue > 1 ? 's' : ''} after due date · Action:{' '}
            <span style={{ color: 'var(--text-1)' }}>
              {(rule.action ?? 'send_reminder').replace(/_/g, ' ')}
            </span>
          </div>
          <div
            className="mt-2.5 rounded-md border px-3 py-2 text-[11.5px] leading-relaxed"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}
          >
            {rule.bodyTemplate}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Toggle on={rule.isActive} />
          <Button size="sm" variant="outline" icon={<Pencil size={12} />}>Edit</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Log tab ────────────────────────────────────────────────────────────────

function LogTab() {
  const { data, isLoading } = useDunningLog();
  const entries = (data?.data ?? []) as any[];

  return (
    <Table>
      <TableHeader>
        <tr>
          <Th>Sent at</Th>
          <Th>Invoice</Th>
          <Th>Customer</Th>
          <Th>Channel</Th>
          <Th>Recipient</Th>
          <Th>Status</Th>
        </tr>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : entries.length === 0 ? (
          <tr>
            <td colSpan={6}>
              <EmptyState
                icon={<History size={18} />}
                title="No reminders sent yet"
                description="Sent reminders will appear here."
              />
            </td>
          </tr>
        ) : entries.map((e: any) => {
          const ChannelIcon = e.channel === 'whatsapp' ? MessageCircle : Mail;
          return (
            <TableRow key={e.id}>
              <TableCell numeric style={{ color: 'var(--text-2)' }}>
                {e.sentAt.slice(0, 10)} <span style={{ color: 'var(--text-3)' }}>{e.sentAt.slice(11, 16)}</span>
              </TableCell>
              <TableCell>
                <span className="num text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>
                  {e.invoiceNumber ?? `${e.invoiceId.slice(0, 8)}…`}
                </span>
              </TableCell>
              <TableCell>
                <span className="font-medium" style={{ color: 'var(--text-1)' }}>{e.customerName ?? '—'}</span>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--text-2)' }}>
                  <ChannelIcon size={11} style={{ color: 'var(--text-3)' }} />
                  <span className="capitalize">{e.channel}</span>
                </span>
              </TableCell>
              <TableCell numeric style={{ color: 'var(--text-2)' }}>{e.customerEmail ?? '—'}</TableCell>
              <TableCell><StatusBadge status={e.status} /></TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
