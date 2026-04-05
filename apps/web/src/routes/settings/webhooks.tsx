import { useState } from 'react';
import { Zap, Trash2, Play, Eye, EyeOff } from 'lucide-react';
import { PageHeader, Button, Badge, Input, Textarea, Table, TableHeader, TableBody, TableRow, TableCell, Th, Card, CardContent, useToast } from '@/components/ui';
import { useWebhookEndpoints, useCreateWebhookEndpoint, useDeleteWebhookEndpoint, useTestWebhook, type WebhookEndpoint } from '@/hooks/queries/use-webhooks';

const EVENT_TYPES = [
  'invoice.created', 'invoice.paid', 'payment.created',
  'bill.created', 'bill.paid', 'vendor.created',
  'customer.created', 'receipt.created',
  'expense_claim.submitted', 'expense_claim.approved',
] as const;

export function WebhooksPage() {
  const { data, isLoading } = useWebhookEndpoints();
  const endpoints = data?.data ?? [];
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader title="Webhook Endpoints" icon={Zap}>
        <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : 'Add Endpoint'}</Button>
      </PageHeader>

      {showForm && <CreateForm onDone={() => setShowForm(false)} />}

      {isLoading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : endpoints.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-zinc-400">No webhook endpoints configured.</CardContent></Card>
      ) : (
        <EndpointsTable endpoints={endpoints} />
      )}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [desc, setDesc] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const create = useCreateWebhookEndpoint();
  const { toast } = useToast();

  function toggle(e: string) {
    setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!url.trim() || events.length === 0) return;
    create.mutate({ url: url.trim(), description: desc.trim() || undefined, events }, {
      onSuccess: (res) => {
        const s = res.data?.secret;
        if (s) { setSecret(s); toast({ title: 'Endpoint created. Copy your secret now -- it won\'t be shown again.' }); }
        else { toast({ title: 'Webhook endpoint created' }); onDone(); }
      },
    });
  }

  if (secret) {
    return (
      <Card>
        <CardContent className="space-y-3 py-4">
          <p className="text-sm font-medium">Signing Secret (copy now, shown only once):</p>
          <code className="block rounded bg-zinc-100 px-3 py-2 text-sm font-mono dark:bg-zinc-800 break-all">{secret}</code>
          <Button onClick={onDone}>Done</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Endpoint URL</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhook" />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Optional description" />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Events</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {EVENT_TYPES.map((et) => (
                <label key={et} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={events.includes(et)} onChange={() => toggle(et)} className="rounded border-zinc-300" />
                  <span className="font-mono text-xs">{et}</span>
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={create.isPending}>Create Endpoint</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EndpointsTable({ endpoints }: { endpoints: WebhookEndpoint[] }) {
  const del = useDeleteWebhookEndpoint();
  const test = useTestWebhook();
  const { toast } = useToast();

  function handleTest(id: string) {
    test.mutate(id, {
      onSuccess: () => toast({ title: 'Test ping sent' }),
      onError: () => toast({ title: 'Test failed', variant: 'destructive' }),
    });
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this webhook endpoint?')) return;
    del.mutate(id);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>URL</Th>
          <Th>Events</Th>
          <Th>Status</Th>
          <Th>Failures</Th>
          <Th>Last Delivered</Th>
          <Th>Actions</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {endpoints.map((ep) => (
          <TableRow key={ep.id}>
            <TableCell>
              <span className="font-mono text-xs break-all">{ep.url}</span>
              {ep.description && <p className="text-xs text-zinc-400 mt-0.5">{ep.description}</p>}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {ep.events.slice(0, 3).map((e) => (
                  <Badge key={e} variant="secondary" className="text-[10px] font-mono">{e}</Badge>
                ))}
                {ep.events.length > 3 && <Badge variant="secondary" className="text-[10px]">+{ep.events.length - 3}</Badge>}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={ep.isActive ? 'default' : 'secondary'}>{ep.isActive ? 'Active' : 'Inactive'}</Badge>
            </TableCell>
            <TableCell className="tabular-nums">{ep.failureCount}</TableCell>
            <TableCell className="text-xs text-zinc-500">{ep.lastDeliveredAt ?? '--'}</TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => handleTest(ep.id)} title="Send test ping">
                  <Play className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(ep.id)} title="Delete">
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
