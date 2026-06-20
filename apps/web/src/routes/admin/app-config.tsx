import { useEffect, useMemo, useState } from 'react';
import { Smartphone, AlertTriangle, Save } from 'lucide-react';
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  Skeleton,
  Button,
  Input,
  Textarea,
  Badge,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api-client';

interface ConfigRow {
  key: string;
  value: unknown;
  updatedAt: string;
  updatedBy: string | null;
}

const FIELDS: Array<{
  key: string;
  label: string;
  description: string;
  group: 'mobile' | 'dhenu' | 'maintenance';
  type: 'string' | 'multiline' | 'boolean';
}> = [
  { key: 'mobile.currentVersion', label: 'Current version', description: 'The latest version on the stores. Older clients see a soft "update available" prompt.', group: 'mobile', type: 'string' },
  { key: 'mobile.minVersion', label: 'Minimum version', description: 'Below this, the app blocks usage and forces an update.', group: 'mobile', type: 'string' },
  { key: 'mobile.forceUpdateMessage', label: 'Force-update message', description: 'Shown in the blocking dialog.', group: 'mobile', type: 'multiline' },
  { key: 'dhenu.currentVersion', label: 'Current version', description: 'The latest Dhenu version on the stores (reserved for a future "update available" prompt).', group: 'dhenu', type: 'string' },
  { key: 'dhenu.minVersion', label: 'Minimum version', description: 'Below this, Dhenu hard-blocks and forces an update. Bump this to force all old clients to update.', group: 'dhenu', type: 'string' },
  { key: 'dhenu.forceUpdateMessage', label: 'Force-update message', description: 'Shown on the Dhenu blocking screen.', group: 'dhenu', type: 'multiline' },
  { key: 'dhenu.androidStoreUrl', label: 'Android store URL', description: 'Play Store link opened by the "Update Now" button on Android.', group: 'dhenu', type: 'string' },
  { key: 'dhenu.iosStoreUrl', label: 'iOS store URL', description: 'App Store link opened by the "Update Now" button on iOS.', group: 'dhenu', type: 'string' },
  { key: 'platform.maintenance.enabled', label: 'Maintenance mode', description: 'When ON, all clients show the maintenance message and writes are blocked.', group: 'maintenance', type: 'boolean' },
  { key: 'platform.maintenance.message', label: 'Maintenance message', description: 'Banner shown to all users when maintenance is on.', group: 'maintenance', type: 'multiline' },
];

export function AdminAppConfigPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: ConfigRow[] }>('/admin/app-config')
      .then((r) => setRows(r.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const valueMap = useMemo(() => new Map(rows.map((r) => [r.key, r.value])), [rows]);

  const setEdit = (key: string, value: unknown) => setEdits((e) => ({ ...e, [key]: value }));

  const save = async (key: string) => {
    const value = key in edits ? edits[key] : valueMap.get(key);
    setSaving(key);
    try {
      await api.put(`/admin/app-config/${encodeURIComponent(key)}`, { value });
      toast('Saved', 'success');
      // refresh row
      const fresh = await api.get<{ data: ConfigRow[] }>('/admin/app-config');
      setRows(fresh.data);
      setEdits((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Failed';
      toast(msg, 'error');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="App Config" description="Mobile app settings, force update, maintenance mode" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const maintenanceOn = (key: string) => {
    const v = key in edits ? edits[key] : valueMap.get(key);
    return v === true;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="App Config" description="Manage runtime configuration without redeploying the API" />

      {maintenanceOn('platform.maintenance.enabled') && (
        <div className="flex items-center gap-3 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <strong>Maintenance mode is ON.</strong> All clients are seeing the maintenance message.
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-indigo-500" />
            <h2 className="text-base font-semibold">Mobile app</h2>
          </div>
          <p className="text-xs text-zinc-500">Pushed to clients via /api/v1/public/app-config (60s redis cache).</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {FIELDS.filter((f) => f.group === 'mobile').map((f) => (
            <ConfigField
              key={f.key}
              field={f}
              value={f.key in edits ? edits[f.key] : valueMap.get(f.key)}
              onChange={(v) => setEdit(f.key, v)}
              dirty={f.key in edits}
              saving={saving === f.key}
              onSave={() => save(f.key)}
              row={rows.find((r) => r.key === f.key)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-emerald-500" />
            <h2 className="text-base font-semibold">Dhenu app</h2>
          </div>
          <p className="text-xs text-zinc-500">Milk-procurement app (separate store listing). Bump minimum version to force users to update.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {FIELDS.filter((f) => f.group === 'dhenu').map((f) => (
            <ConfigField
              key={f.key}
              field={f}
              value={f.key in edits ? edits[f.key] : valueMap.get(f.key)}
              onChange={(v) => setEdit(f.key, v)}
              dirty={f.key in edits}
              saving={saving === f.key}
              onSave={() => save(f.key)}
              row={rows.find((r) => r.key === f.key)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h2 className="text-base font-semibold">Maintenance mode</h2>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {FIELDS.filter((f) => f.group === 'maintenance').map((f) => (
            <ConfigField
              key={f.key}
              field={f}
              value={f.key in edits ? edits[f.key] : valueMap.get(f.key)}
              onChange={(v) => setEdit(f.key, v)}
              dirty={f.key in edits}
              saving={saving === f.key}
              onSave={() => save(f.key)}
              row={rows.find((r) => r.key === f.key)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ConfigField({
  field,
  value,
  onChange,
  dirty,
  saving,
  onSave,
  row,
}: {
  field: { key: string; label: string; description: string; type: 'string' | 'multiline' | 'boolean' };
  value: unknown;
  onChange: (v: unknown) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  row: ConfigRow | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <label className="block text-sm font-medium">{field.label}</label>
          <code className="text-[10px] text-zinc-500">{field.key}</code>
        </div>
        {dirty && <Badge variant="warning">Unsaved</Badge>}
      </div>
      {field.description && <p className="text-xs text-zinc-500">{field.description}</p>}
      <div className="flex items-start gap-2">
        <div className="flex-1">
          {field.type === 'boolean' ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value === true}
                onChange={(e) => onChange(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              {value === true ? 'Enabled' : 'Disabled'}
            </label>
          ) : field.type === 'multiline' ? (
            <Textarea value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} rows={3} />
          ) : (
            <Input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
          )}
        </div>
        <Button size="sm" onClick={onSave} loading={saving} disabled={!dirty} variant={dirty ? 'primary' : 'secondary'}>
          <Save className="h-4 w-4" />
        </Button>
      </div>
      {row && (
        <p className="text-[10px] text-zinc-400">
          Last updated {new Date(row.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
