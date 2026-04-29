import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import {
  PageHeader,
  Card,
  CardContent,
  Skeleton,
  Button,
  Modal,
  Input,
  Textarea,
  Combobox,
  Badge,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api-client';

type Severity = 'info' | 'warning' | 'critical';

interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: Severity;
  audience: Record<string, unknown>;
  startsAt: string;
  endsAt: string | null;
  dismissible: boolean;
  isActive: boolean;
  createdAt: string;
}

const SEVERITY_OPTIONS = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];

const SEVERITY_BADGE: Record<Severity, 'info' | 'warning' | 'danger'> = {
  info: 'info',
  warning: 'warning',
  critical: 'danger',
};

export function AdminAnnouncementsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ data: Announcement[] }>('/admin/announcements')
      .then((r) => setRows(r.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);

  const remove = async (a: Announcement) => {
    if (!window.confirm(`Delete announcement "${a.title}"?`)) return;
    try {
      await api.delete(`/admin/announcements/${a.id}`);
      toast('Deleted', 'success');
      refresh();
    } catch {
      toast('Failed', 'error');
    }
  };

  const toggleActive = async (a: Announcement) => {
    try {
      await api.patch(`/admin/announcements/${a.id}`, { isActive: !a.isActive });
      refresh();
    } catch {
      toast('Failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Banners shown inside tenant apps"
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setShowModal(true); }}>
            <Plus className="h-4 w-4" /> New announcement
          </Button>
        }
      />

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-zinc-500">
            No announcements yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant={SEVERITY_BADGE[a.severity]}>{a.severity}</Badge>
                      {a.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="default">Inactive</Badge>}
                      {a.endsAt && new Date(a.endsAt) < new Date() && <Badge variant="default">Expired</Badge>}
                    </div>
                    <h3 className="text-base font-semibold truncate">{a.title}</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-2">{a.body}</p>
                    <p className="text-xs text-zinc-500 mt-2">
                      {new Date(a.startsAt).toLocaleDateString()}
                      {a.endsAt ? ` → ${new Date(a.endsAt).toLocaleDateString()}` : ' → no end'}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(a)}>
                      {a.isActive ? 'Pause' : 'Resume'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(a); setShowModal(true); }}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(a)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <AnnouncementModal
          existing={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AnnouncementModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: Announcement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [severity, setSeverity] = useState(existing?.severity ?? 'info');
  const [endsAt, setEndsAt] = useState(existing?.endsAt ? existing.endsAt.slice(0, 10) : '');
  const [dismissible, setDismissible] = useState(existing?.dismissible ?? true);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title,
        body,
        severity,
        dismissible,
        endsAt: endsAt ? new Date(`${endsAt}T23:59:59Z`).toISOString() : null,
        audience: { all: true },
      };
      if (existing) {
        await api.patch(`/admin/announcements/${existing.id}`, payload);
      } else {
        await api.post('/admin/announcements', payload);
      }
      toast('Saved', 'success');
      onSaved();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Failed';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={existing ? 'Edit announcement' : 'New announcement'} wide>
      <form onSubmit={onSubmit} className="space-y-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Textarea label="Body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} required />
        <div className="grid grid-cols-2 gap-4">
          <Combobox label="Severity" options={SEVERITY_OPTIONS} value={severity} onChange={(v) => setSeverity(v as Severity)} />
          <Input label="Ends on (optional)" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={dismissible} onChange={(e) => setDismissible(e.target.checked)} className="h-4 w-4 rounded" />
          Allow users to dismiss
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{existing ? 'Save' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}
