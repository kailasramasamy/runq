import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Webhook, Database, Lock, FileText, RefreshCw } from 'lucide-react';
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  Skeleton,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  Badge,
  Button,
  Combobox,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api-client';

interface WebhookEventRow {
  id: string;
  tenantId: string;
  tenantName: string | null;
  eventType: string;
  source: string;
  status: 'received' | 'processing' | 'processed' | 'failed';
  errorMessage: string | null;
  retries: number;
  createdAt: string;
  processedAt: string | null;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'received', label: 'Received' },
  { value: 'processing', label: 'Processing' },
  { value: 'processed', label: 'Processed' },
  { value: 'failed', label: 'Failed' },
];

const STATUS_BADGE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  received: 'default',
  processing: 'warning',
  processed: 'success',
  failed: 'danger',
};

export function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Platform Settings" description="Internal tools, webhooks, data ops" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-indigo-500" />
              <h3 className="text-base font-semibold">GST credential vault</h3>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-zinc-600 dark:text-zinc-400">
              GSP credentials (White Books) are stored encrypted per tenant in the integrations table.
              Rotation is logged in the platform audit log.
            </p>
            <p className="text-xs text-zinc-500">No live UI yet — managed via tenant-side Settings → Integrations.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-500" />
              <h3 className="text-base font-semibold">Master data templates</h3>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-zinc-600 dark:text-zinc-400">
              Standard chart of accounts, default tax rates, and HSN/SAC catalog seed data.
            </p>
            <p className="text-xs text-zinc-500">Versioned in <code>packages/db/seeds</code>; future UI will let you publish revisions.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-indigo-500" />
              <h3 className="text-base font-semibold">Audit log</h3>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-zinc-600 dark:text-zinc-400">Every action you take in /admin is recorded.</p>
            <Link to="/admin/audit-log" className="inline-block text-sm text-indigo-600 hover:underline dark:text-indigo-400">
              Open audit log →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-indigo-500" />
              <h3 className="text-base font-semibold">Platform team</h3>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-zinc-600 dark:text-zinc-400">Manage platform users and their roles.</p>
            <Link to="/admin/users/platform" className="inline-block text-sm text-indigo-600 hover:underline dark:text-indigo-400">
              Manage platform users →
            </Link>
          </CardContent>
        </Card>
      </div>

      <WebhookEventsCard />
    </div>
  );
}

function WebhookEventsCard() {
  const { toast } = useToast();
  const [rows, setRows] = useState<WebhookEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    params.set('limit', '25');
    api
      .get<{ data: { rows: WebhookEventRow[] } }>(`/admin/system/webhook-events?${params}`)
      .then((r) => setRows(r.data.rows))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [status, reloadKey]);

  const replay = async (id: string) => {
    try {
      await api.post(`/admin/system/webhook-events/${id}/replay`, {});
      toast('Queued for replay', 'success');
      setReloadKey((k) => k + 1);
    } catch {
      toast('Failed', 'error');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-indigo-500" />
            <div>
              <h3 className="text-base font-semibold">Webhook events</h3>
              <p className="text-xs text-zinc-500">Cross-tenant view of inbound webhook deliveries</p>
            </div>
          </div>
          <div className="w-48">
            <Combobox options={STATUS_OPTIONS} value={status} onChange={setStatus} placeholder="Status" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6"><Skeleton className="h-32 w-full" /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-500">No events match.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Event</Th>
                <Th>Tenant</Th>
                <Th>Status</Th>
                <Th>Retries</Th>
                <Th>Received</Th>
                <Th className="text-right">Actions</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{e.eventType}</div>
                    <div className="text-xs text-zinc-500">{e.source}</div>
                  </TableCell>
                  <TableCell>
                    <Link to="/admin/tenants/$tenantId" params={{ tenantId: e.tenantId }} className="text-indigo-600 hover:underline dark:text-indigo-400">
                      {e.tenantName ?? e.tenantId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[e.status]}>{e.status}</Badge>
                    {e.errorMessage && <div className="text-[10px] text-red-500 mt-0.5 truncate max-w-xs" title={e.errorMessage}>{e.errorMessage}</div>}
                  </TableCell>
                  <TableCell className="font-mono">{e.retries}</TableCell>
                  <TableCell className="text-xs text-zinc-500">{new Date(e.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {e.status === 'failed' && (
                      <Button variant="ghost" size="sm" onClick={() => replay(e.id)}>
                        <RefreshCw className="h-4 w-4" /> Replay
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

