// HR Announcements — full management page for HR / owner roles.
//
// The dashboard already has a 3-row preview + post modal; this page is
// the "see everything + filter + manage" surface. Shares the
// PostAnnouncementModal from hr-feed-sections so the post UI never
// drifts between the two entry points.

import { useMemo, useState } from 'react';
import {
  Megaphone, Plus, Pin, Trash2, Pencil, Gavel, Umbrella, Calendar, HardHat,
  PartyPopper, Wallet,
} from 'lucide-react';
import {
  PageHeader, Button, Select, useToast, ConfirmationDialog,
} from '@/components/ui';
import { EmptyState } from '@/components/ar/primitives';
import {
  useAnnouncements, useDeleteAnnouncement, useDepartments,
  useAnnouncementImageSrc, useHrMe,
  type Announcement, type AnnouncementCategory,
} from '@/hooks/queries/use-hr';
import { useAuth } from '@/providers/auth-provider';
import { PostAnnouncementModal } from '@/components/dashboard/announcement-post-modal';

function categoryMeta(c: AnnouncementCategory): { label: string; Icon: any; color: string } {
  switch (c) {
    case 'policy':      return { label: 'Policy',      Icon: Gavel,        color: 'rgb(99,102,241)' };
    case 'holiday':     return { label: 'Holiday',     Icon: Umbrella,     color: 'rgb(234,88,12)'  };
    case 'event':       return { label: 'Event',       Icon: Calendar,     color: 'rgb(6,182,212)'  };
    case 'operational': return { label: 'Operations',  Icon: HardHat,      color: 'rgb(8,145,178)'  };
    case 'celebration': return { label: 'Celebration', Icon: PartyPopper,  color: 'rgb(236,72,153)' };
    case 'payroll':     return { label: 'Payroll',     Icon: Wallet,       color: 'rgb(22,163,74)'  };
    default:            return { label: 'Announcement', Icon: Megaphone,    color: 'rgb(124,58,237)' };
  }
}

const CATEGORY_OPTIONS: AnnouncementCategory[] = [
  'general', 'policy', 'holiday', 'event',
  'operational', 'celebration', 'payroll',
];

function AnnouncementImage({
  announcementId, imageUrl, className,
}: { announcementId: string; imageUrl: string | null; className?: string }) {
  const { data: src } = useAnnouncementImageSrc(announcementId, imageUrl);
  if (!src) return null;
  return <img src={src} alt="" className={className} />;
}

export function AnnouncementsPage() {
  const { user } = useAuth();
  const { data: meResp } = useHrMe();
  const isManager = meResp?.data?.isManager ?? false;
  // canPost lets managers open the New post modal; canModerateAny is
  // the stricter flag for edit/delete-any-row affordances. Server
  // enforces both — these only drive UI visibility.
  const canPost = user?.role === 'owner'
    || user?.role === 'accountant'
    || user?.role === 'hr'
    || (user?.role === 'viewer' && isManager);
  const canModerateAny = user?.role === 'owner'
    || user?.role === 'accountant'
    || user?.role === 'hr';
  // Kept as canManage to minimise downstream churn in this file.
  const canManage = canPost;
  const { data, isLoading } = useAnnouncements();
  const { data: deptsResp } = useDepartments();
  const depts = deptsResp?.data ?? [];
  const remove = useDeleteAnnouncement();
  const { toast } = useToast();

  const [postOpen, setPostOpen] = useState(false);
  /// When set, the post modal opens in edit mode hydrated from this row.
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [filterCat, setFilterCat] = useState<AnnouncementCategory | ''>('');
  const [filterDept, setFilterDept] = useState<string>(''); // '' = any, 'org' = org-wide only
  const [confirmDelete, setConfirmDelete] = useState<Announcement | null>(null);

  const rows = useMemo(() => {
    let r = data?.data ?? [];
    if (filterCat) r = r.filter((a) => a.category === filterCat);
    if (filterDept === 'org') r = r.filter((a) => !a.departmentId);
    else if (filterDept) r = r.filter((a) => a.departmentId === filterDept);
    return r;
  }, [data, filterCat, filterDept]);

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Announcements' }]}
        title="Announcements"
        description="Company-wide and team noticeboard. HR + owners post."
        actions={canManage ? (
          <Button size="sm" onClick={() => setPostOpen(true)}>
            <Plus size={13} /> New post
          </Button>
        ) : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40">
          <Select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value as AnnouncementCategory | '')}
            options={[
              { value: '', label: 'All categories' },
              ...CATEGORY_OPTIONS.map((c) => ({ value: c, label: categoryMeta(c).label })),
            ]}
          />
        </div>
        <div className="w-48">
          <Select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            options={[
              { value: '', label: 'All departments' },
              { value: 'org', label: 'Org-wide only' },
              ...depts.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
        </div>
        <div className="ml-auto text-[12px]" style={{ color: 'var(--text-3)' }}>
          {rows.length} of {data?.data?.length ?? 0}
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border p-12 text-center text-[13px]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={18} />}
          title="No announcements"
          description={
            canManage
              ? 'Post the first one to share with your team.'
              : 'Nothing posted right now.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((a) => {
            // Managers can edit / delete only their own posts;
            // admin + HR can touch any row.
            const isOwner = a.postedById === user?.id;
            const rowCanEdit = canModerateAny || (canPost && isOwner);
            const rowCanDelete = canModerateAny || (canPost && isOwner);
            return (
            <AnnouncementRow
              key={a.id}
              item={a}
              canDelete={rowCanDelete}
              canEdit={rowCanEdit}
              onEdit={() => { setEditing(a); setPostOpen(true); }}
              onDelete={() => setConfirmDelete(a)}
            />
            );
          })}
        </ul>
      )}

      <PostAnnouncementModal
        open={postOpen}
        editing={editing ?? undefined}
        onClose={() => { setPostOpen(false); setEditing(null); }}
      />

      <ConfirmationDialog
        open={confirmDelete != null}
        title="Delete announcement?"
        description={confirmDelete
          ? `"${confirmDelete.title}" will be removed for everyone. This can't be undone.`
          : ''}
        confirmLabel="Delete"
        variant="danger"
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await remove.mutateAsync(confirmDelete.id);
            toast('Announcement removed', 'success');
            setConfirmDelete(null);
          } catch (e: any) {
            toast(e?.message ?? 'Delete failed', 'error');
          }
        }}
      />
    </div>
  );
}

