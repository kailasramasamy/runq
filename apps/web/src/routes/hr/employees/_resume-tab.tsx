import { useRef, useState } from 'react';
import {
  FileText, Upload, Pencil, Loader2, Briefcase, GraduationCap,
  Award, Languages as LanguagesIcon, Sparkles, Eye,
} from 'lucide-react';
import { Badge, Button, useToast } from '@/components/ui';
import type { ResumeProfile } from '@runq/types';
import {
  useResumeProfile, useUploadResume, useMyResumeProfile, useUploadMyResume,
} from '@/hooks/queries/use-resume-profile';
import { documentDownloadUrl } from '@/hooks/queries/use-employee-documents';
import { useAuth, canManageHrModule } from '@/providers/auth-provider';
import { SectionLabel } from './_employee-tabs';
import { ResumeEditForm } from './_resume-edit-form';
import { api } from '@/lib/api-client';

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/jpg,image/webp';

export function ResumeTab({
  employeeId, selfService = false,
}: {
  employeeId: string;
  /** Self-service mode — the logged-in employee viewing their OWN resume.
   *  Uses the /me endpoints, allows upload, hides Edit (corrections = HR). */
  selfService?: boolean;
}) {
  const mgmtQuery = useResumeProfile(selfService ? null : employeeId);
  const selfQuery = useMyResumeProfile(selfService);
  const { data, isLoading } = selfService ? selfQuery : mgmtQuery;

  const mgmtUpload = useUploadResume(employeeId);
  const selfUpload = useUploadMyResume();
  const upload = selfService ? selfUpload : mgmtUpload;

  const { toast } = useToast();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);

  // Editing the extracted data is HR-admin only. In self-service the
  // employee can upload but not edit (corrections stay with HR); a
  // manager/viewer viewing someone else sees the profile read-only.
  const canEdit = !selfService && canManageHrModule(user?.role);
  const canUpload = selfService || canEdit;
  const profile = data?.data ?? null;

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    upload.mutate(file, {
      onSuccess: () => toast('Resume uploaded — profile extracted', 'success'),
      onError: (err: any) => toast(err?.message ?? 'Upload failed', 'error'),
    });
  }

  if (isLoading) {
    return <div className="p-6 text-sm" style={{ color: 'var(--text-3)' }}>Loading resume…</div>;
  }

  if (editing && profile && canEdit) {
    return <ResumeEditForm employeeId={employeeId} profile={profile} onDone={() => setEditing(false)} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={pickFile} />
      {profile
        ? (
          <ResumeView
            profile={profile}
            canUpload={canUpload}
            canEdit={canEdit}
            uploading={upload.isPending}
            onReplace={() => inputRef.current?.click()}
            onEdit={() => setEditing(true)}
          />
        )
        : (
          <EmptyState
            canUpload={canUpload}
            uploading={upload.isPending}
            onUpload={() => inputRef.current?.click()}
          />
        )}
    </div>
  );
}

function EmptyState({
  canUpload, uploading, onUpload,
}: {
  canUpload: boolean;
  uploading: boolean;
  onUpload: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed py-12 text-center"
      style={{ borderColor: 'var(--border-soft)' }}
    >
      <FileText size={32} style={{ color: 'var(--text-3)' }} />
      <div>
        <div className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
          No resume on file
        </div>
        <div className="mt-0.5 text-[12px]" style={{ color: 'var(--text-3)' }}>
          {canUpload
            ? 'Upload a PDF or image — a profile is extracted automatically.'
            : 'The employee can upload their resume from the runq app.'}
        </div>
      </div>
      {canUpload && (
        <Button size="sm" onClick={onUpload} disabled={uploading}>
          {uploading
            ? <><Loader2 size={13} className="animate-spin" /> Extracting…</>
            : <><Upload size={13} /> Upload resume</>}
        </Button>
      )}
    </div>
  );
}

