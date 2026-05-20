import { useState } from 'react';
import {
  Pin, Plus, Megaphone, Trash2, UserPlus, LogOut, CheckCircle2, XCircle,
  Wallet, FileText, Receipt, History, Gavel, Umbrella, Calendar, HardHat,
  PartyPopper,
} from 'lucide-react';
import { useToast } from '@/components/ui';
import {
  useAnnouncements, useDeleteAnnouncement, useAnnouncementImageSrc,
  useRecentActivity, useHrMe,
  type Announcement, type ActivityEvent, type ActivityKind, type AnnouncementCategory,
} from '@/hooks/queries/use-hr';
import { useAuth } from '@/providers/auth-provider';
import { PostAnnouncementModal } from './announcement-post-modal';

// Maps a category code to display label + icon + accent. Same set as
// the mobile feed so the two surfaces look the same when a user flips
// from web to phone.
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

/// Small <img> that fetches the cover via an auth'd blob URL — the
/// API stream is private, so a plain `<img src>` would 401. Reused
/// by the dashboard row + the post-modal preview.
function AnnouncementImage({
  announcementId, imageUrl, className,
}: {
  announcementId: string;
  imageUrl: string | null;
  className?: string;
}) {
  const { data: src } = useAnnouncementImageSrc(announcementId, imageUrl);
  if (!src) return null;
  return <img src={src} alt="" className={className} />;
}

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
  // Posting opens up to managers (viewer + isManager) too — server
  // narrows their post to their own department + audience=all.
  const { data: meResp } = useHrMe();
  const isManager = meResp?.data?.isManager ?? false;
  const canPost = user?.role === 'owner'
    || user?.role === 'accountant'
    || user?.role === 'hr'
    || (user?.role === 'viewer' && isManager);
  // Org-wide delete is admin/HR-only. Managers can still delete their
  // own posts via the dedicated management page (which checks the
  // posted_by_id server-side).
  const canDeleteAny = user?.role === 'owner'
    || user?.role === 'accountant'
    || user?.role === 'hr';
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
            <AnnouncementRow key={a.id} item={a} canDelete={canDeleteAny} />
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
  const cat = categoryMeta(item.category);
  const meta = [item.postedByName, age, item.audience === 'managers' ? 'managers only' : null]
    .filter(Boolean).join(' · ');
  return (
    <li className="rounded-md px-2 py-2" style={{ background: 'var(--surface-2)' }}>
      <div className="flex items-start gap-2.5">
        {/* Category tile — colored badge with the category icon. Pin
            overlaid on top-right when the post is pinned. */}
        <div className="relative shrink-0">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-md"
            style={{ background: `color-mix(in srgb, ${cat.color} 14%, var(--surface))`, color: cat.color }}
            title={cat.label}
          >
            <cat.Icon size={16} />
          </div>
          {item.pinned && (
            <div
              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full"
              style={{ background: 'var(--surface)', color: 'var(--accent)' }}
            >
              <Pin size={9} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold" style={{ color: 'var(--text-1)' }}>
            {item.title}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[11.5px]" style={{ color: 'var(--text-2)' }}>
            {item.body}
          </div>
          {item.imageUrl && (
            <div className="mt-1.5 overflow-hidden rounded-md" style={{ background: 'var(--surface)' }}>
              <AnnouncementImage
                announcementId={item.id}
                imageUrl={item.imageUrl}
                className="block h-24 w-full object-cover"
              />
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-3)' }}>
              {meta}
            </div>
            {item.departmentName && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider"
                style={{ background: `color-mix(in srgb, ${cat.color} 14%, transparent)`, color: cat.color }}
              >
                {item.departmentName}
              </span>
            )}
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

// PostAnnouncementModal lives in ./announcement-post-modal so the
// dedicated /hr/announcements management page can reuse it without
// pulling in the rest of this file.

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
