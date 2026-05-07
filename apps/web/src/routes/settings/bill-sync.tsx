import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Plus, RefreshCw, Copy, Check, KeyRound, Power, ChevronRight } from 'lucide-react';
import {
  Card, CardContent, PageHeader, Button, Badge, Input, Select, Modal, Skeleton,
  useToast,
} from '@/components/ui';
import {
  useBillSyncSources, useCreateBillSyncSource, useRotateBillSyncKey, useToggleBillSyncSource,
  type BillSyncSource, type BillSyncSourceWithKey,
} from '@/hooks/queries/use-bill-sync';

export function BillSyncSettingsPage() {
  const { data, isLoading } = useBillSyncSources();
  const [showCreate, setShowCreate] = useState(false);
  const [revealedKey, setRevealedKey] = useState<BillSyncSourceWithKey | null>(null);
  const sources = data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bill sync sources"
        description="Connect external systems that push bills into runQ — accounting tools, payroll exports, point-of-sale apps, custom integrations."
        actions={
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus size={14} /> Add source
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : !sources.length ? (
        <EmptyState onAdd={() => setShowCreate(true)} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sources.map((s) => (
            <SourceCard key={s.id} source={s} onRevealNewKey={setRevealedKey} />
          ))}
        </div>
      )}

      <CreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(s) => { setShowCreate(false); setRevealedKey(s); }}
      />
      <ApiKeyModal source={revealedKey} onClose={() => setRevealedKey(null)} />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card>
      <CardContent>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
            <KeyRound size={20} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">No sources yet</h3>
            <p className="mt-1 max-w-md text-xs text-zinc-500 dark:text-zinc-400">
              Add an external system to start syncing bills automatically. Each source gets an API key your system uses to push bills directly, or you can upload bills as CSV.
            </p>
          </div>
          <Button size="sm" onClick={onAdd}><Plus size={14} /> Add source</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SourceCard({ source, onRevealNewKey }: { source: BillSyncSource; onRevealNewKey: (s: BillSyncSourceWithKey) => void }) {
  const rotate = useRotateBillSyncKey();
  const toggle = useToggleBillSyncSource();
  const { toast } = useToast();

  async function handleRotate(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!confirm(`Rotate API key for ${source.name}? The current key will stop working immediately.`)) return;
    try {
      const res = await rotate.mutateAsync(source.id);
      onRevealNewKey(res.data);
    } catch {
      toast('Failed to rotate key', 'error');
    }
  }

  function handleToggle(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    toggle.mutate({ id: source.id, isActive: !source.isActive });
  }

  return (
    <Link to="/settings/bill-sync/$id" params={{ id: source.id }}>
      <Card className="group h-full transition-colors hover:border-indigo-300 dark:hover:border-indigo-700/60">
        <CardContent>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{source.name}</h3>
                <Badge variant={source.isActive ? 'success' : 'default'}>
                  {source.isActive ? 'Active' : 'Disabled'}
                </Badge>
              </div>
              <code className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{source.slug}</code>
            </div>
            <ChevronRight size={16} className="mt-0.5 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800">
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Mode</dt>
              <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{source.mode === 'api' ? 'API push' : source.mode === 'csv' ? 'CSV upload' : 'API + CSV'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Last sync</dt>
              <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{source.lastSyncAt ? timeAgo(source.lastSyncAt) : 'Never'}</dd>
            </div>
          </dl>

          <div className="mt-3 flex gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
            <Button size="sm" variant="ghost" onClick={handleRotate} loading={rotate.isPending}>
              <RefreshCw size={12} /> Rotate key
            </Button>
            <Button size="sm" variant="ghost" onClick={handleToggle} loading={toggle.isPending}>
              <Power size={12} /> {source.isActive ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function CreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: BillSyncSourceWithKey) => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [mode, setMode] = useState<'api' | 'csv' | 'both'>('both');
  const create = useCreateBillSyncSource();
  const { toast } = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await create.mutateAsync({ name, slug, mode });
      onCreated(res.data);
      setName(''); setSlug(''); setMode('both');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create source', 'error');
    }
  }

  return (
    <Modal open={open} title="Add a new source" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Display name"
          placeholder="External billing system"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
          }}
          required
        />
        <Input
          label="Identifier"
          helper="Used in the X-Source-Slug header. Lowercase letters, numbers, hyphens only."
          placeholder="external-billing"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          required
        />
        <Select
          label="Ingestion mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as 'api' | 'csv' | 'both')}
          options={[
            { value: 'api', label: 'API push only — system calls runQ when bills are ready' },
            { value: 'csv', label: 'CSV upload only — bills uploaded manually as files' },
            { value: 'both', label: 'API + CSV — accept either' },
          ]}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={create.isPending}>Create source</Button>
        </div>
      </form>
    </Modal>
  );
}

function ApiKeyModal({ source, onClose }: { source: BillSyncSourceWithKey | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (!source) return;
    navigator.clipboard.writeText(source.apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Modal open={!!source} title="Save your API key" onClose={onClose}>
      {source && (
        <div className="space-y-4">
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
            This key is shown only once. Copy it now — it cannot be retrieved later. If you lose it, rotate to generate a new one.
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex items-center justify-between gap-2">
              <code className="break-all font-mono text-sm">{source.apiKey}</code>
              <Button size="sm" variant="ghost" onClick={copy}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
          <div className="space-y-2 text-xs text-zinc-500 dark:text-zinc-400">
            <div>Use these headers when calling <code className="font-mono">POST /api/v1/bill-sync/bills</code>:</div>
            <pre className="rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
{`X-Source-Slug: ${source.slug}
X-API-Key: ${source.apiKey}`}
            </pre>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
