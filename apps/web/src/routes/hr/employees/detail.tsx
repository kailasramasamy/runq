import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Pencil, X, ArrowLeft, Camera, Trash2 } from 'lucide-react';
import { PageHeader, Button, Badge, useToast } from '@/components/ui';
import { Avatar } from '@/components/ar/primitives';
import { EmployeeForm } from '@/components/forms/employee-form';
import { useEmployee, useUpdateEmployee, type EmployeeStatus } from '@/hooks/queries/use-hr';
import {
  useEmployeePhotoSrc, useUploadEmployeePhoto, useDeleteEmployeePhoto,
} from '@/hooks/queries/use-employee-documents';
import { OverviewTab, LeaveTab, PayrollTab } from './_employee-tabs';
import { DocumentsTab } from './_documents-tab';

const STATUS_BADGE: Record<EmployeeStatus, { variant: any; label: string }> = {
  active: { variant: 'success', label: 'Active' },
  inactive: { variant: 'outline', label: 'Inactive' },
  on_leave: { variant: 'warning', label: 'On leave' },
  terminated: { variant: 'danger', label: 'Terminated' },
};

type Tab = 'overview' | 'documents' | 'leave' | 'payroll';

interface Props { employeeId: string }

export function EmployeeDetailPage({ employeeId }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading } = useEmployee(employeeId);
  const mutation = useUpdateEmployee();

  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);

  if (isLoading) return <div className="p-6 text-sm" style={{ color: 'var(--text-3)' }}>Loading…</div>;
  const employee = data?.data;
  if (!employee) return <div className="p-6 text-sm" style={{ color: 'var(--text-3)' }}>Employee not found.</div>;

  const name = `${employee.firstName}${employee.lastName ? ' ' + employee.lastName : ''}`;
  const statusBadge = STATUS_BADGE[employee.status];

  function handleSubmit(input: any) {
    mutation.mutate({ id: employeeId, ...input }, {
      onSuccess: () => { toast('Employee updated', 'success'); setEditing(false); },
      onError: (e: any) => toast(e?.message ?? 'Failed to update', 'error'),
    });
  }

  return (
    <div className="max-w-4xl">
      <button
        type="button"
        onClick={() => navigate({ to: '/hr/employees' })}
        className="mb-3 flex items-center gap-1.5 text-[12px] font-medium hover:opacity-80"
        style={{ color: 'var(--text-2)' }}
      >
        <ArrowLeft size={14} /> Back to employees
      </button>
      <PageHeader
        breadcrumbs={[
          { label: 'HR', href: '/hr' },
          { label: 'Employees', href: '/hr/employees' },
          { label: name },
        ]}
        title={name}
        description={`Code: ${employee.employeeCode} · Joined ${employee.joiningDate}`}
        actions={
          editing ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              <X size={13} /> Cancel edit
            </Button>
          ) : (
            <Button size="sm" onClick={() => { setEditing(true); setTab('overview'); }}>
              <Pencil size={13} /> Edit
            </Button>
          )
        }
      />

      {/* Profile header */}
      <div
        className="mb-4 rounded-xl border p-4"
        style={{ background: 'linear-gradient(135deg, var(--accent-soft) 0%, var(--surface-2) 100%)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-start gap-4">
          <AvatarUploader employeeId={employeeId} name={name} photoKey={employee.photoUrl} />
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-bold" style={{ color: 'var(--text-1)' }}>{name}</div>
            <div className="mt-0.5 text-[13px]" style={{ color: 'var(--text-2)' }}>
              {employee.designationName ?? '—'} · {employee.departmentName ?? '—'}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={statusBadge?.variant ?? 'default'}>{statusBadge?.label ?? employee.status}</Badge>
              <Badge variant="default">{employee.employmentType.replace('_', ' ')}</Badge>
              <span className="num text-[11px]" style={{ color: 'var(--text-3)' }}>{employee.employeeCode}</span>
            </div>
          </div>
          <div className="hidden gap-px overflow-hidden rounded-lg sm:grid sm:grid-cols-3" style={{ background: 'var(--border)' }}>
            {[
              { label: 'CTC', value: employee.ctcAnnual ? `₹${(Number(employee.ctcAnnual) / 100000).toFixed(1)}L` : '—' },
              { label: 'Joined', value: employee.joiningDate },
              { label: 'Type', value: employee.employmentType.replace('_', ' ') },
            ].map((s) => (
              <div key={s.label} className="px-4 py-2.5 text-center" style={{ background: 'var(--surface)' }}>
                <div className="text-[13px] font-bold capitalize" style={{ color: 'var(--text-1)' }}>{s.value}</div>
                <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tab strip */}
      <div className="mb-4 flex gap-0 border-b" style={{ borderColor: 'var(--border)' }}>
        {(['overview', 'documents', 'leave', 'payroll'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="-mb-px border-b-2 px-4 py-2 text-[13px] font-medium capitalize transition-colors"
            style={{
              color: tab === t ? 'var(--accent-text)' : 'var(--text-2)',
              borderColor: tab === t ? 'var(--accent)' : 'transparent',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        editing ? (
          <EmployeeForm
            initialData={employee}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(false)}
            isLoading={mutation.isPending}
          />
        ) : (
          <OverviewTab employee={employee} />
        )
      )}
      {tab === 'documents' && <DocumentsTab employeeId={employeeId} />}
      {tab === 'leave' && <LeaveTab employeeId={employeeId} />}
      {tab === 'payroll' && <PayrollTab employeeId={employeeId} />}
    </div>
  );
}

/**
 * Avatar in the profile header. Behaviour splits on whether a photo exists:
 *   - With a photo: tap → opens a fullscreen lightbox. A small camera badge
 *     (always visible) handles replace; trash badge (hover) handles delete.
 *   - No photo: tap → opens the file picker, since there's nothing to view.
 * Image is fetched as a blob through the authenticated endpoint and turned
 * into an object URL — <img src> can't carry a bearer token directly.
 */
function AvatarUploader({
  employeeId, name, photoKey,
}: {
  employeeId: string;
  name: string;
  photoKey: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: photoSrc } = useEmployeePhotoSrc(employeeId, photoKey);
  const upload = useUploadEmployeePhoto(employeeId);
  const remove = useDeleteEmployeePhoto(employeeId);
  const { toast } = useToast();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const hasPhoto = !!photoKey;

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    upload.mutate(file, {
      onSuccess: () => toast('Photo updated', 'success'),
      onError: (err: any) => toast(err?.message ?? 'Upload failed', 'error'),
    });
    e.target.value = '';
  }

  return (
    <>
      <div className="group relative">
        <button
          type="button"
          onClick={() => hasPhoto ? setLightboxOpen(true) : inputRef.current?.click()}
          className="block rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{ ['--tw-ring-color' as any]: 'var(--accent)' }}
          title={hasPhoto ? 'View photo' : 'Upload photo'}
        >
          <Avatar name={name} size={56} src={photoSrc ?? undefined} />
        </button>
        {/* Camera badge: replace photo. Always visible when one exists, fades
            in on hover otherwise so empty avatars still hint at uploadability. */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title={hasPhoto ? 'Replace photo' : 'Upload photo'}
          className={`absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-opacity ${hasPhoto ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          style={{
            background: 'var(--accent)',
            borderColor: 'var(--surface)',
            color: 'white',
          }}
        >
          <Camera size={12} />
        </button>
        {hasPhoto && (
          <button
            type="button"
            onClick={() => {
              if (!confirm('Remove this photo?')) return;
              remove.mutate(undefined, {
                onSuccess: () => toast('Photo removed', 'success'),
                onError: (err: any) => toast(err?.message ?? 'Delete failed', 'error'),
              });
            }}
            title="Remove photo"
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border opacity-0 transition-opacity group-hover:opacity-100"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--neg)',
            }}
          >
            <Trash2 size={11} />
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={pick}
        />
      </div>

      {/* Fullscreen lightbox. Click anywhere outside the image or press Esc
          (handled by browser's default focus) to dismiss. */}
      {lightboxOpen && photoSrc && (
        <div
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            title="Close"
            aria-label="Close"
          >
            <X size={18} />
          </button>
          <img
            src={photoSrc}
            alt={name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[88vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