function ResumeView({
  profile, canUpload, canEdit, uploading, onReplace, onEdit,
}: {
  profile: ResumeProfile;
  canUpload: boolean;
  canEdit: boolean;
  uploading: boolean;
  onReplace: () => void;
  onEdit: () => void;
}) {
  return (
    <>
      <ProvenanceBar
        profile={profile}
        canUpload={canUpload}
        canEdit={canEdit}
        uploading={uploading}
        onReplace={onReplace}
        onEdit={onEdit}
      />

      {profile.summary && (
        <section>
          <SectionLabel>Summary</SectionLabel>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-1)' }}>
            {profile.summary}
          </p>
        </section>
      )}

      {profile.experience.length > 0 && (
        <section>
          <SectionLabel>Experience</SectionLabel>
          <div className="flex flex-col gap-2">
            {profile.experience.map((exp, i) => (
              <EntryRow
                key={i}
                icon={<Briefcase size={14} />}
                title={[exp.title, exp.company].filter(Boolean).join(' · ') || exp.company}
                meta={dateRange(exp.fromDate, exp.toDate)}
                body={exp.description}
              />
            ))}
          </div>
        </section>
      )}

      {profile.education.length > 0 && (
        <section>
          <SectionLabel>Education</SectionLabel>
          <div className="flex flex-col gap-2">
            {profile.education.map((edu, i) => (
              <EntryRow
                key={i}
                icon={<GraduationCap size={14} />}
                title={edu.degree}
                meta={[edu.institution, edu.year, edu.grade].filter(Boolean).join(' · ')}
              />
            ))}
          </div>
        </section>
      )}

      {profile.skills.length > 0 && (
        <section>
          <SectionLabel>Skills</SectionLabel>
          <ChipRow items={profile.skills} />
        </section>
      )}

      {profile.certifications.length > 0 && (
        <section>
          <SectionLabel>Certifications</SectionLabel>
          <div className="flex flex-col gap-2">
            {profile.certifications.map((cert, i) => (
              <EntryRow
                key={i}
                icon={<Award size={14} />}
                title={cert.name}
                meta={[cert.issuer, cert.year].filter(Boolean).join(' · ')}
              />
            ))}
          </div>
        </section>
      )}

      {profile.languages.length > 0 && (
        <section>
          <SectionLabel>Languages</SectionLabel>
          <ChipRow items={profile.languages} icon={<LanguagesIcon size={12} />} />
        </section>
      )}

      {isEmptyProfile(profile) && (
        <div className="rounded-lg border border-dashed py-6 text-center text-[12px]"
          style={{ borderColor: 'var(--border-soft)', color: 'var(--text-3)' }}>
          The resume was processed but no profile fields could be extracted.
          Try a clearer file, or add details with Edit.
        </div>
      )}
    </>
  );
}

function ProvenanceBar({
  profile, canUpload, canEdit, uploading, onReplace, onEdit,
}: {
  profile: ResumeProfile;
  canUpload: boolean;
  canEdit: boolean;
  uploading: boolean;
  onReplace: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2.5"
      style={{ background: 'var(--accent-soft)' }}
    >
      <Sparkles size={14} style={{ color: 'var(--accent-text)' }} />
      <span className="text-[12px]" style={{ color: 'var(--accent-text)' }}>
        {profile.manuallyEdited
          ? 'Extracted from the resume, then corrected by HR. Self-reported — unverified.'
          : 'Extracted from the employee’s resume. Self-reported — unverified.'}
      </span>
      <ConfidenceBadge profile={profile} />
      <div className="ml-auto flex items-center gap-1.5">
        {profile.sourceAttachmentId && <ViewFileButton attachmentId={profile.sourceAttachmentId} />}
        {canUpload && (
          <Button size="sm" variant="outline" onClick={onReplace} disabled={uploading}>
            {uploading
              ? <><Loader2 size={12} className="animate-spin" /> Extracting…</>
              : <><Upload size={12} /> Replace</>}
          </Button>
        )}
        {canEdit && (
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil size={12} /> Edit
          </Button>
        )}
      </div>
    </div>
  );
}

function ConfidenceBadge({ profile }: { profile: ResumeProfile }) {
  if (profile.manuallyEdited) return <Badge variant="success">HR-reviewed</Badge>;
  if (profile.aiConfidence == null) return null;
  const c = Number(profile.aiConfidence);
  if (c >= 0.75) return <Badge variant="success">{Math.round(c * 100)}% confidence</Badge>;
  if (c >= 0.5) return <Badge variant="warning">{Math.round(c * 100)}% — review</Badge>;
  return <Badge variant="danger">{Math.round(c * 100)}% — verify</Badge>;
}

function ViewFileButton({ attachmentId }: { attachmentId: string }) {
  async function open() {
    const res = await fetch(documentDownloadUrl(attachmentId), { headers: api.authHeaders() });
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return (
    <Button size="sm" variant="outline" onClick={open}>
      <Eye size={12} /> Resume file
    </Button>
  );
}

function EntryRow({
  icon, title, meta, body,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  body?: string | null;
}) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: 'var(--accent-text)' }}>{icon}</span>
        <span className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>{title}</span>
      </div>
      {meta && (
        <div className="mt-0.5 pl-6 text-[11px]" style={{ color: 'var(--text-3)' }}>{meta}</div>
      )}
      {body && (
        <div className="mt-1 pl-6 text-[12px] leading-relaxed" style={{ color: 'var(--text-2)' }}>{body}</div>
      )}
    </div>
  );
}

function ChipRow({ items, icon }: { items: string[]; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span
          key={`${it}-${i}`}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px]"
          style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}
        >
          {icon}{it}
        </span>
      ))}
    </div>
  );
}

function dateRange(from: string | null, to: string | null): string {
  if (!from && !to) return '';
  return `${from ?? '?'} — ${to ?? 'Present'}`;
}

function isEmptyProfile(p: ResumeProfile): boolean {
  return !p.summary
    && p.experience.length === 0
    && p.education.length === 0
    && p.skills.length === 0
    && p.certifications.length === 0
    && p.languages.length === 0;
}