function AnnouncementRow({
  item, canDelete, canEdit, onDelete, onEdit,
}: {
  item: Announcement;
  canDelete: boolean;
  canEdit: boolean;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const cat = categoryMeta(item.category);
  const age = relativeTime(item.postedAt);
  const expired = item.expiresAt && new Date(item.expiresAt) < new Date();
  return (
    <li
      className="flex items-start gap-3 rounded-xl border p-4"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        opacity: expired ? 0.6 : 1,
      }}
    >
      <div className="relative shrink-0">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-lg"
          style={{
            background: `color-mix(in srgb, ${cat.color} 14%, var(--surface))`,
            color: cat.color,
          }}
        >
          <cat.Icon size={20} />
        </div>
        {item.pinned && (
          <div
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full"
            style={{ background: 'var(--surface)', color: 'var(--accent)' }}
          >
            <Pin size={11} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{
              background: `color-mix(in srgb, ${cat.color} 14%, transparent)`,
              color: cat.color,
            }}
          >
            {cat.label}
          </span>
          {item.departmentName && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
            >
              {item.departmentName}
            </span>
          )}
          {item.audience === 'managers' && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
            >
              Managers only
            </span>
          )}
          {expired && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
            >
              Expired
            </span>
          )}
        </div>
        <div className="mt-1.5 text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
          {item.title}
        </div>
        <div className="mt-1 text-[12.5px]" style={{ color: 'var(--text-2)' }}>
          {item.body}
        </div>
        {item.imageUrl && (
          <div className="mt-2 overflow-hidden rounded-md"
            style={{ background: 'var(--surface-2)' }}>
            <AnnouncementImage
              announcementId={item.id}
              imageUrl={item.imageUrl}
              className="block max-h-64 w-full object-cover"
            />
          </div>
        )}
        <div className="mt-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
          {item.postedByName ? `${item.postedByName} · ` : ''}
          {age}
          {item.expiresAt && !expired
            ? ` · expires ${new Date(item.expiresAt).toLocaleDateString()}`
            : ''}
        </div>
      </div>
      {(canEdit || canDelete) && (
        <div className="flex shrink-0 flex-col gap-1">
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              title="Edit"
              className="rounded p-2 hover:bg-[color:var(--surface-2)]"
              style={{ color: 'var(--text-3)' }}
            >
              <Pencil size={14} />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              title="Delete"
              className="rounded p-2 hover:bg-[color:var(--surface-2)]"
              style={{ color: 'var(--text-3)' }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

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
