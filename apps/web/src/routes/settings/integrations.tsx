import { useState } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import {
  Card,
  CardContent,
  PageHeader,
  Button,
  Badge,
  Select,
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
  useIntegrations,
  useCreateIntegration,
  useUpdateIntegration,
  useTriggerSync,
} from '@/hooks/queries/use-integrations';

const PROVIDER_OPTIONS = [
  { value: '', label: 'Select provider...' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'razorpay', label: 'Razorpay' },
  { value: 'cashfree', label: 'Cashfree' },
  { value: 'tally', label: 'Tally' },
  { value: 'google_sheets', label: 'Google Sheets' },
  { value: 'slack', label: 'Slack' },
  { value: 'teams', label: 'Microsoft Teams' },
];

// ─── Create Form ─────────────────────────────────────────────────────────────

function CreateForm({ onClose }: { onClose: () => void }) {
  const create = useCreateIntegration();
  const { toast } = useToast();
  const [provider, setProvider] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({ provider });
      toast('Integration added', 'success');
      onClose();
    } catch {
      toast('Failed to add integration', 'error');
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Add Integration</h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="w-64">
          <Select label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)} options={PROVIDER_OPTIONS} required />
        </div>
        <Button type="submit" loading={create.isPending} size="sm"><Plus size={14} /> Add</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </form>
    </div>
  );
}

// ─── Integrations Page ───────────────────────────────────────────────────────

export function IntegrationsPage() {
  const { data, isLoading } = useIntegrations();
  const updateIntegration = useUpdateIntegration();
  const triggerSync = useTriggerSync();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);

  const integrations = data?.data ?? [];

  async function handleToggle(id: string, currentlyActive: boolean) {
    try {
      await updateIntegration.mutateAsync({ id, isActive: !currentlyActive });
      toast(`Integration ${currentlyActive ? 'deactivated' : 'activated'}`, 'success');
    } catch {
      toast('Failed to update integration', 'error');
    }
  }

  async function handleSync(id: string) {
    try {
      await triggerSync.mutateAsync({ id, action: 'full_sync' });
      toast('Sync triggered', 'success');
    } catch {
      toast('Failed to trigger sync', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Integrations"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Integrations' }]}
        description="Connect external services to sync data automatically."
        actions={
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            <Plus size={14} />
            Add Integration
          </Button>
        }
      />

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr>
                <Th>Provider</Th>
                <Th>Status</Th>
                <Th>Last Sync</Th>
                <Th align="right">Actions</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={4} cols={4} />
              ) : integrations.length === 0 ? (
                <TableEmpty colSpan={4} message="No integrations configured yet." />
              ) : (
                integrations.map((int) => (
                  <TableRow key={int.id}>
                    <TableCell className="font-medium capitalize">{int.provider.replace('_', ' ')}</TableCell>
                    <TableCell>
                      <Badge variant={int.isActive ? 'success' : 'default'}>
                        {int.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-600 dark:text-zinc-400">
                      {int.lastSyncAt
                        ? new Date(int.lastSyncAt).toLocaleString()
                        : 'Never'}
                    </TableCell>
                    <TableCell align="right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggle(int.id, int.isActive)}
                          disabled={updateIntegration.isPending}
                        >
                          {int.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        {int.isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSync(int.id)}
                            disabled={triggerSync.isPending}
                          >
                            <RefreshCw size={14} /> Sync
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
