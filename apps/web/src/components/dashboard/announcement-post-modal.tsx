// Post-announcement modal — single source of truth for both the
// Manager dashboard "+ Post" button and the dedicated Announcements
// management page. Title, body, category, department, cover image,
// audience, pin — everything an HR / owner can attach.

import { useEffect, useRef, useState } from 'react';
import {
  Image as ImageIcon, X, Gavel, Umbrella, Calendar, HardHat,
  PartyPopper, Wallet, Megaphone,
} from 'lucide-react';
import { Modal, useToast } from '@/components/ui';
import {
  useCreateAnnouncement, useUpdateAnnouncement,
  useUploadAnnouncementImage, useDepartments, useAnnouncementImageSrc,
  useHrMe,
  type Announcement, type AnnouncementCategory,
} from '@/hooks/queries/use-hr';
import { useAuth } from '@/providers/auth-provider';

const CATEGORY_OPTIONS: AnnouncementCategory[] = [
  'general', 'policy', 'holiday', 'event',
  'operational', 'celebration', 'payroll',
];

function categoryLabel(c: AnnouncementCategory): string {
  switch (c) {
    case 'policy':      return 'Policy';
    case 'holiday':     return 'Holiday';
    case 'event':       return 'Event';
    case 'operational': return 'Operations';
    case 'celebration': return 'Celebration';
    case 'payroll':     return 'Payroll';
    default:            return 'Announcement';
  }
}

// Keep the icon list near the labels — used solely to render the
// category select option icons for visual scannability.
const CATEGORY_ICON: Record<AnnouncementCategory, any> = {
  general:     Megaphone,
  policy:      Gavel,
  holiday:     Umbrella,
  event:       Calendar,
  operational: HardHat,
  celebration: PartyPopper,
  payroll:     Wallet,
};
void CATEGORY_ICON; // reserved for a future select-with-icons render

