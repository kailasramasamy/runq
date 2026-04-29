import { useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  Skeleton,
  Button,
  Modal,
  Input,
  Textarea,
  useToast,
  Badge,
} from '@/components/ui';
import { api } from '@/lib/api-client';

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  defaultEnabled: boolean;
  rolloutPercentage: number;
  createdAt: string;
  updatedAt: string;
}

export function AdminFeatureFlagsPage() {
  const { toast } = useToast();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ data: FeatureFlag[] }>('/admin/feature-flags')
      .then((r) => setFlags(r.data))
      .catch(() => setFlags([]))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);

  const updateFlag = async (id: string, patch: Partial<FeatureFlag>) => {
    try {
      await api.patch(`/admin/feature-flags/${id}`, patch);
      toast('Flag updated', 'success');
      refresh();
    } catch {
      toast('Failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feature Flags"
        description="Toggle features globally or per-tenant"
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> New flag
          </Button>
        }
      />

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : flags.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-zinc-500">
            No feature flags yet. Create one to start rolling out features gradually.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {flags.map((f) => (
            <Card key={f.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold truncate">{f.name}</h3>
                    <code className="text-xs text-zinc-500">{f.key}</code>
                  </div>
                  <Badge variant={f.defaultEnabled ? 'success' : 'default'}>
                    {f.defaultEnabled ? 'On by default' : 'Off by default'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {f.description && <p className="text-sm text-zinc-600 dark:text-zinc-400">{f.description}</p>}
                <div className="flex items-center gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={f.defaultEnabled}
                      onChange={(e) => updateFlag(f.id, { defaultEnabled: e.target.checked })}
                      className="h-4 w-4 rounded"
                    />
                    Default enabled
                  </label>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-zinc-500">Rollout (%)</label>
                  <RolloutSlider
                    value={f.rolloutPercentage}
                    onCommit={(v) => updateFlag(f.id, { rolloutPercentage: v })}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateFlagModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function RolloutSlider({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        value={local}
        onChange={(e) => setLocal(parseInt(e.target.value, 10))}
        onMouseUp={() => onCommit(local)}
        onTouchEnd={() => onCommit(local)}
        className="flex-1"
      />
      <span className="font-mono text-sm w-12 text-right">{local}%</span>
    </div>
  );
}

function CreateFlagModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultEnabled, setDefaultEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/feature-flags', { key, name, description: description || null, defaultEnabled });
      toast('Flag created', 'success');
      onCreated();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Failed';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Create feature flag">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input label="Key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. ar.bulk-upload" required />
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={defaultEnabled} onChange={(e) => setDefaultEnabled(e.target.checked)} className="h-4 w-4 rounded" />
          Enable for all tenants by default
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>
            <Save className="h-4 w-4" /> Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
