import { useState } from 'react';
import {
  Pin, Plus, Megaphone, Trash2, UserPlus, LogOut, CheckCircle2, XCircle,
  Wallet, FileText, Receipt, History,
} from 'lucide-react';
import { Modal, useToast } from '@/components/ui';
import {
  useAnnouncements, useCreateAnnouncement, useDeleteAnnouncement,
  useRecentActivity,
  type Announcement, type ActivityEvent, type ActivityKind,
} from '@/hooks/queries/use-hr';
import { useAuth } from '@/providers/auth-provider';

/** Manager-dashboard companion to mobile's announcement + activity feeds.
 *  Same backend, same derivations, same accent palette. */

// ─── Shared shell ──────────────────────────────────────────────────────────

function SectionCard({
  title, action, empty, children,
}: {
  title: string;
  action?: React.ReactNode;
  empty?: { icon: any; text: string } | null;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
          {title}
        </div>
        {action}
      </div>
      {empty ? <EmptyRow icon={empty.icon} text={empty.text} /> : children}
    </div>
  );
}

function EmptyRow({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-3 py-3"
      style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
      <Icon size={16} />
      <span className="text-[12px]">{text}</span>
    </div>
  );
}

// ─── Announcements ─────────────────────────────────────────────────────────

export function AnnouncementsSection() {
  const { data, isLoading } = useAnnouncements();
  const { user } = useAuth();
  const canPost = user?.role === 'owner';
  const [postOpen, setPostOpen] = useState(false);
  const rows = data?.data ?? [];
  const top = rows.slice(0, 3);

  return (
    <>
      <SectionCard
        title="Announcements"
        action={canPost ? (
          <button
            type="button"
            onClick={() => setPostOpen(true)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold hover:opacity-90"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
          >
            <Plus size={11} /> Post
          </button>
        ) : null}
        empty={!isLoading && rows.length === 0
          ? { icon: Megaphone,
              text: canPost ? 'No announcements yet — post one to share with the team.'
                            : 'No announcements right now.' }
          : null}
      >
        <ul className="flex flex-col gap-1.5">
          {top.map((a) => (
            <AnnouncementRow key={a.id} item={a} canDelete={canPost} />
          ))}
          {rows.length > top.length && (
            <li className="px-2 pt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
              +{rows.length - top.length} more
            </li>
          )}
        </ul>
      </SectionCard>
      <PostAnnouncementModal open={postOpen} onClose={() => setPostOpen(false)} />
    </>
  );
}

function AnnouncementRow({ item, canDelete }: { item: Announcement; canDelete: boolean }) {
  const del = useDeleteAnnouncement();
  const { toast } = useToast();
  const age = relativeTime(item.postedAt);
  const meta = [item.postedByName, age, item.audience === 'managers' ? 'managers only' : null]
    .filter(Boolean).join(' · ');
  return (
    <li className="rounded-md px-2 py-2" style={{ background: 'var(--surface-2)' }}>
      <div className="flex items-start gap-2">
        {item.pinned && (
          <Pin size={12} className="mt-1 shrink-0" style={{ color: 'var(--accent)' }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold" style={{ color: 'var(--text-1)' }}>
            {item.title}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[11.5px]" style={{ color: 'var(--text-2)' }}>
            {item.body}
          </div>
          <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-3)' }}>
            {meta}
          </div>
        </div>
        {canDelete && (
          <button
            type="button"
            title="Delete"
            onClick={() => {
              if (!confirm(`Delete "${item.title}"?`)) return;
              del.mutate(item.id, {
                onSuccess: () => toast('Announcement removed', 'success'),
                onError: (e: any) => toast(e?.message ?? 'Delete failed', 'error'),
              });
            }}
            className="rounded p-1 hover:bg-[color:var(--surface)]"
            style={{ color: 'var(--text-3)' }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </li>
  );
}

function PostAnnouncementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateAnnouncement();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'all' | 'managers'>('all');
  const [pinned, setPinned] = useState(false);

  function submit() {
    if (title.trim().length < 2 || body.trim().length < 2) return;
    create.mutate(
      { title: title.trim(), body: body.trim(), audience, pinned },
      {
        onSuccess: () => {
          toast('Announcement posted', 'success');
          setTitle(''); setBody(''); setAudience('all'); setPinned(false);
          onClose();
        },
        onError: (e: any) => toast(e?.message ?? 'Post failed', 'error'),
      },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="New announcement" size="md">
      <div className="space-y-3 px-4 py-4 sm:px-6">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            className="mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            rows={5}
            className="mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
          />
        </div>
        <div className="flex items-center gap-4">
          <label className="text-[12px]" style={{ color: 'var(--text-2)' }}>Audience</label>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as 'all' | 'managers')}
            className="rounded-md border px-2 py-1 text-[12px]"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
          >
            <option value="all">Everyone</option>
            <option value="managers">Managers only</option>
          </select>
          <label className="ml-auto flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-2)' }}>
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            Pin to top
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-[12px]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={create.isPending}
            className="rounded-md px-3 py-1.5 text-[12px] font-medium text-white"
            style={{ background: 'var(--accent)' }}>
            {create.isPending ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Recent activity ───────────────────────────────────────────────────────

const KIND_META: Record<ActivityKind, { icon: any; tint: string }> = {
  employee_added:    { icon: UserPlus,     tint: 'rgb(22,163,74)'  },
  employee_exited:   { icon: LogOut,       tint: 'rgb(220,38,38)'  },
  leave_approved:    { icon: CheckCircle2, tint: 'rgb(14,116,144)' },
  leave_rejected:    { icon: XCircle,      tint: 'rgb(220,38,38)'  },
  salary_assigned:   { icon: Wallet,       tint: 'rgb(124,58,237)' },
  document_uploaded: { icon: FileText,     tint: 'rgb(2,132,199)'  },
  payroll_started:   { icon: Receipt,      tint: 'rgb(217,119,6)'  },
};

export function RecentActivitySection() {
  const { data, isLoading } = useRecentActivity();
  const rows = data?.data ?? [];
  const top = rows.slice(0, 8);
  return (
    <SectionCard
      title="Recent activity"
      empty={!isLoading && rows.length === 0
        ? { icon: History, text: 'No HR activity yet.' }
        : null}
    >
      <ul className="flex flex-col gap-1.5">
        {top.map((e) => <ActivityRow key={e.id} ev={e} />)}
      </ul>
    </SectionCard>
  );
}

function ActivityRow({ ev }: { ev: ActivityEvent }) {
  const meta = KIND_META[ev.kind] ?? { icon: History, tint: 'rgb(100,116,139)' };
  const Ico = meta.icon;
  const line = ev.subject ? `${ev.title} · ${ev.subject}` : ev.title;
  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-1.5"
      style={{ background: 'var(--surface-2)' }}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: `color-mix(in srgb, ${meta.tint} 14%, var(--surface))`, color: meta.tint }}>
        <Ico size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium" style={{ color: 'var(--text-1)' }}>
          {line}
        </div>
        <div className="text-[10.5px]" style={{ color: 'var(--text-3)' }}>
          {relativeTime(ev.occurredAt)}
        </div>
      </div>
    </li>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}