export function PostAnnouncementModal({
  open, onClose, editing,
}: {
  open: boolean;
  onClose: () => void;
  /// When set, the modal hydrates from this row and submits an update
  /// instead of a create. Image picker still works — picking a new
  /// file replaces the existing image; leaving it blank keeps the
  /// current one untouched.
  editing?: Announcement;
}) {
  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();
  const uploadImage = useUploadAnnouncementImage();
  const { data: deptsResp } = useDepartments();
  const depts = deptsResp?.data ?? [];
  const { user } = useAuth();
  const { data: meResp } = useHrMe();
  // Managers can post but only within their own department; audience
  // also collapses to "all". The server enforces both — these flags
  // just keep the UI honest so the manager isn't shown options that
  // would be silently overridden.
  const isAdminOrHr = user?.role === 'owner' || user?.role === 'hr';
  const callerDeptName = meResp?.data?.employee?.departmentId
    ? (depts.find((d) => d.id === meResp.data.employee?.departmentId)?.name)
    : null;
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'all' | 'managers'>('all');
  const [category, setCategory] = useState<AnnouncementCategory>('general');
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  /// Date string in 'YYYY-MM-DD' form; empty = never expires.
  /// Stored as a plain string (not Date) so the <input type="date">
  /// stays controlled without timezone drift.
  const [expiresAt, setExpiresAt] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pull the existing cover as a blob URL when editing so the user can
  // see what's currently attached before deciding to replace it. No
  // network call when not editing or when the row has no image.
  const existingImage = useAnnouncementImageSrc(
    editing?.id ?? '',
    editing?.imageUrl ?? null,
  );

  // Hydrate state from `editing` every time the modal opens with a
  // (possibly different) row. Skipping this would leave stale text in
  // the form after the modal is reopened on a different announcement.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setBody(editing.body);
      setAudience(editing.audience);
      setCategory(editing.category);
      setDepartmentId(editing.departmentId);
      setPinned(editing.pinned);
      // Server stores expiresAt as ISO timestamp; the date input wants
      // YYYY-MM-DD. Slicing avoids a TZ-shifted day when the server
      // sends 23:59 UTC for a local-midnight date.
      setExpiresAt(editing.expiresAt ? editing.expiresAt.slice(0, 10) : '');
    } else {
      setTitle(''); setBody('');
      setAudience('all'); setCategory('general');
      setDepartmentId(null); setPinned(false);
      setExpiresAt('');
    }
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  function resetForm() {
    setTitle(''); setBody('');
    setAudience('all'); setCategory('general');
    setDepartmentId(null); setPinned(false);
    setExpiresAt('');
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit() {
    if (title.trim().length < 2 || body.trim().length < 2) return;
    // Empty → null (never expires). Server validates the ISO format,
    // so we expand the YYYY-MM-DD picker value to end-of-day local
    // time before sending — feels more natural than midnight UTC.
    const expiresIso = expiresAt
      ? new Date(`${expiresAt}T23:59:59`).toISOString()
      : null;
    try {
      // Either path returns the row id; we then upload an image to it
      // if the user picked one. For edits, leaving the image blank
      // keeps the existing cover unchanged (no delete-image action).
      const targetId = editing
        ? (await update.mutateAsync({
            id: editing.id,
            title: title.trim(),
            body: body.trim(),
            audience,
            category,
            departmentId,
            pinned,
            expiresAt: expiresIso,
          })).data.id
        : (await create.mutateAsync({
            title: title.trim(),
            body: body.trim(),
            audience,
            category,
            departmentId,
            pinned,
            expiresAt: expiresIso,
          })).data.id;
      if (imageFile) {
        try {
          await uploadImage.mutateAsync({ announcementId: targetId, file: imageFile });
        } catch (e: any) {
          toast(`Saved, but image upload failed: ${e?.message ?? 'unknown'}`, 'error');
        }
      }
      toast(editing ? 'Announcement updated' : 'Announcement posted', 'success');
      resetForm();
      onClose();
    } catch (e: any) {
      toast(e?.message ?? 'Save failed', 'error');
    }
  }

  const labelClass = 'text-[11px] font-semibold uppercase tracking-wider';
  const labelStyle = { color: 'var(--text-3)' as const };
  const fieldClass = 'mt-1 w-full rounded-md border px-3 py-2 text-[13px]';
  const fieldStyle = {
    borderColor: 'var(--border)' as const,
    background: 'var(--surface)' as const,
    color: 'var(--text-1)' as const,
  };

  return (
    <Modal open={open} onClose={() => { resetForm(); onClose(); }} title={editing ? 'Edit announcement' : 'New announcement'} size="md">
      <div className="space-y-3 px-4 py-4 sm:px-6">
        <div>
          <label className={labelClass} style={labelStyle}>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            className={fieldClass}
            style={fieldStyle}
          />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            rows={5}
            className={fieldClass}
            style={fieldStyle}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} style={labelStyle}>Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}
              className={fieldClass}
              style={fieldStyle}
            >
              {CATEGORY_OPTIONS
                .filter((c) => isAdminOrHr || c !== 'policy')
                .map((c) => (
                  <option key={c} value={c}>{categoryLabel(c)}</option>
                ))}
            </select>
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Department</label>
            {isAdminOrHr ? (
              <select
                value={departmentId ?? ''}
                onChange={(e) => setDepartmentId(e.target.value === '' ? null : e.target.value)}
                className={fieldClass}
                style={fieldStyle}
              >
                <option value="">All departments (org-wide)</option>
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            ) : (
              // Managers see their dept name as a read-only tile so
              // they understand the scope before posting.
              <div
                className="mt-1 rounded-md border px-3 py-2 text-[13px]"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)' }}
              >
                {callerDeptName ?? 'Your department'}
              </div>
            )}
          </div>
        </div>
        {/* Image picker — preview tile with Remove, or a dashed dropzone
            that opens the file dialog when there's no image yet. */}
        <div>
          <label className={labelClass} style={labelStyle}>Cover image (optional)</label>
          {/* Three states:
              1. user picked a new file → show local preview + ✕
              2. editing an existing post with an image → show server
                 image + "Change" button (no remove yet — needs a
                 dedicated delete-image endpoint)
              3. no image anywhere → dashed upload tile
           */}
          {imagePreview ? (
            <div className="relative mt-1 overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }}>
              <img src={imagePreview} alt="" className="block max-h-48 w-full object-cover" />
              <button
                type="button"
                onClick={clearImage}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full"
                style={{ background: 'rgba(0,0,0,0.55)', color: 'white' }}
                title="Remove"
              >
                <X size={14} />
              </button>
            </div>
          ) : editing?.imageUrl && existingImage.data ? (
            <div className="relative mt-1 overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }}>
              <img src={existingImage.data} alt="" className="block max-h-48 w-full object-cover" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute right-2 top-2 rounded-md px-2 py-1 text-[11px] font-semibold"
                style={{ background: 'rgba(0,0,0,0.55)', color: 'white' }}
              >
                Change
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-3 py-4 text-[12.5px]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
            >
              <ImageIcon size={16} />
              Click to upload a cover image
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onPickImage}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} style={labelStyle}>Audience</label>
            {isAdminOrHr ? (
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as 'all' | 'managers')}
                className={fieldClass}
                style={fieldStyle}
              >
                <option value="all">Everyone</option>
                <option value="managers">Managers only</option>
              </select>
            ) : (
              // Manager posts always go to all viewers in their dept.
              // Show the lock as plain text so they don't try to
              // change a hidden field.
              <div
                className="mt-1 rounded-md border px-3 py-2 text-[13px]"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)' }}
              >
                Everyone in your department
              </div>
            )}
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>
              Expires on
              <span className="ml-1 normal-case opacity-70">(optional)</span>
            </label>
            <div className="relative">
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className={fieldClass}
                style={fieldStyle}
              />
              {expiresAt && (
                <button
                  type="button"
                  onClick={() => setExpiresAt('')}
                  title="Clear (never expires)"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-[color:var(--surface-2)]"
                  style={{ color: 'var(--text-3)' }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-2)' }}>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Pin to top
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => { resetForm(); onClose(); }}
            className="rounded-md border px-3 py-1.5 text-[12px]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
            Cancel
          </button>
          <button type="button" onClick={submit}
            disabled={create.isPending || update.isPending || uploadImage.isPending}
            className="rounded-md px-3 py-1.5 text-[12px] font-medium text-white"
            style={{ background: 'var(--accent)' }}>
            {create.isPending || update.isPending || uploadImage.isPending
              ? 'Saving…'
              : editing ? 'Save changes' : 'Post'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
